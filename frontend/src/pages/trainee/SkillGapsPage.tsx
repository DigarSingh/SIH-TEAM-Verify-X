import { useQuery } from '@tanstack/react-query';
import { Gauge, RefreshCw, Target, TriangleAlert } from 'lucide-react';
import { useMemo, useState } from 'react';
import { keys } from '../../api/keys';
import { CompetencyRadar } from '../../charts';
import { GapCard } from '../../components/domain/GapCard';
import { QueryBoundary } from '../../components/domain/QueryBoundary';
import { RefresherPanel, FreshnessSummaryRow, ReadinessTimeTravel, SimulationBanner } from '../../components/domain/ReadinessParts';
import { Card, EmptyState, PageHeader, Segmented, StatCard } from '../../components/ui';
import { usePageTitle } from '../../hooks/misc';
import { fetchEngineConfig } from '../../services/engine';
import { fetchSkillGaps } from '../../services/learner';
import type { SkillGapReport } from '../../types';
import { SEVERITY_META } from '../../utils/constants';

type Filter = 'gaps' | 'all' | 'met';

function SeverityLegend() {
  const config = useQuery({ queryKey: keys.engineConfig, queryFn: fetchEngineConfig, staleTime: 5 * 60_000 });
  const t = config.data?.config.severity;
  const ranges = t
    ? {
        LOW: `0-${t.lowMax}`,
        MODERATE: `${t.lowMax + 1}-${t.moderateMax}`,
        HIGH: `${t.moderateMax + 1}-${t.highMax}`,
        CRITICAL: `${t.highMax + 1}+`,
      }
    : null;
  return (
    <Card title="How gaps are classified" description="Skill gap = required level − current level (never below zero)">
      <ul className="space-y-2.5">
        {(Object.keys(SEVERITY_META) as (keyof typeof SEVERITY_META)[]).map((severity) => (
          <li key={severity} className="flex items-center justify-between gap-3 text-sm">
            <span className="flex items-center gap-2 font-semibold text-navy">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: SEVERITY_META[severity].hex }} aria-hidden />
              {SEVERITY_META[severity].label}
            </span>
            <span className="text-slate-500">{ranges ? ranges[severity] : '…'} points</span>
          </li>
        ))}
      </ul>
      <p className="mt-4 text-xs leading-5 text-slate-500">
        Training priority = <strong>gap × competency importance × role criticality</strong>, normalised to 0-100. It ranks which gap to close first; the severity above only describes how large the gap is.
        These thresholds are configured by your administrator.
      </p>
    </Card>
  );
}

function Content({ report, offsetDays, onOffsetChange }: { report: SkillGapReport; offsetDays: number; onOffsetChange: (days: number) => void }) {
  const [filter, setFilter] = useState<Filter>('gaps');
  const { summary } = report;
  const highOrCritical = summary.bySeverity.HIGH + summary.bySeverity.CRITICAL;

  const visible = useMemo(() => {
    const rows = report.gaps.filter((gap) => (filter === 'all' ? true : filter === 'gaps' ? !gap.met : gap.met));
    return [...rows].sort((a, b) => Number(a.met) - Number(b.met) || b.priorityScore - a.priorityScore || b.gap - a.gap);
  }, [report.gaps, filter]);

  if (!report.jobRole) {
    return (
      <>
        <PageHeader eyebrow="Trainee workspace" title="Skill gaps" />
        <EmptyState title="No job role assigned" description="Skill gaps compare your competency levels with what your job role requires. Ask an administrator to assign your job role." icon={<TriangleAlert size={18} />} />
      </>
    );
  }

  return (
    <div className="animate-fade-in">
      <PageHeader
        eyebrow="Trainee workspace"
        title="Skill gaps"
        description={`Your current competency levels compared with the levels required for ${report.jobRole.name}. Every number below is calculated from your recorded evidence, and each priority can be explained.`}
        actions={<ReadinessTimeTravel value={offsetDays} onChange={onOffsetChange} />}
      />

      {report.asOf.simulated && (
        <div className="mb-6">
          <SimulationBanner asOf={report.asOf} />
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Competencies required" value={summary.totalCompetencies} meta={`${summary.met} already meet the requirement`} icon={<Target size={19} />} tone="sky" />
        <StatCard label="With a skill gap" value={summary.withGap} meta={`Average gap ${summary.averageGap} points`} icon={<TriangleAlert size={19} />} tone="coral" />
        <StatCard label="High or critical" value={highOrCritical} meta={`${summary.byPriority.HIGH + summary.byPriority.CRITICAL} high-priority to train`} icon={<TriangleAlert size={19} />} tone="amber" />
        <StatCard label="Role readiness" value={`${Math.round(summary.readiness)}%`} meta={`${summary.averageCurrent}% average vs ${summary.averageRequired}% required`} icon={<Gauge size={19} />} tone="green" />
      </div>

      {summary.freshness.needingRefresher > 0 && (
        <div className="mt-4 flex flex-wrap items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <RefreshCw className="h-5 w-5 shrink-0 text-amber-600" aria-hidden="true" />
          <p className="min-w-0 flex-1 text-sm text-amber-900">
            <span className="font-bold">
              {summary.freshness.needingRefresher} competenc{summary.freshness.needingRefresher === 1 ? 'y needs' : 'ies need'} refreshing.
            </span>{' '}
            {summary.freshness.totalDecayPoints > 0 && `${summary.freshness.totalDecayPoints} points have been lost to competency decay. `}
            Freshness is calculated from when each competency was last practised.
          </p>
          <FreshnessSummaryRow byStatus={summary.freshness.byStatus} />
        </div>
      )}

      {report.refreshers.length > 0 && (
        <div className="mt-6">
          <RefresherPanel refreshers={report.refreshers} />
        </div>
      )}

      <div className="mt-8 grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="min-w-0 xl:col-span-2">
          <h2 className="sr-only">Competencies compared with your role</h2>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <Segmented
              label="Show competencies"
              value={filter}
              onChange={setFilter}
              items={[
                { id: 'gaps', label: `With a gap (${summary.withGap})` },
                { id: 'met', label: `Met (${summary.met})` },
                { id: 'all', label: `All (${summary.totalCompetencies})` },
              ]}
            />
            <p className="text-xs text-slate-500">Sorted by training priority</p>
          </div>
          {visible.length === 0 ? (
            <EmptyState
              title={filter === 'gaps' ? 'No skill gaps' : filter === 'met' ? 'No requirement is met yet' : 'Nothing to show'}
              description={filter === 'gaps' ? 'You meet every competency requirement of your role.' : 'Complete a course assessment to raise a competency level.'}
              icon={<Target size={18} />}
            />
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {visible.map((gap) => (
                <GapCard key={gap.competencyId} gap={gap} />
              ))}
            </div>
          )}
        </div>

        <div className="space-y-6">
          <Card title="Competency profile" description="Current (filled) vs required (dashed)">
            <CompetencyRadar data={report.gaps.map((gap) => ({ competency: gap.competencyName, current: gap.currentLevel, required: gap.requiredLevel }))} height={280} />
          </Card>
          <SeverityLegend />
        </div>
      </div>
    </div>
  );
}

export default function SkillGapsPage() {
  usePageTitle('Skill gaps');
  const [offsetDays, setOffsetDays] = useState(0);
  const query = useQuery({
    queryKey: keys.skillGapsAt(offsetDays),
    queryFn: () => fetchSkillGaps(offsetDays),
    // Keep the previous answer on screen while a simulated date loads, so the page does not flash.
    placeholderData: (previous) => previous,
  });
  return <QueryBoundary query={query}>{(report) => <Content report={report} offsetDays={offsetDays} onOffsetChange={setOffsetDays} />}</QueryBoundary>;
}
