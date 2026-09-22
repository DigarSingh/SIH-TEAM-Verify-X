import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router-dom';
import { z } from 'zod';
import { errorMessage } from '../../api/client';
import { keys } from '../../api/keys';
import { useApiMutation } from '../../hooks/misc';
import { useCurrentUser } from '../../hooks/useAuth';
import { fetchUsers } from '../../services/admin';
import { createCourse } from '../../services/trainer';
import { paths } from '../../utils/links';
import { applyServerErrors } from '../../utils/forms';
import { Button, CheckboxField, InlineAlert, Modal, SelectField, TextAreaField, TextField } from '../ui';

const schema = z.object({
  title: z.string().trim().min(3, 'Enter a course title (at least 3 characters)').max(150),
  category: z.string().trim().min(2, 'Enter a category').max(60),
  difficulty: z.enum(['BEGINNER', 'INTERMEDIATE', 'ADVANCED']),
  description: z.string().trim().min(10, 'Describe the course in at least 10 characters').max(5000),
  durationMinutes: z.string().trim().refine((value) => value === '' || (/^\d+$/.test(value) && Number(value) <= 60000), 'Enter the duration in whole minutes'),
  passingScore: z.string().trim().refine((value) => /^\d+$/.test(value) && Number(value) >= 1 && Number(value) <= 100, 'Enter a pass mark from 1 to 100'),
  certificateEnabled: z.boolean(),
  trainerId: z.string(),
});
type FormValues = z.infer<typeof schema>;

/** Creates a draft course, then opens it in the editor. Administrators can create it on behalf of a trainer. */
export function CourseFormDialog({ categories, onClose }: { categories: string[]; onClose: () => void }) {
  const user = useCurrentUser();
  const navigate = useNavigate();
  const isAdmin = user.role === 'ADMIN';
  const trainers = useQuery({ queryKey: keys.users({ role: 'TRAINER', status: 'ACTIVE', pageSize: 100 }), queryFn: () => fetchUsers({ role: 'TRAINER', status: 'ACTIVE', pageSize: 100, sort: 'name', order: 'asc' }), enabled: isAdmin });

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { title: '', category: '', difficulty: 'BEGINNER', description: '', durationMinutes: '', passingScore: '70', certificateEnabled: true, trainerId: '' },
  });

  const create = useApiMutation({
    mutationFn: (values: FormValues) =>
      createCourse({
        title: values.title,
        category: values.category,
        difficulty: values.difficulty,
        description: values.description,
        ...(values.durationMinutes ? { durationMinutes: Number(values.durationMinutes) } : {}),
        passingScore: Number(values.passingScore),
        certificateEnabled: values.certificateEnabled,
        ...(isAdmin && values.trainerId ? { trainerId: values.trainerId } : {}),
      }),
    successMessage: 'Draft course created. Add modules, competencies and an assessment next.',
    invalidate: [keys.coursesAll],
    onSuccess: (course) => {
      onClose();
      navigate(paths.course(user.role, course.id));
    },
    onError: (error) => {
      if (!applyServerErrors(error, setError, ['title', 'category', 'difficulty', 'description', 'durationMinutes', 'passingScore', 'trainerId'])) setError('root', { message: errorMessage(error) });
    },
  });

  const submit = handleSubmit((values) => create.mutate(values));

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title="New course"
      description="The course starts as a draft: learners cannot see it until you publish it."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={create.isPending} onClick={() => void submit()}>
            Create draft
          </Button>
        </>
      }
    >
      <form onSubmit={submit} noValidate className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <TextField label="Title" required wrapperClassName="sm:col-span-2" error={errors.title?.message} {...register('title')} />
        <div>
          <TextField label="Category" required list="course-categories" error={errors.category?.message} {...register('category')} />
          <datalist id="course-categories">
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
        <TextAreaField label="Description" required rows={4} wrapperClassName="sm:col-span-2" error={errors.description?.message} {...register('description')} />
        <TextField label="Duration (minutes)" inputMode="numeric" hint="Leave empty to add up the module durations." error={errors.durationMinutes?.message} {...register('durationMinutes')} />
        <TextField label="Assessment pass mark (%)" inputMode="numeric" required error={errors.passingScore?.message} {...register('passingScore')} />
        {isAdmin && (
          <SelectField label="Trainer" wrapperClassName="sm:col-span-2" hint="Leave empty to own the course yourself." {...register('trainerId')}>
            <option value="">Me ({user.name})</option>
            {(trainers.data?.items ?? []).map((trainer) => (
              <option key={trainer.id} value={trainer.id}>
                {trainer.name}
              </option>
            ))}
          </SelectField>
        )}
        <CheckboxField label="Issue a certificate when the assessment is passed" className="sm:col-span-2" {...register('certificateEnabled')} />
        {errors.root?.message && (
          <InlineAlert tone="danger" className="sm:col-span-2">
            {errors.root.message}
          </InlineAlert>
        )}
        <button type="submit" className="hidden" aria-hidden tabIndex={-1} />
      </form>
    </Modal>
  );
}
