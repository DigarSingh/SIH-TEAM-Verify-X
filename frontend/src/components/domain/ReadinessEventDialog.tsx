import { useQuery } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { keys } from '../../api/keys';
import { useApiMutation } from '../../hooks/misc';
import { createReadinessEvent, updateReadinessEvent } from '../../services/readiness';
import { fetchDepartments } from '../../services/admin';
import { fetchCompetencies } from '../../services/learner';
import type { HazardType, ReadinessEvent, ReadinessEventInput, ReadinessEventStatus } from '../../types';
import { HAZARD_META, READINESS_EVENT_STATUS_META } from '../../utils/constants';
import { Button, CheckboxField, InlineAlert, Modal, SelectField, TextAreaField, TextField, Toggle } from '../ui';

/**
 * Creating and editing a readiness event.
 *
 * An event is a date range, the competencies it depends on and the departments
 * it applies to. The server replaces requirements wholesale on an edit, so this
 * form always submits the complete set.
 */

type Requirement = { competencyId: string; requiredLevel: number; importance: number };

const asDateInput = (iso: string) => iso.slice(0, 10);
const today = () => new Date().toISOString().slice(0, 10);
const inDays = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);

interface FormState {
  name: string;
  description: string;
  hazardType: HazardType;
  startDate: string;
  endDate: string;
  priority: number;
  status: ReadinessEventStatus;
  isSimulation: boolean;
  departmentIds: string[];
  requirements: Requirement[];
}

const blank = (): FormState => ({
  name: '',
  description: '',
  hazardType: 'MONSOON',
  startDate: inDays(30),
  endDate: inDays(120),
  priority: 3,
  status: 'PLANNED',
  isSimulation: true,
  departmentIds: [],
  requirements: [],
});

const fromEvent = (event: ReadinessEvent): FormState => ({
  name: event.name,
  description: event.description ?? '',
  hazardType: event.hazardType,
  startDate: asDateInput(event.startDate),
  endDate: asDateInput(event.endDate),
  priority: event.priority,
  status: event.status,
  isSimulation: event.isSimulation,
  departmentIds: event.departments.map((entry) => entry.departmentId),
  requirements: event.requirements.map((requirement) => ({ competencyId: requirement.competencyId, requiredLevel: requirement.requiredLevel, importance: requirement.importance })),
});

export function ReadinessEventDialog({ open, event, onClose }: { open: boolean; event: ReadinessEvent | null; onClose: () => void }) {
  const [form, setForm] = useState<FormState>(blank);
  const [error, setError] = useState<string | null>(null);

  const departments = useQuery({ queryKey: keys.departments(), queryFn: () => fetchDepartments(), staleTime: 5 * 60_000, enabled: open });
  const competencies = useQuery({ queryKey: keys.competencies({ forEvents: true }), queryFn: () => fetchCompetencies({ pageSize: 100 }), staleTime: 5 * 60_000, enabled: open });

  // Reopening the dialog for a different event must not show the previous one's values.
  useEffect(() => {
    if (open) {
      setForm(event ? fromEvent(event) : blank());
      setError(null);
    }
  }, [open, event]);

  const save = useApiMutation({
    mutationFn: (input: ReadinessEventInput) => (event ? updateReadinessEvent(event.id, input) : createReadinessEvent(input)),
    successMessage: event ? 'Readiness event updated.' : 'Readiness event added to the calendar.',
    invalidate: [keys.readinessEventsAll],
    onSuccess: onClose,
  });

  const patch = (changes: Partial<FormState>) => setForm((current) => ({ ...current, ...changes }));

  const addRequirement = () => {
    const used = new Set(form.requirements.map((requirement) => requirement.competencyId));
    const next = (competencies.data?.items ?? []).find((competency) => !used.has(competency.id));
    if (next) patch({ requirements: [...form.requirements, { competencyId: next.id, requiredLevel: 70, importance: 3 }] });
  };

  const submit = () => {
    if (form.name.trim().length < 3) return setError('Give the event a name of at least three characters.');
    if (form.requirements.length === 0) return setError('An event needs at least one competency: that is what readiness is measured against.');
    if (new Date(form.endDate) < new Date(form.startDate)) return setError('The event cannot end before it starts.');
    setError(null);
    save.mutate({
      name: form.name.trim(),
      description: form.description.trim() || null,
      hazardType: form.hazardType,
      startDate: form.startDate,
      endDate: form.endDate,
      priority: form.priority,
      status: form.status,
      isSimulation: form.isSimulation,
      departmentIds: form.departmentIds,
      requirements: form.requirements,
    });
    return undefined;
  };

  const toggleDepartment = (id: string) =>
    patch({ departmentIds: form.departmentIds.includes(id) ? form.departmentIds.filter((item) => item !== id) : [...form.departmentIds, id] });

  return (
    <Modal
      open={open}
      title={event ? 'Edit readiness event' : 'New readiness event'}
      description="An operational period the workforce has to be ready for."
      size="lg"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={save.isPending} onClick={submit}>
            {event ? 'Save changes' : 'Add to calendar'}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        {error && <InlineAlert tone="danger">{error}</InlineAlert>}

        <TextField label="Name" required value={form.name} onChange={(e) => patch({ name: e.target.value })} placeholder="South-west monsoon 2027" />

        <TextAreaField label="What this period demands" hint="Shown to administrators on the readiness calendar." rows={2} value={form.description} onChange={(e) => patch({ description: e.target.value })} />

        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField label="Hazard" value={form.hazardType} onChange={(e) => patch({ hazardType: e.target.value as HazardType })}>
            {Object.entries(HAZARD_META).map(([value, meta]) => (
              <option key={value} value={value}>
                {meta.label}
              </option>
            ))}
          </SelectField>
          <SelectField label="Status" value={form.status} onChange={(e) => patch({ status: e.target.value as ReadinessEventStatus })}>
            {Object.entries(READINESS_EVENT_STATUS_META).map(([value, meta]) => (
              <option key={value} value={value}>
                {meta.label}
              </option>
            ))}
          </SelectField>
          <TextField label="Starts" required hint="Readiness is measured at this date." type="date" min={today()} value={form.startDate} onChange={(e) => patch({ startDate: e.target.value })} />
          <TextField label="Ends" required type="date" value={form.endDate} onChange={(e) => patch({ endDate: e.target.value })} />
          <SelectField label="Priority" hint="1 is routine, 5 is a national emergency posture." value={String(form.priority)} onChange={(e) => patch({ priority: Number(e.target.value) })}>
            {[1, 2, 3, 4, 5].map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </SelectField>
        </div>

        <Toggle
          checked={form.isSimulation}
          onChange={(value) => patch({ isSimulation: value })}
          label="Mark as simulated"
          description="Simulated events are labelled everywhere they appear. Leave this on unless the event is a real, approved operational period."
        />

        <fieldset>
          <legend className="text-sm font-bold text-navy">Departments affected</legend>
          <p className="mb-2 mt-0.5 text-xs text-slate-500">Choose none to measure the whole active workforce.</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {(departments.data ?? []).map((department) => (
              <CheckboxField key={department.id} label={department.name} checked={form.departmentIds.includes(department.id)} onChange={() => toggleDepartment(department.id)} />
            ))}
          </div>
        </fieldset>

        <fieldset>
          <div className="flex items-center justify-between">
            <legend className="text-sm font-bold text-navy">Competencies this period depends on</legend>
            <Button size="sm" variant="secondary" onClick={addRequirement} leftIcon={<Plus size={13} />}>
              Add competency
            </Button>
          </div>
          <p className="mb-3 mt-0.5 text-xs text-slate-500">Readiness is the weighted share of these met at the start date. Importance weights how much a shortfall counts.</p>

          {form.requirements.length === 0 ? (
            <p className="rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-500">No competencies yet. An event needs at least one.</p>
          ) : (
            <ul className="space-y-2">
              {form.requirements.map((requirement, index) => (
                <li key={requirement.competencyId} className="flex flex-wrap items-end gap-2 rounded-xl border border-slate-100 bg-slate-50/60 p-3">
                  <SelectField
                    label="Competency"
                    wrapperClassName="min-w-[12rem] flex-1"
                    value={requirement.competencyId}
                    onChange={(e) => patch({ requirements: form.requirements.map((item, position) => (position === index ? { ...item, competencyId: e.target.value } : item)) })}
                  >
                    {(competencies.data?.items ?? []).map((competency) => (
                      <option key={competency.id} value={competency.id}>
                        {competency.name}
                      </option>
                    ))}
                  </SelectField>
                  <TextField
                    label="Level needed"
                    wrapperClassName="w-28"
                    type="number"
                    min={0}
                    max={100}
                    value={requirement.requiredLevel}
                    onChange={(e) => patch({ requirements: form.requirements.map((item, position) => (position === index ? { ...item, requiredLevel: Number(e.target.value) } : item)) })}
                  />
                  <SelectField
                    label="Importance"
                    wrapperClassName="w-28"
                    value={String(requirement.importance)}
                    onChange={(e) => patch({ requirements: form.requirements.map((item, position) => (position === index ? { ...item, importance: Number(e.target.value) } : item)) })}
                  >
                    {[1, 2, 3, 4, 5].map((value) => (
                      <option key={value} value={value}>
                        {value}
                      </option>
                    ))}
                  </SelectField>
                  <Button size="sm" variant="ghost" aria-label={`Remove competency ${index + 1}`} onClick={() => patch({ requirements: form.requirements.filter((_, position) => position !== index) })} leftIcon={<Trash2 size={13} />}>
                    Remove
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </fieldset>
      </div>
    </Modal>
  );
}
