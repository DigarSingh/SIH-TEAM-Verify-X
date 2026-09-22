import { AlertTriangle, CalendarClock, FlaskConical, RefreshCw, TrendingDown } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { AsOf, Freshness, FreshnessStatus, RefresherItem } from '../../types';
import { FRESHNESS_META } from '../../utils/constants';
import { Badge, Card } from '../ui';

/** How current a competency is, with the reason available on hover. */
export const FreshnessBadge = ({ status, title }: { status: FreshnessStatus; title?: string }) => (
  <Badge tone={FRESHNESS_META[status].tone} title={title ?? FRESHNESS_META[status].hint}>
    {FRESHNESS_META[status].label}
  </Badge>
);

const dayLabel = (days: number) => `${Math.abs(Math.round(days))} day${Math.abs(Math.round(days)) === 1 ? '' : 's'}`;

/**
 * The decay story for one competency: what it was verified at, what it is worth
 * now, and why. Shown only when there is something to say.
 */
export function FreshnessNote({ freshness }: { freshness: Freshness }) {
  if (!freshness.decayApplied && freshness.recertificationDueAt === null) return null;
  const { decayPoints, baselineLevel, effectiveLevel, daysUntilRecertification } = freshness;

  return (
    <div className="mt-2 rounded-xl bg-slate-50 p-3 text-xs text-slate-600">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        {decayPoints > 0 && (
          <span className="inline-flex items-center gap-1.5 font-semibold text-slate-700">
            <TrendingDown className="h-3.5 w-3.5 text-amber-600" aria-hidden="true" />
            {baselineLevel}% verified &rarr; {effectiveLevel}% effective
          </span>
        )}
        {daysUntilRecertification !== null && (
          <span className="inline-flex items-center gap-1.5">
            <CalendarClock className="h-3.5 w-3.5 text-slate-500" aria-hidden="true" />
            {daysUntilRecertification < 0 ? `Recertification overdue by ${dayLabel(daysUntilRecertification)}` : `Recertification due in ${dayLabel(daysUntilRecertification)}`}
          </span>
        )}
      </div>
      <p className="mt-1.5 leading-relaxed">{freshness.reason}</p>
    </div>
  );
}

const OFFSETS = [
  { days: 0, label: 'Today' },
  { days: 30, label: '+30 days' },
  { days: 90, label: '+90 days' },
  { days: 180, label: '+180 days' },
];

/**
 * Readiness simulation: look at a future date without changing anything.
 *
 * The server recalculates decay, recertification, gaps and priorities for the
 * chosen date; no stored timestamp is touched, which is why this is safe to hand
 * to anyone looking at the system.
 */
export function ReadinessTimeTravel({ value, onChange, className }: { value: number; onChange: (offsetDays: number) => void; className?: string }) {
  return (
    <div className={className}>
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Readiness simulation date">
        <span className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-slate-500">
          <FlaskConical className="h-3.5 w-3.5" aria-hidden="true" />
          Readiness simulation
        </span>
        <div className="flex flex-wrap gap-1.5">
          {OFFSETS.map((offset) => {
            const active = value === offset.days;
            return (
              <button
                key={offset.days}
                type="button"
                onClick={() => onChange(offset.days)}
                aria-pressed={active}
                className={`rounded-full px-3 py-1.5 text-xs font-bold transition ${
                  active ? 'bg-navy text-sky-light' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {offset.label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/** Says plainly that the numbers on screen are a simulation, not today's reality. */
export function SimulationBanner({ asOf }: { asOf: AsOf }) {
  if (!asOf.simulated) return null;
  const when = new Date(asOf.date).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });
  return (
    <div role="status" className="flex items-start gap-3 rounded-2xl border border-violet-200 bg-violet-50 p-4 text-sm text-violet-900">
      <FlaskConical className="mt-0.5 h-5 w-5 shrink-0 text-violet-600" aria-hidden="true" />
      <p>
        <span className="font-bold">Simulation mode &mdash; demonstration only.</span> These figures show what readiness would look like on{' '}
        <span className="font-bold">{when}</span> ({asOf.offsetDays > 0 ? `${asOf.offsetDays} days from now` : `${Math.abs(asOf.offsetDays)} days ago`}) if nothing
        is practised or reassessed in the meantime. Nothing stored has changed.
      </p>
    </div>
  );
}

/**
 * "Maintain your readiness": competencies that were earned and have since lost
 * their freshness, with the courses that restore them.
 */
export function RefresherPanel({ refreshers }: { refreshers: RefresherItem[] }) {
  if (refreshers.length === 0) return null;

  return (
    <Card
      title="Maintain your readiness"
      description="These competencies were earned but have lost freshness. A short refresher restores them."
      action={
        <Badge tone="warning">
          <RefreshCw className="h-3 w-3" aria-hidden="true" />
          {refreshers.length} to refresh
        </Badge>
      }
    >
      <ul className="divide-y divide-slate-100">
        {refreshers.map((item) => (
          <li key={item.competencyId} className="py-4 first:pt-0 last:pb-0">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-display text-sm font-bold text-navy">{item.competencyName}</h3>
              <FreshnessBadge status={item.status} />
            </div>

            <p className="mt-1 text-xs text-slate-600">
              <span className="font-semibold text-slate-700">
                {item.effectiveLevel}% effective
              </span>{' '}
              against a required {item.requiredLevel}%
              {item.decayPoints > 0 && <> &mdash; down {item.decayPoints} points from the {item.baselineLevel}% you demonstrated</>}
            </p>
            <p className="mt-1.5 text-xs leading-relaxed text-slate-500">{item.reason}</p>

            {item.courses.length > 0 && (
              <ol className="mt-3 space-y-1.5">
                {item.courses.map((course, index) => (
                  <li key={course.courseId} className="flex items-center gap-2 text-xs">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-teal/10 font-bold text-teal-deep">{index + 1}</span>
                    <Link to={`/courses/${course.courseId}`} className="font-semibold text-sky-deep hover:underline">
                      {course.title}
                    </Link>
                  </li>
                ))}
              </ol>
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
}

/** Counts by freshness status, for a dashboard header. */
export function FreshnessSummaryRow({ byStatus }: { byStatus: Record<FreshnessStatus, number> }) {
  const shown = (Object.keys(FRESHNESS_META) as FreshnessStatus[]).filter((status) => byStatus[status] > 0);
  if (shown.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-2">
      {shown.map((status) => (
        <Badge key={status} tone={FRESHNESS_META[status].tone} title={FRESHNESS_META[status].hint}>
          {status === 'CRITICAL' && <AlertTriangle className="h-3 w-3" aria-hidden="true" />}
          {byStatus[status]} {FRESHNESS_META[status].label.toLowerCase()}
        </Badge>
      ))}
    </div>
  );
}
