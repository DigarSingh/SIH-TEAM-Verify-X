import { useQuery } from '@tanstack/react-query';
import { CalendarClock, CalendarPlus, Pencil, Trash2, Users } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { keys } from '../../api/keys';
import { QueryBoundary } from '../../components/domain/QueryBoundary';
import { ReadinessEventDialog } from '../../components/domain/ReadinessEventDialog';
import { Badge, Button, Card, EmptyState, PageHeader, ProgressBar, Toggle, useConfirm } from '../../components/ui';
import { useApiMutation, usePageTitle } from '../../hooks/misc';
import { deleteReadinessEvent, fetchReadinessCalendar, fetchReadinessEvents } from '../../services/readiness';
import type { ReadinessEvent, ReadinessEventSummary } from '../../types';
import { HAZARD_META, READINESS_EVENT_STATUS_META } from '../../utils/constants';
import { formatDate } from '../../utils/format';

/**
 * The readiness calendar.
 *
 * Each row is an operational period the workforce has to be ready for, with the
 * share of people who meet its requirements *at its start date* - not today,
 * because a competency that is fine now but decayed by the cyclone season is a
 * gap that needs work now.
 */

const readyTone = (percent: number) => (percent >= 80 ? 'green' : percent >= 50 ? 'amber' : 'red');

function EventRow({ event, summary, onEdit, onDelete }: { event: ReadinessEvent; summary: ReadinessEventSummary | undefined; onEdit: () => void; onDelete: () => void }) {
  const hazard = HAZARD_META[event.hazardType];
  const status = READINESS_EVENT_STATUS_META[event.status];

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Link to={`/admin/readiness/events/${event.id}`} className="font-display text-base font-bold text-navy hover:text-sky-deep">
              {event.name}
            </Link>
            <Badge tone={hazard.tone}>{hazard.label}</Badge>
            <Badge tone={status.tone}>{status.label}</Badge>
            {event.isSimulation && <Badge tone="purple">Simulated</Badge>}
          </div>
          <p className="mt-1 text-xs text-slate-500">
            {formatDate(event.startDate)} – {formatDate(event.endDate)}
            {summary && ` · starts in ${summary.daysUntilStart} day${summary.daysUntilStart === 1 ? '' : 's'}`}
            {` · priority ${event.priority}/5`}
          </p>
          {event.description && <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">{event.description}</p>}
          <p className="mt-2 text-xs text-slate-500">
            {event.requirements.length} competenc{event.requirements.length === 1 ? 'y' : 'ies'} ·{' '}
            {event.departments.length === 0 ? 'whole workforce' : event.departments.map((entry) => entry.department.name).join(', ')}
            {event._count.assignments > 0 && ` · ${event._count.assignments} preparation assignment${event._count.assignments === 1 ? '' : 's'}`}
          </p>
        </div>

        <div className="w-full max-w-[16rem] space-y-3">
          {summary ? (
            <div>
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-slate-600">Workforce ready</span>
                <span className="font-bold text-navy">{summary.workforceReady}%</span>
              </div>
              <ProgressBar value={summary.workforceReady} color={readyTone(summary.workforceReady)} height="h-2" label={`${event.name} readiness`} />
              <p className="mt-1 text-[11px] text-slate-500">
                {summary.readyCount} of {summary.totalPeople} people · {summary.criticalCount} critical
              </p>
            </div>
          ) : (
            <p className="text-[11px] text-slate-500">Readiness is measured for planned and active events.</p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" onClick={onEdit} leftIcon={<Pencil size={13} />}>
              Edit
            </Button>
            <Button size="sm" variant="ghost" onClick={onDelete} leftIcon={<Trash2 size={13} />}>
              Delete
            </Button>
          </div>
        </div>
      </div>
    </Card>
  );
}

export default function ReadinessEventsPage() {
  usePageTitle('Readiness calendar');
  const confirm = useConfirm();
  const [includeCompleted, setIncludeCompleted] = useState(false);
  const [editing, setEditing] = useState<ReadinessEvent | null>(null);
  const [creating, setCreating] = useState(false);

  const events = useQuery({ queryKey: keys.readinessEvents({ includeCompleted }), queryFn: () => fetchReadinessEvents({ includeCompleted }) });
  // The calendar carries the computed readiness for each event; the event list carries its definition.
  const calendar = useQuery({ queryKey: keys.readinessCalendar(0), queryFn: () => fetchReadinessCalendar(0) });

  const remove = useApiMutation({
    mutationFn: (eventId: string) => deleteReadinessEvent(eventId),
    successMessage: 'Event removed from the readiness calendar.',
    invalidate: [keys.readinessEventsAll],
  });

  const onDelete = async (event: ReadinessEvent) => {
    const ok = await confirm({
      title: 'Delete this readiness event?',
      message: `"${event.name}" and its ${event._count.assignments} preparation assignment(s) will be removed. Competency records are not affected.`,
      confirmLabel: 'Delete event',
      tone: 'danger',
    });
    if (ok) remove.mutate(event.id);
  };

  return (
    <div className="animate-fade-in space-y-6">
      <PageHeader
        eyebrow="Operational readiness"
        title="Readiness calendar"
        description="Operational periods the workforce has to be ready for. Readiness is measured at each event's start date, so preparation time is visible while it still exists."
        actions={
          <Button onClick={() => setCreating(true)} leftIcon={<CalendarPlus size={16} />}>
            New event
          </Button>
        }
      />

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <Toggle checked={includeCompleted} onChange={setIncludeCompleted} label="Include completed and cancelled" description="Planned and active events are shown by default." />
          <Link to="/admin/readiness" className="text-sm font-semibold text-sky-deep hover:text-navy">
            Back to the readiness dashboard →
          </Link>
        </div>
      </Card>

      <QueryBoundary query={events}>
        {(list) =>
          list.length === 0 ? (
            <EmptyState
              title="No readiness events yet"
              description="Add the operational periods this organisation prepares for - a monsoon season, a cyclone watch, a winter fog campaign - and Capacity Connect will measure who is ready for each one."
              icon={<CalendarClock size={18} />}
              action={
                <Button onClick={() => setCreating(true)} leftIcon={<CalendarPlus size={15} />}>
                  Add the first event
                </Button>
              }
            />
          ) : (
            <ul className="space-y-4">
              {list.map((event) => (
                <li key={event.id}>
                  <EventRow event={event} summary={calendar.data?.events.find((item) => item.id === event.id)} onEdit={() => setEditing(event)} onDelete={() => void onDelete(event)} />
                </li>
              ))}
            </ul>
          )
        }
      </QueryBoundary>

      <Card title="How an event is measured" description="The same engine as the rest of the platform, asked a different question">
        <ul className="space-y-2 text-sm text-slate-600">
          <li className="flex gap-2">
            <Users size={15} className="mt-0.5 shrink-0 text-sky-deep" aria-hidden />
            Everyone in the named departments is measured; naming none measures the whole active workforce.
          </li>
          <li className="flex gap-2">
            <CalendarClock size={15} className="mt-0.5 shrink-0 text-sky-deep" aria-hidden />
            Each person's competency is decayed forward to the event's start date. Nobody's stored record is changed.
          </li>
        </ul>
      </Card>

      <ReadinessEventDialog open={creating} event={null} onClose={() => setCreating(false)} />
      <ReadinessEventDialog open={editing !== null} event={editing} onClose={() => setEditing(null)} />
    </div>
  );
}
