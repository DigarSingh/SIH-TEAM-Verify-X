import { useQuery } from '@tanstack/react-query';
import { CalendarClock, ClipboardList, GraduationCap, Handshake, ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { keys } from '../../api/keys';
import { QueryBoundary } from '../../components/domain/QueryBoundary';
import { FreshnessSummaryRow, ReadinessTimeTravel, RefresherPanel, SimulationBanner } from '../../components/domain/ReadinessParts';
import { Badge, Card, EmptyState, PageHeader, StatCard } from '../../components/ui';
import { usePageTitle } from '../../hooks/misc';
import { fetchSkillGaps } from '../../services/learner';
import { fetchMyMentorships, fetchMyReadinessAssignments } from '../../services/readiness';
import { ASSIGNMENT_STATUS_META, HAZARD_META } from '../../utils/constants';
import { formatDate } from '../../utils/format';

/**
 * "My operational readiness" for a trainee.
 *
 * The same engine as the administrator's dashboard, asked about one person:
 * what has faded, what has to be recertified, what an upcoming operational
 * period needs from them, and who they are paired with. The simulation control
 * is here too, because the most useful question a learner can ask is "where
 * will I be when the season starts?".
 */
export default function MyReadinessPage() {
  usePageTitle('My readiness');
  const [offsetDays, setOffsetDays] = useState(0);

  const gaps = useQuery({ queryKey: keys.skillGapsAt(offsetDays), queryFn: () => fetchSkillGaps(offsetDays) });
  const assignments = useQuery({ queryKey: keys.myReadinessAssignments, queryFn: fetchMyReadinessAssignments });
  const mentorships = useQuery({ queryKey: keys.myMentorships, queryFn: fetchMyMentorships });

  const open = (assignments.data ?? []).filter((assignment) => assignment.status !== 'COMPLETED' && assignment.status !== 'WAIVED');

  return (
    <div className="animate-fade-in space-y-6">
      <PageHeader
        eyebrow="Operational readiness"
        title="My readiness"
        description="What your competencies look like today, and what they will look like when the next operational period starts."
      />

      <ReadinessTimeTravel value={offsetDays} onChange={setOffsetDays} />

      <QueryBoundary query={gaps}>
        {(report) => {
          const freshness = report.summary.freshness;
          // `gaps` carries every requirement of the person's role, each with its freshness.
          const dueSoon = report.gaps.filter((gap) => {
            const days = gap.freshness?.daysUntilRecertification;
            return days !== null && days !== undefined && days <= 90;
          });
          return (
            <div className="space-y-6">
              <SimulationBanner asOf={report.asOf} />

              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <StatCard label="Competencies current" value={freshness ? freshness.byStatus.CURRENT : 0} meta="Meet the requirement and recently practised" icon={<ShieldCheck size={18} />} tone="teal" />
                <StatCard label="Need a refresher" value={report.refreshers.length} meta="At risk, critical or expired" icon={<GraduationCap size={18} />} tone="amber" />
                <StatCard label="Preparation assigned" value={open.length} meta="For an upcoming operational period" icon={<ClipboardList size={18} />} tone="sky" />
                <StatCard label="Recertification within 90 days" value={dueSoon.length} meta="Assessed evidence needed again" icon={<CalendarClock size={18} />} tone="purple" />
              </div>

              {freshness && (
                <Card title="How fresh my competencies are" description="Freshness is calculated from when each competency was last practised and last assessed. Nothing stored changes when you simulate a date.">
                  <FreshnessSummaryRow byStatus={freshness.byStatus} />
                </Card>
              )}

              <RefresherPanel refreshers={report.refreshers} />
            </div>
          );
        }}
      </QueryBoundary>

      <Card
        title="Preparation assigned to me"
        description="Competencies an administrator has asked you to work on before a specific operational period"
        action={open.length > 0 ? <Badge tone="warning">{open.length} open</Badge> : null}
      >
        {(assignments.data ?? []).length === 0 ? (
          <EmptyState title="Nothing assigned" description="When an operational period needs a competency you are short on, it appears here with the date it is needed by." icon={<ClipboardList size={18} />} />
        ) : (
          <ul className="space-y-3">
            {(assignments.data ?? []).map((assignment) => {
              const hazard = HAZARD_META[assignment.event.hazardType];
              const status = ASSIGNMENT_STATUS_META[assignment.status];
              return (
                <li key={assignment.id} className="rounded-xl border border-slate-100 px-4 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-navy">{assignment.competency.name}</p>
                      <p className="text-xs text-slate-500">
                        For {assignment.event.name} · {hazard.label} · starts {formatDate(assignment.event.startDate)}
                      </p>
                      {assignment.note && <p className="mt-1 text-xs text-slate-500">{assignment.note}</p>}
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge tone={status.tone}>{status.label}</Badge>
                      <Link to="/trainee/learning-path" className="text-xs font-semibold text-sky-deep hover:text-navy">
                        Find a course →
                      </Link>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <Card title="Mentorship" description="Pairings recorded to pass a competency on">
        {(mentorships.data?.asMentee.length ?? 0) === 0 && (mentorships.data?.asMentor.length ?? 0) === 0 ? (
          <EmptyState title="No mentorships" description="When you are paired with a mentor, or asked to mentor somebody, it appears here." icon={<Handshake size={18} />} />
        ) : (
          <div className="grid gap-6 md:grid-cols-2">
            <div>
              <h3 className="mb-2 text-[11px] font-bold uppercase tracking-wide text-slate-500">Learning from</h3>
              {(mentorships.data?.asMentee ?? []).length === 0 ? (
                <p className="text-sm text-slate-500">Nobody is currently mentoring you.</p>
              ) : (
                <ul className="space-y-2">
                  {(mentorships.data?.asMentee ?? []).map((mentorship) => (
                    <li key={mentorship.id} className="rounded-xl bg-slate-50 px-4 py-3 text-sm">
                      <p className="font-semibold text-navy">{mentorship.mentor.name}</p>
                      <p className="text-xs text-slate-500">
                        {mentorship.competency.name} · {mentorship.status.replace('_', ' ').toLowerCase()}
                      </p>
                      {mentorship.note && <p className="mt-1 text-xs text-slate-500">{mentorship.note}</p>}
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div>
              <h3 className="mb-2 text-[11px] font-bold uppercase tracking-wide text-slate-500">Mentoring</h3>
              {(mentorships.data?.asMentor ?? []).length === 0 ? (
                <p className="text-sm text-slate-500">You are not mentoring anyone at the moment.</p>
              ) : (
                <ul className="space-y-2">
                  {(mentorships.data?.asMentor ?? []).map((mentorship) => (
                    <li key={mentorship.id} className="rounded-xl bg-slate-50 px-4 py-3 text-sm">
                      <p className="font-semibold text-navy">{mentorship.mentee.name}</p>
                      <p className="text-xs text-slate-500">
                        {mentorship.competency.name} · {mentorship.status.replace('_', ' ').toLowerCase()}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </Card>

      <Card title="What this page is" description="So the numbers are not mistaken for something they are not">
        <ul className="space-y-2 text-sm text-slate-600">
          <li>• Freshness is a calculation from dates, using half-lives an administrator configures. It is a prompt to practise, not a judgement of your ability.</li>
          <li>• Simulating a future date changes nothing: no record is written, and your stored competency levels are untouched.</li>
          <li>• Readiness events and their half-lives in this deployment are marked as simulated where they are demonstration data.</li>
        </ul>
        <div className="mt-4 flex flex-wrap gap-3 text-sm">
          <Link to="/trainee/skill-gaps" className="font-semibold text-sky-deep hover:text-navy">
            See every competency and its gap →
          </Link>
          <Link to="/trainee/passport" className="font-semibold text-sky-deep hover:text-navy">
            Open my Competency Passport →
          </Link>
        </div>
      </Card>
    </div>
  );
}
