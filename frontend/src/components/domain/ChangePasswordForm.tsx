import { zodResolver } from '@hookform/resolvers/zod';
import { useForm, useWatch } from 'react-hook-form';
import { z } from 'zod';
import { api, errorMessage } from '../../api/client';
import { Button, PasswordField, useToast } from '../ui';
import { applyServerErrors, passwordIsValid } from '../../utils/forms';
import { PasswordChecklist } from './PasswordChecklist';
import { useState } from 'react';
import { InlineAlert } from '../ui';

const schema = z
  .object({
    currentPassword: z.string().min(1, 'Enter your current password'),
    newPassword: z.string().refine(passwordIsValid, 'Password does not meet the requirements below'),
    confirmPassword: z.string().min(1, 'Confirm the new password'),
  })
  .refine((value) => value.newPassword === value.confirmPassword, { path: ['confirmPassword'], message: 'Passwords do not match' })
  .refine((value) => value.currentPassword !== value.newPassword, { path: ['newPassword'], message: 'The new password must be different from the current one' });
type FormValues = z.infer<typeof schema>;

export function ChangePasswordForm({ onChanged }: { onChanged?: () => void }) {
  const toast = useToast();
  const [problem, setProblem] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    control,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: { currentPassword: '', newPassword: '', confirmPassword: '' } });
  const next = useWatch({ control, name: 'newPassword' }) ?? '';

  const onSubmit = handleSubmit(async ({ currentPassword, newPassword }) => {
    setProblem(null);
    try {
      await api.post('/auth/change-password', { currentPassword, newPassword });
      toast.success('Password changed. Other devices have been signed out.');
      reset();
      onChanged?.();
    } catch (error) {
      if (!applyServerErrors(error, setError, ['currentPassword', 'newPassword'])) setProblem(errorMessage(error));
    }
  });

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      <PasswordField label="Current password" autoComplete="current-password" required error={errors.currentPassword?.message} {...register('currentPassword')} />
      <div>
        <PasswordField label="New password" autoComplete="new-password" required error={errors.newPassword?.message} {...register('newPassword')} />
        <PasswordChecklist value={next} />
      </div>
      <PasswordField label="Confirm new password" autoComplete="new-password" required error={errors.confirmPassword?.message} {...register('confirmPassword')} />
      {problem && <InlineAlert tone="danger">{problem}</InlineAlert>}
      <Button type="submit" loading={isSubmitting}>
        Change password
      </Button>
    </form>
  );
}
