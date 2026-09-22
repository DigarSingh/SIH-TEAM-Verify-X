import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Award, BookOpen, Gauge, GraduationCap, Target, UserCheck, UsersRound } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { keys } from '../../api/keys';
import { CHART_COLORS, Donut, HorizontalBars, LineTrend, TrendChart } from '../../charts';
import { DifficultyBadge } from '../../components/domain/badges';
import { QueryBoundary } from '../../components/domain/QueryBoundary';
import { ButtonLink, Card, DataTable, InlineAlert, PageHeader, Segmented, StatCard, Td, Th } from '../../components/ui';
import { usePageTitle } from '../../hooks/misc';
import { fetchAdminAnalytics, fetchSkillGapAnalytics } from '../../services/admin';
import type { AdminAnalytics } from '../../types';
import { ENROLLMENT_STATUS_META, SEVERITY_META } from '../../utils/constants';
import { formatNumber, formatPercent } from '../../utils/format';

const STATUS_COLORS: Record<string, string> = { ENROLLED: '#38BDF8', IN_PROGRESS: '#2D8CFF', ASSESSMENT_PENDING: '#F59E0B', COMPLETED: '#10B981', CERTIFIED: '#8B5CF6', WITHDRAWN: '#94A3B8' };

function SeverityDonut() {
  const query = useQuery({ queryKey: keys.skillGapAnalytics({}), queryFn: () => fetchSkillGapAnalytics() });
  if (!query.data) return <p className="py-10 text-center text-sm text-slate-500">{query.isError ? 'Skill-gap data could not be loaded.' : 'Loading…'}</p>;
  const data = query.data.severityDistribution.map((row) => ({
    name: row.severity === 'MET' ? 'Requirement met' : `${SEVERITY_META[row.severity].label} gap`,
    value: row.count,
    color: row.severity === 'MET' ? '#94A3B8' : SEVERITY_META[row.severity].hex,
  }));
  return <Donut stacked height={170} data={data} center={{ value: formatPercent(query.data.readiness), label: 'readiness' }} />;
}

function Dashboard({ data, months, onMonths }: { data: AdminAnalytics; months: number; onMonths: (value: number) => void }) {
  const { metrics, trends } = data;
  const byMonth = <T extends { month: string }>(rows: T[]) => new Map(rows.map((row) => [row.month, row]));
  const enrollments = byMonth(trends.enrollments);
  const completions = byMonth(trends.completions);
  const certifications = byMonth(trends.certifications);
  const performance = byMonth(trends.assessmentPerformance);
  const competency = byMonth(trends.competency);

  const activity = trends.months.map((month) => ({ month, enrollments: enrollments.get(month)?.value ?? 0, completions: completions.get(month)?.value ?? 0, certifications: certifications.get(month)?.value ?? 0 }));
  const scores = trends.months.map((month) => ({ month, averageScore: performance.get(month)?.averageScore ?? null, passRate: performance.get(month)?.passRate ?? null }));
  const growth = trends.months.map((month) => ({ month, average: competency.get(month)?.averageCompetency ?? null }));

  return (
    <div className="animate-fade-in">
      <PageHeader
        eyebrow="Administration"
        title="Organisation overview"
        description="Live figures calculated from every employee's recorded competency evidence, enrollments and assessment results."
        actions={
          <>
            <Segmented label="Period" value={String(months)} onChange={(value) => onMonths(Number(value))} items={[{ id: '6', label: '6 months' }, { id: '12', label: '12 months' }, { id: '24', label: '24 months' }]} />
            <ButtonLink to="/admin/heatmap" leftIcon={<Target size={16} />}>
              Competency heatmap
            </ButtonLink>
          </>
        }
      />

      {metrics.pendingApprovals > 0 && (
        <InlineAlert tone="warning" className="mb-6">
          <span className="flex flex-wrap items-center justify-between gap-3">
            <span>
              <strong>{metrics.pendingApprovals}</strong> registration request{metrics.pendingApprovals === 1 ? ' is' : 's are'} waiting for your approval.
            </span>
            <Link to="/admin/users?status=PENDING" className="font-bold underline">
              Review requests →
            </Link>
          </span>
        </InlineAlert>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Employees" value={formatNumber(metrics.totalEmployees)} meta={`${metrics.trainees} trainees · ${metrics.trainers} trainers`} icon={<UsersRound size={19} />} tone="sky" />
        <StatCard label="Active learners" value={formatNumber(metrics.activeTrainees)} meta="Currently enrolled in a course" icon={<GraduationCap size={19} />} tone="teal" />
        <StatCard label="Workforce readiness" value={formatPercent(metrics.workforceReadiness)} meta={`${formatPercent(metrics.averageCompetency, 1)} average vs ${formatPercent(metrics.averageRequired, 1)} required`} icon={<Gauge size={19} />} tone="green" />
        <StatCard label="Need training" value={formatNumber(metrics.employeesRequiringTraining)} meta={`of ${formatNumber(metrics.employeesWithRole)} employees with a job role`} icon={<Target size={19} />} tone="coral" />
        <StatCard label="Published courses" value={metrics.courses} meta={`${metrics.totalCourses} in total`} icon={<BookOpen size={19} />} tone="purple" />
        <StatCard label="Enrollments" value={formatNumber(metrics.enrollments)} meta={`${formatPercent(metrics.completionRate)} completed`} icon={<UserCheck size={19} />} tone="sky" />
        <StatCard label="Certificates issued" value={formatNumber(metrics.certificatesIssued)} meta="Each independently verifiable" icon={<Award size={19} />} tone="amber" />
        <StatCard label="Assessment average" value={formatPercent(metrics.averageAssessmentScore, 1)} meta={`Pass rate ${formatPercent(metrics.assessmentPassRate, 1)}`} icon={<Gauge size={19} />} tone="teal" />
      </div>

      <div className="mt-8 grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Card title="Training activity" description="Enrollments, completions and certificates per month">
          <TrendChart
            data={activity}
            series={[
              { key: 'enrollments', name: 'Enrollments', color: CHART_COLORS.sky },
              { key: 'completions', name: 'Completions', color: CHART_COLORS.green },
              { key: 'certifications', name: 'Certificates', color: CHART_COLORS.violet },
            ]}
          />
        </Card>
        <Card title="Competency growth" description="Average competency level of all assessed employees, month by month">
          <LineTrend data={growth} series={[{ key: 'average', name: 'Average competency', color: CHART_COLORS.teal }]} />
        </Card>
        <Card title="Assessment performance" description="Average score and pass rate per month">
          <LineTrend
            data={scores}
            series={[
              { key: 'averageScore', name: 'Average score', color: CHART_COLORS.sky },
              { key: 'passRate', name: 'Pass rate', color: CHART_COLORS.amber },
            ]}
          />
        </Card>
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          <Card title="Enrollment status">
            <Donut
              stacked
              height={170}
              data={data.enrollmentStatus.map((row) => ({ name: ENROLLMENT_STATUS_META[row.status as keyof typeof ENROLLMENT_STATUS_META]?.label ?? row.status, value: row.count, color: STATUS_COLORS[row.status] ?? '#94A3B8' }))}
              center={{ value: formatNumber(metrics.enrollments), label: 'enrollments' }}
            />
          </Card>
          <Card title="Skill-gap severity" description="Every role requirement, by gap size">
            <SeverityDonut />
          </Card>
        </div>
      </div>

      <div className="mt-8 grid grid-cols-1 gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2" title="Department comparison" description="Readiness = how close employees are to the levels their roles require" padded={false}>
          <div className="px-5 pt-5">
            <HorizontalBars
              data={data.departmentComparison.map((row) => ({ name: row.department, readiness: row.readiness }))}
              nameKey="name"
              series={[{ key: 'readiness', name: 'Readiness (%)', color: CHART_COLORS.sky }]}
              nameWidth={170}
              height={Math.max(200, data.departmentComparison.length * 40)}
            />
          </div>
          <DataTable caption="Department comparison">
            <thead>
              <tr>
                <Th>Department</Th>
                <Th align="right">Employees</Th>
                <Th align="right">Avg level</Th>
                <Th align="right">Required</Th>
                <Th align="right">Need training</Th>
                <Th align="right">Completion</Th>
              </tr>
            </thead>
            <tbody>
              {data.departmentComparison.map((row) => (
                <tr key={row.departmentId} className="hover:bg-slate-50/60">
                  <Td className="font-semibold text-navy">{row.department}</Td>
                  <Td align="right">{row.employees}</Td>
                  <Td align="right">{formatPercent(row.averageCompetency, 1)}</Td>
                  <Td align="right">{formatPercent(row.averageRequired, 1)}</Td>
                  <Td align="right">{row.needingTraining}</Td>
                  <Td align="right">{formatPercent(row.completionRate)}</Td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        </Card>
        <Card title="Most popular courses" padded={false}>
          <DataTable caption="Most popular courses" className="[&_table]:min-w-0">
            <thead>
              <tr>
                <Th>Course</Th>
                <Th align="right">Enrolled</Th>
                <Th align="right">Done</Th>
              </tr>
            </thead>
            <tbody>
              {data.topCourses.map((course) => (
                <tr key={course.courseId} className="hover:bg-slate-50/60">
                  <Td>
                    <Link to={`/admin/courses/${course.courseId}`} className="font-semibold text-navy hover:text-sky-deep">
                      {course.title}
                    </Link>
                    <div className="mt-1">
                      <DifficultyBadge difficulty={course.difficulty} />
                    </div>
                  </Td>
                  <Td align="right">{course.enrollments}</Td>
                  <Td align="right">{formatPercent(course.completionRate)}</Td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        </Card>
      </div>
    </div>
  );
}

export default function AdminDashboard() {
  usePageTitle('Dashboard');
  const [months, setMonths] = useState(12);
  const query = useQuery({ queryKey: keys.adminAnalytics(months), queryFn: () => fetchAdminAnalytics(months), placeholderData: keepPreviousData });
  return <QueryBoundary query={query}>{(data) => <Dashboard data={data} months={months} onMonths={setMonths} />}</QueryBoundary>;
}
