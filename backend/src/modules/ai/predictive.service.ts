import { prisma, Prisma } from '../../lib/prisma';
import { loadOrgRows, mean, monthKeys, round1 } from '../analytics/org-data';
import { getEngineConfig } from '../competencies/engine-config.service';
import { addMonths, confidenceOf, linearTrend, monthsToClose, outlookOf, projectFrom, type Confidence, type Outlook } from './forecast';

export interface CompetencyForecast {
  competencyId: string;
  name: string;
  category: string;
  /** Employees whose job role requires this competency. */
  employees: number;
  currentAverage: number;
  requiredAverage: number;
  affectedNow: number;
  /** Average change per month over the history window (null when there are fewer than 3 months of data). */
  trendPerMonth: number | null;
  projectedAverage: number | null;
  projectedGap: number;
  /** Employees still below their required level after the horizon, if everyone moves with the average trend. */
  projectedAffected: number;
  monthsToClose: number | null;
  outlook: Outlook;
  confidence: Confidence | null;
  history: { month: string; value: number }[];
  projection: { month: string; value: number }[];
}

export interface TrainingNeedsForecast {
  generatedAt: Date;
  horizonMonths: number;
  historyMonths: number;
  /** How the numbers were produced, shown to the user next to them. */
  method: string;
  summary: { employees: number; competencies: number; affectedNow: number; projectedAffected: number; atRisk: number };
  competencies: CompetencyForecast[];
}

const METHOD =
  'For each competency, the average level of the employees whose role requires it is calculated month by month from the recorded competency history. ' +
  'Each employee counts at the level they had at the end of that month, and before their first record at that first level, so new joiners do not look like progress. ' +
  'A straight line is fitted (least squares) through those monthly averages; its slope is the pace in points per month. ' +
  "The projection continues from today's average at that pace, and employees still below their required level are estimated by moving every employee by the same amount. " +
  'It assumes the recent pace continues; it does not know about planned courses, retirements or new joiners. Confidence is LOW when there are few months of data or the line fits poorly.';

interface MonthlyAverage {
  competencyId: string;
  month: string;
  average: number;
}

/**
 * Average level per competency and month for the same set of employees every month (the ACTIVE employees whose
 * role requires the competency): each counts at their latest level as of the month's end, and at their first
 * recorded level before that, so people who were first assessed later do not distort the trend. Months before
 * the first record of the competency are left out. Month boundaries are UTC and passed in as text, so the result
 * does not depend on the database's time zone (history timestamps are stored in UTC).
 */
async function monthlyAverages(months: string[]): Promise<Map<string, MonthlyAverage[]>> {
  const rows = await prisma.$queryRaw<MonthlyAverage[]>(Prisma.sql`
    WITH months AS (
      SELECT (k || '-01')::timestamp AS m FROM unnest(${months}::text[]) AS k
    ), panel AS (
      SELECT u.id AS "userId", rc."competencyId"
      FROM "User" u
      JOIN "RoleCompetency" rc ON rc."roleId" = u."jobRoleId"
      JOIN "Competency" c ON c.id = rc."competencyId" AND c."isActive"
      WHERE u.status = 'ACTIVE' AND u."deletedAt" IS NULL
    ), first_record AS (
      SELECT DISTINCT ON (h."userId", h."competencyId") h."userId", h."competencyId", h."newLevel", h."createdAt"
      FROM "CompetencyHistory" h
      ORDER BY h."userId", h."competencyId", h."createdAt" ASC
    ), started AS (
      SELECT p."competencyId", date_trunc('month', MIN(f."createdAt")) AS first_month
      FROM panel p JOIN first_record f ON f."userId" = p."userId" AND f."competencyId" = p."competencyId"
      GROUP BY p."competencyId"
    ), levels AS (
      SELECT m.m, p."competencyId", COALESCE(latest."newLevel", f."newLevel", 0) AS level
      FROM months m
      CROSS JOIN panel p
      LEFT JOIN first_record f ON f."userId" = p."userId" AND f."competencyId" = p."competencyId"
      LEFT JOIN LATERAL (
        SELECT h."newLevel" FROM "CompetencyHistory" h
        WHERE h."userId" = p."userId" AND h."competencyId" = p."competencyId" AND h."createdAt" < m.m + interval '1 month'
        ORDER BY h."createdAt" DESC LIMIT 1
      ) latest ON true
    )
    SELECT l."competencyId", to_char(l.m, 'YYYY-MM') AS month, ROUND(AVG(l.level)::numeric, 1)::float AS average
    FROM levels l JOIN started s ON s."competencyId" = l."competencyId"
    WHERE l.m >= s.first_month
    GROUP BY l.m, l."competencyId" ORDER BY l.m`);
  const byCompetency = new Map<string, MonthlyAverage[]>();
  for (const row of rows) byCompetency.set(row.competencyId, [...(byCompetency.get(row.competencyId) ?? []), row]);
  return byCompetency;
}

/**
 * Forecast of training needs, competency by competency. Entirely deterministic: it needs no AI service
 * and is reproducible from the recorded history.
 */
export async function forecastTrainingNeeds(horizonMonths = 6, historyMonths = 12): Promise<TrainingNeedsForecast> {
  const config = await getEngineConfig();
  const months = monthKeys(historyMonths);
  const [rows, series] = await Promise.all([loadOrgRows({}, config), monthlyAverages(months)]);

  const byCompetency = new Map<string, typeof rows>();
  for (const row of rows) byCompetency.set(row.competencyId, [...(byCompetency.get(row.competencyId) ?? []), row]);

  const lastMonth = months[months.length - 1] as string;
  const competencies: CompetencyForecast[] = [];

  for (const [competencyId, group] of byCompetency) {
    const first = group[0]!;
    const currentAverage = mean(group.map((row) => row.currentLevel)) ?? 0;
    const requiredAverage = mean(group.map((row) => row.requiredLevel)) ?? 0;
    const affectedNow = group.filter((row) => !row.met).length;

    const history = (series.get(competencyId) ?? []).map((point) => ({ month: point.month, value: point.average }));
    const trend = linearTrend(history.map((point) => point.value));
    // The pace comes from the trend; the starting point is today's actual average.
    const projectedAverage = trend ? projectFrom(currentAverage, trend.slope, horizonMonths) : null;
    const currentGap = Math.max(0, round1(requiredAverage - currentAverage));
    const projectedGap = projectedAverage === null ? currentGap : Math.max(0, round1(requiredAverage - projectedAverage));

    // Move every employee by the trend (slope x horizon) and count who is still short of the requirement.
    const expectedChange = trend ? trend.slope * horizonMonths : 0;
    const projectedAffected = group.filter((row) => row.currentLevel + expectedChange < row.requiredLevel).length;

    competencies.push({
      competencyId,
      name: first.competencyName,
      category: first.category,
      employees: group.length,
      currentAverage,
      requiredAverage,
      affectedNow,
      trendPerMonth: trend ? round1(trend.slope) : null,
      projectedAverage,
      projectedGap,
      projectedAffected,
      monthsToClose: trend ? monthsToClose(currentGap, trend.slope) : null,
      outlook: outlookOf({ currentGap, projectedGap, slope: trend ? trend.slope : null }),
      confidence: trend ? confidenceOf(trend) : null,
      history,
      projection: trend ? Array.from({ length: horizonMonths }, (_, index) => ({ month: addMonths(lastMonth, index + 1), value: projectFrom(currentAverage, trend.slope, index + 1) })) : [],
    });
  }

  competencies.sort((a, b) => b.projectedAffected - a.projectedAffected || b.projectedGap - a.projectedGap || a.name.localeCompare(b.name));
  const employees = new Set(rows.map((row) => row.userId)).size;
  return {
    generatedAt: new Date(),
    horizonMonths,
    historyMonths,
    method: METHOD,
    summary: {
      employees,
      competencies: competencies.length,
      affectedNow: competencies.reduce((sum, item) => sum + item.affectedNow, 0),
      projectedAffected: competencies.reduce((sum, item) => sum + item.projectedAffected, 0),
      atRisk: competencies.filter((item) => item.outlook === 'WIDENING' || item.outlook === 'STAGNANT').filter((item) => item.projectedAffected > 0).length,
    },
    competencies,
  };
}
