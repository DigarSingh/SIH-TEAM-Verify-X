import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import { Building2, Pencil, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { errorMessage } from '../../api/client';
import { keys } from '../../api/keys';
import { QueryBoundary } from '../../components/domain/QueryBoundary';
import { Badge, Button, Card, DataTable, EmptyState, InlineAlert, Modal, PageHeader, TextAreaField, TextField, Td, Th, Toggle, useConfirm } from '../../components/ui';
import { useApiMutation, usePageTitle } from '../../hooks/misc';
import { createDepartment, deleteDepartment, fetchDepartments, updateDepartment } from '../../services/admin';
import type { Department } from '../../types';
import { applyServerErrors } from '../../utils/forms';

const schema = z.object({
  name: z.string().trim().min(2, 'Enter the department name').max(100),
  code: z.string().trim().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{1,29}$/, 'Code must be 2-30 characters: letters, digits, "_" or "-"'),
  description: z.string().trim().max(500, 'At most 500 characters'),
});
type FormValues = z.infer<typeof schema>;

function DepartmentDialog({ existing, onClose }: { existing: Department | null; onClose: () => void }) {
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: { name: existing?.name ?? '', code: existing?.code ?? '', description: existing?.description ?? '' } });
  const save = useApiMutation({
    // The create endpoint takes the field omitted when blank; only an update may send null to clear it.
    mutationFn: (values: FormValues) =>
      existing
        ? updateDepartment(existing.id, { name: values.name, code: values.code, description: values.description || null })
        : createDepartment({ name: values.name, code: values.code, ...(values.description ? { description: values.description } : {}) }),
    successMessage: existing ? 'Department updated' : 'Department created',
    invalidate: [keys.departments(true), keys.departments()],
    onSuccess: onClose,
    onError: (error) => {
      if (!applyServerErrors(error, setError, ['name', 'code', 'description'])) setError('root', { message: errorMessage(error) });
    },
  });
  const submit = handleSubmit((values) => save.mutate(values));
  return (
    <Modal
      open
      onClose={onClose}
      title={existing ? 'Edit department' : 'Add a department'}
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
        <TextField label="Code" required hint="Short identifier, stored in upper case. For example FC." error={errors.code?.message} {...register('code')} />
        <TextAreaField label="Description" rows={3} error={errors.description?.message} {...register('description')} />
        {errors.root?.message && <InlineAlert tone="danger">{errors.root.message}</InlineAlert>}
        <button type="submit" className="hidden" aria-hidden tabIndex={-1} />
      </form>
    </Modal>
  );
}

export default function DepartmentsPage() {
  usePageTitle('Departments');
  const confirm = useConfirm();
  const [editing, setEditing] = useState<Department | null | 'new'>(null);
  const query = useQuery({ queryKey: keys.departments(true), queryFn: () => fetchDepartments(true) });
  const refresh = [keys.departments(true), keys.departments()];
  const toggle = useApiMutation({ mutationFn: (input: { id: string; isActive: boolean }) => updateDepartment(input.id, { isActive: input.isActive }), invalidate: refresh, successMessage: (saved) => (saved.isActive ? 'Department activated' : 'Department deactivated') });
  const remove = useApiMutation({ mutationFn: (id: string) => deleteDepartment(id), successMessage: 'Department deleted', invalidate: refresh });

  return (
    <div className="animate-fade-in">
      <PageHeader
        eyebrow="Administration"
        title="Departments"
        description="The organisational units of IMD. Departments group employees for reporting and the competency heatmap."
        actions={
          <Button onClick={() => setEditing('new')} leftIcon={<Plus size={16} />}>
            Add department
          </Button>
        }
      />
      <QueryBoundary query={query}>
        {(departments) =>
          departments.length === 0 ? (
            <EmptyState title="No departments" icon={<Building2 size={18} />} action={<Button onClick={() => setEditing('new')}>Add the first department</Button>} />
          ) : (
            <Card padded={false}>
              <DataTable caption="Departments">
                <thead>
                  <tr>
                    <Th>Department</Th>
                    <Th>Code</Th>
                    <Th align="right">Employees</Th>
                    <Th>Active</Th>
                    <Th align="right">Actions</Th>
                  </tr>
                </thead>
                <tbody>
                  {departments.map((department) => (
                    <tr key={department.id} className="hover:bg-slate-50/60">
                      <Td>
                        <p className="font-semibold text-navy">{department.name}</p>
                        {department.description && <p className="max-w-md truncate text-xs text-slate-500">{department.description}</p>}
                      </Td>
                      <Td>
                        <Badge tone="neutral">{department.code}</Badge>
                      </Td>
                      <Td align="right">{department.employeeCount ?? 0}</Td>
                      <Td>
                        <Toggle label={`${department.name} is active`} checked={department.isActive} disabled={toggle.isPending} onChange={(value) => toggle.mutate({ id: department.id, isActive: value })} />
                      </Td>
                      <Td align="right">
                        <div className="flex justify-end gap-1">
                          <button type="button" aria-label={`Edit ${department.name}`} onClick={() => setEditing(department)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-navy">
                            <Pencil size={16} />
                          </button>
                          <button
                            type="button"
                            aria-label={`Delete ${department.name}`}
                            onClick={async () => {
                              if (await confirm({ title: `Delete ${department.name}?`, message: 'This is only possible when no employee belongs to the department; otherwise deactivate it instead.', confirmLabel: 'Delete', tone: 'danger' })) remove.mutate(department.id);
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
      {editing && <DepartmentDialog existing={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </div>
  );
}
