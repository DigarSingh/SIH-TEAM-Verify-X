import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import { ArrowDown, ArrowLeft, ArrowUp, BarChart3, Check, Lock, Pencil, Plus, Rocket, Trash2, Undo2 } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { z } from 'zod';
import { errorMessage } from '../../api/client';
import { keys } from '../../api/keys';
import { QueryBoundary } from '../../components/domain/QueryBoundary';
import { Badge, Button, ButtonLink, Card, CheckboxField, EmptyState, InlineAlert, TextAreaField, TextField, useConfirm } from '../../components/ui';
import { useApiMutation, usePageTitle } from '../../hooks/misc';
import { useCurrentUser } from '../../hooks/useAuth';
import { deleteAssessment, deleteQuestion, fetchManagedAssessment, reorderQuestions, updateAssessment } from '../../services/assessments';
import type { ManagedAssessment } from '../../types';
import { applyServerErrors } from '../../utils/forms';
import { plural } from '../../utils/format';
import { QuestionDialog } from './assessment-builder/QuestionDialog';

const whole = (min: number, max: number, message: string) => z.string().trim().refine((value) => /^\d+$/.test(value) && Number(value) >= min && Number(value) <= max, message);

const schema = z.object({
  title: z.string().trim().min(3, 'Enter a title (at least 3 characters)').max(150),
  description: z.string().trim().max(1000),
  instructions: z.string().trim().max(2000),
  timeLimitMinutes: z.string().trim().refine((value) => value === '' || (/^\d+$/.test(value) && Number(value) >= 1 && Number(value) <= 600), 'Whole minutes from 1 to 600, or leave empty for no limit'),
  passingScore: whole(1, 100, 'Pass mark from 1 to 100'),
  maxAttempts: whole(0, 50, 'From 0 to 50 (0 means unlimited)'),
  deadline: z.string(),
  questionsPerAttempt: z.string().trim().refine((value) => value === '' || (/^\d+$/.test(value) && Number(value) >= 1 && Number(value) <= 200), 'Whole number of questions, or leave empty to use all'),
  shuffleQuestions: z.boolean(),
  shuffleOptions: z.boolean(),
  showCorrectAnswers: z.boolean(),
});
type FormValues = z.infer<typeof schema>;

const pad = (value: number) => String(value).padStart(2, '0');
const toLocalInput = (iso: string | null) => {
  if (!iso) return '';
  const date = new Date(iso);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

const initialValues = (assessment: ManagedAssessment): FormValues => ({
  title: assessment.title,
  description: assessment.description ?? '',
  instructions: assessment.instructions ?? '',
  timeLimitMinutes: assessment.timeLimitMinutes ? String(assessment.timeLimitMinutes) : '',
  passingScore: String(assessment.passingScore),
  maxAttempts: String(assessment.maxAttempts),
  deadline: toLocalInput(assessment.deadline),
  questionsPerAttempt: assessment.questionsPerAttempt ? String(assessment.questionsPerAttempt) : '',
  shuffleQuestions: assessment.shuffleQuestions,
  shuffleOptions: assessment.shuffleOptions,
  showCorrectAnswers: assessment.showCorrectAnswers,
});

function SettingsCard({ assessment }: { assessment: ManagedAssessment }) {
  const {
    register,
    handleSubmit,
    setError,
    reset,
    formState: { errors, isDirty },
  } = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: initialValues(assessment) });

  const save = useApiMutation({
    mutationFn: (values: FormValues) =>
      updateAssessment(assessment.id, {
        title: values.title,
        description: values.description || null,
        instructions: values.instructions || null,
        timeLimitMinutes: values.timeLimitMinutes ? Number(values.timeLimitMinutes) : null,
        passingScore: Number(values.passingScore),
        maxAttempts: Number(values.maxAttempts),
        deadline: values.deadline ? new Date(values.deadline).toISOString() : null,
        questionsPerAttempt: values.questionsPerAttempt ? Number(values.questionsPerAttempt) : null,
        shuffleQuestions: values.shuffleQuestions,
        shuffleOptions: values.shuffleOptions,
        showCorrectAnswers: values.showCorrectAnswers,
      }),
    successMessage: 'Assessment settings saved',
    invalidate: [keys.managedAssessment(assessment.id), keys.managedAssessments(), keys.course(assessment.courseId)],
    onSuccess: (saved) => reset(initialValues(saved)),
    onError: (error) => {
      if (!applyServerErrors(error, setError, ['title', 'description', 'instructions', 'timeLimitMinutes', 'passingScore', 'maxAttempts', 'deadline', 'questionsPerAttempt'])) setError('root', { message: errorMessage(error) });
    },
  });

  const submit = handleSubmit((values) => {
    if (values.questionsPerAttempt && Number(values.questionsPerAttempt) > assessment.questionCount) {
      setError('questionsPerAttempt', { message: `The question bank only has ${plural(assessment.questionCount, 'question')}` });
      return;
    }
    save.mutate(values);
  });

  return (
    <Card title="Settings" description="How the assessment is taken and scored">
      <form onSubmit={submit} noValidate className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <TextField label="Title" required wrapperClassName="sm:col-span-2" error={errors.title?.message} {...register('title')} />
        <TextAreaField label="Description" rows={2} wrapperClassName="sm:col-span-2" error={errors.description?.message} {...register('description')} />
        <TextAreaField label="Instructions for learners" rows={3} wrapperClassName="sm:col-span-2" error={errors.instructions?.message} {...register('instructions')} />
        <TextField label="Time limit (minutes)" inputMode="numeric" hint="Empty means no limit. The timer is kept by the server." error={errors.timeLimitMinutes?.message} {...register('timeLimitMinutes')} />
        <TextField label="Pass mark (%)" inputMode="numeric" required error={errors.passingScore?.message} {...register('passingScore')} />
        <TextField label="Attempts allowed" inputMode="numeric" hint="0 means unlimited." error={errors.maxAttempts?.message} {...register('maxAttempts')} />
        <TextField label="Deadline" type="datetime-local" hint="Optional. Learners cannot start after it." error={errors.deadline?.message} {...register('deadline')} />
        <TextField label="Questions drawn per attempt" inputMode="numeric" hint="Empty uses every question. A smaller number draws a random set from the bank." error={errors.questionsPerAttempt?.message} wrapperClassName="sm:col-span-2" {...register('questionsPerAttempt')} />
        <div className="space-y-3 sm:col-span-2">
          <CheckboxField label="Shuffle the order of questions" {...register('shuffleQuestions')} />
          <CheckboxField label="Shuffle the order of options" {...register('shuffleOptions')} />
          <CheckboxField label="Show correct answers and explanations after submitting" {...register('showCorrectAnswers')} />
        </div>
        {errors.root?.message && (
          <InlineAlert tone="danger" className="sm:col-span-2">
            {errors.root.message}
          </InlineAlert>
        )}
        <div className="sm:col-span-2">
          <Button type="submit" loading={save.isPending} disabled={!isDirty}>
            Save settings
          </Button>
        </div>
      </form>
    </Card>
  );
}

function Builder({ assessment }: { assessment: ManagedAssessment }) {
  const user = useCurrentUser();
  const navigate = useNavigate();
  const confirm = useConfirm();
  const base = user.role === 'ADMIN' ? '/admin' : '/trainer';
  const [dialog, setDialog] = useState<{ question: ManagedAssessment['questions'][number] | null } | null>(null);
  const locked = assessment.attemptCount > 0;
  const refresh = [keys.managedAssessment(assessment.id), keys.managedAssessments(), keys.course(assessment.courseId), keys.coursesAll];

  const publish = useApiMutation({
    mutationFn: (isPublished: boolean) => updateAssessment(assessment.id, { isPublished }),
    invalidate: refresh,
    successMessage: (saved) => (saved.isPublished ? 'Assessment published. Learners who finish the modules can now take it.' : 'Assessment unpublished'),
  });
  const removeQuestion = useApiMutation({ mutationFn: (id: string) => deleteQuestion(assessment.id, id), successMessage: 'Question deleted', invalidate: refresh });
  const move = useApiMutation({ mutationFn: (ids: string[]) => reorderQuestions(assessment.id, ids), invalidate: refresh });
  const removeAssessment = useApiMutation({
    mutationFn: () => deleteAssessment(assessment.id),
    successMessage: 'Assessment deleted',
    invalidate: [keys.managedAssessments(), keys.course(assessment.courseId), keys.coursesAll],
    onSuccess: () => navigate(`${base}/courses/${assessment.courseId}?tab=assessment`, { replace: true }),
  });

  const swap = (index: number, direction: -1 | 1) => {
    const ids = assessment.questions.map((question) => question.id);
    const target = index + direction;
    if (target < 0 || target >= ids.length) return;
    [ids[index], ids[target]] = [ids[target] as string, ids[index] as string];
    move.mutate(ids);
  };

  return (
    <div className="animate-fade-in">
      <Link to={`${base}/courses/${assessment.courseId}?tab=assessment`} className="mb-4 inline-flex items-center gap-1.5 text-xs font-bold text-sky-deep hover:text-navy">
        <ArrowLeft size={13} aria-hidden /> {assessment.courseTitle}
      </Link>
      <div className="mb-6 flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            {assessment.isPublished ? <Badge tone="success">Published</Badge> : <Badge tone="warning">Draft</Badge>}
            <span className="text-xs text-slate-500">
              {plural(assessment.questionCount, 'question')} · {assessment.totalMarks} marks · {plural(assessment.attemptCount, 'attempt')}
            </span>
          </div>
          <h1 className="mt-2 font-display text-3xl font-bold tracking-tight text-navy">{assessment.title}</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ButtonLink to={`${base}/assessments/${assessment.id}/results`} variant="secondary" leftIcon={<BarChart3 size={16} />}>
            Results
          </ButtonLink>
          {assessment.isPublished ? (
            <Button variant="secondary" loading={publish.isPending} onClick={() => publish.mutate(false)} leftIcon={<Undo2 size={16} />}>
              Unpublish
            </Button>
          ) : (
            <Button loading={publish.isPending} disabled={assessment.questionCount === 0} title={assessment.questionCount === 0 ? 'Add at least one question first' : undefined} onClick={() => publish.mutate(true)} leftIcon={<Rocket size={16} />}>
              Publish
            </Button>
          )}
          <Button
            variant="danger"
            disabled={locked}
            title={locked ? 'Learners have attempted this assessment. Unpublish it instead.' : undefined}
            loading={removeAssessment.isPending}
            onClick={async () => {
              if (await confirm({ title: 'Delete this assessment?', message: 'The assessment and all of its questions are removed. This cannot be undone.', confirmLabel: 'Delete assessment', tone: 'danger' })) removeAssessment.mutate();
            }}
            leftIcon={<Trash2 size={16} />}
          >
            Delete
          </Button>
        </div>
      </div>

      {locked && (
        <InlineAlert tone="info" className="mb-6">
          <span className="flex items-start gap-2">
            <Lock size={16} className="mt-0.5 shrink-0" aria-hidden />
            <span>
              Learners have submitted {plural(assessment.attemptCount, 'attempt')}. To keep their scores trustworthy, the options, question types and marks of existing questions are locked and questions cannot be deleted. You can still fix wording, add questions and change settings.
            </span>
          </span>
        </InlineAlert>
      )}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-5">
        <div className="min-w-0 xl:col-span-3">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="font-display text-lg font-bold text-navy">Questions</h2>
            <Button onClick={() => setDialog({ question: null })} leftIcon={<Plus size={16} />}>
              Add question
            </Button>
          </div>
          {assessment.questions.length === 0 ? (
            <EmptyState title="No questions yet" description="Add multiple-choice questions. Each question has one correct option, or several for multiple-answer questions." action={<Button onClick={() => setDialog({ question: null })}>Add the first question</Button>} />
          ) : (
            <ol className="space-y-4">
              {assessment.questions.map((question, index) => (
                <li key={question.id}>
                  <Card padded={false}>
                    <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-3.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-mist text-xs font-bold text-sky-deep">{index + 1}</span>
                        <Badge tone={question.type === 'SINGLE' ? 'info' : 'purple'}>{question.type === 'SINGLE' ? 'Single answer' : 'Multiple answers'}</Badge>
                        <Badge tone="neutral">{plural(question.marks, 'mark')}</Badge>
                      </div>
                      <div className="flex shrink-0 gap-1" role="group" aria-label={`Actions for question ${index + 1}`}>
                        <button type="button" aria-label="Move question up" disabled={index === 0 || move.isPending} onClick={() => swap(index, -1)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-navy disabled:opacity-30">
                          <ArrowUp size={15} />
                        </button>
                        <button type="button" aria-label="Move question down" disabled={index === assessment.questions.length - 1 || move.isPending} onClick={() => swap(index, 1)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-navy disabled:opacity-30">
                          <ArrowDown size={15} />
                        </button>
                        <button type="button" aria-label="Edit question" onClick={() => setDialog({ question })} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-navy">
                          <Pencil size={15} />
                        </button>
                        <button
                          type="button"
                          aria-label="Delete question"
                          disabled={locked}
                          onClick={async () => {
                            if (await confirm({ title: 'Delete this question?', message: 'The question is removed from the assessment.', confirmLabel: 'Delete', tone: 'danger' })) removeQuestion.mutate(question.id);
                          }}
                          className="rounded-lg p-2 text-slate-500 hover:bg-red-50 hover:text-red-500 disabled:opacity-30"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </div>
                    <div className="px-5 py-4">
                      <p className="font-semibold leading-6 text-navy">{question.text}</p>
                      <ul className="mt-3 space-y-1.5">
                        {question.options.map((option) => (
                          <li key={option.id} className={option.isCorrect ? 'flex items-start gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-800' : 'flex items-start gap-2 rounded-lg px-3 py-2 text-sm text-slate-600'}>
                            {option.isCorrect ? <Check size={16} className="mt-0.5 shrink-0" aria-hidden /> : <span className="mt-1 block h-3.5 w-3.5 shrink-0 rounded-full border border-slate-300" aria-hidden />}
                            <span>
                              {option.text}
                              {option.isCorrect && <span className="sr-only"> (correct answer)</span>}
                            </span>
                          </li>
                        ))}
                      </ul>
                      {question.explanation && <p className="mt-3 rounded-lg bg-mist px-3 py-2 text-xs leading-5 text-slate-600">Explanation: {question.explanation}</p>}
                    </div>
                  </Card>
                </li>
              ))}
            </ol>
          )}
        </div>
        <div className="min-w-0 xl:col-span-2">
          <SettingsCard assessment={assessment} />
        </div>
      </div>

      {dialog && <QuestionDialog assessment={assessment} existing={dialog.question} onClose={() => setDialog(null)} />}
    </div>
  );
}

export default function AssessmentBuilderPage() {
  const { assessmentId = '' } = useParams();
  const query = useQuery({ queryKey: keys.managedAssessment(assessmentId), queryFn: () => fetchManagedAssessment(assessmentId), enabled: Boolean(assessmentId) });
  usePageTitle(query.data ? `${query.data.title} - builder` : 'Assessment');
  return <QueryBoundary query={query}>{(assessment) => <Builder assessment={assessment} />}</QueryBoundary>;
}
