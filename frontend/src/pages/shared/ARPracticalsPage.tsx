import { useQuery } from '@tanstack/react-query';
import { Boxes, CheckCircle2, Clock, RefreshCw, TrendingUp, TriangleAlert } from 'lucide-react';
import { keys } from '../../api/keys';
import { Columns, TrendChart } from '../../charts';
import { ARPerformanceTable } from '../../components/domain/ARParts';
import { QueryBoundary } from '../../components/domain/QueryBoundary';
import { Badge, Card, EmptyState, InlineAlert, PageHeader, StatCard } from '../../components/ui';
import { usePageTitle } from '../../hooks/misc';
import { useCurrentUser } from '../../hooks/useAuth';
import { fetchARAnalytics, fetchARAttempts } from '../../services/ar';
import { monthLabel } from '../../utils/format';

/**
 * AR practical results.
 *
 * Trainers see the results of the people they oversee; administrators also see
 * what the labs are doing to competency across the organisation. The headline
 * number is deliberately the competency gain, not the completion count: labs
 * completed measures activity, competency gained measures effect.
 */
export default function ARPracticalsPage() {
  usePageTitle('AR practicals');
  const user = useCurrentUser();
  const isAdmin = user.role === 'ADMIN';

  const attempts = useQuery({ queryKey: keys.arAttempts(), queryFn: () => fetchARAttempts() });
  const analytics = useQuery({ queryKey: keys.arAnalytics, queryFn: fetchARAnalytics, enabled: isAdmin });

  const duration = (seconds: number | null) => (seconds === null ? '-' : `${Math.floor(seconds / 60)}:${String(Math.round(seconds % 60)).padStart(2, '0')}`);

  return (
    <div className="animate-fade-in space-y-6">
      <PageHeader
        eyebrow="AR Instrument Lab"
        title="AR practical performance"
        description={
          isAdmin
            ? 'What the instrument labs are doing to competency across the organisation, and which tasks people find hardest.'
            : 'Practical results for the trainees on your courses, with what each practical did to their competency.'
        }
        actions={<Badge tone="purple">Demonstration data</Badge>}
      />

      {isAdmin && (
        <QueryBoundary query={analytics}>
          {(data) =>
            data.labsCompleted === 0 ? (
              <EmptyState title="No AR practicals completed yet" description="Once trainees complete a lab, the analytics appear here." icon={<Boxes size={18} />} />
            ) : (
              <div className="space-y-6">
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                  <StatCard label="Labs completed" value={data.labsCompleted} meta={`${data.distinctLearners} trainee${data.distinctLearners === 1 ? '' : 's'}`} icon={<Boxes size={18} />} tone="sky" />
                  <StatCard label="Average practical" value={data.averagePractical === null ? '-' : `${data.averagePractical}%`} meta={`Pass rate ${data.passRate ?? 0}%`} icon={<CheckCircle2 size={18} />} tone="teal" />
                  <StatCard
                    label="Average competency gain"
                    value={data.averageCompetencyGain === null ? '-' : `${data.averageCompetencyGain > 0 ? '+' : ''}${data.averageCompetencyGain}`}
                    meta="Points, after the engine's rules"
                    icon={<TrendingUp size={18} />}
                    tone="green"
                  />
                  <StatCard label="Refreshers completed" value={data.refresherCompletions} meta={`Average ${duration(data.averageDurationSeconds)} per lab`} icon={<RefreshCw size={18} />} tone="purple" />
                </div>

                <div className="grid gap-6 lg:grid-cols-2">
                  <Card title="Practical score distribution" description="Where practical scores fall, in bands of ten">
                    <Columns data={data.distribution as unknown as Record<string, string | number | null>[]} xKey="band" series={[{ key: 'count', name: 'Practicals', color: '#2D8CFF' }]} height={230} />
                  </Card>

                  <Card title="Completions over time" description="AR practicals finished each month">
                    {data.trend.length === 0 ? (
                      <p className="text-sm text-slate-500">Not enough history yet.</p>
                    ) : (
                      <TrendChart
                        data={data.trend.map((point) => ({ month: monthLabel(point.month), count: point.count }))}
                        series={[{ key: 'count', name: 'Completed', color: '#0EA5A8' }]}
                        height={230}
                      />
                    )}
                  </Card>
                </div>

                <div className="grid gap-6 lg:grid-cols-2">
                  <Card title="Hardest tasks" description="Lowest share of the available points, worst first">
                    <ul className="space-y-3">
                      {data.hardestTasks.map((task) => (
                        <li key={task.taskId}>
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <p className="min-w-0 text-sm text-slate-700">{task.instruction}</p>
                            <Badge tone={task.correctRate < 50 ? 'danger' : task.correctRate < 80 ? 'warning' : 'success'}>{task.correctRate}%</Badge>
                          </div>
                          <p className="text-[11px] text-slate-500">
                            {task.moduleTitle} · answered {task.answered} time{task.answered === 1 ? '' : 's'}
                          </p>
                        </li>
                      ))}
                    </ul>
                    <p className="mt-4 text-xs text-slate-500">A task everybody gets wrong is usually a teaching problem, not a workforce problem.</p>
                  </Card>

                  <Card title="By lab" description="Completion and average score per module">
                    <ul className="space-y-3">
                      {data.byModule.map((module) => (
                        <li key={module.moduleId} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-100 px-4 py-3">
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-navy">{module.title}</p>
                            <p className="text-[11px] text-slate-500">
                              {module.kind === 'REFRESHER' ? 'Refresher' : 'Full lab'} · {module.completions} completion{module.completions === 1 ? '' : 's'}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="font-display text-lg font-bold text-navy">{module.averagePractical === null ? '-' : `${module.averagePractical}%`}</p>
                            <p className="text-[11px] text-slate-500">pass rate {module.passRate ?? 0}%</p>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </Card>
                </div>

                <InlineAlert tone="info">
                  <span className="flex items-start gap-2">
                    <TriangleAlert size={15} className="mt-0.5 shrink-0" aria-hidden />
                    These figures come from simulated training content on a demonstration dataset. The competency gain is what the engine actually applied, not a projection.
                  </span>
                </InlineAlert>
              </div>
            )
          }
        </QueryBoundary>
      )}

      <Card
        title="Practical results"
        description="Each row is one completed practical, with what it did to that trainee's competency"
        action={
          <span className="flex items-center gap-1 text-[11px] text-slate-500">
            <Clock size={12} aria-hidden /> Most recent first
          </span>
        }
        padded={false}
      >
        <QueryBoundary query={attempts}>
          {(rows) => (
            <div className="p-0">
              <ARPerformanceTable attempts={rows} emptyHint="Results appear here as trainees complete the instrument labs." />
            </div>
          )}
        </QueryBoundary>
      </Card>
    </div>
  );
}
