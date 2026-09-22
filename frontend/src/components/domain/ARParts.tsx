import { useQuery } from '@tanstack/react-query';
import { Boxes, CircleAlert, Clock, Smartphone, TrendingUp } from 'lucide-react';
import { Link } from 'react-router-dom';
import { keys } from '../../api/keys';
import { fetchARModules, fetchARRefresher } from '../../services/ar';
import type { ARAttemptRow } from '../../types';
import { Badge, ButtonLink, Card, DataTable, EmptyState, Td, Th } from '../ui';
import { formatDate } from '../../utils/format';

/**
 * AR lab panels shared by the dashboards.
 *
 * The trainee's panel exists to carry one message: a competency that has faded
 * can be brought back in five minutes, and here is the button. That is the join
 * between the decay engine and the lab, and it belongs where people look first.
 */

/** "AR Training" for the trainee dashboard. */
export function ARTrainingPanel() {
  const modules = useQuery({ queryKey: keys.arModules(0), queryFn: () => fetchARModules(0), staleTime: 60_000 });
  const refresher = useQuery({ queryKey: keys.arRefresher(0), queryFn: () => fetchARRefresher(0), staleTime: 60_000 });

  const labs = (modules.data?.modules ?? []).filter((module) => module.kind === 'FULL_LAB');
  const completed = labs.filter((module) => module.progress.completed > 0).length;
  if (modules.isLoading || labs.length === 0) return null;

  return (
    <Card
      title={
        <span className="flex items-center gap-2">
          <Boxes size={17} className="text-sky-deep" aria-hidden /> AR Training
        </span>
      }
      description="Practise on the instrument, not just about it"
      action={
        <Badge tone="neutral">
          {completed} of {labs.length} labs completed
        </Badge>
      }
    >
      {refresher.data ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3.5">
          <p className="flex items-start gap-2 text-sm font-bold text-amber-900">
            <CircleAlert size={16} className="mt-0.5 shrink-0" aria-hidden />
            {refresher.data.competency.name} is {refresher.data.freshness.statusLabel.toLowerCase()}.
          </p>
          <p className="mt-1.5 text-xs leading-6 text-amber-900/80">{refresher.data.freshness.reason}</p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <ButtonLink to={`/trainee/ar-lab/${refresher.data.module.key}`} size="sm">
              Start the {refresher.data.module.durationMinutes}-minute AR refresher
            </ButtonLink>
            <span className="flex items-center gap-1 text-[11px] text-amber-900/70">
              <Clock size={12} aria-hidden /> Recommended because the competency has faded, not because you failed anything
            </span>
          </div>
        </div>
      ) : (
        <ul className="space-y-2">
          {labs.slice(0, 2).map((module) => (
            <li key={module.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-100 px-4 py-3">
              <div className="min-w-0">
                <Link to={`/trainee/ar-lab/${module.key}`} className="text-sm font-semibold text-navy hover:text-sky-deep">
                  {module.title}
                </Link>
                <p className="text-xs text-slate-500">
                  {module.competency.name} · {module.durationMinutes} min
                  {module.progress.bestScore !== null && ` · best ${module.progress.bestScore}%`}
                </p>
              </div>
              <Badge tone={module.progress.passed ? 'success' : 'info'}>{module.progress.passed ? 'Passed' : module.progress.attempts > 0 ? 'In progress' : 'Not started'}</Badge>
            </li>
          ))}
        </ul>
      )}

      <p className="mt-4 flex items-center gap-1.5 text-[11px] text-slate-500">
        <Smartphone size={12} aria-hidden /> Best on an Android phone; works as interactive 3D everywhere else.
        <Link to="/trainee/ar-lab" className="ml-auto font-bold text-sky-deep hover:text-navy">
          Open the AR Lab →
        </Link>
      </p>
    </Card>
  );
}

/**
 * AR practical results for a trainer or administrator.
 *
 * The last column is the reason this table exists: what the practical did to
 * the trainee's competency. Without it this would be a list of scores.
 */
export function ARPerformanceTable({ attempts, emptyHint }: { attempts: ARAttemptRow[]; emptyHint: string }) {
  if (attempts.length === 0) {
    return <EmptyState title="No AR practicals completed yet" description={emptyHint} icon={<Boxes size={18} />} />;
  }
  return (
    <DataTable caption="AR practical performance">
      <thead>
        <tr>
          <Th>Trainee</Th>
          <Th>Lab</Th>
          <Th align="right">Practical</Th>
          <Th align="right">Theory</Th>
          <Th align="right">Final</Th>
          <Th>Competency change</Th>
          <Th>Completed</Th>
        </tr>
      </thead>
      <tbody>
        {attempts.map((attempt) => {
          const moved = attempt.competencyBefore !== null && attempt.competencyAfter !== null && attempt.competencyAfter !== attempt.competencyBefore;
          return (
            <tr key={attempt.id}>
              <Td>
                <span className="font-semibold text-navy">{attempt.user.name}</span>
                <span className="block text-[11px] text-slate-500">{attempt.user.department?.name ?? 'No department'}</span>
              </Td>
              <Td>
                {attempt.module.title}
                {attempt.module.kind === 'REFRESHER' && (
                  <Badge tone="warning" className="ml-1.5">
                    Refresher
                  </Badge>
                )}
              </Td>
              <Td align="right">{attempt.practicalPercentage}%</Td>
              <Td align="right">{attempt.theoryPercentage === null ? '-' : `${attempt.theoryPercentage}%`}</Td>
              <Td align="right">
                <strong className={attempt.passed ? 'text-emerald-700' : 'text-slate-600'}>{attempt.combinedPercentage ?? attempt.practicalPercentage}%</strong>
              </Td>
              <Td>
                {moved ? (
                  <span className="inline-flex items-center gap-1 font-semibold text-emerald-700">
                    <TrendingUp size={13} aria-hidden /> {attempt.competencyBefore}% → {attempt.competencyAfter}%
                  </span>
                ) : (
                  <span className="text-slate-500">No change</span>
                )}
              </Td>
              <Td>{formatDate(attempt.completedAt)}</Td>
            </tr>
          );
        })}
      </tbody>
    </DataTable>
  );
}
