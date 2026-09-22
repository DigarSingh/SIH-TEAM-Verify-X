import { useQuery } from '@tanstack/react-query';
import { Award, CheckCircle2, ChevronDown, ClipboardCheck, Clock, FileText, Layers, Link2, Lock, PlayCircle, Target, TextQuote, UserRound } from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { keys } from '../../api/keys';
import { CourseCover } from '../../components/domain/CourseCard';
import { CourseFeedback } from '../../components/domain/CourseFeedback';
import { DifficultyBadge, EnrollmentStatusBadge } from '../../components/domain/badges';
import { QueryBoundary } from '../../components/domain/QueryBoundary';
import { Badge, Button, ButtonLink, Card, InlineAlert, ProgressBar, SectionLabel, Stars } from '../../components/ui';
import { useEnroll } from '../../hooks/learning';
import { usePageTitle } from '../../hooks/misc';
import { fetchCourse } from '../../services/learner';
import type { CourseDetail, MaterialType } from '../../types';
import { cn } from '../../utils/cn';
import { formatDate, formatDuration, formatFileSize, plural } from '../../utils/format';

const MATERIAL_ICON: Record<MaterialType, typeof FileText> = { VIDEO: PlayCircle, DOCUMENT: FileText, LINK: Link2, TEXT: TextQuote };
const MATERIAL_LABEL: Record<MaterialType, string> = { VIDEO: 'Video', DOCUMENT: 'Document', LINK: 'Link', TEXT: 'Reading' };

function ModuleOutline({ course }: { course: CourseDetail }) {
  const [openId, setOpenId] = useState<string | null>(course.modules[0]?.id ?? null);
  if (course.modules.length === 0) return <p className="text-sm text-slate-500">The trainer has not added any modules yet.</p>;
  return (
    <ol className="space-y-3">
      {course.modules.map((module, index) => {
        const open = openId === module.id;
        return (
          <li key={module.id} className="overflow-hidden rounded-xl border border-slate-100">
            <button type="button" aria-expanded={open} onClick={() => setOpenId(open ? null : module.id)} className="flex w-full items-center gap-3 px-4 py-3.5 text-left hover:bg-slate-50">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-mist text-xs font-bold text-sky-deep">{index + 1}</span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-bold text-navy">{module.title}</span>
                <span className="text-xs text-slate-500">
                  {plural(module.materials.length, 'item')}
                  {module.durationMinutes > 0 && ` · ${formatDuration(module.durationMinutes)}`}
                </span>
              </span>
              <ChevronDown size={16} className={cn('shrink-0 text-slate-500 transition', open && 'rotate-180')} aria-hidden />
            </button>
            {open && (
              <div className="border-t border-slate-100 bg-slate-50/50 px-4 py-3">
                {module.description && <p className="mb-3 text-sm leading-6 text-slate-600">{module.description}</p>}
                {module.materials.length === 0 ? (
                  <p className="text-xs text-slate-500">No learning materials yet.</p>
                ) : (
                  <ul className="space-y-1.5">
                    {module.materials.map((material) => {
                      const Icon = MATERIAL_ICON[material.type];
                      return (
                        <li key={material.id} className="flex items-center gap-2.5 text-sm text-slate-600">
                          <Icon size={15} className="shrink-0 text-slate-500" aria-hidden />
                          <span className="min-w-0 flex-1 truncate">{material.title}</span>
                          <span className="text-xs text-slate-500">
                            {MATERIAL_LABEL[material.type]}
                            {material.sizeBytes ? ` · ${formatFileSize(material.sizeBytes)}` : ''}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            )}
          </li>
        );
      })}
    </ol>
  );
}

function EnrollPanel({ course }: { course: CourseDetail }) {
  const enroll = useEnroll();
  const enrollment = course.myEnrollment && course.myEnrollment.status !== 'WITHDRAWN' ? course.myEnrollment : null;
  const blocked = course.eligibility && !course.eligibility.allowed ? course.eligibility : null;

  if (enrollment) {
    return (
      <Card title="Your progress">
        <div className="space-y-4">
          <EnrollmentStatusBadge status={enrollment.status} />
          <ProgressBar value={enrollment.progress} showLabel label="Course progress" />
          <ButtonLink to={`/trainee/learn/${course.id}`} className="w-full">
            {enrollment.status === 'CERTIFIED' || enrollment.status === 'COMPLETED' ? 'Review course' : enrollment.progress === 0 ? 'Start learning' : 'Continue learning'}
          </ButtonLink>
        </div>
      </Card>
    );
  }

  return (
    <Card title="Enroll in this course">
      <div className="space-y-4">
        {course.status !== 'PUBLISHED' && <InlineAlert tone="warning">This course is not published, so it cannot be enrolled in.</InlineAlert>}
        {blocked && (
          <InlineAlert tone="warning">
            <p className="font-semibold">{blocked.message ?? 'You cannot enroll yet.'}</p>
            {blocked.missingPrerequisites.length > 0 && (
              <ul className="mt-2 list-disc space-y-1 pl-5">
                {blocked.missingPrerequisites.map((item) => (
                  <li key={item.id}>
                    <Link to={`/trainee/courses/${item.id}`} className="font-semibold underline">
                      {item.title}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </InlineAlert>
        )}
        <Button className="w-full" loading={enroll.isPending} disabled={course.status !== 'PUBLISHED' || Boolean(blocked)} onClick={() => enroll.mutate(course.id)}>
          {course.myEnrollment?.status === 'WITHDRAWN' ? 'Re-enroll' : 'Enroll now'}
        </Button>
        <p className="text-center text-xs text-slate-500">Free for all IMD employees. Progress and results are saved to your Competency Passport.</p>
      </div>
    </Card>
  );
}

function Detail({ course }: { course: CourseDetail }) {
  const enrolled = Boolean(course.myEnrollment && course.myEnrollment.status !== 'WITHDRAWN');
  return (
    <div className="animate-fade-in">
      <div className="mb-6 overflow-hidden rounded-3xl shadow-lift">
        <div className="relative h-48 md:h-60">
          <CourseCover course={course} className="object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-navy/90 via-navy/40 to-transparent" aria-hidden />
          <div className="absolute inset-x-0 bottom-0 p-6 md:p-8">
            <div className="flex flex-wrap items-center gap-2">
              <DifficultyBadge difficulty={course.difficulty} />
              <Badge tone="neutral">{course.category}</Badge>
              {course.certificateEnabled && (
                <Badge tone="purple">
                  <Award size={11} aria-hidden /> Certificate
                </Badge>
              )}
            </div>
            <h1 className="mt-3 font-display text-3xl font-bold text-white md:text-4xl">{course.title}</h1>
            <p className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1 text-sm text-white/80">
              <span className="flex items-center gap-1.5">
                <UserRound size={14} aria-hidden /> {course.trainer.name}
                {course.trainer.designation ? `, ${course.trainer.designation}` : ''}
              </span>
              <span className="flex items-center gap-1.5">
                <Clock size={14} aria-hidden /> {formatDuration(course.durationMinutes)}
              </span>
              <span className="flex items-center gap-1.5">
                <Layers size={14} aria-hidden /> {plural(course.moduleCount, 'module')}
              </span>
              {course.rating.count > 0 && (
                <span className="flex items-center gap-1.5">
                  <Stars value={course.rating.average} size={13} /> {course.rating.average.toFixed(1)} ({course.rating.count})
                </span>
              )}
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="min-w-0 space-y-8 lg:col-span-2">
          <section aria-labelledby="about">
            <SectionLabel>
              <span id="about">About this course</span>
            </SectionLabel>
            <Card>
              <p className="whitespace-pre-line text-sm leading-7 text-slate-600">{course.description}</p>
              {course.outcomes.length > 0 && (
                <>
                  <h3 className="mb-3 mt-6 font-display text-sm font-bold text-navy">What you will be able to do</h3>
                  <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {course.outcomes.map((outcome) => (
                      <li key={outcome} className="flex gap-2 text-sm text-slate-600">
                        <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-emerald-500" aria-hidden />
                        {outcome}
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </Card>
          </section>

          <section aria-labelledby="competencies">
            <SectionLabel>
              <span id="competencies">Competencies developed</span>
            </SectionLabel>
            {course.competencies.length === 0 ? (
              <Card>
                <p className="text-sm text-slate-500">This course is not mapped to a competency yet.</p>
              </Card>
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {course.competencies.map((competency) => (
                  <div key={competency.id} className="rounded-2xl border border-slate-100 bg-white p-4 shadow-card">
                    <div className="flex items-center gap-2">
                      <Target size={15} className="text-sky-deep" aria-hidden />
                      <p className="text-sm font-bold text-navy">{competency.name}</p>
                    </div>
                    <p className="mt-2 text-xs text-slate-500">Takes a learner from</p>
                    <div className="mt-1 flex items-center gap-2 font-display text-lg font-bold text-navy">
                      {competency.levelFrom}% <span className="text-slate-300">→</span> <span className="text-emerald-700">{competency.levelTo}%</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section aria-labelledby="modules">
            <SectionLabel>
              <span id="modules">Course content</span>
            </SectionLabel>
            <ModuleOutline course={course} />
          </section>

          {course.prerequisites.length > 0 && (
            <section aria-labelledby="prereq">
              <SectionLabel>
                <span id="prereq">Prerequisites</span>
              </SectionLabel>
              <Card padded={false}>
                <ul className="divide-y divide-slate-100">
                  {course.prerequisites.map((prerequisite) => (
                    <li key={prerequisite.id} className="flex items-center justify-between gap-3 px-5 py-3.5">
                      <Link to={`/trainee/courses/${prerequisite.id}`} className="text-sm font-semibold text-navy hover:text-sky-deep">
                        {prerequisite.title}
                      </Link>
                      {prerequisite.completed ? (
                        <Badge tone="success">
                          <CheckCircle2 size={11} aria-hidden /> Completed
                        </Badge>
                      ) : (
                        <Badge tone="warning">
                          <Lock size={11} aria-hidden /> Required
                        </Badge>
                      )}
                    </li>
                  ))}
                </ul>
              </Card>
            </section>
          )}

          <section aria-labelledby="reviews">
            <SectionLabel>
              <span id="reviews">Learner feedback</span>
            </SectionLabel>
            <CourseFeedback courseId={course.id} canReview={enrolled} />
          </section>
        </div>

        <aside className="space-y-6 lg:sticky lg:top-24 lg:self-start">
          <EnrollPanel course={course} />

          {course.assessment && (
            <Card title="Assessment">
              <dl className="space-y-2.5 text-sm">
                <div className="flex justify-between gap-3">
                  <dt className="flex items-center gap-2 text-slate-500">
                    <ClipboardCheck size={14} aria-hidden /> Questions
                  </dt>
                  <dd className="font-semibold text-navy">{course.assessment.questionCount}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-slate-500">Passing score</dt>
                  <dd className="font-semibold text-navy">{course.assessment.passingScore}%</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-slate-500">Time limit</dt>
                  <dd className="font-semibold text-navy">{course.assessment.timeLimitMinutes ? `${course.assessment.timeLimitMinutes} min` : 'None'}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-slate-500">Attempts</dt>
                  <dd className="font-semibold text-navy">{course.assessment.maxAttempts === 0 ? 'Unlimited' : course.assessment.maxAttempts}</dd>
                </div>
                {course.assessment.deadline && (
                  <div className="flex justify-between gap-3">
                    <dt className="text-slate-500">Deadline</dt>
                    <dd className="font-semibold text-navy">{formatDate(course.assessment.deadline)}</dd>
                  </div>
                )}
              </dl>
              <p className="mt-4 text-xs leading-5 text-slate-500">Unlocked when every module is complete. Passing updates your competency levels and issues your certificate.</p>
            </Card>
          )}

          <Card title="Course facts">
            <dl className="space-y-2.5 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-slate-500">Learners enrolled</dt>
                <dd className="font-semibold text-navy">{course.enrolledCount}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-slate-500">Published</dt>
                <dd className="font-semibold text-navy">{formatDate(course.publishedAt)}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-slate-500">Last updated</dt>
                <dd className="font-semibold text-navy">{formatDate(course.updatedAt)}</dd>
              </div>
            </dl>
          </Card>
        </aside>
      </div>
    </div>
  );
}

export default function CourseDetailPage() {
  const { courseId = '' } = useParams();
  const query = useQuery({ queryKey: keys.course(courseId), queryFn: () => fetchCourse(courseId), enabled: Boolean(courseId) });
  usePageTitle(query.data?.title ?? 'Course');
  return (
    <>
      <Breadcrumb />
      <QueryBoundary query={query}>{(course) => <Detail course={course} />}</QueryBoundary>
    </>
  );
}

function Breadcrumb() {
  return (
    <nav aria-label="Breadcrumb" className="mb-4 text-xs font-semibold text-slate-500">
      <Link to="/trainee/courses" className="hover:text-sky-deep">
        Course catalog
      </Link>
      <span className="mx-2" aria-hidden>
        /
      </span>
      <span className="text-slate-500">Course</span>
    </nav>
  );
}
