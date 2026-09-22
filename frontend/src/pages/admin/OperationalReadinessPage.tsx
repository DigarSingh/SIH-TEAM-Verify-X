import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, CalendarClock, Gauge, Layers, ShieldAlert, TrendingDown, Users } from 'lucide-react';
import { useState } from 'react';
import { keys } from '../../api/keys';
import { FreshnessSummaryRow, ReadinessTimeTravel, SimulationBanner } from '../../components/domain/ReadinessParts';
import { QueryBoundary } from '../../components/domain/QueryBoundary';
import { Badge, Card, EmptyState, PageHeader, ProgressBar, StatCard } from '../../components/ui';
import { usePageTitle } from '../../hooks/misc';
import { fetchReadinessOverview } from '../../services/readiness';
import type { KnowledgeRisk, ReadinessEventSummary, ReadinessOverview } from '../../types';
import { formatDate } from '../../utils/format';

const RISK_TONE: Record<KnowledgeRisk, 'success' | 'info' | 'warning' | 'danger'> = {
  LOW: 'success',
  WATCH: 'info',
  HIGH: 'warning',
  CRITICAL: 'danger',
};

const BAND_TONE = { STRONG: 'text-emerald-600', ADEQUATE: 'text-sky-deep', FRAGILE: 'text-amber-600', AT_RISK: 'text-red-600' } as const;

const HAZARD_LABEL: Record<ReadinessEventSummary['hazardType'], string> = {
  MONSOON: 'Monsoon',
  CYCLONE: 'Cyclone',
  HEATWAVE: 'Heatwave',
  FLOOD: 'Flood',
  WINTER: 'Winter',
  THUNDERSTORM: 'Thunderstorm',
  OTHER: 'Operational',
};

/** The headline index, with the calculation behind it always on show. */
function ReadinessIndexCard({ index }: { index: ReadinessOverview['index'] }) {
  const { components } = index;
  const parts = [
    { label: 'Competency coverage', value: components.coverage },
    { label: 'Freshness', value: components.freshness },
    { label: 'Knowledge continuity', value: components.continuity },
  ];

  return (
    <Card
      title="Capacity Connect Readiness Index"
      description="A demonstration metric, not an official IMD measure"
      action={<Badge tone="purple">Demonstration metric</Badge>}
    >
      <div className="flex flex-wrap items-end gap-6">
        <div>
          <p className={`font-display text-5xl font-bold ${BAND_TONE[index.band]}`}>{index.score}</p>
          <p className="mt-1 text-sm font-bold text-slate-600">out of 100 &middot; {index.label}</p>
        </div>
        <dl className="min-w-0 flex-1 space-y-2.5">
          {parts.map((part) => (
            <div key={part.label}>
              <div className="flex items-center justify-between text-xs">
                <dt className="font-semibold text-slate-600">{part.label}</dt>
                <dd className="font-bold text-navy">{part.value}</dd>
              </div>
              <ProgressBar value={part.value} color="sky" height="h-1.5" label={part.label} />
            </div>
          ))}
          {components.criticalGapPenalty > 0 && (
            <p className="flex items-center gap-1.5 text-xs font-semibold text-red-700">
              <TrendingDown className="h-3.5 w-3.5" aria-hidden="true" />
              &minus;{components.criticalGapPenalty} for critical skill gaps
            </p>
          )}
        </dl>
      </div>
      <p className="mt-4 rounded-xl bg-slate-50 p-3 text-xs leading-relaxed text-slate-600">{index.explanation}</p>
    </Card>
  );
}

function UpcomingEvents({ events }: { events: ReadinessEventSummary[] }) {
  if (events.length === 0) {
    return (
      <Card title="Upcoming readiness events">
        <EmptyState title="No events in the calendar" description="Add a readiness event to track preparation for a hazard season." icon={<CalendarClock size={18} />} />
      </Card>
    );
  }
  return (
    <Card title="Upcoming readiness events" description="Readiness measured at each event's start date">
      <ul className="space-y-4">
        {events.map((event) => (
          <li key={event.id}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <h3 className="font-display text-sm font-bold text-navy">
                  {event.name} {event.isSimulation && <Badge tone="purple">Simulated</Badge>}
                </h3>
                <p className="text-xs text-slate-500">
                  {HAZARD_LABEL[event.hazardType]} &middot; starts {formatDate(event.startDate)}
                  {event.daysUntilStart >= 0 ? ` (in ${event.daysUntilStart} days)` : ' (under way)'}
                </p>
              </div>
              <span className="font-display text-lg font-bold text-navy">{event.workforceReady}%</span>
            </div>
            <div className="mt-2">
              <ProgressBar value={event.workforceReady} color={event.workforceReady >= 80 ? 'green' : event.workforceReady >= 50 ? 'amber' : 'red'} label={`${event.name} readiness`} />
            </div>
            <p className="mt-1.5 text-xs text-slate-500">
              {event.readyCount} of {event.totalPeople} ready
              {event.criticalCount > 0 && <span className="font-semibold text-red-700"> &middot; {event.criticalCount} critical</span>}
              {event.weakestCompetencies[0] && ` · biggest gap: ${event.weakestCompetencies[0].competencyName}`}
            </p>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function SuccessionSection({ succession }: { succession: ReadinessOverview['succession'] }) {
  return (
    <Card title="Knowledge continuity" description="Where too few people hold a competency">
      <div className="grid grid-cols-3 gap-3 text-center">
        {[
          { label: 'At risk', value: succession.atRisk },
          { label: 'Thinly covered', value: succession.thinlyCovered },
          { label: 'Experts leaving', value: succession.expertsLeaving },
        ].map((stat) => (
          <div key={stat.label} className="rounded-xl bg-slate-50 p-3">
            <p className="font-display text-xl font-bold text-navy">{stat.value}</p>
            <p className="text-[11px] font-semibold text-slate-500">{stat.label}</p>
          </div>
        ))}
      </div>
      {succession.top.length === 0 ? (
        <p className="mt-4 text-xs text-slate-500">No competency is currently at high or critical continuity risk.</p>
      ) : (
        <ul className="mt-4 space-y-3">
          {succession.top.map((risk) => (
            <li key={risk.competencyId} className="border-t border-slate-100 pt-3 first:border-0 first:pt-0">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-semibold text-navy">{risk.competencyName}</span>
                <Badge tone={RISK_TONE[risk.risk]}>{risk.risk === 'CRITICAL' ? 'Critical' : 'High'} risk</Badge>
              </div>
              <p className="mt-1 text-xs leading-relaxed text-slate-500">{risk.reason}</p>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function Content({ overview, offsetDays, onOffsetChange }: { overview: ReadinessOverview; offsetDays: number; onOffsetChange: (days: number) => void }) {
  const { headline, index } = overview;

  return (
    <div className="animate-fade-in">
      <PageHeader
        eyebrow="Administration"
        title="Operational readiness"
        description="Whether the organisation can do the work it is responsible for: competency coverage, how current it is, who is at risk of losing it, and what is coming."
        actions={<ReadinessTimeTravel value={offsetDays} onChange={onOffsetChange} />}
      />

      {overview.asOf.simulated && (
        <div className="mb-6">
          <SimulationBanner asOf={overview.asOf} />
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard label="Overall readiness" value={`${headline.overallReadiness}%`} meta={index.label} icon={<Gauge size={19} />} tone="sky" />
        <StatCard label="Competencies at risk" value={headline.competenciesAtRisk} meta="At risk, critical or expired" icon={<TrendingDown size={19} />} tone="amber" />
        <StatCard label="Critical skill gaps" value={headline.criticalSkillGaps} meta="Against role requirements" icon={<AlertTriangle size={19} />} tone="coral" />
        <StatCard label="Knowledge-loss risks" value={headline.knowledgeLossRisks} meta="High or critical continuity" icon={<Users size={19} />} tone="coral" />
        <StatCard label="Upcoming events" value={headline.upcomingEvents} meta="In the readiness calendar" icon={<CalendarClock size={19} />} tone="green" />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <ReadinessIndexCard index={index} />
        </div>
        <UpcomingEvents events={overview.events} />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-3">
        <Card title="Competency decay" description="Average effective level and what decay has taken off it" className="xl:col-span-2">
          {overview.byCompetency.length === 0 ? (
            <EmptyState title="Nothing to show" description="No role requirements have been configured yet." icon={<Layers size={18} />} />
          ) : (
            <div className="relative overflow-x-auto">
              <table className="w-full min-w-[34rem] text-sm">
                <caption className="sr-only">Competencies with their average effective level, decay and freshness</caption>
                <thead>
                  <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-500">
                    <th scope="col" className="pb-2 font-bold">Competency</th>
                    <th scope="col" className="pb-2 text-right font-bold">Average</th>
                    <th scope="col" className="pb-2 text-right font-bold">Lost to decay</th>
                    <th scope="col" className="pb-2 text-right font-bold">People short</th>
                    <th scope="col" className="pb-2 pl-3 font-bold">Freshness</th>
                  </tr>
                </thead>
                <tbody>
                  {overview.byCompetency.map((competency) => (
                    <tr key={competency.competencyId} className="border-b border-slate-50 last:border-0">
                      <th scope="row" className="py-2.5 pr-3 text-left font-semibold text-navy">
                        {competency.competencyName}
                        {competency.knowledgeRisk && (competency.knowledgeRisk === 'HIGH' || competency.knowledgeRisk === 'CRITICAL') && (
                          <ShieldAlert className="ml-1.5 inline h-3.5 w-3.5 text-amber-600" aria-label="Knowledge-loss risk" />
                        )}
                      </th>
                      <td className="py-2.5 text-right font-bold text-navy">{competency.averageLevel}%</td>
                      <td className="py-2.5 text-right text-amber-700">{competency.averageDecay > 0 ? `−${competency.averageDecay}` : '—'}</td>
                      <td className="py-2.5 text-right text-slate-600">{competency.peopleShort}</td>
                      <td className="py-2.5 pl-3">
                        <FreshnessSummaryRow byStatus={competency.byStatus} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <SuccessionSection succession={overview.succession} />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Card title="Readiness by department" description="Share of role requirements met, weakest first">
          <ul className="space-y-3">
            {overview.byDepartment.map((department) => (
              <li key={department.departmentId}>
                <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                  <span className="font-semibold text-navy">{department.departmentName}</span>
                  <span className="text-xs text-slate-500">
                    {department.people} {department.people === 1 ? 'person' : 'people'} &middot; <span className="font-bold text-navy">{department.coverage}%</span>
                  </span>
                </div>
                <div className="mt-1">
                  <ProgressBar value={department.coverage} color={department.coverage >= 80 ? 'green' : department.coverage >= 60 ? 'amber' : 'red'} label={`${department.departmentName} coverage`} />
                </div>
                {department.needingRefresher > 0 && <p className="mt-1 text-xs text-amber-700">{department.needingRefresher} competencies need a refresher</p>}
              </li>
            ))}
          </ul>
        </Card>

        <Card title="Recertification" description="Soonest first; overdue leads">
          {overview.recertifications.length === 0 ? (
            <EmptyState title="Nothing due" description="No competency is approaching its recertification date." icon={<CalendarClock size={18} />} />
          ) : (
            <ul className="divide-y divide-slate-100">
              {overview.recertifications.slice(0, 12).map((item) => (
                <li key={`${item.userId}:${item.competencyId}`} className="flex flex-wrap items-center justify-between gap-2 py-2.5 first:pt-0">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-navy">{item.userName}</p>
                    <p className="text-xs text-slate-500">{item.competencyName}</p>
                  </div>
                  <Badge tone={item.overdue ? 'danger' : item.daysUntil <= 30 ? 'warning' : 'neutral'}>
                    {item.overdue ? `Overdue by ${Math.abs(item.daysUntil)} days` : `Due in ${item.daysUntil} days`}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <p className="mt-8 flex items-start gap-2 rounded-2xl bg-slate-50 p-4 text-xs leading-relaxed text-slate-500">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        <span>
          Every figure on this page is derived from recorded competency evidence and the configured decay, continuity and index settings. The index and the decay
          half-lives shipped with this system are <strong>demonstration values</strong>, not official IMD policy. Each freshness status carries the reason behind it on
          the competency and skill-gap screens.
        </span>
      </p>
    </div>
  );
}

export default function OperationalReadinessPage() {
  usePageTitle('Operational readiness');
  const [offsetDays, setOffsetDays] = useState(0);
  const query = useQuery({
    queryKey: keys.readinessOverview(offsetDays),
    queryFn: () => fetchReadinessOverview(offsetDays),
    placeholderData: (previous) => previous,
  });
  return <QueryBoundary query={query}>{(overview) => <Content overview={overview} offsetDays={offsetDays} onOffsetChange={setOffsetDays} />}</QueryBoundary>;
}
