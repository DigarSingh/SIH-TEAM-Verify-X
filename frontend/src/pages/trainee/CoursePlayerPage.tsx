import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Award, Check, ChevronLeft, ChevronRight, ClipboardCheck, Lock, Undo2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { keys } from '../../api/keys';
import { CertificateActions } from '../../components/domain/CertificateActions';
import { CourseAssistant } from '../../components/domain/CourseAssistant';
import { AssessmentStateBadge, DifficultyBadge, EnrollmentStatusBadge } from '../../components/domain/badges';
import { MaterialView } from '../../components/domain/MaterialView';
import { OfflineNotice, SaveOfflineButton } from '../../components/domain/OfflineParts';
import { QueryBoundary } from '../../components/domain/QueryBoundary';
import { Badge, Button, ButtonLink, Card, EmptyState, InlineAlert, ProgressBar } from '../../components/ui';
import { LEARNING_KEYS } from '../../hooks/learning';
import { useApiMutation, usePageTitle } from '../../hooks/misc';
import { applyModuleCompletion, listPacks, loadLearnContent, markModuleInPack, type PackSummary } from '../../offline/content';
import { runOrQueue } from '../../offline/queue';
import type { LearnContent } from '../../types';
import { cn } from '../../utils/cn';
import { AVAILABILITY_REASON } from '../../utils/constants';
import { formatDate, formatDuration } from '../../utils/format';

type ModuleItem = LearnContent['modules'][number];

function AssessmentPanel({ content }: { content: LearnContent }) {
  const { assessment } = content;
  if (!assessment) return null;
  const availability = assessment.availability;
  const state = availability?.state;

  return (
    <Card
      title="Course assessment"
      description={assessment.title}
      action={state ? <AssessmentStateBadge state={state} /> : <Badge tone="neutral">Preview</Badge>}
    >
      <dl className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
        <div>
          <dt className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Questions</dt>
          <dd className="font-semibold text-navy">{assessment.questionCount}</dd>
        </div>
        <div>
          <dt className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Passing score</dt>
          <dd className="font-semibold text-navy">{assessment.passingScore}%</dd>
        </div>
        <div>
          <dt className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Time limit</dt>
          <dd className="font-semibold text-navy">{assessment.timeLimitMinutes ? `${assessment.timeLimitMinutes} min` : 'None'}</dd>
        </div>
        <div>
          <dt className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Attempts</dt>
          <dd className="font-semibold text-navy">
            {availability ? (availability.attemptsAllowed === null ? `${availability.attemptsUsed} used · unlimited` : `${availability.attemptsUsed} of ${availability.attemptsAllowed} used`) : assessment.maxAttempts === 0 ? 'Unlimited' : assessment.maxAttempts}
          </dd>
        </div>
      </dl>

      {availability && (
        <div className="mt-5 space-y-3">
          {availability.bestScore !== null && (
            <p className="text-sm text-slate-600">
              Best score so far: <strong className="text-navy">{availability.bestScore}%</strong>
            </p>
          )}
          {availability.deadline && <p className="text-xs text-slate-500">Deadline: {formatDate(availability.deadline)}</p>}
          {!availability.eligible && !availability.inProgress && availability.reasons.length > 0 && (
            <InlineAlert tone={state === 'PASSED' ? 'success' : 'info'}>
              <ul className="space-y-1">
                {availability.reasons.map((reason) => (
                  <li key={reason}>{AVAILABILITY_REASON[reason] ?? reason}</li>
                ))}
              </ul>
            </InlineAlert>
          )}
          <div className="flex flex-wrap gap-2">
            {(state === 'AVAILABLE' || state === 'IN_PROGRESS') && (
              <ButtonLink to={`/trainee/assessments/${assessment.id}`} leftIcon={<ClipboardCheck size={16} />}>
                {state === 'IN_PROGRESS' ? 'Resume attempt' : availability.attemptsUsed > 0 ? 'Retake assessment' : 'Start assessment'}
              </ButtonLink>
            )}
            {state === 'LOCKED' && (
              <Button disabled leftIcon={<Lock size={16} />}>
                Locked
              </Button>
            )}
            {(state === 'PASSED' || state === 'NO_ATTEMPTS_LEFT' || state === 'OVERDUE' || availability.attemptsUsed > 0) && (
              <ButtonLink to={`/trainee/assessments/${assessment.id}`} variant="secondary">
                View attempts and results
              </ButtonLink>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}

function ModuleNav({ modules, activeId, onSelect }: { modules: ModuleItem[]; activeId: string; onSelect: (id: string) => void }) {
  return (
    <ol className="space-y-1" aria-label="Course modules">
      {modules.map((module, index) => {
        const active = module.id === activeId;
        return (
          <li key={module.id}>
            <button
              type="button"
              aria-current={active ? 'step' : undefined}
              onClick={() => onSelect(module.id)}
              className={cn('flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition', active ? 'bg-sky/10 font-bold text-navy' : 'text-slate-600 hover:bg-slate-50')}
            >
              <span
                className={cn('flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold', module.completed ? 'bg-emerald-600 text-white' : active ? 'bg-sky-deep text-white' : 'bg-slate-100 text-slate-600')}
                aria-hidden
              >
                {module.completed ? <Check size={13} /> : index + 1}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate">{module.title}</span>
                {module.durationMinutes > 0 && <span className="text-[11px] font-normal text-slate-500">{formatDuration(module.durationMinutes)}</span>}
              </span>
              <span className="sr-only">{module.completed ? '(completed)' : '(not completed)'}</span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}

function Player({ content, courseId }: { content: LearnContent; courseId: string }) {
  const { course, modules, enrollment } = content;
  const firstIncomplete = modules.find((module) => !module.completed) ?? modules[0];
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const activeId = modules.some((module) => module.id === selectedId) ? (selectedId as string) : firstIncomplete?.id ?? '';
  const activeIndex = modules.findIndex((module) => module.id === activeId);
  const active = modules[activeIndex];

  const queryClient = useQueryClient();
  const titleOf = (moduleId: string) => modules.find((module) => module.id === moduleId)?.title ?? 'module';

  /**
   * Progress is recorded through the offline queue: sent straight away when
   * there is a network, kept on the device and shown as complete when there is
   * not. Refreshing from the server would undo a queued change, so a queued
   * completion is applied to the cached course instead.
   */
  const settle = async (moduleId: string, completed: boolean, queued: boolean) => {
    if (queued) {
      queryClient.setQueryData<LearnContent>(keys.learn(courseId), (previous) => (previous ? applyModuleCompletion(previous, moduleId, completed) : previous));
      await markModuleInPack(courseId, moduleId, completed);
      return;
    }
    await Promise.all([keys.learn(courseId), ...LEARNING_KEYS].map((queryKey) => queryClient.invalidateQueries({ queryKey })));
  };

  const complete = useApiMutation({
    mutationFn: (moduleId: string) => runOrQueue('module.complete', `Completed "${titleOf(moduleId)}"`, { enrollmentId: enrollment?.id ?? '', moduleId, courseId }),
    successMessage: (result) => (result.queued ? 'Saved on this device. It will sync when you are back online.' : 'Module marked as complete'),
    onSuccess: async (result, moduleId) => {
      await settle(moduleId, true, result.queued);
      const next = modules[modules.findIndex((module) => module.id === moduleId) + 1];
      if (next) setSelectedId(next.id);
    },
  });
  const undo = useApiMutation({
    mutationFn: (moduleId: string) => runOrQueue('module.uncomplete', `Reopened "${titleOf(moduleId)}"`, { enrollmentId: enrollment?.id ?? '', moduleId, courseId }),
    successMessage: (result) => (result.queued ? 'Saved on this device. It will sync when you are back online.' : 'Module marked as not complete'),
    onSuccess: (result, moduleId) => settle(moduleId, false, result.queued),
  });

  const progress = enrollment?.progress ?? 0;
  const status = enrollment?.status;

  const [pack, setPack] = useState<PackSummary | null>(null);
  const reloadPack = () => void listPacks().then((packs) => setPack(packs.find((saved) => saved.courseId === courseId) ?? null));
  useEffect(reloadPack, [courseId]);

  if (modules.length === 0) {
    return <EmptyState title="This course has no content yet" description="The trainer has not added any modules. Please check back later." />;
  }

  return (
    <div className="animate-fade-in">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <nav aria-label="Breadcrumb" className="mb-2 text-xs font-semibold text-slate-500">
            {content.preview ? <span>Preview</span> : <Link to="/trainee/my-courses" className="hover:text-sky-deep">My courses</Link>}
            <span className="mx-2" aria-hidden>/</span>
            <span className="text-slate-500">{course.category}</span>
          </nav>
          <h1 className="font-display text-2xl font-bold text-navy md:text-3xl">{course.title}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
            <DifficultyBadge difficulty={course.difficulty} />
            {status && <EnrollmentStatusBadge status={status} />}
            <span>Trainer: {course.trainer.name}</span>
          </div>
        </div>
        {enrollment && (
          <div className="w-full max-w-xs space-y-3">
            <div>
              <p className="mb-1 text-xs font-semibold text-slate-500">Course progress</p>
              <ProgressBar value={progress} showLabel label="Course progress" height="h-2.5" />
            </div>
            <SaveOfflineButton courseId={courseId} saved={pack} onChange={reloadPack} />
          </div>
        )}
      </div>

      <OfflineNotice className="mb-6" />

      {content.preview && (
        <InlineAlert tone="info" className="mb-6">
          You are previewing this course exactly as a learner sees it. Progress is not recorded.
        </InlineAlert>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[300px_minmax(0,1fr)]">
        <aside className="lg:sticky lg:top-24 lg:self-start">
          <Card title="Modules" description={`${modules.filter((module) => module.completed).length} of ${modules.length} complete`}>
            <ModuleNav modules={modules} activeId={activeId} onSelect={setSelectedId} />
          </Card>
        </aside>

        <div className="min-w-0 space-y-6">
          {active && (
            <section aria-labelledby="module-title">
              <Card>
                <p className="text-xs font-bold uppercase tracking-wide text-sky-deep">
                  Module {activeIndex + 1} of {modules.length}
                </p>
                <h2 id="module-title" className="mt-1 font-display text-2xl font-bold text-navy">
                  {active.title}
                </h2>
                {active.description && <p className="mt-2 text-sm leading-6 text-slate-600">{active.description}</p>}
              </Card>

              <div className="mt-4 space-y-4">
                {active.materials.length === 0 ? (
                  <EmptyState title="No learning materials in this module yet" description="You can still mark the module complete once the trainer has added content." />
                ) : (
                  active.materials.map((material) => <MaterialView key={material.id} material={material} />)
                )}
              </div>

              <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
                <Button variant="secondary" disabled={activeIndex <= 0} onClick={() => setSelectedId(modules[activeIndex - 1]?.id ?? null)} leftIcon={<ChevronLeft size={16} />}>
                  Previous
                </Button>
                <div className="flex flex-wrap items-center gap-2">
                  {enrollment &&
                    (active.completed ? (
                      <>
                        <Badge tone="success">
                          <Check size={12} aria-hidden /> Completed
                        </Badge>
                        <Button variant="ghost" size="sm" loading={undo.isPending} onClick={() => undo.mutate(active.id)} leftIcon={<Undo2 size={14} />}>
                          Undo
                        </Button>
                      </>
                    ) : (
                      <Button variant="success" loading={complete.isPending} onClick={() => complete.mutate(active.id)} leftIcon={<Check size={16} />}>
                        Mark as complete
                      </Button>
                    ))}
                  <Button variant="secondary" disabled={activeIndex >= modules.length - 1} onClick={() => setSelectedId(modules[activeIndex + 1]?.id ?? null)} rightIcon={<ChevronRight size={16} />}>
                    Next
                  </Button>
                </div>
              </div>
            </section>
          )}

          <CourseAssistant courseId={courseId} />

          <AssessmentPanel content={content} />

          {content.certificate && (
            <Card title="Your certificate" description="Issued when you passed the course assessment">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-violet-50 text-violet-600" aria-hidden>
                    <Award size={20} />
                  </span>
                  <div>
                    <p className="font-mono text-sm font-bold text-navy">{content.certificate.certificateNumber}</p>
                    <p className="text-xs text-slate-500">{content.certificate.status === 'VALID' ? 'Valid' : 'Revoked'}</p>
                  </div>
                </div>
                <CertificateActions certificate={content.certificate} />
              </div>
            </Card>
          )}

          {(status === 'COMPLETED' || status === 'CERTIFIED') && !content.preview && (
            <p className="text-sm text-slate-500">
              Finished the course?{' '}
              <Link to={`/trainee/courses/${courseId}`} className="font-semibold text-sky-deep hover:text-navy">
                Rate it and read learner feedback →
              </Link>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

export default function CoursePlayerPage() {
  const { courseId = '' } = useParams();
  // `loadLearnContent` prefers the server and falls back to this device's saved copy when there is no network.
  const query = useQuery({ queryKey: keys.learn(courseId), queryFn: () => loadLearnContent(courseId), enabled: Boolean(courseId) });
  usePageTitle(query.data?.course.title ?? 'Learning');
  return <QueryBoundary query={query}>{(content) => <Player content={content} courseId={courseId} />}</QueryBoundary>;
}
