import { useQuery } from '@tanstack/react-query';
import { AlarmClock, CheckCircle2, ChevronLeft, ChevronRight, ClipboardCheck, Flag, Send } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { errorMessage, isApiError } from '../../api/client';
import { keys } from '../../api/keys';
import { AssessmentStateBadge } from '../../components/domain/badges';
import { OfflineNotice } from '../../components/domain/OfflineParts';
import { ScenarioPlayer } from '../../components/domain/ScenarioPlayer';
import { QueryBoundary } from '../../components/domain/QueryBoundary';
import { Badge, Button, ButtonLink, Card, DataTable, InlineAlert, PageHeader, Segmented, Td, Th, useConfirm, useToast } from '../../components/ui';
import { LEARNING_KEYS } from '../../hooks/learning';
import { useApiMutation, usePageTitle } from '../../hooks/misc';
import { runOrQueue } from '../../offline/queue';
import { useSyncStatus } from '../../offline/useOffline';
import { fetchAssessmentInfo, fetchMyAttempts, startAssessment } from '../../services/assessments';
import type { AssessmentInfo, AttemptQuestion, AttemptScenario, StartedAttempt } from '../../types';
import { cn } from '../../utils/cn';
import { AVAILABILITY_REASON } from '../../utils/constants';
import { formatClock, formatDate, formatDateTime } from '../../utils/format';

// ---------------------------------------------------------------------------------------------
// Answers survive a page refresh (per attempt, in this browser only).
// ---------------------------------------------------------------------------------------------

type Answers = Record<string, string[]>;
const storageKey = (attemptId: string) => `cc:attempt:${attemptId}`;

function loadAnswers(attemptId: string, questions: AttemptQuestion[]): Answers {
  try {
    const raw = window.localStorage.getItem(storageKey(attemptId));
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Answers;
    const restored: Answers = {};
    for (const question of questions) {
      const saved = parsed[question.id];
      if (Array.isArray(saved)) restored[question.id] = saved.filter((id) => question.options.some((option) => option.id === id));
    }
    return restored;
  } catch {
    return {};
  }
}

function saveAnswers(attemptId: string, answers: Answers): void {
  try {
    window.localStorage.setItem(storageKey(attemptId), JSON.stringify(answers));
  } catch {
    /* storage can be unavailable (private mode); answers then live in memory only */
  }
}

/** One chosen option per scenario step. */
type Choices = Record<string, string>;
const practicalKey = (attemptId: string) => `cc:attempt:${attemptId}:practical`;

function loadChoices(attemptId: string, scenarios: AttemptScenario[]): Choices {
  try {
    const raw = window.localStorage.getItem(practicalKey(attemptId));
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Choices;
    const restored: Choices = {};
    for (const scenario of scenarios) {
      for (const step of scenario.steps) {
        const chosen = parsed[step.id];
        if (chosen && step.options.some((option) => option.id === chosen)) restored[step.id] = chosen;
      }
    }
    return restored;
  } catch {
    return {};
  }
}

function saveChoices(attemptId: string, choices: Choices): void {
  try {
    window.localStorage.setItem(practicalKey(attemptId), JSON.stringify(choices));
  } catch {
    /* storage can be unavailable (private mode); choices then live in memory only */
  }
}

function clearAnswers(attemptId: string): void {
  try {
    window.localStorage.removeItem(storageKey(attemptId));
    window.localStorage.removeItem(practicalKey(attemptId));
  } catch {
    /* nothing to clear */
  }
}

// ---------------------------------------------------------------------------------------------
// The running attempt
// ---------------------------------------------------------------------------------------------

function AttemptRunner({ started, assessmentId, onExit }: { started: StartedAttempt; assessmentId: string; onExit: () => void }) {
  const navigate = useNavigate();
  const confirm = useConfirm();
  const toast = useToast();
  const { attempt, assessment, questions } = started;
  const scenarios = started.scenarios ?? [];
  const hasPractical = scenarios.length > 0;

  const [answers, setAnswers] = useState<Answers>(() => loadAnswers(attempt.id, questions));
  const [choices, setChoices] = useState<Choices>(() => loadChoices(attempt.id, scenarios));
  const [part, setPart] = useState<'questions' | 'practical'>('questions');
  const [flagged, setFlagged] = useState<Set<string>>(new Set());
  const [index, setIndex] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState<number | null>(attempt.remainingSeconds);
  const [announcement, setAnnouncement] = useState('');
  const autoSubmitted = useRef(false);

  useEffect(() => saveAnswers(attempt.id, answers), [attempt.id, answers]);
  useEffect(() => saveChoices(attempt.id, choices), [attempt.id, choices]);

  // Warn before the tab is closed or reloaded mid-attempt (the timer keeps running on the server).
  useEffect(() => {
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, []);

  /**
   * Submission goes through the offline queue. With a network it is an ordinary
   * request and the learner goes straight to their result; without one, the
   * answers are stored with an idempotency key and sent on reconnection, so a
   * dropped connection costs neither the attempt nor the answers.
   */
  const submit = useApiMutation<Awaited<ReturnType<typeof runOrQueue<'assessment.submit'>>>, void>({
    mutationFn: () =>
      runOrQueue('assessment.submit', `Assessment submitted: ${assessment.title}`, {
        assessmentId,
        attemptId: attempt.id,
        answers: questions.map((question) => ({ questionId: question.id, optionIds: answers[question.id] ?? [] })),
        ...(hasPractical ? { practical: Object.entries(choices).map(([stepId, optionId]) => ({ stepId, optionId })) } : {}),
      }),
    invalidate: [...LEARNING_KEYS, keys.assessmentInfo(assessmentId), keys.assessmentResults(assessmentId, 'mine')],
    onSuccess: (outcome) => {
      clearAnswers(attempt.id);
      if (outcome.queued) {
        toast.info('You are offline. Your answers are saved on this device and will be submitted when you reconnect - your score appears then.');
        navigate('/trainee/assessments', { replace: true });
        return;
      }
      navigate(`/trainee/results/${outcome.result.attempt.id}`, { replace: true });
    },
    onError: (error) => {
      toast.error(errorMessage(error));
      autoSubmitted.current = false;
      // An attempt the server no longer accepts (expired, or already submitted elsewhere) cannot be retried from this screen.
      if (isApiError(error) && error.code.startsWith('ATTEMPT_')) {
        clearAnswers(attempt.id);
        onExit();
      }
    },
  });

  const answeredCount = questions.filter((question) => (answers[question.id]?.length ?? 0) > 0).length;
  const stepCount = scenarios.reduce((sum, scenario) => sum + scenario.steps.length, 0);
  const decidedCount = scenarios.reduce((sum, scenario) => sum + scenario.steps.filter((step) => choices[step.id]).length, 0);

  const submitNow = useCallback(() => {
    if (!submit.isPending) submit.mutate();
  }, [submit]);
  const submitRef = useRef(submitNow);
  submitRef.current = submitNow;

  // Countdown from the server-reported remaining time, measured with a monotonic clock so
  // an incorrect device clock cannot extend or shorten the attempt.
  useEffect(() => {
    if (attempt.remainingSeconds === null) return undefined;
    const endsAt = performance.now() + attempt.remainingSeconds * 1000;
    const timer = window.setInterval(() => {
      const remaining = Math.max(0, Math.ceil((endsAt - performance.now()) / 1000));
      setSecondsLeft(remaining);
      if (remaining === 300) setAnnouncement('Five minutes remaining.');
      if (remaining === 60) setAnnouncement('One minute remaining.');
      if (remaining === 0 && !autoSubmitted.current) {
        autoSubmitted.current = true;
        setAnnouncement('Time is up. Submitting your answers.');
        submitRef.current();
      }
    }, 500);
    return () => window.clearInterval(timer);
  }, [attempt.remainingSeconds]);

  const question = questions[index] as AttemptQuestion;
  const selected = answers[question.id] ?? [];

  const choose = (optionId: string) => {
    setAnswers((current) => {
      const existing = current[question.id] ?? [];
      if (question.type === 'SINGLE') return { ...current, [question.id]: [optionId] };
      return { ...current, [question.id]: existing.includes(optionId) ? existing.filter((id) => id !== optionId) : [...existing, optionId] };
    });
  };

  const toggleFlag = () =>
    setFlagged((current) => {
      const next = new Set(current);
      if (next.has(question.id)) next.delete(question.id);
      else next.add(question.id);
      return next;
    });

  const onSubmit = async () => {
    const unanswered = questions.length - answeredCount;
    const yes = await confirm({
      title: 'Submit your answers?',
      message: (
        <>
          <p>
            You have answered <strong>{answeredCount}</strong> of <strong>{questions.length}</strong> questions.
          </p>
          {hasPractical && (
            <p className="mt-2">
              You have made <strong>{decidedCount}</strong> of <strong>{stepCount}</strong> practical decisions.
            </p>
          )}
          {unanswered > 0 && <p className="mt-2 font-semibold text-orange-700">{unanswered} unanswered question{unanswered === 1 ? '' : 's'} will score zero.</p>}
          {hasPractical && stepCount - decidedCount > 0 && (
            <p className="mt-2 font-semibold text-orange-700">
              {stepCount - decidedCount} undecided scenario step{stepCount - decidedCount === 1 ? '' : 's'} will score zero.
            </p>
          )}
          {flagged.size > 0 && <p className="mt-2">{flagged.size} question{flagged.size === 1 ? ' is' : 's are'} flagged for review.</p>}
          <p className="mt-2">You cannot change your answers after submitting.</p>
        </>
      ),
      confirmLabel: 'Submit answers',
    });
    if (yes) submitNow();
  };

  const urgent = secondsLeft !== null && secondsLeft <= 60;
  const warning = secondsLeft !== null && secondsLeft <= 300;

  return (
    <div className="animate-fade-in">
      <OfflineNotice className="mb-4" />
      <div className="sticky top-16 z-20 -mx-4 mb-6 border-b border-slate-200 bg-white/95 px-4 py-3 backdrop-blur md:-mx-8 md:px-8">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate font-display text-base font-bold text-navy">{assessment.title}</p>
            <p className="text-xs text-slate-500">
              Attempt {attempt.attemptNumber} · Question {index + 1} of {questions.length} · {answeredCount} answered
              {hasPractical && ` · ${decidedCount} of ${stepCount} decisions made`}
            </p>
          </div>
          <div className="flex items-center gap-3">
            {secondsLeft !== null && (
              <div
                role="timer"
                aria-label="Time remaining"
                className={cn('flex items-center gap-2 rounded-xl px-3.5 py-2 font-mono text-lg font-bold tabular-nums', urgent ? 'animate-pulse bg-red-50 text-red-600' : warning ? 'bg-amber-50 text-amber-700' : 'bg-slate-100 text-navy')}
              >
                <AlarmClock size={18} aria-hidden /> {formatClock(secondsLeft)}
              </div>
            )}
            <Button variant="success" loading={submit.isPending} onClick={() => void onSubmit()} leftIcon={<Send size={15} />}>
              Submit
            </Button>
          </div>
        </div>
        <p className="sr-only" role="status" aria-live="polite">
          {announcement}
        </p>
      </div>

      {hasPractical && (
        <div className="mx-auto mb-6 max-w-6xl">
          <Segmented
            label="Part of the assessment"
            value={part}
            onChange={setPart}
            items={[
              { id: 'questions', label: `Questions (${answeredCount}/${questions.length})` },
              { id: 'practical', label: `Practical (${decidedCount}/${stepCount})` },
            ]}
          />
          <p className="mt-2 text-xs text-slate-500">
            The questions are worth {Math.round(assessment.mcqWeight * 100)}% of the final mark and the practical scenarios {Math.round((1 - assessment.mcqWeight) * 100)}%. Both are submitted together.
          </p>
        </div>
      )}

      {hasPractical && part === 'practical' && (
        <div className="mx-auto max-w-6xl">
          <ScenarioPlayer scenarios={scenarios} choices={choices} onChoose={(stepId, optionId) => setChoices((current) => ({ ...current, [stepId]: optionId }))} />
          <div className="mt-6 flex justify-between">
            <Button variant="secondary" onClick={() => setPart('questions')} leftIcon={<ChevronLeft size={16} />}>
              Back to the questions
            </Button>
            <Button variant="success" loading={submit.isPending} onClick={() => void onSubmit()} leftIcon={<Send size={15} />}>
              Submit everything
            </Button>
          </div>
        </div>
      )}

      <div className={cn('mx-auto grid grid-cols-1 max-w-6xl gap-6 lg:grid-cols-[minmax(0,1fr)_280px]', hasPractical && part !== 'questions' && 'hidden')}>
        <section aria-labelledby="question-text">
          <Card>
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <Badge tone="info">Question {index + 1}</Badge>
              <Badge tone="neutral">
                {question.marks} mark{question.marks === 1 ? '' : 's'}
              </Badge>
              {flagged.has(question.id) && (
                <Badge tone="warning">
                  <Flag size={11} aria-hidden /> Flagged
                </Badge>
              )}
            </div>
            <fieldset>
              <legend id="question-text" className="font-display text-lg font-bold leading-snug text-navy">
                {question.text}
              </legend>
              <p className="mt-1 text-xs font-semibold text-slate-500">{question.type === 'MULTIPLE' ? 'Select all that apply. Every correct option is needed for the marks.' : 'Select one answer.'}</p>
              <div className="mt-5 space-y-3">
                {question.options.map((option) => {
                  const checked = selected.includes(option.id);
                  return (
                    <label
                      key={option.id}
                      className={cn('flex cursor-pointer items-start gap-3 rounded-xl border-2 px-4 py-3.5 text-sm transition focus-within:ring-4 focus-within:ring-sky/15', checked ? 'border-sky bg-sky/5 text-navy' : 'border-slate-100 text-slate-700 hover:border-slate-300')}
                    >
                      <input
                        type={question.type === 'SINGLE' ? 'radio' : 'checkbox'}
                        name={`question-${question.id}`}
                        checked={checked}
                        onChange={() => choose(option.id)}
                        className="mt-0.5 h-4 w-4 shrink-0 border-slate-300 text-sky-deep focus:ring-sky"
                      />
                      <span className="leading-6">{option.text}</span>
                    </label>
                  );
                })}
              </div>
            </fieldset>
            <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-5">
              <Button variant="secondary" disabled={index === 0} onClick={() => setIndex(index - 1)} leftIcon={<ChevronLeft size={16} />}>
                Previous
              </Button>
              <Button variant="ghost" onClick={toggleFlag} leftIcon={<Flag size={15} />}>
                {flagged.has(question.id) ? 'Remove flag' : 'Flag for review'}
              </Button>
              <Button variant="secondary" disabled={index === questions.length - 1} onClick={() => setIndex(index + 1)} rightIcon={<ChevronRight size={16} />}>
                Next
              </Button>
            </div>
          </Card>
        </section>

        <aside className="lg:sticky lg:top-44 lg:self-start">
          <Card title="Questions" description={`${answeredCount} of ${questions.length} answered`}>
            <ol className="grid grid-cols-5 gap-2">
              {questions.map((item, position) => {
                const answered = (answers[item.id]?.length ?? 0) > 0;
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => setIndex(position)}
                      aria-label={`Question ${position + 1}${answered ? ', answered' : ', not answered'}${flagged.has(item.id) ? ', flagged' : ''}`}
                      aria-current={position === index ? 'true' : undefined}
                      className={cn(
                        'relative flex h-10 w-full items-center justify-center rounded-lg border text-sm font-bold transition',
                        position === index ? 'border-navy ring-2 ring-navy/20' : 'border-transparent',
                        answered ? 'bg-sky-deep text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200',
                      )}
                    >
                      {position + 1}
                      {flagged.has(item.id) && <span className="absolute -right-1 -top-1 h-3 w-3 rounded-full border-2 border-white bg-amber-400" aria-hidden />}
                    </button>
                  </li>
                );
              })}
            </ol>
            <ul className="mt-4 space-y-1.5 text-[11px] text-slate-500">
              <li className="flex items-center gap-2"><span className="h-3 w-3 rounded bg-sky-deep" aria-hidden /> Answered</li>
              <li className="flex items-center gap-2"><span className="h-3 w-3 rounded bg-slate-200" aria-hidden /> Not answered</li>
              <li className="flex items-center gap-2"><span className="h-3 w-3 rounded-full bg-amber-400" aria-hidden /> Flagged for review</li>
            </ul>
            {hasPractical && (
              <Button variant="secondary" size="sm" className="mt-4 w-full" onClick={() => setPart('practical')} rightIcon={<ChevronRight size={15} />}>
                Go to the practical part
              </Button>
            )}
            <p className="mt-4 text-xs leading-5 text-slate-500">The timer runs on the server. Leaving this page does not pause it, and your answers on this device are restored if you come back in time.</p>
            <Button variant="ghost" size="sm" className="mt-3 w-full" onClick={onExit}>
              Back to the assessment overview
            </Button>
          </Card>
        </aside>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// Overview before (and between) attempts
// ---------------------------------------------------------------------------------------------

function Intro({ info, onStarted }: { info: AssessmentInfo; onStarted: (started: StartedAttempt) => void }) {
  const toast = useToast();
  const { availability } = info;
  const attempts = useQuery({ queryKey: keys.assessmentResults(info.id, 'mine'), queryFn: () => fetchMyAttempts(info.id) });
  const start = useApiMutation({
    mutationFn: () => startAssessment(info.id),
    invalidate: [keys.assessmentInfo(info.id), keys.myAssessments],
    onSuccess: (started) => {
      if (started.resumed) toast.info('Your attempt in progress was resumed.');
      onStarted(started);
    },
  });
  const canStart = availability.eligible || Boolean(availability.inProgress);

  return (
    <div className="animate-fade-in">
      <nav aria-label="Breadcrumb" className="mb-4 text-xs font-semibold text-slate-500">
        <Link to="/trainee/assessments" className="hover:text-sky-deep">
          Assessments
        </Link>
        <span className="mx-2" aria-hidden>/</span>
        <span className="text-slate-500">{info.courseTitle}</span>
      </nav>
      <PageHeader
        eyebrow={info.courseTitle}
        title={info.title}
        description={info.description ?? undefined}
        actions={<AssessmentStateBadge state={availability.state} />}
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="min-w-0 space-y-6 lg:col-span-2">
          <Card title="Before you start">
            {info.instructions && <p className="mb-5 whitespace-pre-line text-sm leading-7 text-slate-600">{info.instructions}</p>}
            <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-xl bg-slate-50 p-4">
                <dt className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Questions</dt>
                <dd className="mt-1 font-display text-2xl font-bold text-navy">{info.questionCount}</dd>
              </div>
              <div className="rounded-xl bg-slate-50 p-4">
                <dt className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Time limit</dt>
                <dd className="mt-1 font-display text-2xl font-bold text-navy">{info.timeLimitMinutes ? `${info.timeLimitMinutes} min` : 'None'}</dd>
              </div>
              <div className="rounded-xl bg-slate-50 p-4">
                <dt className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Pass mark</dt>
                <dd className="mt-1 font-display text-2xl font-bold text-navy">{info.passingScore}%</dd>
              </div>
              <div className="rounded-xl bg-slate-50 p-4">
                <dt className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Attempts</dt>
                <dd className="mt-1 font-display text-2xl font-bold text-navy">
                  {availability.attemptsUsed}
                  <span className="text-base text-slate-500"> / {availability.attemptsAllowed ?? '∞'}</span>
                </dd>
              </div>
            </dl>
            <ul className="mt-5 space-y-2 text-sm text-slate-600">
              <li className="flex gap-2"><CheckCircle2 size={16} className="mt-0.5 shrink-0 text-sky-deep" aria-hidden /> Each question is marked as a whole: for multiple-answer questions every correct option must be selected and no wrong one.</li>
              {info.timeLimitMinutes && <li className="flex gap-2"><CheckCircle2 size={16} className="mt-0.5 shrink-0 text-sky-deep" aria-hidden /> The timer starts when you begin and is kept by the server. Answers are submitted automatically when time runs out.</li>}
              <li className="flex gap-2"><CheckCircle2 size={16} className="mt-0.5 shrink-0 text-sky-deep" aria-hidden /> Passing updates your competency levels and issues a certificate. Your level is never lowered by a single result.</li>
              {info.deadline && <li className="flex gap-2"><CheckCircle2 size={16} className="mt-0.5 shrink-0 text-sky-deep" aria-hidden /> Deadline: {formatDateTime(info.deadline)}.</li>}
            </ul>
          </Card>

          {!canStart && availability.reasons.length > 0 && (
            <InlineAlert tone={availability.passed ? 'success' : 'warning'}>
              <ul className="space-y-1">
                {availability.reasons.map((reason) => (
                  <li key={reason}>{AVAILABILITY_REASON[reason] ?? reason}</li>
                ))}
              </ul>
              {availability.reasons.includes('MODULES_INCOMPLETE') && (
                <Link to={`/trainee/learn/${info.courseId}`} className="mt-2 inline-block font-semibold underline">
                  Go to the course →
                </Link>
              )}
            </InlineAlert>
          )}

          <div className="flex flex-wrap gap-3">
            <Button size="lg" disabled={!canStart} loading={start.isPending} onClick={() => start.mutate()} leftIcon={<ClipboardCheck size={18} />}>
              {availability.inProgress ? 'Resume attempt' : availability.attemptsUsed > 0 ? 'Start another attempt' : 'Start assessment'}
            </Button>
            <ButtonLink to={`/trainee/learn/${info.courseId}`} variant="secondary" size="lg">
              Back to the course
            </ButtonLink>
          </div>
        </div>

        <Card title="Your attempts" padded={false}>
          {attempts.isLoading ? (
            <p className="p-5 text-sm text-slate-500">Loading…</p>
          ) : !attempts.data || attempts.data.attempts.length === 0 ? (
            <p className="p-5 text-sm text-slate-500">You have not attempted this assessment yet.</p>
          ) : (
            <DataTable caption="Your attempts" className="[&_table]:min-w-0">
              <thead>
                <tr>
                  <Th>#</Th>
                  <Th>Result</Th>
                  <Th align="right">Score</Th>
                </tr>
              </thead>
              <tbody>
                {attempts.data.attempts.map((attempt) => (
                  <tr key={attempt.id}>
                    <Td>
                      {attempt.status === 'SUBMITTED' ? (
                        <Link to={`/trainee/results/${attempt.id}`} className="font-bold text-sky-deep hover:text-navy">
                          {attempt.attemptNumber}
                        </Link>
                      ) : (
                        attempt.attemptNumber
                      )}
                      <span className="block text-[11px] text-slate-500">{formatDate(attempt.submittedAt ?? attempt.startedAt)}</span>
                    </Td>
                    <Td>
                      {attempt.status === 'IN_PROGRESS' ? <Badge tone="info">In progress</Badge> : attempt.status === 'EXPIRED' ? <Badge tone="neutral">Expired</Badge> : attempt.passed ? <Badge tone="success">Passed</Badge> : <Badge tone="danger">Not passed</Badge>}
                    </Td>
                    <Td align="right">{attempt.percentage !== null ? <strong className="text-navy">{attempt.percentage}%</strong> : '-'}</Td>
                  </tr>
                ))}
              </tbody>
            </DataTable>
          )}
        </Card>
      </div>
    </div>
  );
}

/**
 * Shown when this assessment has a submission waiting in the offline queue.
 *
 * Without this the learner could start the attempt again and queue a second
 * submission, of which only the first would ever be graded.
 */
function AwaitingSync({ title, syncNow, syncing }: { title: string; syncNow: () => void; syncing: boolean }) {
  return (
    <div className="animate-fade-in">
      <nav aria-label="Breadcrumb" className="mb-4 text-xs font-semibold text-slate-500">
        <Link to="/trainee/assessments" className="hover:text-sky-deep">
          Assessments
        </Link>
      </nav>
      <PageHeader eyebrow="Submitted on this device" title={title} description="Your answers are safe. They will be graded as soon as this device reaches the server." />
      <Card>
        <InlineAlert tone="info">
          This submission is waiting to sync. Your attempt is not counted twice: it carries a key that lets the server recognise it if it arrives more than once.
        </InlineAlert>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button loading={syncing} onClick={syncNow} leftIcon={<Send size={15} />}>
            Try to send it now
          </Button>
          <ButtonLink to="/offline-library" variant="secondary">
            See everything waiting
          </ButtonLink>
        </div>
      </Card>
    </div>
  );
}

export default function AssessmentPage() {
  const { assessmentId = '' } = useParams();
  const [started, setStarted] = useState<StartedAttempt | null>(null);
  const info = useQuery({ queryKey: keys.assessmentInfo(assessmentId), queryFn: () => fetchAssessmentInfo(assessmentId), enabled: Boolean(assessmentId) });
  usePageTitle(info.data?.title ?? 'Assessment');
  const { pending, state, syncNow } = useSyncStatus();
  const queued = pending.find((entry) => !entry.failed && entry.kind === 'assessment.submit' && (entry.payload as { assessmentId: string }).assessmentId === assessmentId);

  const exit = useCallback(() => {
    setStarted(null);
    void info.refetch();
  }, [info]);

  if (queued) return <AwaitingSync title={info.data?.title ?? 'Assessment'} syncNow={syncNow} syncing={state === 'SYNCING'} />;
  if (started) return <AttemptRunner key={started.attempt.id} started={started} assessmentId={assessmentId} onExit={exit} />;
  return <QueryBoundary query={info}>{(data) => <Intro info={data} onStarted={setStarted} />}</QueryBoundary>;
}
