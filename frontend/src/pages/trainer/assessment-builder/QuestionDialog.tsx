import { zodResolver } from '@hookform/resolvers/zod';
import { Plus, Trash2 } from 'lucide-react';
import { useFieldArray, useForm } from 'react-hook-form';
import { z } from 'zod';
import { errorMessage } from '../../../api/client';
import { keys } from '../../../api/keys';
import { Button, InlineAlert, Modal, SelectField, TextAreaField, TextField } from '../../../components/ui';
import { useApiMutation } from '../../../hooks/misc';
import { addQuestions, updateQuestion } from '../../../services/assessments';
import type { ManagedAssessment, ManagedQuestion } from '../../../types';
import { cn } from '../../../utils/cn';

const schema = z
  .object({
    text: z.string().trim().min(5, 'Write the question (at least 5 characters)').max(2000),
    type: z.enum(['SINGLE', 'MULTIPLE']),
    marks: z.string().trim().refine((value) => /^\d+$/.test(value) && Number(value) >= 1 && Number(value) <= 20, 'Marks must be a whole number from 1 to 20'),
    explanation: z.string().trim().max(1000, 'At most 1000 characters'),
    options: z.array(z.object({ text: z.string().trim().min(1, 'Enter the option text').max(500), isCorrect: z.boolean() })).min(2, 'Provide at least two options').max(8, 'At most 8 options'),
  })
  .superRefine((value, ctx) => {
    const correct = value.options.filter((option) => option.isCorrect).length;
    if (correct === 0) ctx.addIssue({ code: 'custom', path: ['options'], message: 'Mark at least one option as correct' });
    else if (value.type === 'SINGLE' && correct !== 1) ctx.addIssue({ code: 'custom', path: ['options'], message: 'Single-answer questions need exactly one correct option' });
    else if (value.type === 'MULTIPLE' && correct < 2) ctx.addIssue({ code: 'custom', path: ['options'], message: 'Multiple-answer questions need at least two correct options' });
    const texts = value.options.map((option) => option.text.trim().toLowerCase());
    if (new Set(texts).size !== texts.length) ctx.addIssue({ code: 'custom', path: ['options'], message: 'Options must be different from each other' });
  });
type FormValues = z.infer<typeof schema>;

/**
 * Create or edit one question. Once learners have attempted the assessment the options, type and marks are
 * locked (changing them would rewrite scored results); the wording and explanation can still be corrected.
 */
export function QuestionDialog({ assessment, existing, onClose }: { assessment: ManagedAssessment; existing: ManagedQuestion | null; onClose: () => void }) {
  const locked = existing !== null && assessment.attemptCount > 0;
  const {
    register,
    control,
    handleSubmit,
    setError,
    watch,
    setValue,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: existing
      ? { text: existing.text, type: existing.type, marks: String(existing.marks), explanation: existing.explanation ?? '', options: existing.options.map((option) => ({ text: option.text, isCorrect: option.isCorrect })) }
      : { text: '', type: 'SINGLE', marks: '1', explanation: '', options: [{ text: '', isCorrect: true }, { text: '', isCorrect: false }, { text: '', isCorrect: false }, { text: '', isCorrect: false }] },
  });
  const options = useFieldArray({ control, name: 'options' });
  const type = watch('type');
  const watched = watch('options');

  const save = useApiMutation({
    mutationFn: (values: FormValues) => {
      const input = { text: values.text, type: values.type, marks: Number(values.marks), options: values.options.map((option) => ({ text: option.text, isCorrect: option.isCorrect })) };
      if (!existing) return addQuestions(assessment.id, [{ ...input, ...(values.explanation ? { explanation: values.explanation } : {}) }]);
      // After attempts only the wording and the explanation may change.
      return updateQuestion(assessment.id, existing.id, locked ? { text: values.text, explanation: values.explanation || null } : { ...input, explanation: values.explanation || null });
    },
    successMessage: existing ? 'Question updated' : 'Question added',
    invalidate: [keys.managedAssessment(assessment.id), keys.managedAssessments(), keys.course(assessment.courseId)],
    onSuccess: onClose,
    onError: (error) => setError('root', { message: errorMessage(error) }),
  });
  const submit = handleSubmit((values) => save.mutate(values));

  const setCorrect = (index: number, checked: boolean) => {
    if (type === 'SINGLE') watched.forEach((_, position) => setValue(`options.${position}.isCorrect`, position === index && checked, { shouldValidate: true }));
    else setValue(`options.${index}.isCorrect`, checked, { shouldValidate: true });
  };

  return (
    <Modal
      open
      onClose={onClose}
      size="xl"
      title={existing ? 'Edit question' : 'Add a question'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={save.isPending} onClick={() => void submit()}>
            {existing ? 'Save question' : 'Add question'}
          </Button>
        </>
      }
    >
      <form onSubmit={submit} noValidate className="space-y-5">
        {locked && <InlineAlert tone="info">Learners have attempted this assessment, so the options, question type and marks are locked. You can still correct the wording and the explanation.</InlineAlert>}
        <TextAreaField label="Question" required rows={3} error={errors.text?.message} {...register('text')} />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <SelectField label="Answer type" disabled={locked} {...register('type')}>
            <option value="SINGLE">Single answer (one correct option)</option>
            <option value="MULTIPLE">Multiple answers (two or more correct)</option>
          </SelectField>
          <TextField label="Marks" inputMode="numeric" disabled={locked} error={errors.marks?.message} {...register('marks')} />
        </div>

        <fieldset disabled={locked}>
          <legend className="mb-2 text-xs font-bold text-slate-600">Options</legend>
          <p className="mb-3 text-xs text-slate-500">{type === 'SINGLE' ? 'Select the one correct option.' : 'Tick every correct option. Learners must select all of them, and nothing else, to earn the marks.'}</p>
          <ul className="space-y-2.5">
            {options.fields.map((field, index) => (
              <li key={field.id} className="flex items-start gap-3">
                <input
                  type={type === 'SINGLE' ? 'radio' : 'checkbox'}
                  name="correct-option"
                  aria-label={`Option ${index + 1} is correct`}
                  checked={Boolean(watched[index]?.isCorrect)}
                  onChange={(event) => setCorrect(index, event.target.checked)}
                  className="mt-3 h-4 w-4 shrink-0 border-slate-300 text-emerald-700 focus:ring-emerald-500"
                />
                <div className="flex-1">
                  <input
                    aria-label={`Option ${index + 1} text`}
                    placeholder={`Option ${index + 1}`}
                    className={cn('w-full rounded-xl border px-3 py-2.5 text-sm text-navy outline-none transition placeholder:text-slate-500 focus:border-sky focus:ring-4 focus:ring-sky/10 disabled:bg-slate-50 disabled:text-slate-400', watched[index]?.isCorrect ? 'border-emerald-300 bg-emerald-50/40' : 'border-slate-200')}
                    {...register(`options.${index}.text` as const)}
                  />
                  {errors.options?.[index]?.text?.message && (
                    <p role="alert" className="mt-1 text-xs font-semibold text-red-600">
                      {errors.options[index]?.text?.message}
                    </p>
                  )}
                </div>
                <button type="button" aria-label={`Remove option ${index + 1}`} disabled={options.fields.length <= 2} onClick={() => options.remove(index)} className="rounded-lg p-2.5 text-slate-500 hover:bg-red-50 hover:text-red-500 disabled:opacity-30">
                  <Trash2 size={15} />
                </button>
              </li>
            ))}
          </ul>
          {(errors.options?.message || errors.options?.root?.message) && (
            <p role="alert" className="mt-2 text-xs font-semibold text-red-600">
              {errors.options?.message ?? errors.options?.root?.message}
            </p>
          )}
          <Button type="button" size="sm" variant="secondary" className="mt-3" disabled={options.fields.length >= 8} onClick={() => options.append({ text: '', isCorrect: false })} leftIcon={<Plus size={14} />}>
            Add an option
          </Button>
        </fieldset>

        <TextAreaField label="Explanation (optional)" rows={2} hint="Shown to learners after they submit, so they learn from the answer." error={errors.explanation?.message} {...register('explanation')} />
        {errors.root?.message && <InlineAlert tone="danger">{errors.root.message}</InlineAlert>}
        <button type="submit" className="hidden" aria-hidden tabIndex={-1} />
      </form>
    </Modal>
  );
}
