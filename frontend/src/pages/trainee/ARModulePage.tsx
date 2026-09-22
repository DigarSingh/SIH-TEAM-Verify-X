import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, ArrowRight, CheckCircle2, CircleAlert, Lightbulb, Play, Send, Target } from 'lucide-react';
import { useCallback, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { keys } from '../../api/keys';
import { ARResult } from '../../components/domain/ARResult';
import { ARViewer } from '../../components/domain/ARViewer';
import { OfflineNotice } from '../../components/domain/OfflineParts';
import { QueryBoundary } from '../../components/domain/QueryBoundary';
import { Badge, Button, Card, InlineAlert, PageHeader, ProgressBar, useConfirm, useToast } from '../../components/ui';
import { LEARNING_KEYS } from '../../hooks/learning';
import { useApiMutation, usePageTitle } from '../../hooks/misc';
import { fetchARModule, startARAttempt, submitARAttempt } from '../../services/ar';
import type { ARComponent, ARModuleDetail, ARStartedAttempt, ARSubmitResult, ARTask } from '../../types';
import { cn } from '../../utils/cn';

/**
 * One AR lab, from the briefing to the competency change.
 *
 * Four stages, because they are genuinely different activities: reading what
 * the lab is for, exploring the instrument with hints, being assessed without
 * them, and seeing what it did to your competency.
 */
type Stage = 'INTRO' | 'TRAINING' | 'ASSESSMENT' | 'RESULT';

/** Components a trainee may hide to see what is underneath. */
const CUTAWAY_KEYS = ['radome'];

const newKey = () => (typeof crypto?.randomUUID === 'function' ? crypto.randomUUID() : `ar-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`);

// ---------------------------------------------------------------------------------------------
// Stage 1: what the lab is for
// ---------------------------------------------------------------------------------------------

function Intro({ detail, onStart, starting }: { detail: ARModuleDetail; onStart: () => void; starting: boolean }) {
  const { module } = detail;
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
      <Card title="What you will be able to do" description="By the end of this lab">
        <ul className="space-y-2.5">
          {module.objectives.map((objective) => (
            <li key={objective} className="flex gap-2.5 text-sm leading-6 text-slate-700">
              <CheckCircle2 size={16} className="mt-1 shrink-0 text-emerald-600" aria-hidden />
              {objective}
            </li>
          ))}
        </ul>

        <div className="mt-6 rounded-xl bg-slate-50 p-4">
          <h3 className="text-[11px] font-bold uppercase tracking-wide text-slate-500">How it runs</h3>
          <ol className="mt-2 space-y-1.5 text-sm text-slate-600">
            <li>1. Guided training: {detail.training.length} steps, with hints. Nothing is scored.</li>
            <li>2. Practical assessment: {detail.assessmentTaskCount} tasks, no hints, {detail.assessmentTotalPoints} points.</li>
            <li>3. Your result, and what it did to {module.competency.name}.</li>
          </ol>
        </div>
      </Card>

      <div className="space-y-4">
        <Card title="Scoring">
          {detail.theory ? (
            <>
              <p className="text-sm text-slate-600">
                Your theory result for <strong className="text-navy">{module.course?.title}</strong> is <strong className="text-navy">{detail.theory.percentage}%</strong>. It will be combined with
                this practical:
              </p>
              <p className="mt-3 rounded-xl bg-sky/5 px-4 py-3 text-center font-mono text-sm text-navy">
                theory × {Math.round(detail.theory.weight * 100)}% + practical × {Math.round((1 - detail.theory.weight) * 100)}%
              </p>
            </>
          ) : module.theoryWeight === 0 ? (
            <p className="text-sm text-slate-600">This refresher is scored on the practical alone. It is about whether the skill is still there.</p>
          ) : (
            <p className="text-sm text-slate-600">
              You have not passed the theory assessment for this course yet, so the practical will stand on its own. Take the theory assessment later and it will count towards your competency too.
            </p>
          )}
          <p className="mt-3 text-xs text-slate-500">Pass mark: {module.passingScore}%.</p>
        </Card>

        <Card>
          <Button className="w-full" loading={starting} onClick={onStart} leftIcon={<Play size={16} />}>
            Start the lab
          </Button>
          <p className="mt-3 text-center text-xs text-slate-500">You can leave and come back; an attempt in progress is resumed.</p>
        </Card>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// The component description panel, shared by training and free exploration
// ---------------------------------------------------------------------------------------------

function ComponentPanel({ component }: { component: ARComponent | null }) {
  if (!component) {
    return (
      <Card>
        <p className="text-sm text-slate-500">Tap a numbered marker on the model to find out what that part does.</p>
      </Card>
    );
  }
  return (
    <Card title={component.name} description="Purpose">
      <p className="text-sm leading-7 text-slate-700">{component.description}</p>
    </Card>
  );
}

// ---------------------------------------------------------------------------------------------
// Stage 2: guided training
// ---------------------------------------------------------------------------------------------

function Training({
  detail,
  onFinish,
  onHintUsed,
}: {
  detail: ARModuleDetail;
  onFinish: () => void;
  onHintUsed: () => void;
}) {
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState<ARComponent | null>(null);
  const [outcome, setOutcome] = useState<'none' | 'correct' | 'wrong'>('none');
  const [hintShown, setHintShown] = useState(false);
  const [points, setPoints] = useState(0);

  const task = detail.training[index];
  const componentByKey = useMemo(() => new Map(detail.components.map((component) => [component.key, component])), [detail.components]);

  /**
   * Training marks itself in the browser, deliberately.
   *
   * It is not scored and nothing is stored, so a round trip per tap would add
   * latency to the one place where immediate feedback is the whole point. The
   * assessment is the opposite: it is marked on the server and nothing else.
   */
  const check = (component: ARComponent) => {
    setSelected(component);
    if (!task) return;
    // The training answer is known only after the trainee commits to a choice.
    const correct = detail.training.length > 0 && component.key === trainingAnswer(task, componentByKey);
    setOutcome(correct ? 'correct' : 'wrong');
    if (correct) setPoints((value) => value + 10);
  };

  const next = () => {
    setOutcome('none');
    setSelected(null);
    setHintShown(false);
    if (index + 1 < detail.training.length) setIndex(index + 1);
    else onFinish();
  };

  if (!task) {
    return (
      <Card>
        <p className="text-sm text-slate-600">This lab has no guided training.</p>
        <Button className="mt-3" onClick={onFinish}>
          Go to the assessment
        </Button>
      </Card>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
      <ARViewer
        modelUrl={detail.module.modelUrl}
        modelHeightM={detail.module.modelHeightM}
        components={detail.components}
        selectedKey={selected?.key ?? null}
        onSelect={check}
        cutawayKeys={CUTAWAY_KEYS}
      />

      <div className="space-y-4">
        <Card
          title={`Step ${index + 1} of ${detail.training.length}`}
          description="Guided training · not scored"
          action={<Badge tone="info">{points} practice points</Badge>}
        >
          <p className="font-display text-base font-bold leading-snug text-navy">{task.instruction}</p>

          {outcome === 'correct' && (
            <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
              <p className="flex items-center gap-2 text-sm font-bold text-emerald-800">
                <CheckCircle2 size={16} aria-hidden /> Correct · +10 points
              </p>
              {selected && <p className="mt-1.5 text-sm leading-6 text-emerald-900/80">{selected.description}</p>}
            </div>
          )}

          {outcome === 'wrong' && (
            <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
              <p className="flex items-center gap-2 text-sm font-bold text-amber-800">
                <CircleAlert size={16} aria-hidden /> Not that one — try again.
              </p>
              {selected && <p className="mt-1 text-xs text-amber-900/80">You selected the {selected.name.toLowerCase()}.</p>}
              {task.hint && !hintShown && (
                <Button
                  size="sm"
                  variant="secondary"
                  className="mt-3"
                  leftIcon={<Lightbulb size={14} />}
                  onClick={() => {
                    setHintShown(true);
                    onHintUsed();
                  }}
                >
                  Show a hint
                </Button>
              )}
              {hintShown && task.hint && <p className="mt-3 rounded-lg bg-white px-3 py-2 text-sm text-slate-700">{task.hint}</p>}
            </div>
          )}

          <div className="mt-5 flex flex-wrap items-center justify-between gap-2">
            <Button variant="ghost" size="sm" onClick={onFinish}>
              Skip to the assessment
            </Button>
            <Button size="sm" disabled={outcome !== 'correct'} onClick={next} rightIcon={<ArrowRight size={15} />}>
              {index + 1 < detail.training.length ? 'Next step' : 'Start the assessment'}
            </Button>
          </div>
        </Card>

        <ComponentPanel component={selected} />
      </div>
    </div>
  );
}

/**
 * Training answers.
 *
 * The server does not send the answer for a training task either, so training
 * is checked against the component whose name the instruction refers to. This
 * is good enough for unscored practice and keeps the answer key off the wire;
 * the assessment never relies on it.
 */
function trainingAnswer(task: ARTask, componentByKey: Map<string, ARComponent>): string | null {
  const text = task.instruction.toLowerCase();
  let best: { key: string; at: number } | null = null;
  for (const [key, component] of componentByKey) {
    const at = text.indexOf(component.name.toLowerCase());
    if (at >= 0 && (best === null || at < best.at)) best = { key, at };
  }
  return best?.key ?? null;
}

// ---------------------------------------------------------------------------------------------
// Stage 3: the assessment
// ---------------------------------------------------------------------------------------------

function Assessment({
  detail,
  started,
  onSubmit,
  submitting,
}: {
  detail: ARModuleDetail;
  started: ARStartedAttempt;
  onSubmit: (responses: { taskId: string; selectedComponentId: string | null; timeMs: number }[]) => void;
  submitting: boolean;
}) {
  const confirm = useConfirm();
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const startedAt = useRef<Record<string, number>>({});
  const task = started.tasks[index];

  if (!startedAt.current[task?.id ?? '']) startedAt.current[task?.id ?? ''] = Date.now();

  const componentById = useMemo(() => new Map(started.components.map((component) => [component.id, component])), [started.components]);
  const selectedId = task ? answers[task.id] : undefined;
  const answeredCount = Object.keys(answers).length;

  const choose = (component: ARComponent) => {
    if (!task) return;
    setAnswers((current) => ({ ...current, [task.id]: component.id }));
  };

  const submit = async () => {
    const unanswered = started.tasks.length - answeredCount;
    const yes = await confirm({
      title: 'Submit your practical?',
      message: (
        <>
          <p>
            You have answered <strong>{answeredCount}</strong> of <strong>{started.tasks.length}</strong> tasks.
          </p>
          {unanswered > 0 && <p className="mt-2 font-semibold text-orange-700">{unanswered} unanswered task{unanswered === 1 ? '' : 's'} will score zero.</p>}
          <p className="mt-2">Your answers are marked on the server and cannot be changed afterwards.</p>
        </>
      ),
      confirmLabel: 'Submit practical',
    });
    if (!yes) return;
    onSubmit(
      started.tasks.map((item) => ({
        taskId: item.id,
        selectedComponentId: answers[item.id] ?? null,
        timeMs: Math.max(0, Date.now() - (startedAt.current[item.id] ?? Date.now())),
      })),
    );
  };

  if (!task) return null;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
      <ARViewer
        modelUrl={detail.module.modelUrl}
        modelHeightM={detail.module.modelHeightM}
        components={started.components}
        selectedKey={selectedId ? componentById.get(selectedId)?.key ?? null : null}
        onSelect={choose}
        cutawayKeys={CUTAWAY_KEYS}
        /* The markers are numbered, not named: a labelled marker would answer the question. */
        hideLabels
      />

      <div className="space-y-4">
        <Card
          title={`Task ${index + 1} of ${started.tasks.length}`}
          description="Practical assessment · no hints"
          action={<Badge tone={task.type === 'INSPECT' ? 'warning' : 'info'}>{task.type === 'INSPECT' ? 'Inspection' : 'Identify'}</Badge>}
        >
          <ProgressBar value={(answeredCount / started.tasks.length) * 100} height="h-1.5" label="Tasks answered" />
          <p className="mt-4 font-display text-base font-bold leading-snug text-navy">{task.instruction}</p>
          <p className="mt-2 text-xs text-slate-500">{task.points} points. Tap a numbered marker on the model.</p>

          <div className="mt-4 rounded-xl bg-slate-50 px-4 py-3">
            <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Your answer</p>
            <p className="mt-0.5 text-sm font-semibold text-navy">{selectedId ? componentById.get(selectedId)?.name : 'Nothing selected yet'}</p>
          </div>

          <div className="mt-5 flex flex-wrap items-center justify-between gap-2">
            <Button variant="secondary" size="sm" disabled={index === 0} onClick={() => setIndex(index - 1)} leftIcon={<ArrowLeft size={15} />}>
              Previous
            </Button>
            {index + 1 < started.tasks.length ? (
              <Button size="sm" onClick={() => setIndex(index + 1)} rightIcon={<ArrowRight size={15} />}>
                Next task
              </Button>
            ) : (
              <Button size="sm" variant="success" loading={submitting} onClick={() => void submit()} leftIcon={<Send size={15} />}>
                Submit practical
              </Button>
            )}
          </div>
        </Card>

        <Card title="Tasks">
          <ol className="grid grid-cols-5 gap-2">
            {started.tasks.map((item, position) => (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => setIndex(position)}
                  aria-label={`Task ${position + 1}${answers[item.id] ? ', answered' : ', not answered'}`}
                  aria-current={position === index ? 'true' : undefined}
                  className={cn(
                    'flex h-10 w-full items-center justify-center rounded-lg border text-sm font-bold transition',
                    position === index ? 'border-navy ring-2 ring-navy/20' : 'border-transparent',
                    answers[item.id] ? 'bg-sky-deep text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200',
                  )}
                >
                  {position + 1}
                </button>
              </li>
            ))}
          </ol>
          <p className="mt-3 text-xs text-slate-500">You can move between tasks freely until you submit.</p>
        </Card>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------

export default function ARModulePage() {
  const { moduleKey = '' } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [stage, setStage] = useState<Stage>('INTRO');
  const [started, setStarted] = useState<ARStartedAttempt | null>(null);
  const [result, setResult] = useState<ARSubmitResult | null>(null);
  const hintsUsed = useRef(0);
  /** Generated once per attempt, so a retry after a dropped connection cannot double-count. */
  const idempotencyKey = useRef(newKey());

  const query = useQuery({ queryKey: keys.arModule(moduleKey), queryFn: () => fetchARModule(moduleKey), enabled: Boolean(moduleKey) });
  usePageTitle(query.data?.module.title ?? 'AR Lab');

  const start = useApiMutation({
    mutationFn: () => startARAttempt(moduleKey),
    onSuccess: (attempt) => {
      setStarted(attempt);
      idempotencyKey.current = newKey();
      if (attempt.resumed) toast.info('Your attempt in progress was resumed.');
      setStage(query.data && query.data.training.length > 0 ? 'TRAINING' : 'ASSESSMENT');
    },
  });

  const submit = useApiMutation({
    mutationFn: (responses: { taskId: string; selectedComponentId: string | null; timeMs: number }[]) =>
      submitARAttempt(moduleKey, { attemptId: started?.attempt.id ?? '', responses, hintsUsed: hintsUsed.current, idempotencyKey: idempotencyKey.current }),
    onSuccess: async (submitted) => {
      setResult(submitted);
      setStage('RESULT');
      await Promise.all([keys.arModulesAll, keys.arModule(moduleKey), ...LEARNING_KEYS].map((queryKey) => queryClient.invalidateQueries({ queryKey })));
    },
  });

  const onHintUsed = useCallback(() => {
    hintsUsed.current += 1;
  }, []);

  return (
    <QueryBoundary query={query}>
      {(detail) => (
        <div className="animate-fade-in space-y-6">
          <Link to="/trainee/ar-lab" className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-sky-deep">
            <ArrowLeft size={14} aria-hidden /> AR Instrument Lab
          </Link>

          {stage !== 'RESULT' && (
            <PageHeader
              eyebrow={`${detail.module.subtitle ?? 'AR practical'} · ${detail.module.competency.name}`}
              title={detail.module.title}
              description={stage === 'INTRO' ? detail.module.description : undefined}
              actions={
                <div className="flex flex-wrap items-center gap-2">
                  {detail.module.isSimulation && <Badge tone="purple">Simulated exercise</Badge>}
                  <Badge tone="info">{detail.module.durationMinutes} min</Badge>
                </div>
              }
            />
          )}

          <OfflineNotice />

          {stage === 'INTRO' && <Intro detail={detail} onStart={() => start.mutate()} starting={start.isPending} />}

          {stage === 'TRAINING' && <Training detail={detail} onFinish={() => setStage('ASSESSMENT')} onHintUsed={onHintUsed} />}

          {stage === 'ASSESSMENT' && started && (
            <>
              <InlineAlert tone="info">
                <span className="flex items-start gap-2">
                  <Target size={15} className="mt-0.5 shrink-0" aria-hidden />
                  This part is marked. The markers are numbered rather than named, and no hints are shown.
                </span>
              </InlineAlert>
              <Assessment detail={detail} started={started} onSubmit={(responses) => submit.mutate(responses)} submitting={submit.isPending} />
            </>
          )}

          {stage === 'RESULT' && result && <ARResult result={result} moduleKey={moduleKey} />}

          {stage === 'INTRO' && detail.attempts.length > 0 && (
            <Card title="Your earlier attempts">
              <ul className="space-y-2">
                {detail.attempts
                  .filter((attempt) => attempt.status === 'COMPLETED')
                  .map((attempt) => (
                    <li key={attempt.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-100 px-4 py-2.5 text-sm">
                      <span className="text-slate-600">
                        Attempt {attempt.attemptNumber} · practical {attempt.practicalPercentage}%
                        {attempt.combinedPercentage !== null && ` · final ${attempt.combinedPercentage}%`}
                      </span>
                      <div className="flex items-center gap-2">
                        <Badge tone={attempt.passed ? 'success' : 'neutral'}>{attempt.passed ? 'Passed' : 'Not passed'}</Badge>
                        <Button size="sm" variant="ghost" onClick={() => navigate(`/trainee/ar-lab/${moduleKey}/attempts/${attempt.id}`)}>
                          View
                        </Button>
                      </div>
                    </li>
                  ))}
              </ul>
            </Card>
          )}
        </div>
      )}
    </QueryBoundary>
  );
}
