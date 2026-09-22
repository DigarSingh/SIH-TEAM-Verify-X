import { useQuery } from '@tanstack/react-query';
import { Award, Gauge, GraduationCap, IdCard, Target } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { keys } from '../../api/keys';
import { CompetencyRadar, ReadinessRing } from '../../charts';
import { AssessmentStateBadge } from '../../components/domain/badges';
import { GapCard, RecommendationCard } from '../../components/domain/GapCard';
import { QueryBoundary } from '../../components/domain/QueryBoundary';
import { ARTrainingPanel } from '../../components/domain/ARParts';
import { Badge, ButtonLink, Card, EmptyState, PageHeader, ProgressBar, SectionLabel, StatCard } from '../../components/ui';
import { usePageTitle } from '../../hooks/misc';
import { fetchTraineeDashboard } from '../../services/learner';
import type { TraineeDashboard as DashboardData } from '../../types';
import { DIFFICULTY_META } from '../../utils/constants';
import { daysUntil, formatDate, timeAgo } from '../../utils/format';

function Deadline({ iso }: { iso: string }) {
  const days = daysUntil(iso);
  const urgent = days <= 3;
  return (
    <span className={urgent ? 'font-bold text-orange-700' : 'text-slate-500'}>
      {days < 0 ? `overdue since ${formatDate(iso)}` : days === 0 ? 'due today' : `due in ${days} day${days === 1 ? '' : 's'} (${formatDate(iso)})`}
    </span>
  );
}

function Dashboard({ data }: { data: DashboardData }) {
  const navigate = useNavigate();
  const first = data.welcome.name.replace(/^(dr|mr|mrs|ms|prof)\.?\s+/i, '').split(' ')[0];
  const highGaps = data.competency.summary.bySeverity.HIGH + data.competency.summary.bySeverity.CRITICAL;
  return (
    <div className="animate-fade-in">
      <PageHeader
        eyebrow="Trainee workspace"
        title={`Welcome back, ${first}`}
        description={
          data.welcome.jobRole
            ? `${data.welcome.jobRole.name}${data.welcome.department ? ` · ${data.welcome.department}` : ''}. Your training is prioritised by skill gap × competency importance × role criticality.`
            : 'Ask an administrator to assign your job role so your required competencies and skill gaps can be calculated.'
        }
        actions={
          <ButtonLink to="/trainee/passport" leftIcon={<IdCard size={16} />}>
            Open Competency Passport
          </ButtonLink>
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Role readiness" value={`${Math.round(data.competency.readiness)}%`} meta={`Average ${data.competency.averageCurrent}% vs ${data.competency.averageRequired}% required`} icon={<Gauge size={19} />} tone="sky" />
        <StatCard label="Skill gaps" value={data.competency.summary.withGap} meta={`${highGaps} high or critical`} icon={<Target size={19} />} tone="coral" onClick={() => navigate('/trainee/skill-gaps')} />
        <StatCard label="Courses in progress" value={data.learning.inProgress.length} meta={`${data.learning.coursesCompleted} completed`} icon={<GraduationCap size={19} />} tone="teal" />
        <StatCard label="Certificates" value={data.learning.certificates} meta="Verified by QR code" icon={<Award size={19} />} tone="purple" />
      </div>

      <div className="mt-8 grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="min-w-0 space-y-8 xl:col-span-2">
          <section aria-labelledby="gaps-heading">
            <SectionLabel action={<Link to="/trainee/skill-gaps" className="text-xs font-bold text-sky-deep hover:text-navy">All skill gaps →</Link>}>
              <span id="gaps-heading">Priority skill gaps</span>
            </SectionLabel>
            {data.topGaps.length === 0 ? (
              <EmptyState title="No skill gaps" description="You meet every competency requirement of your role. Keep learning to stay ahead." icon={<Target size={18} />} />
            ) : (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {data.topGaps.map((gap) => (
                  <GapCard key={gap.competencyId} gap={gap} compact />
                ))}
              </div>
            )}
          </section>

          <section aria-labelledby="recs-heading">
            <SectionLabel action={<Link to="/trainee/learning-path" className="text-xs font-bold text-sky-deep hover:text-navy">Full learning path →</Link>}>
              <span id="recs-heading">Recommended for you</span>
            </SectionLabel>
            {data.recommendations.length === 0 ? (
              <EmptyState title="Nothing to recommend yet" description="Recommendations appear when a published course can close one of your skill gaps." />
            ) : (
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                {data.recommendations.slice(0, 2).map((recommendation) => (
                  <RecommendationCard key={recommendation.courseId} recommendation={recommendation} />
                ))}
              </div>
            )}
          </section>

          <section aria-labelledby="ar-heading">
            <SectionLabel action={<Link to="/trainee/ar-lab" className="text-xs font-bold text-sky-deep hover:text-navy">AR Instrument Lab →</Link>}>
              <span id="ar-heading">Practical training</span>
            </SectionLabel>
            <ARTrainingPanel />
          </section>

          <section aria-labelledby="progress-heading">
            <SectionLabel action={<Link to="/trainee/my-courses" className="text-xs font-bold text-sky-deep hover:text-navy">My courses →</Link>}>
              <span id="progress-heading">Learning progress</span>
            </SectionLabel>
            {data.learning.inProgress.length === 0 ? (
              <EmptyState title="No active courses" description="Enroll in a recommended course to start closing your gaps." action={<ButtonLink to="/trainee/courses">Browse the catalog</ButtonLink>} />
            ) : (
              <Card padded={false}>
                <ul className="divide-y divide-slate-100">
                  {data.learning.inProgress.map((item) => (
                    <li key={item.enrollmentId} className="flex flex-wrap items-center gap-4 px-5 py-4">
                      <div className="min-w-0 flex-1">
                        <Link to={`/trainee/learn/${item.course.id}`} className="font-display text-sm font-bold text-navy hover:text-sky-deep">
                          {item.course.title}
                        </Link>
                        <p className="mt-0.5 text-xs text-slate-500">
                          {item.course.category} · {DIFFICULTY_META[item.course.difficulty].label}
                          {item.status === 'ASSESSMENT_PENDING' && ' · assessment pending'}
                        </p>
                        <div className="mt-2 max-w-sm">
                          <ProgressBar value={item.progress} showLabel label={`${item.course.title} progress`} color={item.status === 'ASSESSMENT_PENDING' ? 'amber' : 'sky'} />
                        </div>
                      </div>
                      <ButtonLink to={`/trainee/learn/${item.course.id}`} size="sm" variant="secondary">
                        {item.status === 'ASSESSMENT_PENDING' ? 'Take assessment' : 'Continue'}
                      </ButtonLink>
                    </li>
                  ))}
                </ul>
              </Card>
            )}
          </section>
        </div>

        <div className="space-y-6">
          <Card title="Competency profile" description="Current level against what your role requires">
            <div className="flex justify-center pb-2">
              <ReadinessRing value={data.competency.readiness} label="Readiness" />
            </div>
            <CompetencyRadar data={data.competency.radar} height={280} />
          </Card>

          <Card title="Upcoming assessments" action={<Link to="/trainee/assessments" className="text-xs font-bold text-sky-deep hover:text-navy">All</Link>}>
            {data.upcomingAssessments.length === 0 ? (
              <p className="text-sm text-slate-500">No assessments waiting. Finish a course’s modules to unlock its assessment.</p>
            ) : (
              <ul className="space-y-4">
                {data.upcomingAssessments.map((assessment) => (
                  <li key={assessment.assessmentId}>
                    <div className="flex items-start justify-between gap-2">
                      <Link to={`/trainee/assessments/${assessment.assessmentId}`} className="text-sm font-bold text-navy hover:text-sky-deep">
                        {assessment.courseTitle}
                      </Link>
                      <AssessmentStateBadge state={assessment.state} />
                    </div>
                    <p className="mt-0.5 text-xs">
                      {assessment.deadline ? <Deadline iso={assessment.deadline} /> : <span className="text-slate-500">No deadline</span>}
                      <span className="text-slate-500"> · {assessment.questionCount} questions{assessment.timeLimitMinutes ? ` · ${assessment.timeLimitMinutes} min` : ''}</span>
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title="Certificates" action={<Link to="/trainee/certificates" className="text-xs font-bold text-sky-deep hover:text-navy">All</Link>}>
            {data.certificates.length === 0 ? (
              <p className="text-sm text-slate-500">Pass a course assessment to earn your first certificate.</p>
            ) : (
              <ul className="space-y-3">
                {data.certificates.map((certificate) => (
                  <li key={certificate.id} className="flex items-center gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-violet-50 text-violet-600" aria-hidden>
                      <Award size={17} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold text-navy">{certificate.courseTitle}</p>
                      <p className="text-xs text-slate-500">{formatDate(certificate.issuedAt)}</p>
                    </div>
                    {certificate.score !== null && <Badge tone="success">{certificate.score}%</Badge>}
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title="Recent activity" description="What you did most recently">
            {data.activity.length === 0 ? (
              <p className="text-sm text-slate-500">Your activity will appear here.</p>
            ) : (
              <ol className="relative space-y-4 border-l border-slate-100 pl-5">
                {data.activity.map((item, index) => (
                  <li key={`${item.at}-${index}`} className="relative">
                    <span className="absolute -left-[25px] top-1.5 h-2.5 w-2.5 rounded-full bg-sky ring-4 ring-white" aria-hidden />
                    <p className="text-sm font-semibold text-navy">{item.title}</p>
                    <p className="text-xs text-slate-500">
                      {item.detail && <span className="mr-2 font-bold text-slate-500">{item.detail}</span>}
                      {timeAgo(item.at)}
                    </p>
                  </li>
                ))}
              </ol>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}

export default function TraineeDashboard() {
  usePageTitle('Dashboard');
  const query = useQuery({ queryKey: keys.dashboardTrainee, queryFn: fetchTraineeDashboard });
  return <QueryBoundary query={query}>{(data) => <Dashboard data={data} />}</QueryBoundary>;
}
