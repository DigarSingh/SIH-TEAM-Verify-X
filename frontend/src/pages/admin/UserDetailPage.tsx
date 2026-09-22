import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, KeyRound, Pencil, ShieldCheck, Trash2, UserCheck, UserX } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { z } from 'zod';
import { errorMessage } from '../../api/client';
import { keys } from '../../api/keys';
import { RoleBadge, UserStatusBadge } from '../../components/domain/badges';
import { PassportView } from '../../components/domain/PassportView';
import { QueryBoundary } from '../../components/domain/QueryBoundary';
import { ApproveDialog, RejectDialog, TemporaryPasswordDialog } from '../../components/domain/UserDialogs';
import { Avatar, Button, Card, InlineAlert, KeyValue, Modal, SectionLabel, SelectField, TextAreaField, TextField, useConfirm } from '../../components/ui';
import { useApiMutation, usePageTitle } from '../../hooks/misc';
import { useCurrentUser } from '../../hooks/useAuth';
import { adjustCompetency, changeUserRole, changeUserStatus, deleteUser, fetchDepartments, fetchRoles, fetchUser, resetUserPassword, updateUser, type UserDetail } from '../../services/admin';
import { fetchCompetencies, fetchEmployeePassport } from '../../services/learner';
import type { Role } from '../../types';
import { applyServerErrors } from '../../utils/forms';
import { formatDate, formatDateTime } from '../../utils/format';

const detailsSchema = z.object({
  name: z.string().trim().min(2, 'Enter the full name').max(100),
  employeeId: z.string().trim().max(30),
  designation: z.string().trim().max(100),
  location: z.string().trim().max(100),
  departmentId: z.string(),
  jobRoleId: z.string(),
});
type DetailsValues = z.infer<typeof detailsSchema>;

function EditDialog({ user, onClose }: { user: UserDetail; onClose: () => void }) {
  const departments = useQuery({ queryKey: keys.departments(true), queryFn: () => fetchDepartments(true), staleTime: 5 * 60_000 });
  const roles = useQuery({ queryKey: keys.roles(true), queryFn: () => fetchRoles(true), staleTime: 5 * 60_000 });
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<DetailsValues>({
    resolver: zodResolver(detailsSchema),
    defaultValues: { name: user.name, employeeId: user.employeeId ?? '', designation: user.designation ?? '', location: user.location ?? '', departmentId: user.department?.id ?? '', jobRoleId: user.jobRole?.id ?? '' },
  });
  const save = useApiMutation({
    mutationFn: (values: DetailsValues) =>
      updateUser(user.id, {
        name: values.name,
        employeeId: values.employeeId || null,
        designation: values.designation || null,
        location: values.location || null,
        departmentId: values.departmentId || null,
        jobRoleId: values.jobRoleId || null,
      }),
    successMessage: 'User details saved',
    invalidate: [keys.usersAll, keys.employeePassport(user.id), keys.adminAnalyticsAll],
    onSuccess: onClose,
    onError: (error) => {
      if (!applyServerErrors(error, setError, ['name', 'employeeId', 'designation', 'location', 'departmentId', 'jobRoleId'])) setError('root', { message: errorMessage(error) });
    },
  });
  const submit = handleSubmit((values) => save.mutate(values));
  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title="Edit user"
      description={user.email}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={save.isPending} onClick={() => void submit()}>
            Save
          </Button>
        </>
      }
    >
      <form onSubmit={submit} noValidate className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <TextField label="Full name" required wrapperClassName="sm:col-span-2" error={errors.name?.message} {...register('name')} />
        <TextField label="Employee ID" error={errors.employeeId?.message} {...register('employeeId')} />
        <TextField label="Designation" error={errors.designation?.message} {...register('designation')} />
        <SelectField label="Department" {...register('departmentId')}>
          <option value="">Not assigned</option>
          {(departments.data ?? []).map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </SelectField>
        <SelectField label="Job role" hint="Changing the job role changes which competencies and skill gaps apply." {...register('jobRoleId')}>
          <option value="">Not assigned</option>
          {(roles.data ?? []).map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </SelectField>
        <TextField label="Location" wrapperClassName="sm:col-span-2" error={errors.location?.message} {...register('location')} />
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

const adjustSchema = z.object({
  competencyId: z.string().min(1, 'Choose a competency'),
  level: z.string().trim().refine((value) => /^\d{1,3}$/.test(value) && Number(value) <= 100, 'Enter a level from 0 to 100'),
  reason: z.string().trim().min(3, 'Give a reason (at least 3 characters)').max(300, 'At most 300 characters'),
});
type AdjustValues = z.infer<typeof adjustSchema>;

/** Records a baseline or corrects a level. It is audited and appears in the employee's competency history. */
function AdjustCard({ user }: { user: UserDetail }) {
  const competencies = useQuery({ queryKey: keys.competencies({ adjust: true }), queryFn: () => fetchCompetencies({ pageSize: 100 }), staleTime: 5 * 60_000 });
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors },
  } = useForm<AdjustValues>({ resolver: zodResolver(adjustSchema), defaultValues: { competencyId: '', level: '', reason: '' } });
  const save = useApiMutation({
    mutationFn: (values: AdjustValues) => adjustCompetency(user.id, values.competencyId, { level: Number(values.level), reason: values.reason }),
    successMessage: 'Competency level recorded',
    invalidate: [keys.employeePassport(user.id), keys.adminAnalyticsAll],
    onSuccess: () => reset(),
    onError: (error) => {
      if (!applyServerErrors(error, setError, ['competencyId', 'level', 'reason'])) setError('root', { message: errorMessage(error) });
    },
  });
  return (
    <Card title="Record or correct a competency level" description="Use this to enter a baseline for a new employee or to correct a level. The change is audited and appears in their competency history.">
      <form onSubmit={handleSubmit((values) => save.mutate(values))} noValidate className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <SelectField label="Competency" required wrapperClassName="md:col-span-2" error={errors.competencyId?.message} {...register('competencyId')}>
          <option value="">Choose…</option>
          {(competencies.data?.items ?? []).map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </SelectField>
        <TextField label="New level (0-100)" required inputMode="numeric" error={errors.level?.message} {...register('level')} />
        <div className="flex items-end">
          <Button type="submit" loading={save.isPending} className="w-full">
            Record level
          </Button>
        </div>
        <TextAreaField label="Reason" required rows={2} wrapperClassName="md:col-span-4" error={errors.reason?.message} {...register('reason')} />
        {errors.root?.message && (
          <InlineAlert tone="danger" className="md:col-span-4">
            {errors.root.message}
          </InlineAlert>
        )}
      </form>
    </Card>
  );
}

function Detail({ user }: { user: UserDetail }) {
  const me = useCurrentUser();
  const navigate = useNavigate();
  const confirm = useConfirm();
  const [editing, setEditing] = useState(false);
  const [approving, setApproving] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [changingRole, setChangingRole] = useState<Role>(user.role);
  const [temporary, setTemporary] = useState<string | null>(null);
  const isSelf = me.id === user.id;
  const refresh = [keys.usersAll, keys.adminAnalyticsAll];

  const role = useApiMutation({ mutationFn: (next: Role) => changeUserRole(user.id, next), successMessage: 'Access role changed. The user is signed out of other sessions so the change applies immediately.', invalidate: refresh });
  const status = useApiMutation({ mutationFn: (next: 'ACTIVE' | 'SUSPENDED') => changeUserStatus(user.id, next), successMessage: (updated) => (updated.status === 'SUSPENDED' ? 'Account suspended' : 'Account reactivated'), invalidate: refresh });
  const reset = useApiMutation({ mutationFn: () => resetUserPassword(user.id), invalidate: refresh, onSuccess: (result) => setTemporary(result.temporaryPassword) });
  const remove = useApiMutation({ mutationFn: () => deleteUser(user.id), successMessage: 'User deleted', invalidate: refresh, onSuccess: () => navigate('/admin/users', { replace: true }) });

  const passport = useQuery({ queryKey: keys.employeePassport(user.id), queryFn: () => fetchEmployeePassport(user.id), enabled: user.role === 'TRAINEE' && user.status === 'ACTIVE' });

  return (
    <div className="animate-fade-in">
      <Link to="/admin/users" className="mb-4 inline-flex items-center gap-1.5 text-xs font-bold text-sky-deep hover:text-navy">
        <ArrowLeft size={13} aria-hidden /> All users
      </Link>

      <Card>
        <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex items-start gap-5">
            <Avatar name={user.name} size="xl" tone="navy" />
            <div>
              <h1 className="font-display text-3xl font-bold text-navy">{user.name}</h1>
              <p className="mt-1 text-sm text-slate-500">{user.email}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <RoleBadge role={user.role} />
                <UserStatusBadge status={user.status} />
              </div>
              {user.status === 'REJECTED' && user.rejectionReason && <p className="mt-3 text-sm text-red-600">Rejected: {user.rejectionReason}</p>}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {user.status === 'PENDING' && (
              <>
                <Button variant="success" onClick={() => setApproving(true)} leftIcon={<UserCheck size={16} />}>
                  Approve
                </Button>
                <Button variant="secondary" onClick={() => setRejecting(true)} leftIcon={<UserX size={16} />}>
                  Reject
                </Button>
              </>
            )}
            <Button variant="secondary" onClick={() => setEditing(true)} leftIcon={<Pencil size={16} />}>
              Edit details
            </Button>
            {(user.status === 'ACTIVE' || user.status === 'SUSPENDED') && (
              <Button
                variant="secondary"
                disabled={isSelf}
                title={isSelf ? 'You cannot suspend your own account' : undefined}
                loading={status.isPending}
                onClick={async () => {
                  const next = user.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE';
                  if (await confirm({ title: next === 'SUSPENDED' ? `Suspend ${user.name}?` : `Reactivate ${user.name}?`, message: next === 'SUSPENDED' ? 'They are signed out immediately and cannot sign in until the account is reactivated. Their data is kept.' : 'They will be able to sign in again.', confirmLabel: next === 'SUSPENDED' ? 'Suspend' : 'Reactivate', tone: next === 'SUSPENDED' ? 'danger' : 'primary' })) status.mutate(next);
                }}
                leftIcon={<ShieldCheck size={16} />}
              >
                {user.status === 'ACTIVE' ? 'Suspend' : 'Reactivate'}
              </Button>
            )}
            <Button
              variant="secondary"
              loading={reset.isPending}
              onClick={async () => {
                if (await confirm({ title: `Reset ${user.name}'s password?`, message: 'A new one-time temporary password is generated. All of their sessions are ended, and they must choose a new password at the next sign-in.', confirmLabel: 'Reset password' })) reset.mutate();
              }}
              leftIcon={<KeyRound size={16} />}
            >
              Reset password
            </Button>
            <Button
              variant="danger"
              disabled={isSelf}
              title={isSelf ? 'You cannot delete your own account' : undefined}
              loading={remove.isPending}
              onClick={async () => {
                if (await confirm({ title: `Delete ${user.name}?`, message: 'The account is removed and can no longer sign in. Training records that others depend on (certificates, results) are kept.', confirmLabel: 'Delete user', tone: 'danger' })) remove.mutate();
              }}
              leftIcon={<Trash2 size={16} />}
            >
              Delete
            </Button>
          </div>
        </div>

        <dl className="mt-8 grid grid-cols-1 gap-5 border-t border-slate-100 pt-6 sm:grid-cols-2 lg:grid-cols-4">
          <KeyValue label="Employee ID">{user.employeeId}</KeyValue>
          <KeyValue label="Department">{user.department?.name}</KeyValue>
          <KeyValue label="Job role">{user.jobRole?.name}</KeyValue>
          <KeyValue label="Designation">{user.designation}</KeyValue>
          <KeyValue label="Location">{user.location}</KeyValue>
          <KeyValue label="Joined">{formatDate(user.joiningDate ?? user.createdAt)}</KeyValue>
          <KeyValue label="Last sign-in">{user.lastLoginAt ? formatDateTime(user.lastLoginAt) : 'Never'}</KeyValue>
          <KeyValue label="Activity">
            {user.stats.enrollments} enrollments · {user.stats.certificates} certificates · {user.stats.assessmentAttempts} attempts
          </KeyValue>
        </dl>
      </Card>

      <Card className="mt-6" title="Access role" description="Controls what this person can do. It is enforced by the server on every request.">
        <div className="flex flex-wrap items-end gap-3">
          <SelectField label="Role" wrapperClassName="w-60" value={changingRole} disabled={isSelf} onChange={(event) => setChangingRole(event.target.value as Role)}>
            <option value="TRAINEE">Trainee</option>
            <option value="TRAINER">Trainer</option>
            <option value="ADMIN">Administrator</option>
          </SelectField>
          <Button
            variant="secondary"
            disabled={changingRole === user.role || isSelf}
            loading={role.isPending}
            onClick={async () => {
              if (await confirm({ title: `Change ${user.name} to ${changingRole.toLowerCase()}?`, message: 'Their permissions change immediately.', confirmLabel: 'Change role', tone: changingRole === 'ADMIN' ? 'danger' : 'primary' })) role.mutate(changingRole);
            }}
          >
            Change role
          </Button>
        </div>
        {isSelf && <p className="mt-2 text-xs text-slate-500">You cannot change your own role.</p>}
      </Card>

      {user.role === 'TRAINEE' && user.status === 'ACTIVE' && (
        <>
          <div className="mt-6">
            <AdjustCard user={user} />
          </div>
          <div className="mt-10">
            <SectionLabel>Competency Passport</SectionLabel>
            <QueryBoundary query={passport}>{(data) => <PassportView passport={data} viewer="other" />}</QueryBoundary>
          </div>
        </>
      )}

      {editing && <EditDialog user={user} onClose={() => setEditing(false)} />}
      {approving && <ApproveDialog user={user} onClose={() => setApproving(false)} />}
      {rejecting && <RejectDialog user={user} onClose={() => setRejecting(false)} />}
      {temporary && <TemporaryPasswordDialog name={user.name} email={user.email} password={temporary} onClose={() => setTemporary(null)} />}
    </div>
  );
}

export default function UserDetailPage() {
  const { userId = '' } = useParams();
  const query = useQuery({ queryKey: keys.userDetail(userId), queryFn: () => fetchUser(userId), enabled: Boolean(userId) });
  usePageTitle(query.data?.name ?? 'User');
  return <QueryBoundary query={query}>{(user) => <Detail user={user} />}</QueryBoundary>;
}
