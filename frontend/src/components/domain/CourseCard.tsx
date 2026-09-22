import { Clock, Layers, Star } from 'lucide-react';
import { Link } from 'react-router-dom';
import { assetUrl } from '../../api/client';
import type { CourseCard as CourseCardData, Role } from '../../types';
import { cn } from '../../utils/cn';
import { formatDuration } from '../../utils/format';
import { paths } from '../../utils/links';
import { Badge, ProgressBar } from '../ui';
import { CourseStatusBadge, DifficultyBadge, EnrollmentStatusBadge } from './badges';

/** Cover image with a graceful gradient fallback when a course has no thumbnail. */
export function CourseCover({ course, className }: { course: Pick<CourseCardData, 'thumbnailUrl' | 'title' | 'category'>; className?: string }) {
  const src = assetUrl(course.thumbnailUrl);
  return src ? (
    <img src={src} alt="" loading="lazy" className={cn('h-full w-full object-cover', className)} />
  ) : (
    <div aria-hidden className={cn('relative flex h-full w-full items-end overflow-hidden bg-gradient-to-br from-navy to-sky p-4', className)}>
      <span className="absolute -right-6 -top-6 h-24 w-24 rounded-full border-[14px] border-white/15" />
      <span className="relative text-xs font-bold uppercase tracking-wider text-white/70">{course.category}</span>
    </div>
  );
}

export function CourseCard({ course, role, showStatus = false }: { course: CourseCardData; role: Role; showStatus?: boolean }) {
  const enrollment = course.myEnrollment;
  return (
    <article className="group flex flex-col overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-card transition hover:-translate-y-0.5 hover:shadow-lift">
      <Link to={paths.course(role, course.id)} className="block h-36 overflow-hidden" tabIndex={-1} aria-hidden>
        <CourseCover course={course} className="transition duration-500 group-hover:scale-105" />
      </Link>
      <div className="flex flex-1 flex-col p-5">
        <div className="flex flex-wrap items-center gap-1.5">
          <DifficultyBadge difficulty={course.difficulty} />
          {showStatus && <CourseStatusBadge status={course.status} />}
          {enrollment && <EnrollmentStatusBadge status={enrollment.status} />}
        </div>
        <h3 className="mt-3 font-display text-lg font-bold leading-snug text-navy">
          <Link to={paths.course(role, course.id)} className="hover:text-sky-deep focus-visible:text-sky-deep">
            {course.title}
          </Link>
        </h3>
        <p className="mt-1 text-xs font-semibold text-slate-500">{course.trainer.name}</p>
        <p className="mt-2 line-clamp-2 text-sm leading-6 text-slate-500">{course.description}</p>

        {course.competencies.length > 0 && (
          <ul className="mt-3 flex flex-wrap gap-1.5" aria-label="Competencies developed">
            {course.competencies.slice(0, 3).map((competency) => (
              <li key={competency.id}>
                <Badge tone="info" title={`Takes a learner from ${competency.levelFrom}% to ${competency.levelTo}%`}>
                  {competency.name} <span className="font-medium">{competency.levelFrom}-{competency.levelTo}%</span>
                </Badge>
              </li>
            ))}
            {course.competencies.length > 3 && <li><Badge>+{course.competencies.length - 3}</Badge></li>}
          </ul>
        )}

        <div className="mt-auto pt-4">
          {enrollment && enrollment.status !== 'WITHDRAWN' && <ProgressBar value={enrollment.progress} showLabel label={`${course.title} progress`} />}
          <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
            <span className="flex items-center gap-1"><Clock size={13} aria-hidden /> {formatDuration(course.durationMinutes)}</span>
            <span className="flex items-center gap-1"><Layers size={13} aria-hidden /> {course.moduleCount} modules</span>
            {course.rating.count > 0 ? (
              <span className="flex items-center gap-1 font-bold text-navy">
                <Star size={13} className="fill-amber-400 text-amber-400" aria-hidden /> {course.rating.average.toFixed(1)}
                <span className="sr-only">average rating</span>
              </span>
            ) : (
              <span className="text-slate-500">No ratings yet</span>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}
