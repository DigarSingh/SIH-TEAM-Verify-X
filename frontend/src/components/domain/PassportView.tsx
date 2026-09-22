import { useQuery } from '@tanstack/react-query';
import { Award, ChevronDown, ClipboardCheck, GraduationCap, History, Printer, Target, TrendingUp } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { keys } from '../../api/keys';
import { CompetencyRadar, ReadinessRing } from '../../charts';
import { fetchARModules } from '../../services/ar';
import type { Passport, PassportCompetency } from '../../types';
import { cn } from '../../utils/cn';
import { COMPETENCY_SOURCE_LABEL, LEVEL_BAND_LABEL } from '../../utils/constants';
import { formatDate, formatDateTime } from '../../utils/format';
import { Avatar, Badge, Button, Card, EmptyState, ProgressBar, SectionLabel, StatCard } from '../ui';
import { PriorityBadge, SeverityBadge } from './badges';
import { CompetencyMeter, ProgressionChips, Sparkline } from './CompetencyMeter';
import { CertificateActions } from './CertificateActions';

function Timeline({ competency }: { competency: PassportCompetency }) {
  if (competency.events.length === 0) return <p className="text-xs text-slate-500">No recorded changes yet.</p>;
  return (
    <ol className="relative space-y-3 border-l border-slate-100 pl-5">
      {[...competency.events].reverse().map((event) => (
        <li key={event.id} className="relative">
          <span className={cn('absolute -left-[25px] top-1 h-2.5 w-2.5 rounded-full ring-4 ring-white', event.delta > 0 ? 'bg-emerald-500' : 'bg-slate-300')} aria-hidden />
          <p className="text-sm font-semibold text-navy">
            {event.source === 'BASELINE' ? `Baseline recorded at ${event.newLevel}%` : `${event.previousLevel}% → ${event.newLevel}%`}
            {event.delta > 0 && event.source !== 'BASELINE' && <span className="ml-2 text-xs font-bold text-emerald-700">+{event.delta}</span>}
          </p>
          <p className="text-xs text-slate-500">
            {COMPETENCY_SOURCE_LABEL[event.source] ?? event.source}
            {event.courseTitle ? ` · ${event.courseTitle}` : ''} · {formatDate(event.createdAt)}
          </p>
          {event.explanation && event.source !== 'BASELINE' && <p className="mt-1 text-xs leading-5 text-slate-500">{event.explanation}</p>}
        </li>
      ))}
    </ol>
  );
}

function CompetencyCard({ competency }: { competency: PassportCompetency }) {
  const [open, setOpen] = useState(false);
  const gained = competency.progression.length > 1 ? competency.progression[competency.progression.length - 1]! - competency.progression[0]! : 0;
  return (
    <article className="rounded-2xl border border-slate-100 bg-white p-5 shadow-card print-break-avoid" aria-label={`${competency.competencyName} competency`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="font-display text-base font-bold text-navy">{competency.competencyName}</h3>
          <p className="text-xs text-slate-500">
            {competency.category} · {LEVEL_BAND_LABEL[competency.band]}
            {!competency.assessed && ' · not yet assessed'}
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <SeverityBadge severity={competency.severity} met={competency.met} />
          {!competency.met && <PriorityBadge level={competency.priorityLevel} />}
        </div>
      </div>

      <div className="mt-6">
        <CompetencyMeter current={competency.currentLevel} required={competency.requiredLevel} severity={competency.severity} label={competency.competencyName} />
      </div>

      <div className="mt-4 flex flex-wrap items-end justify-between gap-3">
        <dl className="flex gap-5 text-sm">
          <div>
            <dt className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Current</dt>
            <dd className="font-display text-xl font-bold text-navy">{competency.currentLevel}%</dd>
          </div>
          <div>
            <dt className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Required</dt>
            <dd className="font-display text-xl font-bold text-navy">{competency.requiredLevel}%</dd>
          </div>
          <div>
            <dt className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Gap</dt>
            <dd className={cn('font-display text-xl font-bold', competency.met ? 'text-emerald-700' : 'text-orange-700')}>{competency.met ? '0%' : `${competency.gap}%`}</dd>
          </div>
        </dl>
        <Sparkline values={competency.progression} color={competency.met ? '#10B981' : '#2D8CFF'} />
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <span className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Progress</span>
        <ProgressionChips values={competency.progression} required={competency.requiredLevel} />
        {gained > 0 && (
          <Badge tone="success">
            <TrendingUp size={11} aria-hidden /> +{gained} pts
          </Badge>
        )}
      </div>

      <button type="button" onClick={() => setOpen((value) => !value)} aria-expanded={open} className="no-print mt-4 flex items-center gap-1.5 text-xs font-bold text-sky-deep hover:text-navy">
        <History size={13} aria-hidden /> {open ? 'Hide' : 'Show'} competency history ({competency.events.length}) <ChevronDown size={14} className={cn('transition', open && 'rotate-180')} aria-hidden />
      </button>
      {open && (
        <div className="mt-3 rounded-xl bg-slate-50 p-4">
          <Timeline competency={competency} />
        </div>
      )}
    </article>
  );
}

/** The Competency Passport for one employee (their own, or - for trainers and admins - a trainee's). */
/**
 * AR practicals on the passport.
 *
 * The passport's job is to show what evidence stands behind a level, so a
 * practical belongs here next to the assessments and the trainer evaluations -
 * with the date, because a practical from two years ago is a different claim
 * from one taken last week.
 */
function ARPracticalCard() {
  const modules = useQuery({ queryKey: keys.arModules(0), queryFn: () => fetchARModules(0), staleTime: 60_000 });
  const taken = (modules.data?.modules ?? []).filter((module) => module.progress.completed > 0);
  if (modules.isLoading || (modules.data && taken.length === 0)) return null;

  return (
    <Card title="AR practicals" description="Practical evidence from the instrument labs">
      <ul className="space-y-4">
        {taken.map((module) => (
          <li key={module.id} className="text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-semibold text-navy">
                {module.competency.name}
                <span className="ml-2 text-xs font-normal text-slate-500">
                  {module.title}
                  {module.progress.lastCompletedAt && ` · ${formatDate(module.progress.lastCompletedAt)}`}
                </span>
              </span>
              <Badge tone={module.progress.passed ? 'success' : 'neutral'}>{module.progress.passed ? 'Passed' : 'Attempted'}</Badge>
            </div>
            <dl className="mt-1.5 flex flex-wrap gap-x-6 gap-y-1 text-xs text-slate-600">
              <div className="flex gap-1.5">
                <dt className="text-slate-500">Practical</dt>
                <dd className="font-bold text-navy">{module.progress.bestPractical}%</dd>
              </div>
              {module.progress.lastTheory !== null && (
                <div className="flex gap-1.5">
                  <dt className="text-slate-500">Theory</dt>
                  <dd className="font-bold text-navy">{module.progress.lastTheory}%</dd>
                </div>
              )}
              {module.progress.bestScore !== null && (
                <div className="flex gap-1.5">
                  <dt className="text-slate-500">Final</dt>
                  <dd className="font-bold text-navy">{module.progress.bestScore}%</dd>
                </div>
              )}
              <div className="flex gap-1.5">
                <dt className="text-slate-500">Current level</dt>
                <dd className="font-bold text-navy">{module.standing.effectiveLevel}%</dd>
              </div>
            </dl>
            {module.standing.needsRefresher && (
              <p className="mt-1.5 text-xs text-amber-700">
                This has faded since.{' '}
                <Link to={`/trainee/ar-lab`} className="font-semibold underline">
                  An AR refresher is recommended
                </Link>
                .
              </p>
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
}

export function PassportView({ passport, viewer }: { passport: Passport; viewer: 'self' | 'other' }) {
  const { employee, summary, competencies } = passport;
  const withGap = competencies.filter((c) => !c.met);
  const focus = [...competencies].sort((a, b) => b.priorityScore - a.priorityScore || b.events.length - a.events.length)[0];
  const highPriority = competencies.filter((c) => !c.met && (c.priorityLevel === 'HIGH' || c.priorityLevel === 'CRITICAL')).length;

  return (
    <div className="animate-fade-in">
      {/* ---- hero -------------------------------------------------------------------------------------------- */}
      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-navy via-[#12305a] to-[#1b4a8c] p-6 text-white shadow-lift md:p-8 print-break-avoid" aria-label="Employee summary">
        <span aria-hidden className="absolute -right-24 -top-24 h-72 w-72 rounded-full border-[40px] border-white/[0.06]" />
        <span aria-hidden className="absolute -bottom-32 left-1/3 h-72 w-72 rounded-full border-[36px] border-sky/10" />
        <div className="relative flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-5">
            <Avatar name={employee.name} size="xl" tone="navy" />
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-sky-light">Competency Passport</p>
              <h1 className="mt-1 font-display text-3xl font-bold md:text-4xl">{employee.name}</h1>
              <p className="mt-1 text-sm text-white/70">
                {[employee.designation, employee.department?.name, employee.location].filter(Boolean).join(' · ')}
              </p>
              <div className="mt-4 flex flex-wrap items-center gap-2">
                {employee.jobRole && <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-bold">{employee.jobRole.name}</span>}
                {employee.employeeId && <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-white/80">{employee.employeeId}</span>}
                <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-white/80">Joined {formatDate(employee.joiningDate)}</span>
              </div>
              <div className="no-print mt-5 flex flex-wrap gap-2">
                <Button size="sm" variant="light" onClick={() => window.print()} leftIcon={<Printer size={14} />}>
                  Print / save as PDF
                </Button>
                {viewer === 'self' && (
                  <Link to="/trainee/skill-gaps" className="inline-flex items-center gap-2 rounded-xl bg-white/10 px-3 py-2 text-xs font-semibold text-white hover:bg-white/20">
                    <Target size={14} aria-hidden /> View skill gaps
                  </Link>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-6">
            <ReadinessRing value={summary.readiness} label="Role readiness" tone="dark" size={148} />
            <dl className="hidden gap-y-3 text-sm sm:grid">
              <div>
                <dt className="text-[10px] font-bold uppercase tracking-wide text-white/50">At target</dt>
                <dd className="font-display text-xl font-bold">
                  {summary.met} <span className="text-sm font-semibold text-white/50">of {summary.totalCompetencies}</span>
                </dd>
              </div>
              <div>
                <dt className="text-[10px] font-bold uppercase tracking-wide text-white/50">High-priority gaps</dt>
                <dd className="font-display text-xl font-bold">{highPriority}</dd>
              </div>
              <div>
                <dt className="text-[10px] font-bold uppercase tracking-wide text-white/50">Role criticality</dt>
                <dd className="font-display text-xl font-bold">{passport.jobRole ? `${passport.jobRole.criticality}/5` : '-'}</dd>
              </div>
            </dl>
          </div>
        </div>
      </section>

      {/* ---- summary tiles ------------------------------------------------------------------------------------- */}
      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Training completed" value={passport.training.coursesCompleted} meta={`${passport.training.learningHours} learning hours · ${passport.training.coursesInProgress} in progress`} icon={<GraduationCap size={19} />} tone="teal" />
        <StatCard label="Assessment average" value={passport.assessments.averageScore === null ? '-' : `${passport.assessments.averageScore}%`} meta={`${passport.assessments.passed} of ${passport.assessments.attempted} passed`} icon={<ClipboardCheck size={19} />} tone="sky" />
        <StatCard label="Certificates" value={passport.certificates.count} meta="Independently verifiable" icon={<Award size={19} />} tone="purple" />
        <StatCard label="Remaining skill gaps" value={withGap.length === 0 ? 'None' : `${summary.remainingGapPoints} pts`} meta={withGap.length === 0 ? 'Every requirement is met' : `across ${withGap.length} competenc${withGap.length === 1 ? 'y' : 'ies'}`} icon={<Target size={19} />} tone="coral" />
      </div>

      {/* ---- focus competency ------------------------------------------------------------------------------------- */}
      {focus && (
        <section className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-5" aria-label="Focus competency">
          <Card className="lg:col-span-3" title={`Focus: ${focus.competencyName}`} description={focus.met ? 'Requirement met' : 'Your highest-priority competency gap'}>
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              <div className="space-y-5">
                <div className="pt-5">
                  <CompetencyMeter current={focus.currentLevel} required={focus.requiredLevel} severity={focus.severity} height="h-4" label={focus.competencyName} />
                </div>
                <dl className="grid grid-cols-3 gap-3 text-center">
                  {[
                    ['Current', `${focus.currentLevel}%`],
                    ['Required', `${focus.requiredLevel}%`],
                    ['Gap', focus.met ? '0%' : `${focus.gap}%`],
                  ].map(([label, value]) => (
                    <div key={label} className="rounded-xl bg-slate-50 py-3">
                      <dt className="text-[10px] font-bold uppercase tracking-wide text-slate-500">{label}</dt>
                      <dd className="font-display text-2xl font-bold text-navy">{value}</dd>
                    </div>
                  ))}
                </dl>
              </div>
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Progress over time</p>
                <div className="mt-2">
                  <ProgressionChips values={focus.progression} required={focus.requiredLevel} />
                </div>
                <div className="mt-4 flex flex-wrap gap-1.5">
                  <SeverityBadge severity={focus.severity} met={focus.met} />
                  {!focus.met && <PriorityBadge level={focus.priorityLevel} score={focus.priorityScore} />}
                </div>
                <p className="mt-3 text-xs leading-5 text-slate-500">{focus.reason}</p>
              </div>
            </div>
          </Card>
          <Card className="lg:col-span-2" title="Competency profile" description="Current (filled) vs required (dashed)">
            <CompetencyRadar data={competencies.map((c) => ({ competency: c.competencyName, current: c.currentLevel, required: c.requiredLevel }))} height={270} />
          </Card>
        </section>
      )}

      {/* ---- all competencies ------------------------------------------------------------------------------------- */}
      <section className="mt-10" aria-labelledby="all-competencies">
        <SectionLabel>
          <span id="all-competencies">All competencies</span>
        </SectionLabel>
        {competencies.length === 0 ? (
          <EmptyState title="No competencies to show" description={passport.jobRole ? 'Your job role has no required competencies yet.' : 'A job role has not been assigned yet. Ask an administrator to assign one.'} />
        ) : (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {[...competencies].sort((a, b) => b.priorityScore - a.priorityScore || a.competencyName.localeCompare(b.competencyName)).map((competency) => (
              <CompetencyCard key={competency.competencyId} competency={competency} />
            ))}
          </div>
        )}
        {passport.additionalCompetencies.length > 0 && (
          <p className="mt-4 text-xs text-slate-500">
            Also assessed outside your role requirements:{' '}
            {passport.additionalCompetencies.map((c) => `${c.competencyName} (${c.currentLevel}%)`).join(', ')}.
          </p>
        )}
      </section>

      {/* ---- training, assessments, certificates -------------------------------------------------------------------- */}
      <div className="mt-10 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card title="Training" description="Courses completed and in progress">
          {passport.training.completed.length === 0 && passport.training.inProgress.length === 0 ? (
            <p className="text-sm text-slate-500">No training recorded yet.</p>
          ) : (
            <ul className="space-y-3">
              {passport.training.completed.map((course) => (
                <li key={course.courseId} className="flex items-center justify-between gap-3 text-sm">
                  <span className="min-w-0">
                    <span className="block truncate font-semibold text-navy">{course.title}</span>
                    <span className="text-xs text-slate-500">{course.category} · completed {formatDate(course.completedAt)}</span>
                  </span>
                  <Badge tone={course.status === 'CERTIFIED' ? 'purple' : 'success'}>{course.status === 'CERTIFIED' ? 'Certified' : 'Completed'}</Badge>
                </li>
              ))}
              {passport.training.inProgress.map((course) => (
                <li key={course.courseId} className="text-sm">
                  <div className="flex items-center justify-between gap-3">
                    <span className="truncate font-semibold text-navy">{course.title}</span>
                    <Badge tone={course.status === 'ASSESSMENT_PENDING' ? 'warning' : 'info'}>{course.status === 'ASSESSMENT_PENDING' ? 'Assessment pending' : 'In progress'}</Badge>
                  </div>
                  <div className="mt-1.5">
                    <ProgressBar value={course.progress} showLabel label={`${course.title} progress`} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Assessments" description={passport.assessments.averageScore === null ? 'No assessments taken yet' : `Average ${passport.assessments.averageScore}% · best ${passport.assessments.bestScore}%`}>
          {passport.assessments.recent.length === 0 ? (
            <p className="text-sm text-slate-500">Assessment results will appear here.</p>
          ) : (
            <ul className="space-y-3">
              {passport.assessments.recent.map((attempt) => (
                <li key={attempt.attemptId} className="flex items-center justify-between gap-3 text-sm">
                  <span className="min-w-0">
                    <span className="block truncate font-semibold text-navy">{attempt.courseTitle}</span>
                    <span className="text-xs text-slate-500">{formatDate(attempt.submittedAt)}</span>
                  </span>
                  <span className="flex items-center gap-2">
                    <span className="font-display font-bold text-navy">{attempt.percentage ?? '-'}%</span>
                    <Badge tone={attempt.passed ? 'success' : 'danger'}>{attempt.passed ? 'Passed' : 'Not passed'}</Badge>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Certificates" description="Every certificate carries a QR code for public verification">
          {passport.certificates.items.length === 0 ? (
            <p className="text-sm text-slate-500">Pass a course assessment to earn your first certificate.</p>
          ) : (
            <ul className="space-y-3">
              {passport.certificates.items.map((certificate) => (
                <li key={certificate.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                  <span className="min-w-0">
                    <span className="block truncate font-semibold text-navy">{certificate.courseTitle}</span>
                    <span className="font-mono text-[11px] text-slate-500">{certificate.certificateNumber}</span>
                  </span>
                  <span className="no-print flex items-center gap-2">
                    {certificate.score !== null && <Badge tone="success">{certificate.score}%</Badge>}
                    <CertificateActions certificate={certificate} compact />
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <ARPracticalCard />

        <Card title="Trainer evaluations" description="Weighted rubric scores that feed your competency levels">
          {passport.evaluations.length === 0 ? (
            <p className="text-sm text-slate-500">No trainer evaluations yet.</p>
          ) : (
            <ul className="space-y-4">
              {passport.evaluations.map((evaluation) => (
                <li key={evaluation.id} className="text-sm">
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-semibold text-navy">
                      {evaluation.trainerName}
                      <span className="ml-2 text-xs font-normal text-slate-500">{evaluation.type === 'PRACTICAL' ? 'Practical assessment' : 'Evaluation'} · {formatDateTime(evaluation.createdAt)}</span>
                    </span>
                    <Badge tone="info">{evaluation.weightedScore}%</Badge>
                  </div>
                  {evaluation.comments && <p className="mt-1 text-xs leading-5 text-slate-500">“{evaluation.comments}”</p>}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <p className="mt-8 text-xs leading-5 text-slate-500">
        How these numbers are calculated: skill gap = required level − current level; priority = gap × competency importance × role criticality, normalised to 0-100; a competency level changes only through
        assessed evidence (assessments, trainer evaluations, practical assessments) blended with the previous level. Nothing is a black-box score.
      </p>
    </div>
  );
}
