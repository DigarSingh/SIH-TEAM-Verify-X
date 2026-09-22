import { useQuery } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { keys } from '../../../api/keys';
import { CourseStatusBadge } from '../../../components/domain/badges';
import { Button, Card, EmptyState, InlineAlert, SearchInput, SelectField } from '../../../components/ui';
import { useApiMutation } from '../../../hooks/misc';
import { fetchCompetencies, fetchCourses } from '../../../services/learner';
import { setCourseCompetencies, setCoursePrerequisites } from '../../../services/trainer';
import type { CourseDetail } from '../../../types';

interface Row {
  competencyId: string;
  levelFrom: string;
  levelTo: string;
}

const isLevel = (value: string) => /^\d{1,3}$/.test(value) && Number(value) >= 0 && Number(value) <= 100;

function rowProblem(row: Row): string | null {
  if (!isLevel(row.levelFrom) || !isLevel(row.levelTo)) return 'Levels are whole numbers from 0 to 100';
  if (Number(row.levelTo) <= Number(row.levelFrom)) return 'The target level must be higher than the entry level';
  return null;
}

function MappingCard({ course }: { course: CourseDetail }) {
  const competencies = useQuery({ queryKey: keys.competencies({ editor: true }), queryFn: () => fetchCompetencies({ pageSize: 100 }), staleTime: 5 * 60_000 });
  const initial = useMemo<Row[]>(() => course.competencies.map((item) => ({ competencyId: item.id, levelFrom: String(item.levelFrom), levelTo: String(item.levelTo) })), [course.competencies]);
  const [rows, setRows] = useState<Row[]>(initial);
  const [pick, setPick] = useState('');

  const names = new Map((competencies.data?.items ?? []).map((item) => [item.id, item.name]));
  course.competencies.forEach((item) => names.set(item.id, item.name));
  const available = (competencies.data?.items ?? []).filter((item) => !rows.some((row) => row.competencyId === item.id));

  const problems = rows.map(rowProblem);
  const changed = JSON.stringify(rows) !== JSON.stringify(initial);
  const save = useApiMutation({
    mutationFn: () => setCourseCompetencies(course.id, rows.map((row) => ({ competencyId: row.competencyId, levelFrom: Number(row.levelFrom), levelTo: Number(row.levelTo) }))),
    successMessage: 'Competency mapping saved',
    invalidate: [keys.course(course.id), keys.coursesAll, keys.recommendations],
  });

  const update = (index: number, patch: Partial<Row>) => setRows((current) => current.map((row, position) => (position === index ? { ...row, ...patch } : row)));

  return (
    <Card title="Competencies developed" description="Which competencies this course improves, and from which level to which level.">
      {rows.length === 0 ? (
        <EmptyState title="No competency mapped" description="A course must develop at least one competency before it can be published. This is how completed training becomes measurable growth." />
      ) : (
        <ul className="space-y-3">
          {rows.map((row, index) => (
            <li key={row.competencyId} className="rounded-xl border border-slate-100 p-4">
              <div className="flex flex-wrap items-end gap-4">
                <div className="min-w-[180px] flex-1">
                  <p className="text-sm font-bold text-navy">{names.get(row.competencyId) ?? 'Competency'}</p>
                </div>
                <div>
                  <label htmlFor={`from-${row.competencyId}`} className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-slate-500">
                    Entry level
                  </label>
                  <input id={`from-${row.competencyId}`} inputMode="numeric" value={row.levelFrom} onChange={(event) => update(index, { levelFrom: event.target.value })} className="w-24 rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-sky focus:ring-4 focus:ring-sky/10" />
                </div>
                <div>
                  <label htmlFor={`to-${row.competencyId}`} className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-slate-500">
                    Target level
                  </label>
                  <input id={`to-${row.competencyId}`} inputMode="numeric" value={row.levelTo} onChange={(event) => update(index, { levelTo: event.target.value })} className="w-24 rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-sky focus:ring-4 focus:ring-sky/10" />
                </div>
                <button type="button" aria-label={`Remove ${names.get(row.competencyId) ?? 'competency'}`} onClick={() => setRows((current) => current.filter((_, position) => position !== index))} className="rounded-lg p-2.5 text-slate-500 hover:bg-red-50 hover:text-red-500">
                  <Trash2 size={16} />
                </button>
              </div>
              {problems[index] && (
                <p role="alert" className="mt-2 text-xs font-semibold text-red-600">
                  {problems[index]}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}

      <div className="mt-5 flex flex-wrap items-end gap-3">
        <SelectField label="Add a competency" wrapperClassName="w-72" value={pick} onChange={(event) => setPick(event.target.value)} disabled={available.length === 0}>
          <option value="">{available.length === 0 ? 'All competencies are mapped' : 'Choose a competency…'}</option>
          {available.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </SelectField>
        <Button
          variant="secondary"
          disabled={!pick}
          onClick={() => {
            setRows((current) => [...current, { competencyId: pick, levelFrom: '0', levelTo: '60' }]);
            setPick('');
          }}
          leftIcon={<Plus size={14} />}
        >
          Add
        </Button>
      </div>

      <InlineAlert tone="info" className="mt-5">
        A learner’s competency can only rise as far as the target level through this course. Courses that continue where another stops should start at the earlier course’s target.
      </InlineAlert>
      <div className="mt-5">
        <Button loading={save.isPending} disabled={!changed || problems.some(Boolean)} onClick={() => save.mutate()}>
          Save mapping
        </Button>
      </div>
    </Card>
  );
}

function PrerequisitesCard({ course }: { course: CourseDetail }) {
  const catalog = useQuery({ queryKey: keys.courses({ prerequisites: true }), queryFn: () => fetchCourses({ pageSize: 100, sort: 'title' }), staleTime: 60_000 });
  const initial = useMemo(() => course.prerequisites.map((item) => item.id).sort(), [course.prerequisites]);
  const [selected, setSelected] = useState<string[]>(initial);
  const [search, setSearch] = useState('');

  const options = (catalog.data?.items ?? []).filter((item) => item.id !== course.id && item.status !== 'ARCHIVED' && item.title.toLowerCase().includes(search.trim().toLowerCase()));
  const changed = JSON.stringify([...selected].sort()) !== JSON.stringify(initial);
  const save = useApiMutation({
    mutationFn: () => setCoursePrerequisites(course.id, selected),
    successMessage: 'Prerequisites saved',
    invalidate: [keys.course(course.id), keys.coursesAll, keys.recommendations],
  });

  const toggle = (id: string) => setSelected((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));

  return (
    <Card title="Prerequisites" description="Learners must complete these courses before they can enrol. Learning paths use them to order courses.">
      <SearchInput value={search} onChange={setSearch} label="Search courses" placeholder="Search courses" className="mb-4 max-w-sm" />
      {catalog.isLoading ? (
        <p className="text-sm text-slate-500">Loading courses…</p>
      ) : options.length === 0 ? (
        <p className="text-sm text-slate-500">No other course matches.</p>
      ) : (
        <ul className="max-h-80 divide-y divide-slate-100 overflow-y-auto rounded-xl border border-slate-100">
          {options.map((item) => (
            <li key={item.id}>
              <label className="flex cursor-pointer items-center gap-3 px-4 py-3 text-sm hover:bg-slate-50">
                <input type="checkbox" checked={selected.includes(item.id)} onChange={() => toggle(item.id)} className="h-4 w-4 rounded border-slate-300 text-sky-deep focus:ring-sky" />
                <span className="min-w-0 flex-1 truncate font-semibold text-navy">{item.title}</span>
                <CourseStatusBadge status={item.status} />
              </label>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-3 text-xs text-slate-500">{selected.length} of 10 prerequisites selected. A prerequisite loop is rejected.</p>
      <div className="mt-4">
        <Button loading={save.isPending} disabled={!changed || selected.length > 10} onClick={() => save.mutate()}>
          Save prerequisites
        </Button>
      </div>
    </Card>
  );
}

export function CompetenciesTab({ course }: { course: CourseDetail }) {
  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
      <MappingCard course={course} />
      <PrerequisitesCard course={course} />
    </div>
  );
}
