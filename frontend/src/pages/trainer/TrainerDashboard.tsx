import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, BookOpen, ClipboardCheck, TrendingUp, UsersRound } from 'lucide-react';
import { Link } from 'react-router-dom';
import { keys } from '../../api/keys';
import { HorizontalBars, LineTrend } from '../../charts';
import { CourseStatusBadge, DifficultyBadge } from '../../components/domain/badges';
import { QueryBoundary } from '../../components/domain/QueryBoundary';
import { ButtonLink, Card, DataTable, EmptyState, PageHeader, ProgressBar, StatCard, Td, Th } from '../../components/ui';
import { usePageTitle } from '../../hooks/misc';
import { fetchTrainerDashboard } from '../../services/trainer';
import type { TrainerDashboard as DashboardData } from '../../types';
import { formatPercent, timeAgo } from '../../utils/format';

function Dashboard({ data }: { data: DashboardData }) {
  const { metrics } = data;
  const trend = data.scoreTrend.map((point) => ({ month: point.month, score: point.averageScore }));
  return (
    <div className="animate-fade-in">
      <PageHeader
        eyebrow="Trainer workspace"
        title="Training overview"
        description="How your courses are performing: who is learning, how they score, and how much their competencies improve."
        actions={
          <ButtonLink to="/trainer/courses?new=1" leftIcon={<BookOpen size={16} />}>
            New course
          </ButtonLink>
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Active courses" value={metrics.activeCourses} meta={`${metrics.draftCourses} draft${metrics.draftCourses === 1 ? '' : 's'}`} icon={<BookOpen size={19} />} tone="sky" />
        <StatCard label="Trainees" value={metrics.totalTrainees} meta={`${metrics.awaitingAssessment} awaiting assessment`} icon={<UsersRound size={19} />} tone="teal" />
        <StatCard label="Completion rate" value={formatPercent(metrics.completionRate)} meta="Of all enrollments" icon={<ClipboardCheck size={19} />} tone="green" />
        <StatCard
          label="Average score"
          value={formatPercent(metrics.averageScore)}
          meta={`Pass rate ${formatPercent(metrics.passRate)}`}
          icon={<TrendingUp size={19} />}
          tone="purple"
          trend={metrics.averageCompetencyGain !== null ? `+${metrics.averageCompetencyGain} pts competency` : undefined}
        />
      </div>

      <div className="mt-8 grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Card title="Assessment scores over time" description="Average score per month across your courses">
          {trend.every((point) => point.score === null) ? (
            <p className="py-10 text-center text-sm text-slate-500">No assessment has been submitted yet.</p>
          ) : (
            <LineTrend data={trend} series={[{ key: 'score', name: 'Average score', color: '#2D8CFF' }]} />
          )}
        </Card>
        <Card title="Competency improvement" description="Average points gained by learners who completed your courses">
          {data.competencyImprovement.length === 0 ? (
            <p className="py-10 text-center text-sm text-slate-500">Competency gains appear once learners pass an assessment.</p>
          ) : (
            <HorizontalBars
              data={data.competencyImprovement.map((row) => ({ name: row.competencyName, gain: row.averageGain }))}
              nameKey="name"
              series={[{ key: 'gain', name: 'Average gain (points)', color: '#0EA5A8' }]}
              domain={[0, Math.max(20, ...data.competencyImprovement.map((row) => row.averageGain))]}
              nameWidth={150}
              height={Math.max(200, data.competencyImprovement.length * 46)}
            />
          )}
        </Card>
      </div>

      <div className="mt-8 grid grid-cols-1 gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2" title="Your courses" padded={false} action={<Link to="/trainer/courses" className="text-xs font-bold text-sky-deep hover:text-navy">Manage all →</Link>}>
          {data.courses.length === 0 ? (
            <div className="p-5">
              <EmptyState title="You have no courses yet" description="Create your first course to start training colleagues." action={<ButtonLink to="/trainer/courses?new=1">Create a course</ButtonLink>} />
            </div>
          ) : (
            <DataTable caption="Your courses">
              <thead>
                <tr>
                  <Th>Course</Th>
                  <Th>Enrolled</Th>
                  <Th>Progress</Th>
                  <Th>Completion</Th>
                  <Th align="right">Avg score</Th>
                </tr>
              </thead>
              <tbody>
                {data.courses.map((course) => (
                  <tr key={course.id} className="hover:bg-slate-50/60">
                    <Td>
                      <Link to={`/trainer/courses/${course.id}`} className="font-semibold text-navy hover:text-sky-deep">
                        {course.title}
                      </Link>
                      <div className="mt-1 flex items-center gap-1.5">
                        <CourseStatusBadge status={course.status} />
                        <DifficultyBadge difficulty={course.difficulty} />
                        {!course.hasAssessment && <span className="text-[11px] font-semibold text-amber-700">No assessment</span>}
                      </div>
                    </Td>
                    <Td>{course.enrolled}</Td>
                    <Td className="min-w-[130px]">
                      <ProgressBar value={course.averageProgress} showLabel label={`${course.title} average progress`} />
                    </Td>
                    <Td>{formatPercent(course.completionRate)}</Td>
                    <Td align="right">{course.averageScore !== null ? <strong className="text-navy">{formatPercent(course.averageScore)}</strong> : <span className="text-slate-500">-</span>}</Td>
                  </tr>
                ))}
              </tbody>
            </DataTable>
          )}
        </Card>

        <div className="space-y-6">
          <Card title="Needs attention" description="Learners who have stalled">
            {data.needsAttention.length === 0 ? (
              <p className="text-sm text-slate-500">Everyone is making progress.</p>
            ) : (
              <ul className="space-y-4">
                {data.needsAttention.map((row) => (
                  <li key={`${row.userId}-${row.courseId}`} className="flex gap-3">
                    <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-50 text-amber-700" aria-hidden>
                      <AlertTriangle size={15} />
                    </span>
                    <div className="min-w-0">
                      <Link to={`/trainer/trainees/${row.userId}`} className="text-sm font-bold text-navy hover:text-sky-deep">
                        {row.name}
                      </Link>
                      <p className="truncate text-xs text-slate-500">
                        {row.courseTitle} · {row.progress}% complete
                      </p>
                      <p className="text-xs text-slate-500">Last active {timeAgo(row.lastActiveAt)}</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card title="Recent activity">
            {data.recentActivity.length === 0 ? (
              <p className="text-sm text-slate-500">Activity from your learners will appear here.</p>
            ) : (
              <ol className="relative space-y-4 border-l border-slate-100 pl-5">
                {data.recentActivity.map((item, index) => (
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

export default function TrainerDashboard() {
  usePageTitle('Dashboard');
  const query = useQuery({ queryKey: keys.dashboardTrainer, queryFn: fetchTrainerDashboard });
  return <QueryBoundary query={query}>{(data) => <Dashboard data={data} />}</QueryBoundary>;
}
