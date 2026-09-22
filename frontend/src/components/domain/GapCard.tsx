import { ChevronDown, Lock } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { CompetencyRecord, Recommendation, SkillGapReportItem } from '../../types';
import { cn } from '../../utils/cn';
import { LEVEL_BAND_LABEL } from '../../utils/constants';
import { formatDuration } from '../../utils/format';
import { Badge, Button, ButtonLink } from '../ui';
import { useEnroll } from '../../hooks/learning';
import { DifficultyBadge, LearningStatusBadge, PriorityBadge, SeverityBadge } from './badges';
import { FreshnessBadge, FreshnessNote } from './ReadinessParts';
import { CompetencyMeter } from './CompetencyMeter';

/**
 * One competency: required level, current level, gap, severity, priority and
 * the plain-language explanation of how that priority was calculated.
 */
export function GapCard({ gap, compact = false }: { gap: CompetencyRecord | SkillGapReportItem; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const courses = 'recommendedCourses' in gap ? gap.recommendedCourses : [];
  return (
    <article className="rounded-2xl border border-slate-100 bg-white p-5 shadow-card print-break-avoid" aria-label={`${gap.competencyName} skill gap`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-display text-base font-bold text-navy">{gap.competencyName}</h3>
          <p className="text-xs text-slate-500">
            {gap.category} · {LEVEL_BAND_LABEL[gap.band]} level
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {gap.freshness.status !== 'CURRENT' && <FreshnessBadge status={gap.freshness.status} title={gap.freshness.reason} />}
          <SeverityBadge severity={gap.severity} met={gap.met} />
          {!gap.met && <PriorityBadge level={gap.priorityLevel} score={gap.priorityScore} />}
        </div>
      </div>

      <div className="mt-6">
        <CompetencyMeter current={gap.currentLevel} required={gap.requiredLevel} severity={gap.severity} label={gap.competencyName} />
      </div>

      <FreshnessNote freshness={gap.freshness} />

      <dl className="mt-3 grid grid-cols-3 gap-3 text-center">
        {[
          ['Current', `${gap.currentLevel}%`],
          ['Required', `${gap.requiredLevel}%`],
          ['Gap', gap.met ? 'None' : `${gap.gap} pts`],
        ].map(([label, value]) => (
          <div key={label} className="rounded-xl bg-slate-50 px-2 py-2">
            <dt className="text-[10px] font-bold uppercase tracking-wide text-slate-500">{label}</dt>
            <dd className="font-display text-lg font-bold text-navy">{value}</dd>
          </div>
        ))}
      </dl>

      {!compact && (
        <>
          <button type="button" onClick={() => setOpen((value) => !value)} aria-expanded={open} className="no-print mt-3 flex items-center gap-1 text-xs font-bold text-sky-deep hover:text-navy">
            Why this priority? <ChevronDown size={14} className={cn('transition', open && 'rotate-180')} aria-hidden />
          </button>
          <p className={cn('mt-2 rounded-xl bg-mist p-3 text-xs leading-5 text-slate-600', !open && 'hidden print:block')}>{gap.reason}</p>
        </>
      )}

      {courses.length > 0 && (
        <div className="mt-4 border-t border-slate-100 pt-4">
          <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-slate-500">Recommended training</p>
          <ul className="space-y-1.5">
            {courses.slice(0, compact ? 2 : 3).map((course) => (
              <li key={course.courseId} className="flex items-center justify-between gap-2 text-sm">
                <span className="flex min-w-0 items-center gap-2">
                  {course.locked && <Lock size={13} className="shrink-0 text-slate-500" aria-label="Locked until prerequisites are complete" />}
                  <Link to={`/trainee/courses/${course.courseId}`} className="truncate font-semibold text-navy hover:text-sky-deep">
                    {course.title}
                  </Link>
                </span>
                <LearningStatusBadge status={course.status} />
              </li>
            ))}
          </ul>
        </div>
      )}
    </article>
  );
}

/** A ranked, explained course recommendation with a one-click enroll. */
export function RecommendationCard({ recommendation, expanded = false }: { recommendation: Recommendation; expanded?: boolean }) {
  const enroll = useEnroll();
  const [showAll, setShowAll] = useState(expanded);
  const reasons = showAll ? recommendation.reasons : recommendation.reasons.slice(0, 1);
  const blockedNames = recommendation.blockedBy.length;
  const inProgress = recommendation.status !== 'NOT_STARTED';

  return (
    <article className="rounded-2xl border border-slate-100 bg-white p-5 shadow-card">
      <div className="flex items-start gap-4">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-navy font-display text-sm font-bold text-white" aria-label={`Rank ${recommendation.rank}`}>
          {recommendation.rank}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <DifficultyBadge difficulty={recommendation.difficulty} />
            {inProgress && <LearningStatusBadge status={recommendation.status} />}
            {!recommendation.ready && (
              <Badge tone="neutral">
                <Lock size={11} aria-hidden /> Prerequisites needed
              </Badge>
            )}
          </div>
          <h3 className="mt-2 font-display text-base font-bold text-navy">
            <Link to={`/trainee/courses/${recommendation.courseId}`} className="hover:text-sky-deep">
              {recommendation.title}
            </Link>
          </h3>
          <p className="text-xs text-slate-500">
            {recommendation.category} · {formatDuration(recommendation.durationMinutes)}
          </p>

          <ul className="mt-3 space-y-1.5 text-xs leading-5 text-slate-600" aria-label="Why this course is recommended">
            {reasons.map((reason) => (
              <li key={reason} className="flex gap-2">
                <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-sky" aria-hidden />
                <span>{reason}</span>
              </li>
            ))}
          </ul>
          {recommendation.reasons.length > 1 && !expanded && (
            <button type="button" onClick={() => setShowAll((value) => !value)} className="mt-1.5 text-xs font-bold text-sky-deep hover:text-navy">
              {showAll ? 'Show less' : `Show ${recommendation.reasons.length - 1} more reason${recommendation.reasons.length === 2 ? '' : 's'}`}
            </button>
          )}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
        <ButtonLink to={`/trainee/courses/${recommendation.courseId}`} variant="secondary" size="sm">
          Details
        </ButtonLink>
        {inProgress ? (
          <ButtonLink to={`/trainee/learn/${recommendation.courseId}`} size="sm">
            Continue
          </ButtonLink>
        ) : recommendation.ready ? (
          <Button size="sm" loading={enroll.isPending} onClick={() => enroll.mutate(recommendation.courseId)}>
            Enroll now
          </Button>
        ) : (
          <Button size="sm" disabled title={`Complete ${blockedNames} prerequisite course${blockedNames === 1 ? '' : 's'} first`}>
            Locked
          </Button>
        )}
      </div>
    </article>
  );
}
