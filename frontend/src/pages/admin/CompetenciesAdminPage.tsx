import { zodResolver } from '@hookform/resolvers/zod';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Library, Pencil, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link } from 'react-router-dom';
import { z } from 'zod';
import { errorMessage } from '../../api/client';
import { keys } from '../../api/keys';
import { Badge, Button, Card, CheckboxField, DataTable, EmptyState, ErrorState, InlineAlert, Modal, PageHeader, Pagination, SearchInput, SelectField, Skeleton, Td, TextAreaField, TextField, Th, Toggle, useConfirm } from '../../components/ui';
import { useApiMutation, useDebounce, usePageTitle } from '../../hooks/misc';
import { createCompetency, deleteCompetency, updateCompetency } from '../../services/admin';
import { fetchCompetencies } from '../../services/learner';
import type { Competency } from '../../types';
import { applyServerErrors } from '../../utils/forms';

const optionalText = z.string().trim().max(500, 'At most 500 characters');
const schema = z.object({
  name: z.string().trim().min(2, 'Enter the competency name').max(100),
  code: z.string().trim().refine((value) => value === '' || /^[A-Za-z0-9][A-Za-z0-9_-]{1,29}$/.test(value), 'Code must be 2-30 characters: letters, digits, "_" or "-"'),
  category: z.string().trim().min(2, 'Enter a category').max(60),
  description: z.string().trim().min(10, 'Describe the competency (at least 10 characters)').max(1000),
  foundation: optionalText,
  developing: optionalText,
  proficient: optionalText,
  expert: optionalText,
});
type FormValues = z.infer<typeof schema>;

function CompetencyDialog({ existing, categories, onClose }: { existing: Competency | null; categories: string[]; onClose: () => void }) {
  const descriptors = existing?.levelDescriptors ?? {};
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: existing?.name ?? '',
      code: existing?.code ?? '',
      category: existing?.category ?? '',
      description: existing?.description ?? '',
      foundation: descriptors.foundation ?? '',
      developing: descriptors.developing ?? '',
      proficient: descriptors.proficient ?? '',
      expert: descriptors.expert ?? '',
    },
  });
  const save = useApiMutation({
    // The create endpoint takes the descriptors omitted when empty; only an update may send null to clear them.
    mutationFn: (values: FormValues) => {
      const levelDescriptors = Object.fromEntries((['foundation', 'developing', 'proficient', 'expert'] as const).filter((key) => values[key]).map((key) => [key, values[key]]));
      const hasDescriptors = Object.keys(levelDescriptors).length > 0;
      const common = { name: values.name, category: values.category, description: values.description, ...(values.code ? { code: values.code } : {}) };
      return existing
        ? updateCompetency(existing.id, { ...common, levelDescriptors: hasDescriptors ? levelDescriptors : null })
        : createCompetency({ ...common, ...(hasDescriptors ? { levelDescriptors } : {}) });
    },
    successMessage: existing ? 'Competency updated' : 'Competency created',
    invalidate: [keys.competenciesAll, keys.adminAnalyticsAll],
    onSuccess: onClose,
    onError: (error) => {
      if (!applyServerErrors(error, setError, ['name', 'code', 'category', 'description'])) setError('root', { message: errorMessage(error) });
    },
  });
  const submit = handleSubmit((values) => save.mutate(values));
  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={existing ? 'Edit competency' : 'Add a competency'}
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
        <TextField label="Name" required error={errors.name?.message} {...register('name')} />
        <TextField label="Code" hint="Optional. Derived from the name when empty." error={errors.code?.message} {...register('code')} />
        <div className="sm:col-span-2">
          <TextField label="Category" required list="competency-categories" error={errors.category?.message} {...register('category')} />
          <datalist id="competency-categories">
            {categories.map((category) => (
              <option key={category} value={category} />
            ))}
          </datalist>
        </div>
        <TextAreaField label="Description" required rows={3} wrapperClassName="sm:col-span-2" error={errors.description?.message} {...register('description')} />
        <fieldset className="grid grid-cols-1 gap-4 sm:col-span-2 sm:grid-cols-2">
          <legend className="mb-1 text-xs font-bold text-slate-600">What each proficiency level means (optional)</legend>
          <TextAreaField label="Foundation (0-39)" rows={2} error={errors.foundation?.message} {...register('foundation')} />
          <TextAreaField label="Developing (40-69)" rows={2} error={errors.developing?.message} {...register('developing')} />
          <TextAreaField label="Proficient (70-89)" rows={2} error={errors.proficient?.message} {...register('proficient')} />
          <TextAreaField label="Expert (90-100)" rows={2} error={errors.expert?.message} {...register('expert')} />
        </fieldset>
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

export default function CompetenciesAdminPage() {
  usePageTitle('Competency framework');
  const confirm = useConfirm();
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [inactive, setInactive] = useState(false);
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<Competency | null | 'new'>(null);
  const debounced = useDebounce(search, 350);

  const request = { q: debounced, category, includeInactive: inactive, page, pageSize: 20 };
  const query = useQuery({ queryKey: keys.competencies({ admin: true, ...request }), queryFn: () => fetchCompetencies(request), placeholderData: keepPreviousData });
  const refresh = [keys.competenciesAll, keys.adminAnalyticsAll];
  const toggle = useApiMutation({ mutationFn: (input: { id: string; isActive: boolean }) => updateCompetency(input.id, { isActive: input.isActive }), invalidate: refresh, successMessage: (saved) => (saved.isActive ? 'Competency activated' : 'Competency deactivated') });
  const remove = useApiMutation({ mutationFn: (id: string) => deleteCompetency(id), successMessage: 'Competency deleted', invalidate: refresh });

  return (
    <div className="animate-fade-in">
      <PageHeader
        eyebrow="Administration"
        title="Competency framework"
        description="The competencies IMD develops. Job roles require them at set levels, courses develop them, and every employee's level is tracked against them."
        actions={
          <Button onClick={() => setEditing('new')} leftIcon={<Plus size={16} />}>
            Add competency
          </Button>
        }
      />
      <Card className="mb-6">
        <div className="flex flex-wrap items-end gap-4">
          <SearchInput className="w-72" label="Search competencies" placeholder="Name, code or description" value={search} onChange={(value) => { setSearch(value); setPage(1); }} />
          <SelectField label="Category" wrapperClassName="w-64" value={category} onChange={(event) => { setCategory(event.target.value); setPage(1); }}>
            <option value="">All categories</option>
            {(query.data?.meta.categories ?? []).map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </SelectField>
          <CheckboxField label="Show inactive" checked={inactive} onChange={(event) => { setInactive(event.target.checked); setPage(1); }} />
        </div>
      </Card>

      {query.isLoading ? (
        <Skeleton className="h-80 rounded-2xl" />
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : query.data && query.data.items.length === 0 ? (
        <EmptyState title="No competencies match" icon={<Library size={18} />} />
      ) : query.data ? (
        <Card padded={false}>
          <DataTable caption="Competencies">
            <thead>
              <tr>
                <Th>Competency</Th>
                <Th>Category</Th>
                <Th align="right">Courses</Th>
                <Th align="right">Job roles</Th>
                <Th align="right">Employees</Th>
                <Th>Active</Th>
                <Th align="right">Actions</Th>
              </tr>
            </thead>
            <tbody>
              {query.data.items.map((competency) => (
                <tr key={competency.id} className="hover:bg-slate-50/60">
                  <Td>
                    <Link to={`/competencies/${competency.id}`} className="font-semibold text-navy hover:text-sky-deep">
                      {competency.name}
                    </Link>
                    <p className="text-xs text-slate-500">{competency.code}</p>
                  </Td>
                  <Td>
                    <Badge tone="neutral">{competency.category}</Badge>
                  </Td>
                  <Td align="right">{competency.courseCount ?? 0}</Td>
                  <Td align="right">{competency.roleCount ?? 0}</Td>
                  <Td align="right">{competency.employeeCount ?? 0}</Td>
                  <Td>
                    <Toggle label={`${competency.name} is active`} checked={competency.isActive} disabled={toggle.isPending} onChange={(value) => toggle.mutate({ id: competency.id, isActive: value })} />
                  </Td>
                  <Td align="right">
                    <div className="flex justify-end gap-1">
                      <button type="button" aria-label={`Edit ${competency.name}`} onClick={() => setEditing(competency)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-navy">
                        <Pencil size={16} />
                      </button>
                      <button
                        type="button"
                        aria-label={`Delete ${competency.name}`}
                        onClick={async () => {
                          if (await confirm({ title: `Delete ${competency.name}?`, message: 'A competency that is used by courses, job roles or employee records cannot be deleted; deactivate it instead.', confirmLabel: 'Delete', tone: 'danger' })) remove.mutate(competency.id);
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
          <Pagination meta={query.data.meta} onPage={setPage} label="Competency pages" />
        </Card>
      ) : null}
      {editing && <CompetencyDialog existing={editing === 'new' ? null : editing} categories={query.data?.meta.categories ?? []} onClose={() => setEditing(null)} />}
    </div>
  );
}
