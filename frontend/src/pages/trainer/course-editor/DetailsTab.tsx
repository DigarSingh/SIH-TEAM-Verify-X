import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import { ImagePlus, Plus, Trash2 } from 'lucide-react';
import { useRef } from 'react';
import { useFieldArray, useForm } from 'react-hook-form';
import { z } from 'zod';
import { assetUrl, errorMessage } from '../../../api/client';
import { keys } from '../../../api/keys';
import { CourseCover } from '../../../components/domain/CourseCard';
import { Button, Card, CheckboxField, InlineAlert, SelectField, TextAreaField, TextField, useToast } from '../../../components/ui';
import { useApiMutation } from '../../../hooks/misc';
import { fetchCourses } from '../../../services/learner';
import { removeCourseThumbnail, updateCourse, uploadCourseThumbnail } from '../../../services/trainer';
import type { CourseDetail } from '../../../types';
import { applyServerErrors } from '../../../utils/forms';

const schema = z.object({
  title: z.string().trim().min(3, 'Enter a course title (at least 3 characters)').max(150),
  category: z.string().trim().min(2, 'Enter a category').max(60),
  difficulty: z.enum(['BEGINNER', 'INTERMEDIATE', 'ADVANCED']),
  description: z.string().trim().min(10, 'Describe the course in at least 10 characters').max(5000),
  durationMinutes: z.string().trim().refine((value) => /^\d+$/.test(value) && Number(value) <= 60000, 'Enter the duration in whole minutes'),
  passingScore: z.string().trim().refine((value) => /^\d+$/.test(value) && Number(value) >= 1 && Number(value) <= 100, 'Enter a pass mark from 1 to 100'),
  certificateEnabled: z.boolean(),
  outcomes: z.array(z.object({ value: z.string().trim().min(3, 'At least 3 characters').max(200, 'At most 200 characters') })).max(12, 'At most 12 outcomes'),
});
type FormValues = z.infer<typeof schema>;

const THUMBNAIL_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];

function Thumbnail({ course }: { course: CourseDetail }) {
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const refresh = [keys.course(course.id), keys.coursesAll];
  const upload = useApiMutation({ mutationFn: (file: File) => uploadCourseThumbnail(course.id, file), successMessage: 'Cover image updated', invalidate: refresh });
  const remove = useApiMutation({ mutationFn: () => removeCourseThumbnail(course.id), successMessage: 'Cover image removed', invalidate: refresh });

  const choose = (file: File | undefined) => {
    if (!file) return;
    if (!THUMBNAIL_TYPES.includes(file.type)) return toast.error('Choose a PNG, JPEG, GIF or WebP image.');
    if (file.size > 5 * 1024 * 1024) return toast.error('The cover image can be at most 5 MB.');
    upload.mutate(file);
  };

  return (
    <Card title="Cover image" description="Shown on the course card. PNG, JPEG, GIF or WebP up to 5 MB.">
      <div className="h-40 overflow-hidden rounded-xl">
        <CourseCover course={course} />
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <input ref={input} type="file" accept={THUMBNAIL_TYPES.join(',')} className="sr-only" aria-label="Choose a cover image" onChange={(event) => { choose(event.target.files?.[0]); event.target.value = ''; }} />
        <Button size="sm" variant="secondary" loading={upload.isPending} onClick={() => input.current?.click()} leftIcon={<ImagePlus size={14} />}>
          {assetUrl(course.thumbnailUrl) ? 'Replace image' : 'Upload image'}
        </Button>
        {assetUrl(course.thumbnailUrl) && (
          <Button size="sm" variant="ghost" loading={remove.isPending} onClick={() => remove.mutate()} leftIcon={<Trash2 size={14} />}>
            Remove
          </Button>
        )}
      </div>
    </Card>
  );
}

export function DetailsTab({ course }: { course: CourseDetail }) {
  const catalog = useQuery({ queryKey: keys.courses({ pageSize: 1 }), queryFn: () => fetchCourses({ pageSize: 1 }), staleTime: 60_000 });
  const categories = catalog.data?.meta.categories ?? [course.category];
  const {
    register,
    control,
    handleSubmit,
    setError,
    reset,
    formState: { errors, isDirty },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      title: course.title,
      category: course.category,
      difficulty: course.difficulty,
      description: course.description,
      durationMinutes: String(course.durationMinutes),
      passingScore: String(course.passingScore),
      certificateEnabled: course.certificateEnabled,
      outcomes: course.outcomes.map((value) => ({ value })),
    },
  });
  const outcomes = useFieldArray({ control, name: 'outcomes' });

  const save = useApiMutation({
    mutationFn: (values: FormValues) =>
      updateCourse(course.id, {
        title: values.title,
        category: values.category,
        difficulty: values.difficulty,
        description: values.description,
        durationMinutes: Number(values.durationMinutes),
        passingScore: Number(values.passingScore),
        certificateEnabled: values.certificateEnabled,
        outcomes: values.outcomes.map((item) => item.value),
      }),
    successMessage: 'Course details saved',
    invalidate: [keys.course(course.id), keys.coursesAll],
    onSuccess: (saved) =>
      reset({
        title: saved.title,
        category: saved.category,
        difficulty: saved.difficulty,
        description: saved.description,
        durationMinutes: String(saved.durationMinutes),
        passingScore: String(saved.passingScore),
        certificateEnabled: saved.certificateEnabled,
        outcomes: saved.outcomes.map((value) => ({ value })),
      }),
    onError: (error) => {
      if (!applyServerErrors(error, setError, ['title', 'category', 'difficulty', 'description', 'durationMinutes', 'passingScore', 'outcomes'])) setError('root', { message: errorMessage(error) });
    },
  });

  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
      <Card className="xl:col-span-2" title="Course details">
        <form onSubmit={handleSubmit((values) => save.mutate(values))} noValidate className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <TextField label="Title" required wrapperClassName="sm:col-span-2" error={errors.title?.message} {...register('title')} />
          <div>
            <TextField label="Category" required list="editor-categories" error={errors.category?.message} {...register('category')} />
            <datalist id="editor-categories">
              {categories.map((category) => (
                <option key={category} value={category} />
              ))}
            </datalist>
          </div>
          <SelectField label="Level" {...register('difficulty')}>
            <option value="BEGINNER">Beginner</option>
            <option value="INTERMEDIATE">Intermediate</option>
            <option value="ADVANCED">Advanced</option>
          </SelectField>
          <TextAreaField label="Description" required rows={5} wrapperClassName="sm:col-span-2" error={errors.description?.message} {...register('description')} />
          <TextField label="Duration (minutes)" inputMode="numeric" error={errors.durationMinutes?.message} {...register('durationMinutes')} />
          <TextField label="Assessment pass mark (%)" inputMode="numeric" required error={errors.passingScore?.message} {...register('passingScore')} />
          <CheckboxField label="Issue a certificate when the assessment is passed" className="sm:col-span-2" {...register('certificateEnabled')} />

          <fieldset className="sm:col-span-2">
            <legend className="mb-1.5 text-xs font-bold text-slate-600">Learning outcomes</legend>
            <p className="mb-3 text-xs text-slate-500">What a learner will be able to do after the course (up to 12).</p>
            <ul className="space-y-2">
              {outcomes.fields.map((field, index) => (
                <li key={field.id} className="flex items-start gap-2">
                  <div className="flex-1">
                    <input
                      aria-label={`Learning outcome ${index + 1}`}
                      className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-navy outline-none transition placeholder:text-slate-500 focus:border-sky focus:ring-4 focus:ring-sky/10"
                      placeholder="For example: Interpret a PPI scan"
                      {...register(`outcomes.${index}.value` as const)}
                    />
                    {errors.outcomes?.[index]?.value?.message && (
                      <p role="alert" className="mt-1 text-xs font-semibold text-red-600">
                        {errors.outcomes[index]?.value?.message}
                      </p>
                    )}
                  </div>
                  <button type="button" aria-label={`Remove outcome ${index + 1}`} onClick={() => outcomes.remove(index)} className="rounded-lg p-2.5 text-slate-500 hover:bg-red-50 hover:text-red-500">
                    <Trash2 size={15} />
                  </button>
                </li>
              ))}
            </ul>
            <Button type="button" size="sm" variant="secondary" className="mt-3" disabled={outcomes.fields.length >= 12} onClick={() => outcomes.append({ value: '' })} leftIcon={<Plus size={14} />}>
              Add an outcome
            </Button>
          </fieldset>

          {errors.root?.message && (
            <InlineAlert tone="danger" className="sm:col-span-2">
              {errors.root.message}
            </InlineAlert>
          )}
          <div className="sm:col-span-2">
            <Button type="submit" loading={save.isPending} disabled={!isDirty}>
              Save changes
            </Button>
          </div>
        </form>
      </Card>
      <Thumbnail course={course} />
    </div>
  );
}
