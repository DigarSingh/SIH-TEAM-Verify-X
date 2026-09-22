import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Calculator, RotateCcw } from 'lucide-react';
import { useForm, useWatch, type Control } from 'react-hook-form';
import { z } from 'zod';
import { errorMessage } from '../../api/client';
import { keys } from '../../api/keys';
import { PriorityBadge, SeverityBadge } from '../../components/domain/badges';
import { QueryBoundary } from '../../components/domain/QueryBoundary';
import { Badge, Button, Card, CheckboxField, InlineAlert, PageHeader, SelectField, TextField, useConfirm } from '../../components/ui';
import { useApiMutation, usePageTitle } from '../../hooks/misc';
import { fetchEngineConfig, resetEngineConfig, saveEngineConfig, simulateEngine } from '../../services/engine';
import type { EngineConfig, EngineConfigResponse } from '../../types';
import { LIMITED_BY_LABEL } from '../../utils/constants';
import { formatDateTime } from '../../utils/format';

// ---------------------------------------------------------------------------------------------
// Form <-> configuration
// ---------------------------------------------------------------------------------------------

const num = (min: number, max: number, message: string) => z.string().trim().refine((value) => value !== '' && Number.isFinite(Number(value)) && Number(value) >= min && Number(value) <= max, message);

const schema = z
  .object({
    lowMax: num(0, 100, '0 to 100'),
    moderateMax: num(0, 100, '0 to 100'),
    highMax: num(0, 100, '0 to 100'),
    mediumMin: num(0, 100, '0 to 100'),
    highMin: num(0, 100, '0 to 100'),
    criticalMin: num(0, 100, '0 to 100'),
    previousWeight: num(0, 0.9, '0 to 0.9'),
    wAssessment: num(0, 1, '0 to 1'),
    wTrainer: num(0, 1, '0 to 1'),
    wPractical: num(0, 1, '0 to 1'),
    evidenceWindowDays: z.string().trim().refine((value) => /^\d+$/.test(value) && Number(value) >= 1 && Number(value) <= 3650, 'Whole days, 1 to 3650'),
    updateOnFailedAttempt: z.boolean(),
    allowDecrease: z.boolean(),
    capAtCourseTarget: z.boolean(),
    ewTechnical: num(0, 1, '0 to 1'),
    ewPractical: num(0, 1, '0 to 1'),
    ewParticipation: num(0, 1, '0 to 1'),
    ewApplication: num(0, 1, '0 to 1'),
    ewOverall: num(0, 1, '0 to 1'),
  })
  .superRefine((v, ctx) => {
    const n = (value: string) => Number(value);
    if (!(n(v.lowMax) < n(v.moderateMax))) ctx.addIssue({ code: 'custom', path: ['moderateMax'], message: 'Must be higher than the Low limit' });
    if (!(n(v.moderateMax) < n(v.highMax))) ctx.addIssue({ code: 'custom', path: ['highMax'], message: 'Must be higher than the Moderate limit' });
    if (!(n(v.mediumMin) > 0)) ctx.addIssue({ code: 'custom', path: ['mediumMin'], message: 'Must be above 0' });
    if (!(n(v.mediumMin) < n(v.highMin))) ctx.addIssue({ code: 'custom', path: ['highMin'], message: 'Must be higher than the Medium threshold' });
    if (!(n(v.highMin) < n(v.criticalMin))) ctx.addIssue({ code: 'custom', path: ['criticalMin'], message: 'Must be higher than the High threshold' });
    if (n(v.wAssessment) + n(v.wTrainer) + n(v.wPractical) <= 0) ctx.addIssue({ code: 'custom', path: ['wAssessment'], message: 'At least one evidence weight must be above 0' });
    const sum = n(v.ewTechnical) + n(v.ewPractical) + n(v.ewParticipation) + n(v.ewApplication) + n(v.ewOverall);
    if (Math.abs(sum - 1) >= 0.001) ctx.addIssue({ code: 'custom', path: ['ewOverall'], message: `The rubric weights add up to ${Math.round(sum * 1000) / 1000}; they must add up to 1` });
  });
type FormValues = z.infer<typeof schema>;

const s = (value: number) => String(value);
const toForm = (c: EngineConfig): FormValues => ({
  lowMax: s(c.severity.lowMax),
  moderateMax: s(c.severity.moderateMax),
  highMax: s(c.severity.highMax),
  mediumMin: s(c.priority.mediumMin),
  highMin: s(c.priority.highMin),
  criticalMin: s(c.priority.criticalMin),
  previousWeight: s(c.update.previousWeight),
  wAssessment: s(c.update.inputWeights.assessment),
  wTrainer: s(c.update.inputWeights.trainerEvaluation),
  wPractical: s(c.update.inputWeights.practical),
  evidenceWindowDays: s(c.update.evidenceWindowDays),
  updateOnFailedAttempt: c.update.updateOnFailedAttempt,
  allowDecrease: c.update.allowDecrease,
  capAtCourseTarget: c.update.capAtCourseTarget,
  ewTechnical: s(c.evaluationWeights.technicalKnowledge),
  ewPractical: s(c.evaluationWeights.practicalAbility),
  ewParticipation: s(c.evaluationWeights.participation),
  ewApplication: s(c.evaluationWeights.applicationOfKnowledge),
  ewOverall: s(c.evaluationWeights.overallCompetency),
});

const toConfig = (v: FormValues): EngineConfig => ({
  severity: { lowMax: Number(v.lowMax), moderateMax: Number(v.moderateMax), highMax: Number(v.highMax) },
  priority: { mediumMin: Number(v.mediumMin), highMin: Number(v.highMin), criticalMin: Number(v.criticalMin) },
  update: {
    previousWeight: Number(v.previousWeight),
    inputWeights: { assessment: Number(v.wAssessment), trainerEvaluation: Number(v.wTrainer), practical: Number(v.wPractical) },
    evidenceWindowDays: Number(v.evidenceWindowDays),
    updateOnFailedAttempt: v.updateOnFailedAttempt,
    allowDecrease: v.allowDecrease,
    capAtCourseTarget: v.capAtCourseTarget,
  },
  evaluationWeights: {
    technicalKnowledge: Number(v.ewTechnical),
    practicalAbility: Number(v.ewPractical),
    participation: Number(v.ewParticipation),
    applicationOfKnowledge: Number(v.ewApplication),
    overallCompetency: Number(v.ewOverall),
  },
});

// ---------------------------------------------------------------------------------------------
// Simulator
// ---------------------------------------------------------------------------------------------

const simSchema = z.object({
  currentLevel: num(0, 100, '0 to 100'),
  requiredLevel: num(0, 100, '0 to 100'),
  importance: z.string(),
  roleCriticality: z.string(),
  assessmentScore: z.string().refine((value) => value === '' || (Number.isFinite(Number(value)) && Number(value) >= 0 && Number(value) <= 100), '0 to 100'),
  trainerEvaluationScore: z.string().refine((value) => value === '' || (Number.isFinite(Number(value)) && Number(value) >= 0 && Number(value) <= 100), '0 to 100'),
  practicalScore: z.string().refine((value) => value === '' || (Number.isFinite(Number(value)) && Number(value) >= 0 && Number(value) <= 100), '0 to 100'),
  ceiling: z.string().refine((value) => value === '' || (Number.isFinite(Number(value)) && Number(value) >= 0 && Number(value) <= 100), '0 to 100'),
});
type SimValues = z.infer<typeof simSchema>;

function Simulator({ control }: { control: Control<FormValues> }) {
  const values = useWatch({ control });
  const draft = schema.safeParse(values);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<SimValues>({
    resolver: zodResolver(simSchema),
    defaultValues: { currentLevel: '35', requiredLevel: '80', importance: '4', roleCriticality: '4', assessmentScore: '84', trainerEvaluationScore: '', practicalScore: '', ceiling: '75' },
  });
  const run = useMutation({
    mutationFn: (input: SimValues) =>
      simulateEngine({
        ...(draft.success ? { config: toConfig(draft.data) } : {}),
        currentLevel: Number(input.currentLevel),
        requiredLevel: Number(input.requiredLevel),
        importance: Number(input.importance),
        roleCriticality: Number(input.roleCriticality),
        ...(input.assessmentScore !== '' ? { assessmentScore: Number(input.assessmentScore) } : {}),
        ...(input.trainerEvaluationScore !== '' ? { trainerEvaluationScore: Number(input.trainerEvaluationScore) } : {}),
        ...(input.practicalScore !== '' ? { practicalScore: Number(input.practicalScore) } : {}),
        ...(input.ceiling !== '' ? { ceiling: Number(input.ceiling) } : {}),
      }),
  });
  const result = run.data;

  return (
    <Card title="Try it: simulator" description="Runs the real engine on made-up numbers, using the values currently in the form (even unsaved). Nothing is changed.">
      <form onSubmit={handleSubmit((input) => run.mutate(input))} noValidate className="grid grid-cols-2 gap-3">
        <TextField label="Current level" inputMode="numeric" error={errors.currentLevel?.message} {...register('currentLevel')} />
        <TextField label="Required level" inputMode="numeric" error={errors.requiredLevel?.message} {...register('requiredLevel')} />
        <SelectField label="Importance" {...register('importance')}>
          {[1, 2, 3, 4, 5].map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </SelectField>
        <SelectField label="Role criticality" {...register('roleCriticality')}>
          {[1, 2, 3, 4, 5].map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </SelectField>
        <TextField label="Assessment %" inputMode="decimal" error={errors.assessmentScore?.message} {...register('assessmentScore')} />
        <TextField label="Trainer evaluation %" inputMode="decimal" error={errors.trainerEvaluationScore?.message} {...register('trainerEvaluationScore')} />
        <TextField label="Practical %" inputMode="decimal" error={errors.practicalScore?.message} {...register('practicalScore')} />
        <TextField label="Course target level" inputMode="numeric" hint="Cap for the update" error={errors.ceiling?.message} {...register('ceiling')} />
        <div className="col-span-2 flex items-center gap-3">
          <Button type="submit" loading={run.isPending} leftIcon={<Calculator size={16} />}>
            Calculate
          </Button>
          {!draft.success && <span className="text-xs text-amber-700">The form has errors, so the saved configuration is used.</span>}
        </div>
      </form>

      {run.isError && (
        <InlineAlert tone="danger" className="mt-4">
          {errorMessage(run.error)}
        </InlineAlert>
      )}
      {result && (
        <div className="mt-5 space-y-4" role="status" aria-live="polite">
          <div className="grid grid-cols-2 gap-3 text-center">
            <div className="rounded-xl bg-slate-50 p-3">
              <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Before</p>
              <p className="font-display text-2xl font-bold text-navy">{result.before.currentLevel}%</p>
              <p className="text-xs text-slate-500">gap {result.before.gap}</p>
              <div className="mt-2 flex flex-wrap justify-center gap-1">
                <SeverityBadge severity={result.before.severity} met={result.before.met} />
                {!result.before.met && <PriorityBadge level={result.before.priorityLevel} score={result.before.priorityScore} />}
              </div>
            </div>
            <div className="rounded-xl bg-emerald-50 p-3">
              <p className="text-[10px] font-bold uppercase tracking-wide text-emerald-700">After</p>
              <p className="font-display text-2xl font-bold text-emerald-700">{result.after.currentLevel}%</p>
              <p className="text-xs text-slate-500">gap {result.after.gap}</p>
              <div className="mt-2 flex flex-wrap justify-center gap-1">
                <SeverityBadge severity={result.after.severity} met={result.after.met} />
                {!result.after.met && <PriorityBadge level={result.after.priorityLevel} score={result.after.priorityScore} />}
              </div>
            </div>
          </div>
          <p className="text-xs leading-5 text-slate-600">{result.update.explanation}</p>
          {LIMITED_BY_LABEL[result.update.limitedBy] && <p className="text-xs font-semibold text-slate-500">{LIMITED_BY_LABEL[result.update.limitedBy]}</p>}
          {result.update.components.length > 0 && (
            <ul className="space-y-1 text-xs text-slate-500">
              {result.update.components.map((component) => (
                <li key={component.source} className="flex justify-between gap-3">
                  <span>{component.source}</span>
                  <span>
                    score {component.score}% · weight {Math.round(component.share * 100)}%
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------------------------

function Settings({ response }: { response: EngineConfigResponse }) {
  const confirm = useConfirm();
  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors, isDirty },
  } = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: toForm(response.config) });
  const live = useWatch({ control });

  const save = useApiMutation({
    mutationFn: (values: FormValues) => saveEngineConfig(toConfig(values)),
    successMessage: 'Engine configuration saved. New calculations use it immediately.',
    invalidate: [keys.engineConfig, keys.skillGaps, keys.recommendations, keys.passport, keys.adminAnalyticsAll, ['admin', 'heatmap'], ['admin', 'training-needs']],
    onSuccess: (saved) => reset(toForm(saved.config)),
  });
  const restore = useApiMutation({
    mutationFn: () => resetEngineConfig(),
    successMessage: 'The default configuration was restored',
    invalidate: [keys.engineConfig, keys.skillGaps, keys.recommendations, keys.passport, keys.adminAnalyticsAll, ['admin', 'heatmap'], ['admin', 'training-needs']],
    onSuccess: (saved) => reset(toForm(saved.config)),
  });

  const n = (value: string | undefined) => (value !== undefined && value !== '' && Number.isFinite(Number(value)) ? Number(value) : null);
  const low = n(live.lowMax);
  const moderate = n(live.moderateMax);
  const high = n(live.highMax);
  const prev = n(live.previousWeight);

  const onSave = handleSubmit(async (values) => {
    if (await confirm({ title: 'Save this engine configuration?', message: 'Skill-gap severities, training priorities and competency updates are recalculated with these numbers from now on. Existing competency history is not rewritten.', confirmLabel: 'Save configuration' })) save.mutate(values);
  });

  return (
    <div className="animate-fade-in">
      <PageHeader
        eyebrow="Administration"
        title="Engine settings"
        description="Every number that classifies a skill gap, ranks a training need or updates a competency lives here. The engine is a set of transparent formulas with these settings, not a black box, and every change is audited."
        actions={
          <>
            <Badge tone={response.customised ? 'warning' : 'success'}>{response.customised ? `Customised${response.updatedAt ? ` · ${formatDateTime(response.updatedAt)}` : ''}` : 'Default configuration'}</Badge>
            <Button
              variant="secondary"
              loading={restore.isPending}
              disabled={!response.customised}
              onClick={async () => {
                if (await confirm({ title: 'Restore the default configuration?', message: 'All thresholds and weights return to their default values.', confirmLabel: 'Restore defaults' })) restore.mutate();
              }}
              leftIcon={<RotateCcw size={16} />}
            >
              Restore defaults
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <form onSubmit={onSave} noValidate className="min-w-0 space-y-6 xl:col-span-2">
          <Card title="Skill-gap severity" description="Gap = required level − current level. A gap is classified by its size in points.">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <TextField label="Low up to" inputMode="numeric" error={errors.lowMax?.message} {...register('lowMax')} />
              <TextField label="Moderate up to" inputMode="numeric" error={errors.moderateMax?.message} {...register('moderateMax')} />
              <TextField label="High up to" inputMode="numeric" error={errors.highMax?.message} {...register('highMax')} />
            </div>
            <p className="mt-3 text-xs text-slate-500">
              Low 0-{low ?? '?'} · Moderate {low !== null ? low + 1 : '?'}-{moderate ?? '?'} · High {moderate !== null ? moderate + 1 : '?'}-{high ?? '?'} · Critical {high !== null ? `${high + 1}+` : '?'}
            </p>
          </Card>

          <Card title="Training priority" description="Priority = gap × importance/5 × role criticality/5, normalised to 0-100. These thresholds decide the priority level.">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <TextField label="Medium from" inputMode="decimal" error={errors.mediumMin?.message} {...register('mediumMin')} />
              <TextField label="High from" inputMode="decimal" error={errors.highMin?.message} {...register('highMin')} />
              <TextField label="Critical from" inputMode="decimal" error={errors.criticalMin?.message} {...register('criticalMin')} />
            </div>
          </Card>

          <Card title="Competency update" description="New level = previous weight × previous level + (1 − previous weight) × evidence, where evidence is the weighted mean of the sources available.">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <TextField label="Weight of the previous level" inputMode="decimal" hint={prev !== null ? `Evidence gets ${Math.round((1 - prev) * 100)}%. With 0.25, a level of 35 and an assessment of 84 gives 72.` : undefined} error={errors.previousWeight?.message} {...register('previousWeight')} />
              <TextField label="Evidence window (days)" inputMode="numeric" hint="Older evidence no longer counts." error={errors.evidenceWindowDays?.message} {...register('evidenceWindowDays')} />
              <TextField label="Assessment weight" inputMode="decimal" error={errors.wAssessment?.message} {...register('wAssessment')} />
              <TextField label="Trainer evaluation weight" inputMode="decimal" error={errors.wTrainer?.message} {...register('wTrainer')} />
              <TextField label="Practical assessment weight" inputMode="decimal" error={errors.wPractical?.message} {...register('wPractical')} />
            </div>
            <p className="mt-2 text-xs text-slate-500">Weights are relative: they are rescaled over the sources that actually exist for the learner.</p>
            <div className="mt-5 space-y-3">
              <CheckboxField label="Failed attempts also update the competency" description="Off by default: only a passed assessment moves a competency." {...register('updateOnFailedAttempt')} />
              <CheckboxField label="A weak result may lower an assessed competency" description="Off by default: a level never goes down because of one result." {...register('allowDecrease')} />
              <CheckboxField label="Cap the update at the course’s target level" description="On by default: a course cannot raise a competency above the level it was designed to reach." {...register('capAtCourseTarget')} />
            </div>
          </Card>

          <Card title="Trainer rubric weights" description="How the five rubric ratings combine into a weighted score. They must add up to 1.">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <TextField label="Technical knowledge" inputMode="decimal" error={errors.ewTechnical?.message} {...register('ewTechnical')} />
              <TextField label="Practical ability" inputMode="decimal" error={errors.ewPractical?.message} {...register('ewPractical')} />
              <TextField label="Participation" inputMode="decimal" error={errors.ewParticipation?.message} {...register('ewParticipation')} />
              <TextField label="Application of knowledge" inputMode="decimal" error={errors.ewApplication?.message} {...register('ewApplication')} />
              <TextField label="Overall competency" inputMode="decimal" error={errors.ewOverall?.message} {...register('ewOverall')} />
            </div>
          </Card>

          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" loading={save.isPending} disabled={!isDirty}>
              Save configuration
            </Button>
            <Button type="button" variant="ghost" disabled={!isDirty} onClick={() => reset(toForm(response.config))}>
              Discard changes
            </Button>
          </div>
        </form>

        <div className="xl:sticky xl:top-24 xl:self-start">
          <Simulator control={control} />
        </div>
      </div>
    </div>
  );
}

export default function EngineSettingsPage() {
  usePageTitle('Engine settings');
  const query = useQuery({ queryKey: keys.engineConfig, queryFn: fetchEngineConfig });
  return <QueryBoundary query={query}>{(response) => <Settings key={response.updatedAt ?? 'default'} response={response} />}</QueryBoundary>;
}
