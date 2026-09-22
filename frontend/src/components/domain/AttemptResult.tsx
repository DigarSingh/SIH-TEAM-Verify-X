import { Award, Check, CircleHelp, TrendingUp, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import { ReadinessRing } from '../../charts';
import { useCurrentUser } from '../../hooks/useAuth';
import type { AttemptDetail, CompetencyImpact, PracticalScenarioResult, ReviewRow } from '../../types';
import { cn } from '../../utils/cn';
import { LIMITED_BY_LABEL } from '../../utils/constants';
import { formatDateTime } from '../../utils/format';
import { paths } from '../../utils/links';
import { Badge, ButtonLink, Card, InlineAlert, SectionLabel } from '../ui';
import { CertificateActions } from './CertificateActions';
import { CompetencyMeter } from './CompetencyMeter';
import { STEP_META } from './ScenarioPlayer';

function duration(seconds: number | null): string {
  if (seconds === null) return '-';
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return minutes === 0 ? `${rest} s` : `${minutes} min ${rest} s`;
}

function Impact({ impact }: { impact: CompetencyImpact }) {
  const delta = impact.newLevel - impact.previousLevel;
  return (
    <article className="rounded-2xl border border-slate-100 bg-white p-5 shadow-card" aria-label={`${impact.competencyName} competency impact`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h3 className="font-display text-base font-bold text-navy">{impact.competencyName}</h3>
        {impact.requirementMet ? (
          <Badge tone="success">
            <Check size={11} aria-hidden /> Requirement met
          </Badge>
        ) : impact.gapAfter !== null ? (
          <Badge tone="warning">Gap {impact.gapAfter} pts remaining</Badge>
        ) : null}
      </div>
      <div className="mt-3 flex items-center gap-3 font-display text-3xl font-bold text-navy">
        <span className="text-slate-500">{impact.previousLevel}%</span>
        <span className="text-slate-300" aria-hidden>
          →
        </span>
        <span className="text-emerald-700">{impact.newLevel}%</span>
        {delta > 0 && (
          <span className="flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 font-sans text-xs font-bold text-emerald-700">
            <TrendingUp size={12} aria-hidden /> +{delta}
          </span>
        )}
      </div>
      <div className="mt-6">
        <CompetencyMeter current={impact.newLevel} required={impact.requiredLevel} label={impact.competencyName} showScale={false} />
      </div>
      <p className="mt-4 text-xs leading-5 text-slate-500">{impact.explanation}</p>
      {LIMITED_BY_LABEL[impact.limitedBy] && <p className="mt-1 text-xs font-semibold text-slate-500">{LIMITED_BY_LABEL[impact.limitedBy]}</p>}
    </article>
  );
}

function ReviewQuestion({ row, index, answerLabel }: { row: ReviewRow; index: number; answerLabel: string }) {
  const revealed = row.isCorrect !== undefined;
  return (
    <li className="rounded-2xl border border-slate-100 bg-white p-5 shadow-card print-break-avoid">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Question {index + 1}</p>
        <div className="flex items-center gap-2">
          {revealed ? (
            row.isCorrect ? (
              <Badge tone="success">
                <Check size={11} aria-hidden /> Correct
              </Badge>
            ) : row.answered ? (
              <Badge tone="danger">
                <X size={11} aria-hidden /> Incorrect
              </Badge>
            ) : (
              <Badge tone="neutral">Not answered</Badge>
            )
          ) : (
            <Badge tone={row.answered ? 'info' : 'neutral'}>{row.answered ? 'Answered' : 'Not answered'}</Badge>
          )}
          <Badge tone="neutral">
            {row.marksAwarded} / {row.marks}
          </Badge>
        </div>
      </div>
      <p className="mt-2 font-semibold leading-6 text-navy">{row.text}</p>
      <ul className="mt-3 space-y-2">
        {row.options.map((option) => {
          const chosen = row.selectedOptionIds.includes(option.id);
          const correct = option.isCorrect === true;
          return (
            <li
              key={option.id}
              className={cn(
                'flex items-start gap-3 rounded-xl border px-3.5 py-2.5 text-sm',
                revealed && correct ? 'border-emerald-200 bg-emerald-50 text-emerald-900' : chosen && revealed ? 'border-red-200 bg-red-50 text-red-900' : chosen ? 'border-sky/40 bg-sky/5 text-navy' : 'border-slate-100 text-slate-600',
              )}
            >
              <span className="mt-0.5 shrink-0" aria-hidden>
                {revealed && correct ? <Check size={16} className="text-emerald-700" /> : chosen && revealed ? <X size={16} className="text-red-500" /> : chosen ? <Check size={16} className="text-sky-deep" /> : <span className="block h-4 w-4 rounded-full border border-slate-300" />}
              </span>
              <span className="flex-1">{option.text}</span>
              <span className="shrink-0 text-[11px] font-bold uppercase tracking-wide">
                {chosen && answerLabel}
                {chosen && revealed && correct && ' · correct'}
                {!chosen && revealed && correct && 'Correct answer'}
              </span>
            </li>
          );
        })}
      </ul>
      {row.explanation && (
        <p className="mt-3 flex gap-2 rounded-xl bg-mist p-3 text-xs leading-5 text-slate-600">
          <CircleHelp size={14} className="mt-0.5 shrink-0 text-sky-deep" aria-hidden />
          <span>{row.explanation}</span>
        </p>
      )}
    </li>
  );
}

/**
 * One practical decision, marked.
 *
 * A scenario teaches through its rationales, so the marking is always shown
 * here: what was chosen, what it earned, and what a full-credit decision would
 * have been. Partial credit is stated plainly rather than dressed up as a pass
 * or a failure.
 */
function ScenarioReview({ scenario, answerLabel }: { scenario: PracticalScenarioResult; answerLabel: string }) {
  return (
    <Card
      title={scenario.title}
      description={`${scenario.marksAwarded} of ${scenario.marks} marks`}
      action={<Badge tone="purple">Simulated</Badge>}
    >
      <div className="rounded-xl bg-slate-50 p-4">
        <h4 className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Situation</h4>
        <p className="mt-1.5 whitespace-pre-line text-sm leading-7 text-slate-700">{scenario.briefing}</p>
      </div>

      <ol className="mt-5 space-y-5">
        {scenario.steps.map((step, index) => {
          const chose = step.options.find((option) => option.id === step.selectedOptionId);
          const best = step.options.find((option) => option.id === step.bestOptionId);
          const full = step.creditAwarded >= 1;
          const none = !chose || step.creditAwarded <= 0;
          return (
            <li key={step.stepId} className="border-t border-slate-100 pt-5 first:border-0 first:pt-0">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone="info">
                  {STEP_META[step.type].label} · step {index + 1}
                </Badge>
                <Badge tone={full ? 'success' : none ? 'danger' : 'warning'}>
                  {step.marksAwarded} of {step.marks} mark{step.marks === 1 ? '' : 's'}
                </Badge>
                {!full && !none && <span className="text-[11px] font-semibold text-amber-700">Partly right: {Math.round(step.creditAwarded * 100)}% credit</span>}
              </div>
              <p className="mt-2 font-semibold leading-snug text-navy">{step.prompt}</p>

              <dl className="mt-3 space-y-2 text-sm">
                <div className="rounded-xl border border-slate-100 px-4 py-3">
                  <dt className="text-[11px] font-bold uppercase tracking-wide text-slate-500">{answerLabel}</dt>
                  <dd className="mt-0.5 text-slate-700">{chose ? chose.text : <span className="text-slate-500">No decision was made, so this step scored zero.</span>}</dd>
                  {chose?.rationale && <dd className="mt-1.5 text-xs leading-6 text-slate-500">{chose.rationale}</dd>}
                </div>
                {!full && best && (
                  <div className="rounded-xl border border-emerald-100 bg-emerald-50/60 px-4 py-3">
                    <dt className="text-[11px] font-bold uppercase tracking-wide text-emerald-700">Full-credit decision</dt>
                    <dd className="mt-0.5 text-slate-700">{best.text}</dd>
                    {best.rationale && <dd className="mt-1.5 text-xs leading-6 text-slate-600">{best.rationale}</dd>}
                  </div>
                )}
              </dl>

              {step.explanation && <p className="mt-3 rounded-xl bg-sky/5 px-4 py-3 text-xs leading-6 text-slate-600">{step.explanation}</p>}
            </li>
          );
        })}
      </ol>
    </Card>
  );
}

/** The outcome of one assessment attempt: score, competency impact, certificate and question review. */
export function AttemptResultView({ detail, viewer }: { detail: AttemptDetail; viewer: 'learner' | 'manager' }) {
  const user = useCurrentUser();
  const { attempt, assessment } = detail;
  const percentage = attempt.percentage ?? 0;
  const passed = attempt.passed === true;
  const revealed = detail.review.some((row) => row.isCorrect !== undefined);

  return (
    <div className="animate-fade-in">
      <section className={cn('relative overflow-hidden rounded-3xl p-6 text-white shadow-lift md:p-8', passed ? 'bg-gradient-to-br from-emerald-700 via-emerald-600 to-teal' : 'bg-gradient-to-br from-navy via-[#1c3a63] to-slate-600')} aria-label="Result summary">
        <span aria-hidden className="absolute -right-20 -top-20 h-64 w-64 rounded-full border-[36px] border-white/[0.07]" />
        <div className="relative flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-white/70">
              {assessment.courseTitle} · Attempt {attempt.attemptNumber}
            </p>
            <h1 className="mt-2 font-display text-3xl font-bold md:text-4xl">{passed ? (viewer === 'manager' ? 'Passed' : 'You passed') : viewer === 'manager' ? 'Did not pass' : 'Not passed this time'}</h1>
            <p className="mt-2 max-w-xl text-sm text-white/80">
              {viewer === 'manager' ? `${detail.learner.name} scored ${percentage}% on ${assessment.title}.` : passed ? 'Your result has been recorded and your competency levels were updated.' : `You need ${assessment.passingScore}% to pass. Review the questions below and try again when you are ready.`}
            </p>
            <dl className="mt-5 flex flex-wrap gap-x-8 gap-y-3 text-sm">
              <div>
                <dt className="text-[10px] font-bold uppercase tracking-wide text-white/60">Score</dt>
                <dd className="font-display text-xl font-bold">
                  {attempt.score} / {attempt.totalMarks} marks
                </dd>
              </div>
              <div>
                <dt className="text-[10px] font-bold uppercase tracking-wide text-white/60">Pass mark</dt>
                <dd className="font-display text-xl font-bold">{assessment.passingScore}%</dd>
              </div>
              {attempt.practicalPercentage !== null && attempt.practicalPercentage !== undefined && (
                <div>
                  <dt className="text-[10px] font-bold uppercase tracking-wide text-white/60">Questions / practical</dt>
                  <dd className="font-display text-xl font-bold">
                    {attempt.mcqPercentage ?? 0}% / {attempt.practicalPercentage}%
                  </dd>
                  <dd className="mt-0.5 text-[11px] text-white/70">
                    Weighted {Math.round((assessment.mcqWeight ?? 1) * 100)}/{Math.round((1 - (assessment.mcqWeight ?? 1)) * 100)} into {percentage}%
                  </dd>
                </div>
              )}
              <div>
                <dt className="text-[10px] font-bold uppercase tracking-wide text-white/60">Time taken</dt>
                <dd className="font-display text-xl font-bold">{duration(attempt.timeTakenSeconds)}</dd>
              </div>
              <div>
                <dt className="text-[10px] font-bold uppercase tracking-wide text-white/60">Submitted</dt>
                <dd className="font-display text-xl font-bold">{formatDateTime(attempt.submittedAt)}</dd>
              </div>
            </dl>
          </div>
          <ReadinessRing value={percentage} label="Score" tone="dark" size={150} />
        </div>
      </section>

      {viewer === 'learner' && (
        <div className="no-print mt-5 flex flex-wrap gap-3">
          <ButtonLink to={`/trainee/learn/${assessment.courseId}`} variant="secondary">
            Back to the course
          </ButtonLink>
          <ButtonLink to={`/trainee/assessments/${assessment.id}`} variant={passed ? 'secondary' : 'primary'}>
            {passed ? 'Assessment overview' : 'Try again'}
          </ButtonLink>
          <ButtonLink to="/trainee/passport" variant="secondary">
            Open my Competency Passport
          </ButtonLink>
        </div>
      )}
      {viewer === 'manager' && (
        <p className="mt-4 text-xs text-slate-500">
          Learner:{' '}
          <Link to={paths.employee(user.role, detail.learner.id)} className="font-semibold text-sky-deep hover:text-navy">
            {detail.learner.name}
          </Link>
          {detail.learner.email ? ` · ${detail.learner.email}` : ''}
        </p>
      )}

      <section className="mt-10" aria-labelledby="impact-heading">
        <SectionLabel>
          <span id="impact-heading">Competency impact</span>
        </SectionLabel>
        {detail.competencyImpacts.length > 0 ? (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {detail.competencyImpacts.map((impact) => (
              <Impact key={impact.competencyId} impact={impact} />
            ))}
          </div>
        ) : (
          <InlineAlert tone="info">{passed ? 'This result did not change any competency level (for example because the level was already at or above what this course develops).' : 'Only a passing result updates competency levels, so nothing changed.'}</InlineAlert>
        )}
      </section>

      {detail.certificate && (
        <section className="mt-10" aria-labelledby="certificate-heading">
          <SectionLabel>
            <span id="certificate-heading">Certificate</span>
          </SectionLabel>
          <Card>
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-violet-50 text-violet-600" aria-hidden>
                  <Award size={22} />
                </span>
                <div>
                  <p className="font-display font-bold text-navy">{viewer === 'learner' ? 'Your certificate has been issued' : 'Certificate issued'}</p>
                  <p className="font-mono text-sm text-slate-500">{detail.certificate.certificateNumber}</p>
                </div>
              </div>
              {viewer === 'learner' && (
                <div className="no-print">
                  <CertificateActions certificate={detail.certificate} />
                </div>
              )}
            </div>
          </Card>
        </section>
      )}

      {detail.practical && detail.practical.length > 0 && (
        <section className="mt-10" aria-labelledby="practical-heading">
          <SectionLabel>
            <span id="practical-heading">Practical scenarios</span>
          </SectionLabel>
          <div className="space-y-4">
            {detail.practical.map((scenario) => (
              <ScenarioReview key={scenario.scenarioId} scenario={scenario} answerLabel={viewer === 'learner' ? 'Your decision' : 'Learner\u2019s decision'} />
            ))}
          </div>
        </section>
      )}

      <section className="mt-10" aria-labelledby="review-heading">
        <SectionLabel>
          <span id="review-heading">Question review</span>
        </SectionLabel>
        {!revealed && <InlineAlert tone="info" className="mb-4">The correct answers are not shown for this assessment. The answers given and the marks awarded are listed below.</InlineAlert>}
        <ol className="space-y-4">
          {detail.review.map((row, index) => (
            <ReviewQuestion key={row.questionId} row={row} index={index} answerLabel={viewer === 'learner' ? 'Your answer' : 'Learner’s answer'} />
          ))}
        </ol>
      </section>
    </div>
  );
}
