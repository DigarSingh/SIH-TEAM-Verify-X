import { useQuery } from '@tanstack/react-query';
import { Boxes, CheckCircle2, Clock, CircleAlert, Smartphone, Target } from 'lucide-react';
import { Link } from 'react-router-dom';
import { keys } from '../../api/keys';
import { QueryBoundary } from '../../components/domain/QueryBoundary';
import { FreshnessBadge } from '../../components/domain/ReadinessParts';
import { Badge, ButtonLink, Card, EmptyState, InlineAlert, PageHeader, ProgressBar } from '../../components/ui';
import { usePageTitle } from '../../hooks/misc';
import { fetchARModules, fetchARRefresher } from '../../services/ar';
import type { ARModuleSummary } from '../../types';
import { DIFFICULTY_META } from '../../utils/constants';
import { timeAgo } from '../../utils/format';

/**
 * The AR Instrument Lab.
 *
 * Each card answers the question a trainee actually has: what is this, how long
 * will it take, and what will it do to my competency. The competency standing
 * is on the card for that reason - a lab with no effect on where you stand is
 * just a toy.
 */

function ModuleCard({ module }: { module: ARModuleSummary }) {
  const { standing, progress } = module;
  const difficulty = DIFFICULTY_META[module.difficulty];

  return (
    <Card className="flex h-full flex-col">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-display text-lg font-bold text-navy">{module.title}</h3>
            {module.kind === 'REFRESHER' && <Badge tone="warning">Refresher</Badge>}
            {module.isSimulation && <Badge tone="purple">Simulated</Badge>}
          </div>
          <p className="mt-0.5 text-xs font-semibold uppercase tracking-wide text-sky-deep">{module.subtitle ?? 'AR practical'}</p>
        </div>
        {progress.passed && (
          <Badge tone="success">
            <CheckCircle2 size={12} aria-hidden /> Passed
          </Badge>
        )}
      </div>

      <p className="mt-3 flex-1 text-sm leading-6 text-slate-600">{module.description}</p>

      <dl className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
        <div>
          <dt className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Competency</dt>
          <dd className="font-semibold text-navy">{module.competency.name}</dd>
        </div>
        <div>
          <dt className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Duration</dt>
          <dd className="flex items-center gap-1 font-semibold text-navy">
            <Clock size={13} aria-hidden /> {module.durationMinutes} min
          </dd>
        </div>
        <div>
          <dt className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Difficulty</dt>
          <dd className="font-semibold text-navy">{difficulty.label}</dd>
        </div>
        <div>
          <dt className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Tasks</dt>
          <dd className="font-semibold text-navy">{module.taskCount}</dd>
        </div>
      </dl>

      <div className="mt-4 rounded-xl bg-slate-50 px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
          <span className="font-semibold text-slate-600">
            Your {module.competency.name}: <strong className="text-navy">{standing.effectiveLevel}%</strong>
            {standing.requiredLevel !== null && <span className="text-slate-500"> of {standing.requiredLevel}% needed</span>}
          </span>
          <FreshnessBadge status={standing.freshnessStatus} />
        </div>
        <ProgressBar
          value={standing.requiredLevel ? Math.min(100, (standing.effectiveLevel / standing.requiredLevel) * 100) : standing.effectiveLevel}
          color={standing.needsRefresher ? 'amber' : 'sky'}
          height="h-1.5"
          label={`${module.competency.name} progress`}
        />
        {module.course && (
          <p className="mt-2 text-[11px] text-slate-500">
            Combined with the theory assessment from <span className="font-semibold">{module.course.title}</span> ({Math.round(module.theoryWeight * 100)}% theory /{' '}
            {Math.round((1 - module.theoryWeight) * 100)}% practical).
          </p>
        )}
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <div className="text-[11px] text-slate-500">
          {progress.attempts === 0 ? (
            'Not attempted yet'
          ) : (
            <>
              {progress.completed} attempt{progress.completed === 1 ? '' : 's'}
              {progress.bestScore !== null && ` · best ${progress.bestScore}%`}
              {progress.lastAttemptAt && ` · ${timeAgo(progress.lastAttemptAt)}`}
            </>
          )}
        </div>
        <ButtonLink to={`/trainee/ar-lab/${module.key}`} size="sm">
          {progress.attempts === 0 ? 'Start AR Lab' : progress.passed ? 'Practise again' : 'Continue'}
        </ButtonLink>
      </div>
    </Card>
  );
}

export default function ARLabPage() {
  usePageTitle('AR Instrument Lab');
  const modules = useQuery({ queryKey: keys.arModules(0), queryFn: () => fetchARModules(0) });
  const refresher = useQuery({ queryKey: keys.arRefresher(0), queryFn: () => fetchARRefresher(0) });

  return (
    <div className="animate-fade-in space-y-6">
      <PageHeader
        eyebrow="Practise, not just read"
        title="AR Instrument Lab"
        description="Place a meteorological instrument in the room in front of you and show that you can work with it. What you score here counts towards your competency, through the same engine as every assessment."
      />

      {refresher.data && (
        <InlineAlert tone="warning">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="flex items-start gap-2">
              <CircleAlert size={16} className="mt-0.5 shrink-0" aria-hidden />
              <span>
                <strong>{refresher.data.competency.name} needs attention.</strong> {refresher.data.freshness.reason}
              </span>
            </span>
            <ButtonLink to={`/trainee/ar-lab/${refresher.data.module.key}`} size="sm">
              Start the {refresher.data.module.durationMinutes}-minute refresher
            </ButtonLink>
          </div>
        </InlineAlert>
      )}

      <Card>
        <div className="flex flex-wrap items-start gap-4">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-sky/10 text-sky-deep" aria-hidden>
            <Smartphone size={20} />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="font-display text-base font-bold text-navy">Best on an Android phone, works anywhere</h2>
            <p className="mt-1 text-sm leading-6 text-slate-600">
              On a supported phone the instrument is placed in your room through the camera. On a laptop, or a phone without AR, the same lab runs as an interactive 3D model: you can rotate, zoom and
              select every component, and the assessment is identical. <strong>AR is never required to complete a lab.</strong>
            </p>
          </div>
        </div>
      </Card>

      <QueryBoundary query={modules}>
        {(data) =>
          data.modules.length === 0 ? (
            <EmptyState title="No AR labs yet" description="Instrument labs appear here once an administrator publishes them." icon={<Boxes size={18} />} />
          ) : (
            <ul className="grid gap-5 lg:grid-cols-2">
              {data.modules.map((module) => (
                <li key={module.id}>
                  <ModuleCard module={module} />
                </li>
              ))}
            </ul>
          )
        }
      </QueryBoundary>

      <Card title="How a practical changes your competency" description="The same rules as every other kind of evidence">
        <ol className="space-y-2 text-sm text-slate-600">
          <li className="flex gap-2">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-sky-deep text-[11px] font-bold text-white">1</span>
            You work through the lab and the server marks it. Your score is calculated from what you selected, never sent by your device.
          </li>
          <li className="flex gap-2">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-sky-deep text-[11px] font-bold text-white">2</span>
            The practical is combined with your theory result using the weighting the lab is configured with.
          </li>
          <li className="flex gap-2">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-sky-deep text-[11px] font-bold text-white">3</span>
            The competency engine takes the practical as evidence and applies its own update rules - it is not set to your score.
          </li>
          <li className="flex gap-2">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-sky-deep text-[11px] font-bold text-white">4</span>
            The lab counts as practice, so it also resets how fresh that competency is.
          </li>
        </ol>
        <p className="mt-4 text-xs text-slate-500">
          <Target size={12} className="mr-1 inline" aria-hidden />
          Want to see the working?{' '}
          <Link to="/trainee/passport" className="font-semibold text-sky-deep hover:text-navy">
            Your Competency Passport
          </Link>{' '}
          records every change with the evidence behind it.
        </p>
      </Card>
    </div>
  );
}
