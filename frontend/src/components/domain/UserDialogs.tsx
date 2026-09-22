import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import { Copy, KeyRound } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { errorMessage } from '../../api/client';
import { keys } from '../../api/keys';
import { useApiMutation } from '../../hooks/misc';
import { approveUser, createUser, fetchDepartments, fetchRoles, rejectUser } from '../../services/admin';
import type { Role, User } from '../../types';
import { applyServerErrors } from '../../utils/forms';
import { Button, InlineAlert, Modal, SelectField, TextAreaField, TextField, useToast } from '../ui';

/** Approving, rejecting or creating an account changes the user lists and the dashboard's pending count. */
const USER_KEYS = [keys.usersAll, keys.adminAnalyticsAll];

/** Shows a one-time temporary password. It is never stored or retrievable again. */
export function TemporaryPasswordDialog({ name, email, password, onClose }: { name: string; email: string; password: string; onClose: () => void }) {
  const toast = useToast();
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(password);
      toast.success('Temporary password copied');
    } catch {
      toast.info('Copy the password manually from the box.');
    }
  };
  return (
    <Modal
      open
      onClose={onClose}
      dismissible={false}
      size="sm"
      title="Temporary password"
      description={`For ${name} (${email})`}
      footer={<Button onClick={onClose}>I have noted it</Button>}
    >
      <div className="space-y-4">
        <div className="flex items-center gap-3 rounded-xl bg-slate-50 px-4 py-3">
          <KeyRound size={18} className="shrink-0 text-sky-deep" aria-hidden />
          <code className="flex-1 select-all break-all font-mono text-base font-bold text-navy">{password}</code>
          <Button size="sm" variant="secondary" onClick={() => void copy()} leftIcon={<Copy size={14} />}>
            Copy
          </Button>
        </div>
        <InlineAlert tone="warning">This password is shown only once and is not stored anywhere you can read it again. Share it with the user securely. They will be asked to choose a new password when they first sign in.</InlineAlert>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------------------------
// Create a user
// ---------------------------------------------------------------------------------------------

const createSchema = z.object({
  name: z.string().trim().min(2, 'Enter the full name').max(100),
  email: z.string().trim().min(1, 'Enter the email address').email('Enter a valid email address'),
  role: z.enum(['TRAINEE', 'TRAINER', 'ADMIN']),
  employeeId: z.string().trim().max(30),
  designation: z.string().trim().max(100),
  location: z.string().trim().max(100),
  departmentId: z.string(),
  jobRoleId: z.string(),
});
type CreateValues = z.infer<typeof createSchema>;
const blank = (value: string) => (value.trim() ? value.trim() : undefined);

export function CreateUserDialog({ onClose, onCreated }: { onClose: () => void; onCreated: (result: { user: User; temporaryPassword?: string }) => void }) {
  const departments = useQuery({ queryKey: keys.departments(), queryFn: () => fetchDepartments(), staleTime: 5 * 60_000 });
  const roles = useQuery({ queryKey: keys.roles(), queryFn: () => fetchRoles(), staleTime: 5 * 60_000 });
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<CreateValues>({ resolver: zodResolver(createSchema), defaultValues: { name: '', email: '', role: 'TRAINEE', employeeId: '', designation: '', location: '', departmentId: '', jobRoleId: '' } });

  const create = useApiMutation({
    mutationFn: (values: CreateValues) =>
      createUser({
        name: values.name,
        email: values.email,
        role: values.role as Role,
        ...(blank(values.employeeId) ? { employeeId: blank(values.employeeId) as string } : {}),
        ...(blank(values.designation) ? { designation: blank(values.designation) as string } : {}),
        ...(blank(values.location) ? { location: blank(values.location) as string } : {}),
        ...(values.departmentId ? { departmentId: values.departmentId } : {}),
        ...(values.jobRoleId ? { jobRoleId: values.jobRoleId } : {}),
      }),
    successMessage: 'Account created',
    invalidate: USER_KEYS,
    onSuccess: (result) => {
      onClose();
      onCreated(result);
    },
    onError: (error) => {
      if (!applyServerErrors(error, setError, ['name', 'email', 'role', 'employeeId', 'designation', 'location', 'departmentId', 'jobRoleId'])) setError('root', { message: errorMessage(error) });
    },
  });
  const submit = handleSubmit((values) => create.mutate(values));

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title="Add a user"
      description="The account is active immediately. A one-time temporary password is generated for you to share."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={create.isPending} onClick={() => void submit()}>
            Create account
          </Button>
        </>
      }
    >
      <form onSubmit={submit} noValidate className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <TextField label="Full name" required error={errors.name?.message} {...register('name')} />
        <TextField label="Email" type="email" required error={errors.email?.message} {...register('email')} />
        <SelectField label="Access role" {...register('role')}>
          <option value="TRAINEE">Trainee</option>
          <option value="TRAINER">Trainer</option>
          <option value="ADMIN">Administrator</option>
        </SelectField>
        <TextField label="Employee ID" error={errors.employeeId?.message} {...register('employeeId')} />
        <SelectField label="Department" {...register('departmentId')}>
          <option value="">Not assigned</option>
          {(departments.data ?? []).map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </SelectField>
        <SelectField label="Job role" hint="Determines the competencies the employee must reach." {...register('jobRoleId')}>
          <option value="">Not assigned</option>
          {(roles.data ?? []).map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </SelectField>
        <TextField label="Designation" error={errors.designation?.message} {...register('designation')} />
        <TextField label="Location" error={errors.location?.message} {...register('location')} />
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

// ---------------------------------------------------------------------------------------------
// Approve / reject a registration
// ---------------------------------------------------------------------------------------------

export function ApproveDialog({ user, onClose }: { user: User; onClose: () => void }) {
  const departments = useQuery({ queryKey: keys.departments(), queryFn: () => fetchDepartments(), staleTime: 5 * 60_000 });
  const roles = useQuery({ queryKey: keys.roles(), queryFn: () => fetchRoles(), staleTime: 5 * 60_000 });
  const { register, handleSubmit } = useForm<{ departmentId: string; jobRoleId: string }>({ defaultValues: { departmentId: user.department?.id ?? '', jobRoleId: user.jobRole?.id ?? '' } });
  const approve = useApiMutation({
    mutationFn: (values: { departmentId: string; jobRoleId: string }) => approveUser(user.id, { ...(values.departmentId ? { departmentId: values.departmentId } : {}), ...(values.jobRoleId ? { jobRoleId: values.jobRoleId } : {}) }),
    successMessage: `${user.name} was approved and notified`,
    invalidate: USER_KEYS,
    onSuccess: onClose,
  });
  const submit = handleSubmit((values) => approve.mutate(values));
  return (
    <Modal
      open
      onClose={onClose}
      title={`Approve ${user.name}?`}
      description={user.email}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="success" loading={approve.isPending} onClick={() => void submit()}>
            Approve account
          </Button>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4">
        <p className="text-sm text-slate-600">Confirm where this employee belongs. Their job role decides which competencies and skill gaps apply to them.</p>
        <SelectField label="Department" {...register('departmentId')}>
          <option value="">Not assigned</option>
          {(departments.data ?? []).map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </SelectField>
        <SelectField label="Job role" {...register('jobRoleId')}>
          <option value="">Not assigned</option>
          {(roles.data ?? []).map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </SelectField>
        <button type="submit" className="hidden" aria-hidden tabIndex={-1} />
      </form>
    </Modal>
  );
}

const rejectSchema = z.object({ reason: z.string().trim().min(3, 'Give a short reason (at least 3 characters)').max(300, 'At most 300 characters') });

export function RejectDialog({ user, onClose }: { user: User; onClose: () => void }) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<{ reason: string }>({ resolver: zodResolver(rejectSchema), defaultValues: { reason: '' } });
  const reject = useApiMutation({ mutationFn: (values: { reason: string }) => rejectUser(user.id, values.reason), successMessage: `${user.name}'s request was rejected`, invalidate: USER_KEYS, onSuccess: onClose });
  const submit = handleSubmit((values) => reject.mutate(values));
  return (
    <Modal
      open
      onClose={onClose}
      title={`Reject ${user.name}?`}
      description={user.email}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button className="!bg-red-600 !text-white hover:!bg-red-700" loading={reject.isPending} onClick={() => void submit()}>
            Reject request
          </Button>
        </>
      }
    >
      <form onSubmit={submit} noValidate className="space-y-4">
        <TextAreaField label="Reason" required rows={3} hint="The person is told this reason." error={errors.reason?.message} {...register('reason')} />
        <button type="submit" className="hidden" aria-hidden tabIndex={-1} />
      </form>
    </Modal>
  );
}
