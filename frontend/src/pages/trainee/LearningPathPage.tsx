import { useQuery } from '@tanstack/react-query';
import { Check, Lock, Route as RouteIcon } from 'lucide-react';
import { Link } from 'react-router-dom';
import { keys } from '../../api/keys';
import { RecommendationCard } from '../../components/domain/GapCard';
import { StudyPlanCard } from '../../components/domain/StudyPlanCard';
import { DifficultyBadge, LearningStatusBadge, PriorityBadge } from '../../components/domain/badges';
import { CompetencyMeter } from '../../components/domain/CompetencyMeter';
import { QueryBoundary } from '../../components/domain/QueryBoundary';
import { Button, ButtonLink, Card, EmptyState, PageHeader, ProgressBar, SectionLabel } from '../../components/ui';
import { useEnroll } from '../../hooks/learning';
import { usePageTitle } from '../../hooks/misc';
import { fetchRecommendations } from '../../services/learner';
import type { LearningPath, PathStep, RecommendationReport } from '../../types';
import { cn } from '../../utils/cn';

function StepAction({ step }: { step: PathStep }) {
  const enroll = useEnroll();
  if (step.status === 'COMPLETED' || step.status === 'CERTIFIED') {
    return (
      <ButtonLink to={`/trainee/courses/${step.courseId}`} variant="secondary" size="sm">
        Review
      </ButtonLink>
    );
  }
  if (step.status !== 'NOT_STARTED') {
    return (
      <ButtonLink to={`/trainee/learn/${step.courseId}`} size="sm">
        {step.status === 'ASSESSMENT_PENDING' ? 'Take assessment' : 'Continue'}
      </ButtonLink>
    );
  }
  if (step.locked) {
    return (
      <Button size="sm" disabled title={`Complete ${step.blockedBy.map((course) => course.title).join(', ')} first`}>
        Locked
      </Button>
    );
  }
  return (
    <Button size="sm" loading={enroll.isPending} onClick={() => enroll.mutate(step.courseId)}>
      Enroll
    </Button>
  );
}

function StepMarker({ step, index }: { step: PathStep; index: number }) {
  const done = step.status === 'COMPLETED' || step.status === 'CERTIFIED';
  return (
    <span
      className={cn(
        'flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 text-xs font-bold',
        done ? 'border-emerald-600 bg-emerald-600 text-white' : step.locked ? 'border-slate-200 bg-slate-50 text-slate-500' : 'border-sky bg-white text-sky-deep',
      )}
      aria-hidden
    >
      {done ? <Check size={15} /> : step.locked ? <Lock size={13} /> : index + 1}
    </span>
  );
}

function PathCard({ path }: { path: LearningPath }) {
  return (
    <article className="rounded-2xl border border-slate-100 bg-white p-5 shadow-card md:p-6" aria-label={`Learning path for ${path.competencyName}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-display text-lg font-bold text-navy">{path.competencyName}</h3>
          <p className="mt-0.5 text-xs text-slate-500">
            {path.completedSteps} of {path.steps.length} step{path.steps.length === 1 ? '' : 's'} complete · gap {path.gap} points
          </p>
        </div>
        <PriorityBadge level={path.priorityLevel} score={path.priorityScore} />
      </div>
      <div className="mt-6 max-w-xl">
        <CompetencyMeter current={path.currentLevel} required={path.requiredLevel} label={path.competencyName} />
      </div>

      <ol className="mt-6 space-y-0">
        {path.steps.map((step, index) => (
          <li key={step.courseId} className="relative flex gap-4 pb-6 last:pb-0">
            {index < path.steps.length - 1 && <span className="absolute left-4 top-8 h-full w-0.5 -translate-x-1/2 bg-slate-100" aria-hidden />}
            <StepMarker step={step} index={index} />
            <div className={cn('min-w-0 flex-1 rounded-xl border p-4', step.courseId === path.nextStepCourseId ? 'border-sky/40 bg-sky/5' : 'border-slate-100')}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <DifficultyBadge difficulty={step.stage} />
                    <LearningStatusBadge status={step.status} />
                    {step.addedAsPrerequisite && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">Prerequisite</span>}
                    {step.courseId === path.nextStepCourseId && <span className="rounded-full bg-sky-deep px-2 py-0.5 text-[10px] font-bold text-white">Next step</span>}
                  </div>
                  <Link to={`/trainee/courses/${step.courseId}`} className="mt-1.5 block font-display text-sm font-bold text-navy hover:text-sky-deep">
                    {step.title}
                  </Link>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {step.levelFrom !== null && step.levelTo !== null ? `Develops this competency from ${step.levelFrom}% to ${step.levelTo}%` : 'Supporting course'}
                  </p>
                  {step.locked && step.blockedBy.length > 0 && (
                    <p className="mt-1 text-xs text-slate-500">
                      Unlocks after:{' '}
                      {step.blockedBy.map((course, position) => (
                        <span key={course.id}>
                          {position > 0 && ', '}
                          <Link to={`/trainee/courses/${course.id}`} className="font-semibold text-sky-deep hover:text-navy">
                            {course.title}
                          </Link>
                        </span>
                      ))}
                    </p>
                  )}
                </div>
                <StepAction step={step} />
              </div>
              {step.status !== 'NOT_STARTED' && step.status !== 'COMPLETED' && step.status !== 'CERTIFIED' && (
                <div className="mt-3 max-w-sm">
                  <ProgressBar value={step.progress} showLabel label={`${step.title} progress`} />
                </div>
              )}
            </div>
          </li>
        ))}
      </ol>
    </article>
  );
}

function Content({ report }: { report: RecommendationReport }) {
  return (
    <div className="animate-fade-in">
      <PageHeader
        eyebrow="Trainee workspace"
        title="Learning path"
        description="For each skill gap, courses are ordered from Beginner to Advanced. Courses whose prerequisites you have not completed stay locked until you do. Recommendations are rule-based: every reason is shown."
        actions={
          <ButtonLink to="/trainee/courses" variant="secondary">
            Browse the catalog
          </ButtonLink>
        }
      />

      {!report.jobRole ? (
        <EmptyState title="No job role assigned" description="A learning path is built from the competencies your job role requires. Ask an administrator to assign your job role." icon={<RouteIcon size={18} />} />
      ) : (
        <>
          {report.recommendations.length > 0 && <StudyPlanCard />}

          <section aria-labelledby="paths-heading">
            <SectionLabel>
              <span id="paths-heading">Your paths</span>
            </SectionLabel>
            {report.learningPaths.length === 0 ? (
              <EmptyState
                title="No learning paths needed"
                description={report.summary.withGap === 0 ? 'You meet every competency requirement of your role.' : 'There is no published course yet for the competencies you need to develop. Trainers will be informed of the demand.'}
                icon={<RouteIcon size={18} />}
              />
            ) : (
              <div className="space-y-5">
                {report.learningPaths.map((path) => (
                  <PathCard key={path.competencyId} path={path} />
                ))}
              </div>
            )}
          </section>

          <section className="mt-10" aria-labelledby="ranked-heading">
            <SectionLabel>
              <span id="ranked-heading">Ranked recommendations</span>
            </SectionLabel>
            {report.recommendations.length === 0 ? (
              <Card>
                <p className="text-sm text-slate-500">No course is recommended right now.</p>
              </Card>
            ) : (
              <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                {report.recommendations.map((recommendation) => (
                  <RecommendationCard key={recommendation.courseId} recommendation={recommendation} expanded />
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}

export default function LearningPathPage() {
  usePageTitle('Learning path');
  const query = useQuery({ queryKey: keys.recommendations, queryFn: () => fetchRecommendations() });
  return <QueryBoundary query={query}>{(report) => <Content report={report} />}</QueryBoundary>;
}
