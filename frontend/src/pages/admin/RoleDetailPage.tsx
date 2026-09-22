import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Pencil, Plus, Target, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useParams } from 'react-router-dom';
import { z } from 'zod';
import { errorMessage } from '../../api/client';
import { keys } from '../../api/keys';
import { QueryBoundary } from '../../components/domain/QueryBoundary';
import { Badge, Button, Card, DataTable, EmptyState, InlineAlert, Modal, PageHeader, SelectField, TextField, Td, Th, useConfirm } from '../../components/ui';
import { useApiMutation, usePageTitle } from '../../hooks/misc';
import { fetchRole, removeRoleRequirement, setRoleRequirement } from '../../services/admin';
import { fetchCompetencies } from '../../services/learner';
import type { JobRoleDetail } from '../../types';
import { IMPORTANCE_LABEL } from '../../utils/constants';

type Requirement = JobRoleDetail['competencies'][number];

const schema = z.object({
  competencyId: z.string().min(1, 'Choose a competency'),
  requiredLevel: z.string().trim().refine((value) => /^\d{1,3}$/.test(value) && Number(value) <= 100, 'Enter a level from 0 to 100'),
  importance: z.string(),
});
type FormValues = z.infer<typeof schema>;

function RequirementDialog({ role, existing, onClose }: { role: JobRoleDetail; existing: Requirement | null; onClose: () => void }) {
  const competencies = useQuery({ queryKey: keys.competencies({ roleDialog: true }), queryFn: () => fetchCompetencies({ pageSize: 100 }), staleTime: 5 * 60_000 });
  const available = (competencies.data?.items ?? []).filter((item) => !role.competencies.some((requirement) => requirement.competencyId === item.id));
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: { competencyId: existing?.competencyId ?? '', requiredLevel: existing ? String(existing.requiredLevel) : '70', importance: String(existing?.importance ?? 3) } });
  const save = useApiMutation({
    mutationFn: (values: FormValues) => setRoleRequirement(role.id, values.competencyId, { requiredLevel: Number(values.requiredLevel), importance: Number(values.importance) }),
    successMessage: existing ? 'Requirement updated' : 'Requirement added',
    invalidate: [keys.role(role.id), keys.rolesAll, keys.adminAnalyticsAll],
    onSuccess: onClose,
    onError: (error) => setError('root', { message: errorMessage(error) }),
  });
  const submit = handleSubmit((values) => save.mutate(values));
  return (
    <Modal
      open
      onClose={onClose}
      title={existing ? `Edit requirement: ${existing.name}` : 'Add a required competency'}
      description={role.name}
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
        {existing ? (
          <input type="hidden" {...register('competencyId')} />
        ) : (
          <SelectField label="Competency" required error={errors.competencyId?.message} {...register('competencyId')}>
            <option value="">Choose…</option>
            {available.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </SelectField>
        )}
        <TextField label="Required level (0-100)" required inputMode="numeric" hint="The level an employee in this role should reach." error={errors.requiredLevel?.message} {...register('requiredLevel')} />
        <SelectField label="Importance" hint="How important this competency is within the role. It weights the training priority." {...register('importance')}>
          {[1, 2, 3, 4, 5].map((value) => (
            <option key={value} value={value}>
              {value} · {IMPORTANCE_LABEL[value]}
            </option>
          ))}
        </SelectField>
        {errors.root?.message && <InlineAlert tone="danger">{errors.root.message}</InlineAlert>}
        <button type="submit" className="hidden" aria-hidden tabIndex={-1} />
      </form>
    </Modal>
  );
}

function Detail({ role }: { role: JobRoleDetail }) {
  const confirm = useConfirm();
  const [editing, setEditing] = useState<Requirement | null | 'new'>(null);
  const remove = useApiMutation({ mutationFn: (competencyId: string) => removeRoleRequirement(role.id, competencyId), successMessage: 'Requirement removed', invalidate: [keys.role(role.id), keys.rolesAll, keys.adminAnalyticsAll] });

  return (
    <div className="animate-fade-in">
      <Link to="/admin/roles" className="mb-4 inline-flex items-center gap-1.5 text-xs font-bold text-sky-deep hover:text-navy">
        <ArrowLeft size={13} aria-hidden /> All job roles
      </Link>
      <PageHeader
        eyebrow={`Job role · ${role.code}`}
        title={role.name}
        description={role.description ?? 'Required competencies for this job role.'}
        actions={
          <>
            <Badge tone={role.criticality >= 4 ? 'orange' : 'warning'}>
              Criticality {role.criticality} · {role.criticalityLabel}
            </Badge>
            <Badge tone="neutral">{role.employeeCount} employee{role.employeeCount === 1 ? '' : 's'}</Badge>
            <Button onClick={() => setEditing('new')} leftIcon={<Plus size={16} />}>
              Add requirement
            </Button>
          </>
        }
      />

      {role.competencies.length === 0 ? (
        <EmptyState title="No required competencies yet" description="Until this role requires at least one competency, employees in it have no skill gaps to close." icon={<Target size={18} />} action={<Button onClick={() => setEditing('new')}>Add the first requirement</Button>} />
      ) : (
        <Card padded={false}>
          <DataTable caption={`Competencies required for ${role.name}`}>
            <thead>
              <tr>
                <Th>Competency</Th>
                <Th>Category</Th>
                <Th align="right">Required level</Th>
                <Th>Importance</Th>
                <Th align="right">Actions</Th>
              </tr>
            </thead>
            <tbody>
              {role.competencies.map((requirement) => (
                <tr key={requirement.competencyId} className="hover:bg-slate-50/60">
                  <Td>
                    <Link to={`/competencies/${requirement.competencyId}`} className="font-semibold text-navy hover:text-sky-deep">
                      {requirement.name}
                    </Link>
                    {!requirement.isActive && (
                      <span className="ml-2">
                        <Badge tone="warning">Inactive</Badge>
                      </span>
                    )}
                  </Td>
                  <Td>{requirement.category}</Td>
                  <Td align="right">
                    <strong className="text-navy">{requirement.requiredLevel}%</strong>
                  </Td>
                  <Td>
                    <Badge tone={requirement.importance >= 4 ? 'orange' : 'neutral'}>
                      {requirement.importance} · {requirement.importanceLabel}
                    </Badge>
                  </Td>
                  <Td align="right">
                    <div className="flex justify-end gap-1">
                      <button type="button" aria-label={`Edit requirement ${requirement.name}`} onClick={() => setEditing(requirement)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-navy">
                        <Pencil size={16} />
                      </button>
                      <button
                        type="button"
                        aria-label={`Remove requirement ${requirement.name}`}
                        onClick={async () => {
                          if (await confirm({ title: `Remove ${requirement.name} from ${role.name}?`, message: 'Employees in this role will no longer have a skill gap for it. Their recorded levels are kept.', confirmLabel: 'Remove', tone: 'danger' })) remove.mutate(requirement.competencyId);
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
      )}
      <p className="mt-5 max-w-3xl text-xs leading-5 text-slate-500">
        For an employee in this role: skill gap = required level − current level; training priority = gap × importance × criticality {role.criticality}, normalised to 0-100. Changing a requirement re-classifies every affected employee immediately.
      </p>
      {editing && <RequirementDialog role={role} existing={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

export default function RoleDetailPage() {
  const { roleId = '' } = useParams();
  const query = useQuery({ queryKey: keys.role(roleId), queryFn: () => fetchRole(roleId), enabled: Boolean(roleId) });
  usePageTitle(query.data?.name ?? 'Job role');
  return <QueryBoundary query={query}>{(role) => <Detail role={role} />}</QueryBoundary>;
}
