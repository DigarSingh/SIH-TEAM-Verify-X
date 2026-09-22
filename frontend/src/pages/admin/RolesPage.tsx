import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import { Briefcase, Pencil, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link } from 'react-router-dom';
import { z } from 'zod';
import { errorMessage } from '../../api/client';
import { keys } from '../../api/keys';
import { QueryBoundary } from '../../components/domain/QueryBoundary';
import { Badge, Button, Card, DataTable, EmptyState, InlineAlert, Modal, PageHeader, SelectField, Td, TextAreaField, TextField, Th, Toggle, useConfirm } from '../../components/ui';
import { useApiMutation, usePageTitle } from '../../hooks/misc';
import { createRole, deleteRole, fetchRoles, updateRole } from '../../services/admin';
import type { JobRole } from '../../types';
import { CRITICALITY_LABEL } from '../../utils/constants';
import { applyServerErrors } from '../../utils/forms';

const schema = z.object({
  name: z.string().trim().min(2, 'Enter the job role name').max(100),
  code: z.string().trim().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{1,29}$/, 'Code must be 2-30 characters: letters, digits, "_" or "-"'),
  description: z.string().trim().max(500, 'At most 500 characters'),
  criticality: z.string(),
});
type FormValues = z.infer<typeof schema>;

function RoleDialog({ existing, onClose }: { existing: JobRole | null; onClose: () => void }) {
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: { name: existing?.name ?? '', code: existing?.code ?? '', description: existing?.description ?? '', criticality: String(existing?.criticality ?? 3) } });
  const save = useApiMutation({
    // The create endpoint takes the field omitted when blank; only an update may send null to clear it.
    mutationFn: (values: FormValues) =>
      existing
        ? updateRole(existing.id, { name: values.name, code: values.code, description: values.description || null, criticality: Number(values.criticality) })
        : createRole({ name: values.name, code: values.code, criticality: Number(values.criticality), ...(values.description ? { description: values.description } : {}) }),
    successMessage: existing ? 'Job role updated' : 'Job role created',
    invalidate: [keys.rolesAll, keys.adminAnalyticsAll],
    onSuccess: onClose,
    onError: (error) => {
      if (!applyServerErrors(error, setError, ['name', 'code', 'description', 'criticality'])) setError('root', { message: errorMessage(error) });
    },
  });
  const submit = handleSubmit((values) => save.mutate(values));
  return (
    <Modal
      open
      onClose={onClose}
      title={existing ? 'Edit job role' : 'Add a job role'}
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
      <form onSubmit={submit} noValidate className="space-y-4">
        <TextField label="Name" required error={errors.name?.message} {...register('name')} />
        <TextField label="Code" required hint="Short identifier, stored in upper case. For example SWF." error={errors.code?.message} {...register('code')} />
        <SelectField label="Criticality" hint="How critical this role is to IMD's mission. It weights the training priority of every gap in the role." {...register('criticality')}>
          {[1, 2, 3, 4, 5].map((value) => (
            <option key={value} value={value}>
              {value} · {CRITICALITY_LABEL[value]}
            </option>
          ))}
        </SelectField>
        <TextAreaField label="Description" rows={3} error={errors.description?.message} {...register('description')} />
        {errors.root?.message && <InlineAlert tone="danger">{errors.root.message}</InlineAlert>}
        <button type="submit" className="hidden" aria-hidden tabIndex={-1} />
      </form>
    </Modal>
  );
}

export default function RolesPage() {
  usePageTitle('Job roles');
  const confirm = useConfirm();
  const [editing, setEditing] = useState<JobRole | null | 'new'>(null);
  const query = useQuery({ queryKey: keys.roles(true), queryFn: () => fetchRoles(true) });
  const refresh = [keys.rolesAll, keys.adminAnalyticsAll];
  const toggle = useApiMutation({ mutationFn: (input: { id: string; isActive: boolean }) => updateRole(input.id, { isActive: input.isActive }), invalidate: refresh, successMessage: (saved) => (saved.isActive ? 'Job role activated' : 'Job role deactivated') });
  const remove = useApiMutation({ mutationFn: (id: string) => deleteRole(id), successMessage: 'Job role deleted', invalidate: refresh });

  return (
    <div className="animate-fade-in">
      <PageHeader
        eyebrow="Administration"
        title="Job roles"
        description="A job role defines which competencies an employee must have, at what level, and how important each one is. These requirements drive every skill gap and recommendation."
        actions={
          <Button onClick={() => setEditing('new')} leftIcon={<Plus size={16} />}>
            Add job role
          </Button>
        }
      />
      <QueryBoundary query={query}>
        {(roles) =>
          roles.length === 0 ? (
            <EmptyState title="No job roles" icon={<Briefcase size={18} />} action={<Button onClick={() => setEditing('new')}>Add the first job role</Button>} />
          ) : (
            <Card padded={false}>
              <DataTable caption="Job roles">
                <thead>
                  <tr>
                    <Th>Job role</Th>
                    <Th>Criticality</Th>
                    <Th align="right">Required competencies</Th>
                    <Th align="right">Employees</Th>
                    <Th>Active</Th>
                    <Th align="right">Actions</Th>
                  </tr>
                </thead>
                <tbody>
                  {roles.map((role) => (
                    <tr key={role.id} className="hover:bg-slate-50/60">
                      <Td>
                        <Link to={`/admin/roles/${role.id}`} className="font-semibold text-navy hover:text-sky-deep">
                          {role.name}
                        </Link>
                        <p className="text-xs text-slate-500">{role.code}</p>
                      </Td>
                      <Td>
                        <Badge tone={role.criticality >= 4 ? 'orange' : role.criticality === 3 ? 'warning' : 'neutral'}>
                          {role.criticality} · {role.criticalityLabel}
                        </Badge>
                      </Td>
                      <Td align="right">{role.competencyCount}</Td>
                      <Td align="right">{role.employeeCount}</Td>
                      <Td>
                        <Toggle label={`${role.name} is active`} checked={role.isActive} disabled={toggle.isPending} onChange={(value) => toggle.mutate({ id: role.id, isActive: value })} />
                      </Td>
                      <Td align="right">
                        <div className="flex justify-end gap-1">
                          <Link to={`/admin/roles/${role.id}`} className="mr-2 self-center text-xs font-bold text-sky-deep hover:text-navy">
                            Requirements
                          </Link>
                          <button type="button" aria-label={`Edit ${role.name}`} onClick={() => setEditing(role)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-navy">
                            <Pencil size={16} />
                          </button>
                          <button
                            type="button"
                            aria-label={`Delete ${role.name}`}
                            onClick={async () => {
                              if (await confirm({ title: `Delete ${role.name}?`, message: 'This is only possible when no employee holds the role; otherwise deactivate it instead.', confirmLabel: 'Delete', tone: 'danger' })) remove.mutate(role.id);
                            }}
                            className="rounded-lg p-2 text-slate-500 hover:bg-red-50 hover:text-red-500"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </DataTable>
            </Card>
          )
        }
      </QueryBoundary>
      {editing && <RoleDialog existing={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </div>
  );
}
