import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Check, Sparkles } from 'lucide-react';
import { useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { errorMessage } from '../../api/client';
import { keys } from '../../api/keys';
import { AiBadge, AiDisclosure, AiProvider } from '../../components/domain/AiParts';
import { Badge, Button, ButtonLink, Card, CheckboxField, EmptyState, InlineAlert, PageHeader, SelectField, Spinner, TextAreaField, TextField } from '../../components/ui';
import { useAiEnabled, useApiMutation, usePageTitle } from '../../hooks/misc';
import { useCurrentUser } from '../../hooks/useAuth';
import { draftQuiz } from '../../services/ai';
import { addQuestions, fetchManagedAssessments } from '../../services/assessments';
import { fetchMyCourses } from '../../services/trainer';
import type { AiCoverage, QuizDraftQuestion } from '../../types';
import { plural } from '../../utils/format';

const schema = z.object({
  courseId: z.string().min(1, 'Choose a course'),
  questionCount: z.string().trim().refine((value) => /^\d+$/.test(value) && Number(value) >= 1 && Number(value) <= 20, 'Enter a whole number from 1 to 20'),
  difficulty: z.enum(['EASY', 'MEDIUM', 'HARD']),
  includeMultipleAnswer: z.boolean(),
  focus: z.string().trim().max(200, 'At most 200 characters'),
});
type FormValues = z.infer<typeof schema>;

interface Draft {
  key: number;
  included: boolean;
  question: QuizDraftQuestion;
}
interface DraftInfo {
  courseId: string;
  courseTitle: string;
  rejected: number;
  coverage: AiCoverage;
}

function DraftCard({ draft, index, onToggle }: { draft: Draft; index: number; onToggle: () => void }) {
  const { question } = draft;
  return (
    <li className={`rounded-2xl border p-4 transition ${draft.included ? 'border-sky/40 bg-white' : 'border-slate-100 bg-slate-50/60 opacity-70'}`}>
      <div className="flex items-start gap-3">
        <input type="checkbox" checked={draft.included} onChange={onToggle} aria-label={`Include question ${index + 1}`} className="mt-1 h-4 w-4 shrink-0 rounded border-slate-300 text-sky-deep focus:ring-sky" />
        <div className="min-w-0 flex-1 space-y-3">
          <div>
            <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Question {index + 1}</span>
              <Badge tone="info">{question.type === 'SINGLE' ? 'Single answer' : 'Multiple answers'}</Badge>
              <Badge tone="neutral">{plural(question.marks, 'mark')}</Badge>
            </div>
            <p className="text-sm font-semibold leading-6 text-navy">{question.text}</p>
          </div>
          <ul className="space-y-1.5">
            {question.options.map((option, position) => (
              <li key={`${position}-${option.text}`} className={`flex items-start gap-2 rounded-lg px-3 py-2 text-sm ${option.isCorrect ? 'bg-emerald-50 text-emerald-900' : 'bg-slate-50 text-slate-600'}`}>
                <span className="mt-0.5 shrink-0" aria-hidden>
                  {option.isCorrect ? <Check size={14} className="text-emerald-700" /> : <span className="inline-block w-3.5" />}
                </span>
                <span>
                  {option.text}
                  {option.isCorrect && <span className="sr-only"> (correct answer)</span>}
                </span>
              </li>
            ))}
          </ul>
          {question.explanation && (
            <p className="text-xs leading-5 text-slate-500">
              <span className="font-bold text-slate-600">Explanation: </span>
              {question.explanation}
            </p>
          )}
        </div>
      </div>
    </li>
  );
}

export default function QuizGeneratorPage() {
  usePageTitle('AI quiz generator');
  const user = useCurrentUser();
  const aiEnabled = useAiEnabled();
  const base = user.role === 'ADMIN' ? '/admin' : '/trainer';

  const courses = useQuery({ queryKey: keys.courses({ mine: true, quizGenerator: true }), queryFn: () => fetchMyCourses({ pageSize: 100 }) });
  const [info, setInfo] = useState<DraftInfo | null>(null);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [targetId, setTargetId] = useState('');
  const [added, setAdded] = useState<{ assessmentId: string; title: string; count: number } | null>(null);
  const nextKey = useRef(1);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: { courseId: '', questionCount: '5', difficulty: 'MEDIUM', includeMultipleAnswer: true, focus: '' } });

  const generate = useMutation({
    mutationFn: (values: FormValues) => draftQuiz(values.courseId, { questionCount: Number(values.questionCount), difficulty: values.difficulty, includeMultipleAnswer: values.includeMultipleAnswer, ...(values.focus ? { focus: values.focus } : {}) }),
    onSuccess: (result, values) => {
      setInfo({ courseId: values.courseId, courseTitle: courses.data?.items.find((course) => course.id === values.courseId)?.title ?? 'this course', rejected: result.rejected, coverage: result.coverage });
      setDrafts(result.questions.map((question) => ({ key: nextKey.current++, included: true, question })));
      setAdded(null);
    },
  });

  const assessments = useQuery({ queryKey: keys.managedAssessments(info?.courseId), queryFn: () => fetchManagedAssessments(info?.courseId), enabled: Boolean(info) });
  const targets = assessments.data ?? [];
  const target = targets.find((assessment) => assessment.id === targetId) ?? targets[0];
  const chosen = drafts.filter((draft) => draft.included);

  const add = useApiMutation({
    mutationFn: () => addQuestions((target as NonNullable<typeof target>).id, chosen.map((draft) => draft.question)),
    successMessage: () => `${plural(chosen.length, 'question')} added to the assessment`,
    invalidate: [keys.managedAssessments(), keys.managedAssessment(target?.id ?? ''), keys.coursesAll],
    onSuccess: () => {
      if (target) setAdded({ assessmentId: target.id, title: target.title, count: chosen.length });
      setDrafts((current) => current.filter((draft) => !draft.included));
    },
  });

  if (!aiEnabled) {
    return (
      <div className="animate-fade-in">
        <PageHeader eyebrow="Trainer workspace" title="AI quiz generator" description="Draft assessment questions from your course materials, then review them before they reach learners." />
        <EmptyState
          title="The AI features are not switched on"
          description="This server has no AI service configured. Ask your administrator to enable it. You can still write questions yourself in the assessment builder."
          icon={<Sparkles size={18} />}
          action={
            <ButtonLink to={`${base}/assessments`} variant="secondary">
              Open assessments
            </ButtonLink>
          }
        />
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      <PageHeader
        eyebrow="Trainer workspace"
        title="AI quiz generator"
        description="Draft multiple-choice questions from a course's own materials. Nothing is saved until you choose questions and add them to an assessment, and every question should be read before learners see it."
      />

      <Card title="1. Choose what to generate">
        <form onSubmit={handleSubmit((values) => generate.mutate(values))} noValidate className="space-y-5">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            <SelectField label="Course" required wrapperClassName="xl:col-span-2" error={errors.courseId?.message} {...register('courseId')}>
              <option value="">{courses.isLoading ? 'Loading courses…' : 'Select a course'}</option>
              {(courses.data?.items ?? []).map((course) => (
                <option key={course.id} value={course.id}>
                  {course.title}
                </option>
              ))}
            </SelectField>
            <TextField label="Number of questions" inputMode="numeric" error={errors.questionCount?.message} hint="1 to 20" {...register('questionCount')} />
            <SelectField label="Difficulty" {...register('difficulty')}>
              <option value="EASY">Easy (1 mark each)</option>
              <option value="MEDIUM">Medium (1 mark each)</option>
              <option value="HARD">Hard (2 marks each)</option>
            </SelectField>
          </div>
          <TextAreaField label="Focus (optional)" rows={2} maxLength={200} placeholder="e.g. range ambiguity and the Doppler dilemma" error={errors.focus?.message} hint="Leave empty to spread the questions across the whole course." {...register('focus')} />
          <CheckboxField label="Include questions with more than one correct answer" description="Learners must select every correct option, and nothing else, to earn the marks." {...register('includeMultipleAnswer')} />

          {generate.isError && <InlineAlert tone="danger">{errorMessage(generate.error)}</InlineAlert>}
          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" loading={generate.isPending} leftIcon={<Sparkles size={15} />}>
              {drafts.length > 0 ? 'Generate again' : 'Generate questions'}
            </Button>
            {generate.isPending && <Spinner label="Writing questions from the course materials. This can take up to a minute" />}
          </div>
          <AiDisclosure>The text of the selected course&apos;s materials and the wording of its existing questions are sent to <AiProvider /> to write the drafts. Nothing about learners is sent.</AiDisclosure>
        </form>
      </Card>

      {courses.isSuccess && courses.data.items.length === 0 && (
        <InlineAlert tone="info" className="mt-6">
          You have no courses yet. Create a course and add some text readings, then come back.
        </InlineAlert>
      )}

      {info && (
        <Card
          className="mt-6"
          title="2. Review the drafts"
          action={<AiBadge />}
          description={`${plural(drafts.length, 'question')} left for “${info.courseTitle}” · ${info.rejected > 0 ? `${plural(info.rejected, 'suggestion')} dropped as duplicates or invalid` : 'none dropped'}`}
        >
          <div className="space-y-5">
            <InlineAlert tone="warning">AI-written questions can be wrong or ambiguous. Read each one, uncheck what you do not want, and correct wording in the assessment builder after adding.</InlineAlert>
            {info.coverage.truncated && (
              <InlineAlert tone="info">
                Only {info.coverage.includedMaterials} of {info.coverage.readableMaterials} readable materials fit in what the AI could read, so the questions may not cover the whole course.
              </InlineAlert>
            )}
            {added && (
              <InlineAlert tone="success">
                <span className="flex flex-wrap items-center justify-between gap-3">
                  <span>
                    {plural(added.count, 'question')} added to “{added.title}”.
                  </span>
                  <ButtonLink to={`${base}/assessments/${added.assessmentId}`} variant="secondary" size="sm">
                    Open the assessment builder
                  </ButtonLink>
                </span>
              </InlineAlert>
            )}

            {drafts.length === 0 ? (
              <EmptyState title="No drafts to review" description={info.rejected > 0 ? 'Every suggestion was a duplicate or broke the question rules. Try generating again, or write your own.' : 'All the drafts have been added.'} icon={<Sparkles size={18} />} />
            ) : (
              <>
                <ul className="space-y-3">
                  {drafts.map((draft, index) => (
                    <DraftCard key={draft.key} draft={draft} index={index} onToggle={() => setDrafts((current) => current.map((item) => (item.key === draft.key ? { ...item, included: !item.included } : item)))} />
                  ))}
                </ul>

                <div className="rounded-2xl border border-slate-100 bg-slate-50/60 p-4">
                  {assessments.isLoading ? (
                    <Spinner label="Loading assessments" />
                  ) : targets.length === 0 ? (
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <p className="text-sm text-slate-600">“{info.courseTitle}” has no assessment yet. Create one, then come back and generate again to add these questions.</p>
                      <ButtonLink to={`${base}/assessments`} variant="secondary" size="sm">
                        Go to assessments
                      </ButtonLink>
                    </div>
                  ) : (
                    <div className="flex flex-wrap items-end gap-4">
                      <SelectField label="Add to assessment" wrapperClassName="min-w-[16rem] flex-1" value={target?.id ?? ''} onChange={(event) => setTargetId(event.target.value)}>
                        {targets.map((assessment) => (
                          <option key={assessment.id} value={assessment.id}>
                            {assessment.title} · {plural(assessment.questionCount, 'question')}
                            {assessment.isPublished ? ' · published' : ' · draft'}
                          </option>
                        ))}
                      </SelectField>
                      <Button loading={add.isPending} disabled={chosen.length === 0 || !target} onClick={() => add.mutate()} leftIcon={<Check size={15} />}>
                        Add {plural(chosen.length, 'selected question')}
                      </Button>
                      {target?.isPublished && <p className="w-full text-xs text-amber-700">This assessment is already published, so the new questions become available to learners straight away.</p>}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </Card>
      )}
    </div>
  );
}
