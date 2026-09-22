import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Handshake, Sparkles, UserMinus, Users } from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { keys } from '../../api/keys';
import { QueryBoundary } from '../../components/domain/QueryBoundary';
import { ReadinessTimeTravel, SimulationBanner } from '../../components/domain/ReadinessParts';
import { Badge, Button, Card, DataTable, EmptyState, PageHeader, SelectField, StatCard, Td, TextAreaField, Th, useConfirm } from '../../components/ui';
import { useApiMutation, usePageTitle } from '../../hooks/misc';
import { createMentorship, fetchSuccessionDetail, updateMentorshipStatus } from '../../services/readiness';
import type { KnowledgeRisk, Mentorship, MentorshipStatus, SuccessionHolder, SuccessionRisk } from '../../types';
import { formatDate } from '../../utils/format';

/**
 * One competency's continuity, and what can be done about it.
 *
 * The answer the platform can offer is mentorship: pair somebody who holds the
 * competency with somebody developing it. The pairing is a record of intent,
 * not an automated transfer of expertise, and the page says so.
 */

const RISK_TONE: Record<KnowledgeRisk, 'success' | 'info' | 'warning' | 'danger'> = { LOW: 'success', WATCH: 'info', HIGH: 'warning', CRITICAL: 'danger' };
const STATUS_TONE: Record<MentorshipStatus, 'neutral' | 'info' | 'success' | 'warning'> = { NOT_STARTED: 'neutral', ACTIVE: 'info', COMPLETED: 'success', CANCELLED: 'warning' };

function HolderTable({ people, caption, emptyMessage }: { people: SuccessionHolder[]; caption: string; emptyMessage: string }) {
  if (people.length === 0) return <p className="px-5 py-4 text-sm text-slate-500">{emptyMessage}</p>;
  return (
    <DataTable caption={caption}>
      <thead>
        <tr>
          <Th>Person</Th>
          <Th>Department</Th>
          <Th align="right">Level</Th>
          <Th>Retirement</Th>
        </tr>
      </thead>
      <tbody>
        {people.map((person) => (
          <tr key={person.userId}>
            <Td>
              <Link to={`/admin/users/${person.userId}`} className="font-semibold text-navy hover:text-sky-deep">
                {person.userName}
              </Link>
              <span className="block text-[11px] text-slate-500">{person.jobRoleName ?? 'No job role'}</span>
            </Td>
            <Td>{person.departmentName ?? '-'}</Td>
            <Td align="right">
              <strong className="text-navy">{person.effectiveLevel}%</strong>
            </Td>
            <Td>
              {person.retirementDate ? (
                <span className={person.leavingSoon ? 'font-semibold text-amber-700' : undefined}>
                  {formatDate(person.retirementDate)}
                  {person.daysUntilRetirement !== null && ` · ${person.daysUntilRetirement}d`}
                </span>
              ) : (
                <span className="text-slate-500">Not recorded</span>
              )}
            </Td>
          </tr>
        ))}
      </tbody>
    </DataTable>
  );
}

function PairingForm({ risk, competencyId }: { risk: SuccessionRisk; competencyId: string }) {
  const [mentorId, setMentorId] = useState('');
  const [menteeId, setMenteeId] = useState('');
  const [note, setNote] = useState('');

  const create = useApiMutation({
    mutationFn: () => createMentorship({ mentorId, menteeId, competencyId, ...(note.trim() ? { note: note.trim() } : {}) }),
    successMessage: 'Mentorship recorded. Both people can see it in their own workspace.',
    invalidate: [keys.successionDetail(competencyId, 0), ['succession']],
    onSuccess: () => {
      setMentorId('');
      setMenteeId('');
      setNote('');
    },
  });

  const mentors = risk.experts;
  const mentees = risk.developing;
  const ready = mentorId !== '' && menteeId !== '' && mentorId !== menteeId;

  if (mentors.length === 0 || mentees.length === 0) {
    return (
      <p className="text-sm text-slate-600">
        {mentors.length === 0
          ? 'Nobody currently holds this competency at expert level, so there is no one to pair as a mentor. This competency needs training or recruitment rather than mentorship.'
          : 'Nobody is currently developing this competency, so there is no one to pair as a mentee. Assign the relevant courses first.'}
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField label="Mentor" hint="Holds the competency at expert level." value={mentorId} onChange={(event) => setMentorId(event.target.value)}>
          <option value="">Choose a mentor</option>
          {mentors.map((person) => (
            <option key={person.userId} value={person.userId}>
              {person.userName} ({person.effectiveLevel}%{person.leavingSoon ? ', leaving soon' : ''})
            </option>
          ))}
        </SelectField>
        <SelectField label="Mentee" hint="Developing the competency." value={menteeId} onChange={(event) => setMenteeId(event.target.value)}>
          <option value="">Choose a mentee</option>
          {mentees.map((person) => (
            <option key={person.userId} value={person.userId}>
              {person.userName} ({person.effectiveLevel}%)
            </option>
          ))}
        </SelectField>
      </div>
      <TextAreaField label="Note" hint="Optional: what this pairing is meant to cover." rows={2} value={note} onChange={(event) => setNote(event.target.value)} />
      <Button loading={create.isPending} disabled={!ready} onClick={() => create.mutate()} leftIcon={<Handshake size={15} />}>
        Record this pairing
      </Button>
    </div>
  );
}

function MentorshipList({ mentorships, competencyId }: { mentorships: Mentorship[]; competencyId: string }) {
  const confirm = useConfirm();
  const update = useApiMutation({
    mutationFn: ({ id, status }: { id: string; status: MentorshipStatus }) => updateMentorshipStatus(id, status),
    successMessage: 'Mentorship updated.',
    invalidate: [keys.successionDetail(competencyId, 0), ['succession']],
  });

  const cancel = async (mentorship: Mentorship) => {
    const ok = await confirm({ title: 'Cancel this mentorship?', message: `${mentorship.mentor.name} and ${mentorship.mentee.name} will no longer be paired for this competency.`, confirmLabel: 'Cancel pairing', tone: 'danger' });
    if (ok) update.mutate({ id: mentorship.id, status: 'CANCELLED' });
  };

  if (mentorships.length === 0) return <EmptyState title="No mentorships recorded" description="Pair an expert with someone developing this competency to record the intent to transfer it." icon={<Handshake size={18} />} />;

  return (
    <ul className="space-y-3">
      {mentorships.map((mentorship) => (
        <li key={mentorship.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-100 px-4 py-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-navy">
              {mentorship.mentor.name} → {mentorship.mentee.name}
            </p>
            <p className="text-xs text-slate-500">
              {mentorship.startedAt ? `Started ${formatDate(mentorship.startedAt)}` : 'Not started'}
              {mentorship.completedAt && ` · completed ${formatDate(mentorship.completedAt)}`}
              {mentorship.note && ` · ${mentorship.note}`}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={STATUS_TONE[mentorship.status]}>{mentorship.status.replace('_', ' ').toLowerCase()}</Badge>
            {mentorship.status === 'NOT_STARTED' && (
              <Button size="sm" variant="secondary" loading={update.isPending} onClick={() => update.mutate({ id: mentorship.id, status: 'ACTIVE' })}>
                Mark active
              </Button>
            )}
            {mentorship.status === 'ACTIVE' && (
              <Button size="sm" variant="secondary" loading={update.isPending} onClick={() => update.mutate({ id: mentorship.id, status: 'COMPLETED' })}>
                Mark complete
              </Button>
            )}
            {mentorship.status !== 'CANCELLED' && mentorship.status !== 'COMPLETED' && (
              <Button size="sm" variant="ghost" onClick={() => void cancel(mentorship)}>
                Cancel
              </Button>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}

export default function SuccessionDetailPage() {
  const { competencyId = '' } = useParams();
  const [offsetDays, setOffsetDays] = useState(0);
  const query = useQuery({ queryKey: keys.successionDetail(competencyId, offsetDays), queryFn: () => fetchSuccessionDetail(competencyId, offsetDays), enabled: Boolean(competencyId) });
  usePageTitle(query.data?.risk.competencyName ?? 'Knowledge continuity');

  return (
    <QueryBoundary query={query}>
      {(detail) => {
        const { risk } = detail;
        return (
          <div className="animate-fade-in space-y-6">
            <Link to="/admin/succession" className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-sky-deep">
              <ArrowLeft size={14} aria-hidden /> Knowledge continuity
            </Link>

            <PageHeader
              eyebrow={`${risk.category} · criticality ${risk.criticality}/5`}
              title={risk.competencyName}
              description={risk.reason}
              actions={<Badge tone={RISK_TONE[risk.risk]}>{risk.risk.toLowerCase()} risk</Badge>}
            />

            <ReadinessTimeTravel value={offsetDays} onChange={setOffsetDays} />
            <SimulationBanner asOf={detail.asOf} />

            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <StatCard label="Experts today" value={risk.expertCount} meta={`Minimum wanted: ${risk.minimumExperts}`} icon={<Users size={18} />} tone="sky" />
              <StatCard label="Leaving" value={risk.leavingCount} meta="Retirement date on record" icon={<UserMinus size={18} />} tone="amber" />
              <StatCard label="Experts remaining" value={risk.remainingExperts} meta="Once those people leave" icon={<Users size={18} />} tone={risk.remainingExperts < risk.minimumExperts ? 'coral' : 'teal'} />
              <StatCard label="Developing" value={risk.developingCount} meta="Could become experts" icon={<Sparkles size={18} />} tone="purple" />
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
              <Card title="Who holds it" description="At or above the expert level in the engine settings" padded={false}>
                <HolderTable people={risk.experts} caption="Experts" emptyMessage="Nobody currently holds this competency at expert level." />
              </Card>
              <Card title="Who could hold it" description="Developing the competency, below expert level" padded={false}>
                <HolderTable people={risk.developing} caption="Developing" emptyMessage="Nobody is currently developing this competency." />
              </Card>
            </div>

            <Card title="Pair a mentor with a mentee" description="A record of intent to pass the competency on, not an automated transfer">
              <PairingForm risk={risk} competencyId={competencyId} />
              {detail.suggestions.length > 0 && (
                <div className="mt-5 rounded-xl bg-slate-50 px-4 py-3">
                  <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Suggested pairings</p>
                  <ul className="mt-1.5 space-y-1 text-sm text-slate-600">
                    {detail.suggestions.slice(0, 4).map((suggestion) => (
                      <li key={suggestion.mentor.userId}>
                        <strong className="text-navy">{suggestion.mentor.userName}</strong> could mentor {suggestion.candidates.slice(0, 3).map((candidate) => candidate.userName).join(', ')}
                      </li>
                    ))}
                  </ul>
                  <p className="mt-2 text-[11px] text-slate-500">Suggested by competency level alone. Whether a pairing makes sense is a judgement for a manager.</p>
                </div>
              )}
            </Card>

            <Card title="Mentorships for this competency">
              <MentorshipList mentorships={detail.mentorships} competencyId={competencyId} />
            </Card>
          </div>
        );
      }}
    </QueryBoundary>
  );
}
