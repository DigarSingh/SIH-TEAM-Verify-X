import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, ArrowLeft, CalendarClock, CheckCircle2, ClipboardList, Target, Users } from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { keys } from '../../api/keys';
import { QueryBoundary } from '../../components/domain/QueryBoundary';
import { FreshnessBadge, ReadinessTimeTravel, SimulationBanner } from '../../components/domain/ReadinessParts';
import { Badge, Button, Card, DataTable, EmptyState, PageHeader, ProgressBar, StatCard, Td, Th, useConfirm } from '../../components/ui';
import { useApiMutation, usePageTitle } from '../../hooks/misc';
import { assignPreparation, fetchEventAssignments, fetchEventReadiness } from '../../services/readiness';
import type { EventReadinessReport, PersonReadiness } from '../../types';
import { ASSIGNMENT_STATUS_META, HAZARD_META, READINESS_STATE_META } from '../../utils/constants';
import { formatDate } from '../../utils/format';

/**
 * One readiness sprint.
 *
 * Who is ready for this operational period, who is not, and exactly which
 * competency is holding each person back - measured at the event's start date
 * so there is still time to act on it.
 */

const STATE_ORDER: PersonReadiness['state'][] = ['CRITICAL', 'AT_RISK', 'NEEDS_PREPARATION', 'READY'];

function PeopleTable({ people }: { people: PersonReadiness[] }) {
  const [filter, setFilter] = useState<PersonReadiness['state'] | 'ALL'>('ALL');
  const shown = filter === 'ALL' ? people : people.filter((person) => person.state === filter);
  const counts = Object.fromEntries(STATE_ORDER.map((state) => [state, people.filter((person) => person.state === state).length])) as Record<PersonReadiness['state'], number>;

  return (
    <Card
      title="Everyone this event applies to"
      description="Sorted by how far short they are. Each shortfall is the level that competency will have decayed to by the start date."
      action={
        <div className="flex flex-wrap gap-1">
          <Button size="sm" variant={filter === 'ALL' ? 'primary' : 'ghost'} onClick={() => setFilter('ALL')}>
            All {people.length}
          </Button>
          {STATE_ORDER.filter((state) => counts[state] > 0).map((state) => (
            <Button key={state} size="sm" variant={filter === state ? 'primary' : 'ghost'} onClick={() => setFilter(state)}>
              {READINESS_STATE_META[state].label} {counts[state]}
            </Button>
          ))}
        </div>
      }
      padded={false}
    >
      {shown.length === 0 ? (
        <div className="p-5">
          <EmptyState title="Nobody in this group" description="Choose another filter to see the rest of the workforce." />
        </div>
      ) : (
        <DataTable caption="Readiness by person">
          <thead>
            <tr>
              <Th>Person</Th>
              <Th>Department</Th>
              <Th align="right">Ready</Th>
              <Th>State</Th>
              <Th>Short on</Th>
            </tr>
          </thead>
          <tbody>
            {shown.map((person) => {
              const meta = READINESS_STATE_META[person.state];
              return (
                <tr key={person.userId}>
                  <Td>
                    <Link to={`/admin/users/${person.userId}`} className="font-semibold text-navy hover:text-sky-deep">
                      {person.userName}
                    </Link>
                    <span className="block text-[11px] text-slate-500">{person.jobRoleName ?? 'No job role'}</span>
                  </Td>
                  <Td>{person.departmentName ?? '-'}</Td>
                  <Td align="right">
                    <strong className="text-navy">{person.readiness}%</strong>
                  </Td>
                  <Td>
                    <Badge tone={meta.tone}>{meta.label}</Badge>
                  </Td>
                  <Td>
                    {person.shortfalls.length === 0 ? (
                      <span className="text-xs text-slate-500">Nothing</span>
                    ) : (
                      <ul className="space-y-1">
                        {person.shortfalls.slice(0, 3).map((shortfall) => (
                          <li key={shortfall.competencyId} className="flex flex-wrap items-center gap-1.5 text-xs">
                            <span className="font-semibold text-navy">{shortfall.competencyName}</span>
                            <span className="text-slate-500">
                              {shortfall.freshness.effectiveLevel}% of {shortfall.requiredLevel}%
                            </span>
                            <FreshnessBadge status={shortfall.freshness.status} title={shortfall.freshness.reason} />
                          </li>
                        ))}
                        {person.shortfalls.length > 3 && <li className="text-[11px] text-slate-500">and {person.shortfalls.length - 3} more</li>}
                      </ul>
                    )}
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </DataTable>
      )}
    </Card>
  );
}

function AssignmentsCard({ eventId }: { eventId: string }) {
  const assignments = useQuery({ queryKey: keys.eventAssignments(eventId), queryFn: () => fetchEventAssignments(eventId) });
  return (
    <Card title="Preparation assigned" description="What people have been asked to work on before this event" padded={false}>
      {(assignments.data ?? []).length === 0 ? (
        <div className="p-5">
          <EmptyState title="Nothing assigned yet" description="Use 'Assign preparation' to give everyone who is short a named competency to work on." icon={<ClipboardList size={18} />} />
        </div>
      ) : (
        <DataTable caption="Preparation assignments">
          <thead>
            <tr>
              <Th>Person</Th>
              <Th>Competency</Th>
              <Th>Status</Th>
              <Th>Assigned</Th>
            </tr>
          </thead>
          <tbody>
            {(assignments.data ?? []).map((assignment) => {
              const meta = ASSIGNMENT_STATUS_META[assignment.status];
              return (
                <tr key={assignment.id}>
                  <Td>{assignment.user.name}</Td>
                  <Td>{assignment.competency.name}</Td>
                  <Td>
                    <Badge tone={meta.tone}>{meta.label}</Badge>
                  </Td>
                  <Td>{formatDate(assignment.assignedAt)}</Td>
                </tr>
              );
            })}
          </tbody>
        </DataTable>
      )}
    </Card>
  );
}

function Sprint({ report, offsetDays, onOffset }: { report: EventReadinessReport; offsetDays: number; onOffset: (days: number) => void }) {
  const confirm = useConfirm();
  const { event } = report;
  const hazard = HAZARD_META[event.hazardType];

  const assign = useApiMutation({
    mutationFn: () => assignPreparation(event.id),
    successMessage: (result) =>
      result.created === 0
        ? 'Everyone who is short already has preparation assigned.'
        : `Preparation assigned for ${result.created} competency gap(s); ${result.notified} person(s) notified.`,
    invalidate: [keys.eventAssignments(event.id), keys.readinessEventsAll],
  });

  const onAssign = async () => {
    const ok = await confirm({
      title: 'Assign preparation?',
      message: `Everyone short of a competency this event needs will be given it to work on, and notified. Running this again only adds people who have fallen behind since.`,
      confirmLabel: 'Assign preparation',
    });
    if (ok) assign.mutate();
  };

  return (
    <div className="animate-fade-in space-y-6">
      <Link to="/admin/readiness/events" className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-sky-deep">
        <ArrowLeft size={14} aria-hidden /> Readiness calendar
      </Link>

      <PageHeader
        eyebrow={`${hazard.label} · ${formatDate(event.startDate)} – ${formatDate(event.endDate)}`}
        title={event.name}
        description={event.description ?? 'Readiness measured at the date this period begins.'}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {event.isSimulation && <Badge tone="purple">Simulated event</Badge>}
            <Button loading={assign.isPending} onClick={() => void onAssign()} leftIcon={<Target size={15} />}>
              Assign preparation
            </Button>
          </div>
        }
      />

      <ReadinessTimeTravel value={offsetDays} onChange={onOffset} />
      <SimulationBanner asOf={report.asOf} />

      <p className="text-sm text-slate-600">{report.reason}</p>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Workforce ready" value={`${report.workforceReady}%`} meta={`${report.readyCount} of ${report.totalPeople} people`} icon={<CheckCircle2 size={18} />} tone="teal" />
        <StatCard label="Average readiness" value={`${report.averageReadiness}%`} meta="Weighted by importance" icon={<Users size={18} />} tone="sky" />
        <StatCard label="Need preparation" value={report.needingPreparation} meta={`${report.atRiskCount} at risk`} icon={<ClipboardList size={18} />} tone="amber" />
        <StatCard label="Critical" value={report.criticalCount} meta="Expired or far below" icon={<AlertTriangle size={18} />} tone="coral" />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card title="Measured at" description="Readiness is a question about the start date, not about today" className="lg:col-span-1">
          <p className="font-display text-2xl font-bold text-navy">{formatDate(report.measuredAt)}</p>
          <p className="mt-1 text-sm text-slate-600">
            <CalendarClock size={14} className="mr-1 inline" aria-hidden />
            {report.daysUntilStart > 0 ? `${report.daysUntilStart} days of preparation time remain.` : 'This period has begun.'}
          </p>
          <dl className="mt-4 space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-slate-500">Departments</dt>
              <dd className="font-semibold text-navy">{event.departments.length === 0 ? 'Whole workforce' : event.departments.map((entry) => entry.department.name).join(', ')}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500">Priority</dt>
              <dd className="font-semibold text-navy">{event.priority} of 5</dd>
            </div>
          </dl>
        </Card>

        <Card title="What this period depends on" description="The level each competency must reach by the start date" className="lg:col-span-2">
          <ul className="space-y-3">
            {event.requirements.map((requirement) => {
              const weakness = report.weakestCompetencies.find((item) => item.competencyId === requirement.competencyId);
              const shortShare = report.totalPeople === 0 ? 0 : Math.round(((weakness?.peopleShort ?? 0) / report.totalPeople) * 100);
              return (
                <li key={requirement.competencyId}>
                  <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                    <span className="font-semibold text-navy">
                      {requirement.competency.name}
                      <span className="ml-2 text-xs font-normal text-slate-500">needs {requirement.requiredLevel}% · importance {requirement.importance}/5</span>
                    </span>
                    <span className="text-xs text-slate-500">
                      {weakness ? `${weakness.peopleShort} short by ${weakness.averageShortfall} points on average` : 'Everyone meets this'}
                    </span>
                  </div>
                  <ProgressBar value={100 - shortShare} color={shortShare > 50 ? 'red' : shortShare > 20 ? 'amber' : 'green'} height="h-1.5" label={`${requirement.competency.name} coverage`} />
                </li>
              );
            })}
          </ul>
        </Card>
      </div>

      <PeopleTable people={report.people} />
      <AssignmentsCard eventId={event.id} />
    </div>
  );
}

export default function ReadinessEventPage() {
  const { eventId = '' } = useParams();
  const [offsetDays, setOffsetDays] = useState(0);
  const query = useQuery({ queryKey: keys.eventReadiness(eventId, offsetDays), queryFn: () => fetchEventReadiness(eventId, offsetDays), enabled: Boolean(eventId) });
  usePageTitle(query.data?.event.name ?? 'Readiness sprint');
  return <QueryBoundary query={query}>{(report) => <Sprint report={report} offsetDays={offsetDays} onOffset={setOffsetDays} />}</QueryBoundary>;
}
