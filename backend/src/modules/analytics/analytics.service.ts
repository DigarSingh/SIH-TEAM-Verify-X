import { prisma } from '../../lib/prisma';
import { getEngineConfig } from '../competencies/engine-config.service';
import type { EngineConfig } from '../competencies/engine/config';
import { classifySeverity } from '../competencies/engine/skill-gap';
import type { FreshnessStatus } from '../competencies/engine/decay';
import { levelsAsOf, mean, monthKeys, monthStart, round1, rowKey, loadOrgRows, type OrgFilters, type OrgRow } from './org-data';

const DAY_MS = 24 * 60 * 60 * 1000;
const UNASSIGNED = 'unassigned';

const isHighPriority = (row: OrgRow) => !row.met && (row.priorityLevel === 'HIGH' || row.priorityLevel === 'CRITICAL');
const distinctUsers = (rows: OrgRow[]) => new Set(rows.map((row) => row.userId));

/** Readiness = share of the requirements already met: Σ min(current, required) / Σ required. */
const readiness = (rows: OrgRow[]) => {
  const required = rows.reduce((sum, row) => sum + row.requiredLevel, 0);
  return required === 0 ? null : round1((rows.reduce((sum, row) => sum + Math.min(row.currentLevel, row.requiredLevel), 0) / required) * 100);
};

// ---------------------------------------------------------------------------------------------
// Dashboard metrics and trends
// ---------------------------------------------------------------------------------------------

interface MonthlyRow {
  month: string;
  count: number;
}

const fill = (keys: string[], rows: MonthlyRow[]) => {
  const byMonth = new Map(rows.map((row) => [row.month, row.count]));
  return keys.map((month) => ({ month, count: byMonth.get(month) ?? 0 }));
};

export async function adminAnalytics(months: number) {
  const config = await getEngineConfig();
  const keys = monthKeys(months);
  const since = monthStart(months);

  const [
    totalEmployees,
    trainees,
    activeTrainees,
    trainers,
    pendingApprovals,
    publishedCourses,
    totalCourses,
    enrollmentsByStatus,
    certificates,
    attemptStats,
    passedAttempts,
    orgRows,
    enrolled,
    completed,
    certified,
    performance,
    competencyTrend,
    topCourseRows,
    courseStatus,
    enrollmentsByDepartment,
  ] = await Promise.all([
    prisma.user.count({ where: { status: 'ACTIVE', deletedAt: null } }),
    prisma.user.count({ where: { status: 'ACTIVE', deletedAt: null, role: 'TRAINEE' } }),
    // Actively training = currently enrolled in at least one course that is not finished yet.
    prisma.user.count({ where: { status: 'ACTIVE', deletedAt: null, role: 'TRAINEE', enrollments: { some: { status: { in: ['ENROLLED', 'IN_PROGRESS', 'ASSESSMENT_PENDING'] } } } } }),
    prisma.user.count({ where: { status: 'ACTIVE', deletedAt: null, role: 'TRAINER' } }),
    prisma.user.count({ where: { status: 'PENDING', deletedAt: null } }),
    prisma.course.count({ where: { status: 'PUBLISHED', deletedAt: null } }),
    prisma.course.count({ where: { deletedAt: null } }),
    prisma.enrollment.groupBy({ by: ['status'], _count: true }),
    prisma.certificate.count({ where: { status: 'VALID' } }),
    prisma.assessmentAttempt.aggregate({ where: { status: 'SUBMITTED' }, _avg: { percentage: true }, _count: true }),
    prisma.assessmentAttempt.count({ where: { status: 'SUBMITTED', passed: true } }),
    loadOrgRows({}, config),
    prisma.$queryRaw<MonthlyRow[]>`SELECT to_char(date_trunc('month', "enrolledAt"), 'YYYY-MM') AS month, COUNT(*)::int AS count FROM "Enrollment" WHERE "enrolledAt" >= ${since} AND "status" <> 'WITHDRAWN' GROUP BY 1`,
    prisma.$queryRaw<MonthlyRow[]>`SELECT to_char(date_trunc('month', "completedAt"), 'YYYY-MM') AS month, COUNT(*)::int AS count FROM "Enrollment" WHERE "completedAt" IS NOT NULL AND "completedAt" >= ${since} GROUP BY 1`,
    prisma.$queryRaw<MonthlyRow[]>`SELECT to_char(date_trunc('month', "issuedAt"), 'YYYY-MM') AS month, COUNT(*)::int AS count FROM "Certificate" WHERE "issuedAt" >= ${since} GROUP BY 1`,
    prisma.$queryRaw<{ month: string; average: number; attempts: number; passRate: number }[]>`
      SELECT to_char(date_trunc('month', "submittedAt"), 'YYYY-MM') AS month,
             ROUND(AVG("percentage")::numeric, 1)::float AS average,
             COUNT(*)::int AS attempts,
             ROUND(100.0 * SUM(CASE WHEN "passed" THEN 1 ELSE 0 END) / COUNT(*), 1)::float AS "passRate"
      FROM "AssessmentAttempt" WHERE "status" = 'SUBMITTED' AND "submittedAt" >= ${since} GROUP BY 1`,
    prisma.$queryRaw<{ month: string; average: number; employees: number }[]>`
      WITH months AS (
        SELECT generate_series(date_trunc('month', ${since}::timestamp), date_trunc('month', now()), interval '1 month') AS m
      ), latest AS (
        SELECT m.m, h."userId", h."competencyId", h."newLevel",
               ROW_NUMBER() OVER (PARTITION BY m.m, h."userId", h."competencyId" ORDER BY h."createdAt" DESC) AS rn
        FROM months m
        JOIN "CompetencyHistory" h ON h."createdAt" < m.m + interval '1 month'
        JOIN "User" u ON u.id = h."userId" AND u.status = 'ACTIVE' AND u."deletedAt" IS NULL
      )
      SELECT to_char(m, 'YYYY-MM') AS month, ROUND(AVG("newLevel")::numeric, 1)::float AS average, COUNT(DISTINCT "userId")::int AS employees
      FROM latest WHERE rn = 1 GROUP BY m ORDER BY m`,
    prisma.course.findMany({ where: { status: 'PUBLISHED', deletedAt: null }, orderBy: { enrollments: { _count: 'desc' } }, take: 6, select: { id: true, title: true, difficulty: true, _count: { select: { enrollments: true } } } }),
    prisma.enrollment.groupBy({ by: ['courseId', 'status'], _count: true }),
    prisma.enrollment.findMany({ where: { status: { not: 'WITHDRAWN' }, user: { deletedAt: null } }, select: { status: true, user: { select: { departmentId: true } } } }),
  ]);

  const statusCount = Object.fromEntries(enrollmentsByStatus.map((row) => [row.status, row._count])) as Record<string, number>;
  const activeEnrollments = Object.entries(statusCount).filter(([status]) => status !== 'WITHDRAWN').reduce((sum, [, count]) => sum + count, 0);
  const finishedEnrollments = (statusCount['COMPLETED'] ?? 0) + (statusCount['CERTIFIED'] ?? 0);

  // ---- department comparison ---------------------------------------------------------------------
  const departments = await prisma.department.findMany({ where: { isActive: true }, select: { id: true, name: true } });
  const completionByDepartment = new Map<string, { total: number; done: number }>();
  for (const enrollment of enrollmentsByDepartment) {
    const key = enrollment.user.departmentId ?? UNASSIGNED;
    const entry = completionByDepartment.get(key) ?? { total: 0, done: 0 };
    entry.total += 1;
    if (enrollment.status === 'COMPLETED' || enrollment.status === 'CERTIFIED') entry.done += 1;
    completionByDepartment.set(key, entry);
  }
  const departmentComparison = departments
    .map((department) => {
      const rows = orgRows.filter((row) => row.departmentId === department.id);
      const completion = completionByDepartment.get(department.id);
      return {
        departmentId: department.id,
        department: department.name,
        employees: distinctUsers(rows).size,
        averageCompetency: mean(rows.map((row) => row.currentLevel)),
        averageRequired: mean(rows.map((row) => row.requiredLevel)),
        readiness: readiness(rows),
        needingTraining: distinctUsers(rows.filter(isHighPriority)).size,
        completionRate: completion && completion.total > 0 ? round1((completion.done / completion.total) * 100) : null,
      };
    })
    .filter((entry) => entry.employees > 0)
    .sort((a, b) => (b.readiness ?? 0) - (a.readiness ?? 0));

  // ---- top courses ---------------------------------------------------------------------------------
  const topCourses = topCourseRows.map((course) => {
    const rows = courseStatus.filter((row) => row.courseId === course.id && row.status !== 'WITHDRAWN');
    const total = rows.reduce((sum, row) => sum + row._count, 0);
    const done = rows.filter((row) => row.status === 'COMPLETED' || row.status === 'CERTIFIED').reduce((sum, row) => sum + row._count, 0);
    return { courseId: course.id, title: course.title, difficulty: course.difficulty, enrollments: course._count.enrollments, completionRate: total === 0 ? 0 : round1((done / total) * 100) };
  });

  const performanceBy = new Map(performance.map((row) => [row.month, row]));
  const trendBy = new Map(competencyTrend.map((row) => [row.month, row]));
  const enrolledSeries = fill(keys, enrolled);
  const completedSeries = fill(keys, completed);
  const certifiedSeries = fill(keys, certified);

  return {
    generatedAt: new Date(),
    metrics: {
      totalEmployees,
      trainees,
      activeTrainees,
      trainers,
      pendingApprovals,
      courses: publishedCourses,
      totalCourses,
      enrollments: activeEnrollments,
      completionRate: activeEnrollments === 0 ? 0 : round1((finishedEnrollments / activeEnrollments) * 100),
      certificatesIssued: certificates,
      averageAssessmentScore: attemptStats._avg.percentage === null ? null : round1(attemptStats._avg.percentage),
      assessmentPassRate: attemptStats._count === 0 ? null : round1((passedAttempts / attemptStats._count) * 100),
      averageCompetency: mean(orgRows.map((row) => row.currentLevel)),
      averageRequired: mean(orgRows.map((row) => row.requiredLevel)),
      workforceReadiness: readiness(orgRows),
      employeesRequiringTraining: distinctUsers(orgRows.filter(isHighPriority)).size,
      employeesWithRole: distinctUsers(orgRows).size,
    },
    enrollmentStatus: ['ENROLLED', 'IN_PROGRESS', 'ASSESSMENT_PENDING', 'COMPLETED', 'CERTIFIED'].map((status) => ({ status, count: statusCount[status] ?? 0 })),
    trends: {
      months: keys,
      enrollments: enrolledSeries.map((point) => ({ month: point.month, value: point.count })),
      completions: completedSeries.map((point) => ({ month: point.month, value: point.count })),
      certifications: certifiedSeries.map((point) => ({ month: point.month, value: point.count })),
      assessmentPerformance: keys.map((month) => ({
        month,
        averageScore: performanceBy.get(month)?.average ?? null,
        passRate: performanceBy.get(month)?.passRate ?? null,
        attempts: performanceBy.get(month)?.attempts ?? 0,
      })),
      competency: keys.map((month) => ({ month, averageCompetency: trendBy.get(month)?.average ?? null, employees: trendBy.get(month)?.employees ?? 0 })),
    },
    departmentComparison,
    topCourses,
  };
}

// ---------------------------------------------------------------------------------------------
// Competency heatmap
// ---------------------------------------------------------------------------------------------

export interface HeatmapQuery extends OrgFilters {
  groupBy: 'department' | 'role';
  /** Look-back window (days) used for the per-cell change indicator. */
  periodDays: number;
  /**
   * Which question the grid answers. `competency` is the training gap against
   * the role requirement; `freshness` decays every level to `asOf` first, so a
   * cell shows what has faded rather than what was never learned.
   */
  layer?: 'competency' | 'freshness';
  /** The date the freshness layer is measured at; today when omitted. */
  asOf?: Date;
}

function groupOf(row: OrgRow, groupBy: 'department' | 'role') {
  return groupBy === 'department' ? { id: row.departmentId ?? UNASSIGNED, name: row.departmentName ?? 'Unassigned' } : { id: row.jobRoleId, name: row.jobRoleName };
}

const EMPTY_FRESHNESS: Record<FreshnessStatus, number> = { CURRENT: 0, WATCH: 0, AT_RISK: 0, CRITICAL: 0, EXPIRED: 0 };

function cellStats(rows: OrgRow[], previous: Map<string, number>, config: EngineConfig) {
  const assessed = rows.filter((row) => row.assessed);
  const compared = assessed.filter((row) => previous.has(rowKey(row)));
  const averageGap = mean(rows.map((row) => row.gap));

  // Only present when the caller asked for the freshness pass.
  const fresh = rows.filter((row) => row.freshness);
  const decay = fresh.length === 0 ? null : { byStatus: { ...EMPTY_FRESHNESS }, needingRefresher: 0, averageDecay: 0 };
  if (decay) {
    for (const row of fresh) {
      const freshness = row.freshness as NonNullable<OrgRow['freshness']>;
      decay.byStatus[freshness.status] += 1;
      if (freshness.needsRefresher) decay.needingRefresher += 1;
    }
    decay.averageDecay = round1(fresh.reduce((sum, row) => sum + (row.freshness?.decayPoints ?? 0), 0) / fresh.length);
  }

  return {
    employees: rows.length,
    assessed: assessed.length,
    unassessed: rows.length - assessed.length,
    average: mean(assessed.map((row) => row.currentLevel)),
    required: mean(rows.map((row) => row.requiredLevel)),
    averageGap,
    severity: averageGap === null ? null : classifySeverity(averageGap, config.severity),
    affected: rows.filter((row) => !row.met).length,
    highPriority: rows.filter(isHighPriority).length,
    change: compared.length === 0 ? null : round1(compared.reduce((sum, row) => sum + (row.currentLevel - (previous.get(rowKey(row)) as number)), 0) / compared.length),
    ...(decay ? { decay } : {}),
  };
}

/** Department (or role) × competency matrix of average levels, gaps and affected employees. */
export async function competencyHeatmap(query: HeatmapQuery) {
  const config = await getEngineConfig();
  const layer = query.layer ?? 'competency';
  // The freshness layer decays every level to `asOf`; the competency layer reads the stored levels.
  const rows = await loadOrgRows(query, config, layer === 'freshness' ? { asOf: query.asOf ?? new Date() } : {});
  const previous = await levelsAsOf([...distinctUsers(rows)], new Date(Date.now() - query.periodDays * DAY_MS));

  const columns = new Map<string, { competencyId: string; name: string; code: string; category: string }>();
  const groups = new Map<string, { id: string; name: string }>();
  for (const row of rows) {
    columns.set(row.competencyId, { competencyId: row.competencyId, name: row.competencyName, code: row.competencyCode, category: row.category });
    const group = groupOf(row, query.groupBy);
    groups.set(group.id, group);
  }
  const orderedColumns = [...columns.values()].sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));
  const orderedGroups = [...groups.values()].sort((a, b) => a.name.localeCompare(b.name));

  const build = (subset: OrgRow[]) =>
    orderedColumns.map((column) => ({ competencyId: column.competencyId, ...cellStats(subset.filter((row) => row.competencyId === column.competencyId), previous, config) }));

  return {
    groupBy: query.groupBy,
    periodDays: query.periodDays,
    layer,
    /** Null on the competency layer, which does not depend on a date. */
    measuredAt: layer === 'freshness' ? (query.asOf ?? new Date()) : null,
    filters: { departmentId: query.departmentId ?? null, jobRoleId: query.jobRoleId ?? null, competencyId: query.competencyId ?? null },
    thresholds: config.severity,
    columns: orderedColumns,
    rows: orderedGroups.map((group) => {
      const subset = rows.filter((row) => groupOf(row, query.groupBy).id === group.id);
      return { id: group.id, name: group.name, employees: distinctUsers(subset).size, cells: build(subset) };
    }),
    overall: { id: 'all', name: 'All employees', employees: distinctUsers(rows).size, cells: build(rows) },
  };
}

/** Employees behind one heatmap cell (click-through), worst gap first. */
export async function heatmapCell(query: {
  competencyId: string;
  groupBy: 'department' | 'role';
  groupId: string;
  page: number;
  pageSize: number;
  onlyGaps: boolean;
}) {
  const config = await getEngineConfig();
  const filters: OrgFilters = { competencyId: query.competencyId };
  if (query.groupId !== 'all' && query.groupId !== UNASSIGNED) {
    if (query.groupBy === 'department') filters.departmentId = query.groupId;
    else filters.jobRoleId = query.groupId;
  }
  let rows = await loadOrgRows(filters, config);
  if (query.groupId === UNASSIGNED) rows = rows.filter((row) => row.departmentId === null);
  const scoped = query.onlyGaps ? rows.filter((row) => !row.met) : rows;
  scoped.sort((a, b) => b.priorityScore - a.priorityScore || b.gap - a.gap || a.userName.localeCompare(b.userName));

  const competency = await prisma.competency.findUnique({ where: { id: query.competencyId }, select: { id: true, name: true, code: true, category: true } });
  const courses = await prisma.courseCompetency.findMany({
    where: { competencyId: query.competencyId, course: { status: 'PUBLISHED', deletedAt: null } },
    include: { course: { select: { id: true, title: true, difficulty: true } } },
    orderBy: { levelFrom: 'asc' },
  });

  return {
    competency,
    summary: {
      employees: rows.length,
      affected: rows.filter((row) => !row.met).length,
      averageCurrent: mean(rows.map((row) => row.currentLevel)),
      averageRequired: mean(rows.map((row) => row.requiredLevel)),
      averageGap: mean(rows.map((row) => row.gap)),
    },
    total: scoped.length,
    employees: scoped.slice((query.page - 1) * query.pageSize, query.page * query.pageSize).map((row) => ({
      userId: row.userId,
      name: row.userName,
      department: row.departmentName,
      jobRole: row.jobRoleName,
      currentLevel: row.currentLevel,
      requiredLevel: row.requiredLevel,
      gap: row.gap,
      severity: row.severity,
      priorityScore: row.priorityScore,
      priorityLevel: row.priorityLevel,
      assessed: row.assessed,
    })),
    recommendedCourses: courses.map((mapping) => ({ courseId: mapping.course.id, title: mapping.course.title, difficulty: mapping.course.difficulty, levelFrom: mapping.levelFrom, levelTo: mapping.levelTo })),
  };
}

// ---------------------------------------------------------------------------------------------
// Skill-gap analytics
// ---------------------------------------------------------------------------------------------

export async function skillGapAnalytics(filters: OrgFilters) {
  const config = await getEngineConfig();
  const rows = await loadOrgRows(filters, config);
  const distribution = { MET: 0, LOW: 0, MODERATE: 0, HIGH: 0, CRITICAL: 0 } as Record<string, number>;
  for (const row of rows) distribution[row.met ? 'MET' : row.severity] += 1;

  const summarize = (subset: OrgRow[]) => ({
    employees: distinctUsers(subset).size,
    requirements: subset.length,
    averageGap: mean(subset.filter((row) => !row.met).map((row) => row.gap)) ?? 0,
    needingTraining: distinctUsers(subset.filter(isHighPriority)).size,
    readiness: readiness(subset),
  });
  const group = (key: (row: OrgRow) => { id: string; name: string }) => {
    const groups = new Map<string, { id: string; name: string; rows: OrgRow[] }>();
    for (const row of rows) {
      const { id, name } = key(row);
      const entry = groups.get(id) ?? { id, name, rows: [] };
      entry.rows.push(row);
      groups.set(id, entry);
    }
    return [...groups.values()].map((entry) => ({ id: entry.id, name: entry.name, ...summarize(entry.rows) })).sort((a, b) => b.averageGap - a.averageGap);
  };

  return {
    ...summarize(rows),
    severityDistribution: (['MET', 'LOW', 'MODERATE', 'HIGH', 'CRITICAL'] as const).map((severity) => ({ severity, count: distribution[severity] ?? 0 })),
    byDepartment: group((row) => ({ id: row.departmentId ?? UNASSIGNED, name: row.departmentName ?? 'Unassigned' })),
    byRole: group((row) => ({ id: row.jobRoleId, name: row.jobRoleName })),
    byCompetency: group((row) => ({ id: row.competencyId, name: row.competencyName })),
    thresholds: config.severity,
  };
}

// ---------------------------------------------------------------------------------------------
// Training-needs analysis
// ---------------------------------------------------------------------------------------------

interface NeedsContext {
  config: EngineConfig;
  rows: OrgRow[];
}

/**
 * Highest skill gaps → affected employees → priority → recommended courses → training demand.
 * One entry per competency, ordered by total demand (Σ of the affected employees' priority scores).
 */
export async function trainingNeeds(filters: OrgFilters) {
  const config = await getEngineConfig();
  const rows = await loadOrgRows(filters, config);
  return buildNeeds({ config, rows });
}

async function buildNeeds({ config, rows }: NeedsContext) {
  const byCompetency = new Map<string, OrgRow[]>();
  for (const row of rows) byCompetency.set(row.competencyId, [...(byCompetency.get(row.competencyId) ?? []), row]);

  const affectedCompetencies = [...byCompetency.entries()].filter(([, list]) => list.some((row) => !row.met)).map(([id]) => id);
  const [mappings, enrollments] = await Promise.all([
    prisma.courseCompetency.findMany({
      where: { competencyId: { in: affectedCompetencies }, course: { status: 'PUBLISHED', deletedAt: null } },
      include: { course: { select: { id: true, title: true, difficulty: true, _count: { select: { enrollments: true } } } } },
    }),
    prisma.enrollment.findMany({
      where: {
        userId: { in: [...distinctUsers(rows)] },
        status: { in: ['ENROLLED', 'IN_PROGRESS', 'ASSESSMENT_PENDING'] },
        course: { competencies: { some: { competencyId: { in: affectedCompetencies } } } },
      },
      select: { userId: true, courseId: true },
    }),
  ]);

  const needs = affectedCompetencies.map((competencyId) => {
    const list = byCompetency.get(competencyId) as OrgRow[];
    const affected = list.filter((row) => !row.met);
    const averageGap = mean(affected.map((row) => row.gap)) ?? 0;
    const priorityScore = mean(affected.map((row) => row.priorityScore)) ?? 0;
    const courses = mappings.filter((mapping) => mapping.competencyId === competencyId);
    const courseIds = new Set(courses.map((mapping) => mapping.courseId));
    const inTraining = new Set(enrollments.filter((enrollment) => courseIds.has(enrollment.courseId)).map((enrollment) => enrollment.userId));
    const affectedUsers = distinctUsers(affected);
    const inTrainingAffected = [...affectedUsers].filter((id) => inTraining.has(id)).length;
    const first = list[0] as OrgRow;
    const severityCounts = { LOW: 0, MODERATE: 0, HIGH: 0, CRITICAL: 0 };
    for (const row of affected) severityCounts[row.severity] += 1;

    return {
      competencyId,
      name: first.competencyName,
      code: first.competencyCode,
      category: first.category,
      employeesRequired: list.length,
      employeesAffected: affected.length,
      affectedShare: round1((affected.length / list.length) * 100),
      averageGap,
      severity: classifySeverity(averageGap, config.severity),
      severityCounts,
      priorityScore,
      priorityLevel: priorityLevelOf(priorityScore, config),
      demandScore: round1(affected.reduce((sum, row) => sum + row.priorityScore, 0)),
      inTraining: inTrainingAffected,
      unserved: affectedUsers.size - inTrainingAffected,
      recommendedCourses: courses.length,
      courses: courses
        .sort((a, b) => a.levelFrom - b.levelFrom)
        .slice(0, 5)
        .map((mapping) => ({ courseId: mapping.course.id, title: mapping.course.title, difficulty: mapping.course.difficulty, levelFrom: mapping.levelFrom, levelTo: mapping.levelTo, enrolled: mapping.course._count.enrollments })),
      needsCourseDevelopment: courses.length === 0,
    };
  });

  needs.sort((a, b) => b.demandScore - a.demandScore || b.averageGap - a.averageGap || a.name.localeCompare(b.name));
  const needingTraining = distinctUsers(rows.filter(isHighPriority)).size;
  return {
    summary: {
      employees: distinctUsers(rows).size,
      employeesNeedingTraining: needingTraining,
      competenciesWithGaps: needs.length,
      unservedDemand: needs.reduce((sum, need) => sum + need.unserved, 0),
      competenciesWithoutCourses: needs.filter((need) => need.needsCourseDevelopment).length,
    },
    needs,
    thresholds: config.priority,
  };
}

function priorityLevelOf(score: number, config: EngineConfig): 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' {
  if (score >= config.priority.criticalMin) return 'CRITICAL';
  if (score >= config.priority.highMin) return 'HIGH';
  if (score >= config.priority.mediumMin) return 'MEDIUM';
  return 'LOW';
}

/** Drill-down for one competency: departments, affected employees and the courses that address it. */
export async function trainingNeedDetail(competencyId: string, filters: OrgFilters) {
  const config = await getEngineConfig();
  const rows = await loadOrgRows({ ...filters, competencyId }, config);
  const { needs } = await buildNeeds({ config, rows });
  const need = needs[0] ?? null;

  const departments = new Map<string, { id: string; name: string; rows: OrgRow[] }>();
  for (const row of rows) {
    const id = row.departmentId ?? UNASSIGNED;
    const entry = departments.get(id) ?? { id, name: row.departmentName ?? 'Unassigned', rows: [] };
    entry.rows.push(row);
    departments.set(id, entry);
  }

  const courseStats = await prisma.courseCompetency.findMany({
    where: { competencyId, course: { status: 'PUBLISHED', deletedAt: null } },
    include: { course: { select: { id: true, title: true, difficulty: true, durationMinutes: true, enrollments: { select: { status: true, userId: true } } } } },
    orderBy: { levelFrom: 'asc' },
  });
  const affectedIds = new Set(rows.filter((row) => !row.met).map((row) => row.userId));

  return {
    need,
    departments: [...departments.values()]
      .map((entry) => ({
        id: entry.id,
        name: entry.name,
        employees: entry.rows.length,
        affected: entry.rows.filter((row) => !row.met).length,
        averageGap: mean(entry.rows.filter((row) => !row.met).map((row) => row.gap)) ?? 0,
      }))
      .sort((a, b) => b.affected - a.affected),
    employees: rows
      .filter((row) => !row.met)
      .sort((a, b) => b.priorityScore - a.priorityScore)
      .slice(0, 50)
      .map((row) => ({ userId: row.userId, name: row.userName, department: row.departmentName, jobRole: row.jobRoleName, currentLevel: row.currentLevel, requiredLevel: row.requiredLevel, gap: row.gap, priorityScore: row.priorityScore, priorityLevel: row.priorityLevel })),
    courses: courseStats.map((mapping) => {
      const enrollments = mapping.course.enrollments.filter((enrollment) => enrollment.status !== 'WITHDRAWN');
      return {
        courseId: mapping.course.id,
        title: mapping.course.title,
        difficulty: mapping.course.difficulty,
        durationMinutes: mapping.course.durationMinutes,
        levelFrom: mapping.levelFrom,
        levelTo: mapping.levelTo,
        enrolled: enrollments.length,
        completed: enrollments.filter((enrollment) => enrollment.status === 'COMPLETED' || enrollment.status === 'CERTIFIED').length,
        affectedEnrolled: enrollments.filter((enrollment) => affectedIds.has(enrollment.userId)).length,
      };
    }),
  };
}

// Re-exported so routes can validate look-back windows against one source of truth.
export const PERIOD_DAYS = { '30d': 30, '90d': 90, '180d': 180, '365d': 365 } as const;
export type Period = keyof typeof PERIOD_DAYS;

