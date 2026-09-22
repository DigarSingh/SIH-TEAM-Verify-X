import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, Gauge, Star, UsersRound } from 'lucide-react';
import { keys } from '../../../api/keys';
import { CHART_COLORS, Columns, HorizontalBars, TrendChart } from '../../../charts';
import { QueryBoundary } from '../../../components/domain/QueryBoundary';
import { Card, DataTable, EmptyState, StatCard, Td, Th } from '../../../components/ui';
import { fetchCourseAnalytics } from '../../../services/trainer';
import type { CourseAnalytics } from '../../../types';
import { formatPercent } from '../../../utils/format';

function Analytics({ data }: { data: CourseAnalytics }) {
  const { assessment } = data;
  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Enrolled" value={data.enrollments.total} meta={`${data.enrollments.active} currently learning`} icon={<UsersRound size={19} />} tone="sky" />
        <StatCard label="Completion rate" value={formatPercent(data.completionRate)} meta="Completed or certified" icon={<CheckCircle2 size={19} />} tone="green" />
        <StatCard label="Average progress" value={formatPercent(data.averageProgress)} meta="Across active learners" icon={<Gauge size={19} />} tone="teal" />
        <StatCard label="Learner rating" value={data.feedback.count ? data.feedback.averageRating.toFixed(1) : '-'} meta={`${data.feedback.count} review${data.feedback.count === 1 ? '' : 's'}`} icon={<Star size={19} />} tone="amber" />
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Card title="Enrollments and completions" description="Per month">
          {data.timeline.length === 0 ? (
            <p className="py-10 text-center text-sm text-slate-500">No enrollment history yet.</p>
          ) : (
            <TrendChart
              data={data.timeline.map((point) => ({ month: point.month, enrolled: point.enrolled, completed: point.completed }))}
              series={[
                { key: 'enrolled', name: 'Enrolled', color: CHART_COLORS.sky },
                { key: 'completed', name: 'Completed', color: CHART_COLORS.green },
              ]}
            />
          )}
        </Card>
        <Card title="Module funnel" description="How many learners completed each module">
          {data.moduleFunnel.length === 0 ? (
            <p className="py-10 text-center text-sm text-slate-500">This course has no modules yet.</p>
          ) : (
            <Columns data={data.moduleFunnel.map((row, index) => ({ label: `M${index + 1}`, completed: row.completed }))} xKey="label" series={[{ key: 'completed', name: 'Learners who completed it', color: CHART_COLORS.sky }]} />
          )}
          <ol className="mt-3 space-y-1 text-xs text-slate-500">
            {data.moduleFunnel.map((row, index) => (
              <li key={row.moduleId}>
                <strong className="text-navy">M{index + 1}</strong> {row.title}
              </li>
            ))}
          </ol>
        </Card>
      </div>

      <section aria-labelledby="assessment-analytics">
        <h2 id="assessment-analytics" className="mb-4 font-display text-lg font-bold text-navy">
          Assessment performance
        </h2>
        {!assessment || assessment.attempts === 0 ? (
          <EmptyState title="No assessment results yet" description="Results and question statistics appear once learners submit the assessment." />
        ) : (
          <div className="space-y-6">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <StatCard label="Attempts" value={assessment.attempts} meta={`${assessment.learners} learners`} icon={<UsersRound size={19} />} tone="sky" />
              <StatCard label="Pass rate" value={formatPercent(assessment.passRate)} meta={`${assessment.passedLearners} learners passed`} icon={<CheckCircle2 size={19} />} tone="green" />
              <StatCard label="Average score" value={formatPercent(assessment.averageScore)} meta={`Range ${formatPercent(assessment.lowestScore)} to ${formatPercent(assessment.highestScore)}`} icon={<Gauge size={19} />} tone="teal" />
              <StatCard label="Average time" value={assessment.averageTimeMinutes !== null ? `${assessment.averageTimeMinutes} min` : '-'} icon={<Gauge size={19} />} tone="purple" />
            </div>
            <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
              <Card title="Score distribution">
                <Columns data={assessment.distribution.map((bucket) => ({ label: bucket.label, count: bucket.count }))} xKey="label" series={[{ key: 'count', name: 'Attempts', color: CHART_COLORS.violet }]} />
              </Card>
              <Card title="Question difficulty" description="Share of learners who answered each question correctly" padded={false}>
                <DataTable caption="Question statistics">
                  <thead>
                    <tr>
                      <Th>#</Th>
                      <Th>Question</Th>
                      <Th align="right">Correct</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {assessment.questions.map((question) => (
                      <tr key={question.questionId}>
                        <Td>{question.position + 1}</Td>
                        <Td className="max-w-[260px] truncate" >
                          <span title={question.text}>{question.text}</span>
                        </Td>
                        <Td align="right">
                          {question.correctRate === null ? (
                            '-'
                          ) : (
                            <strong className={question.correctRate < 50 ? 'text-orange-700' : 'text-navy'}>{formatPercent(question.correctRate)}</strong>
                          )}
                        </Td>
                      </tr>
                    ))}
                  </tbody>
                </DataTable>
              </Card>
            </div>
          </div>
        )}
      </section>

      <Card title="Competency impact" description="Average points gained by learners who passed">
        {data.competencyImpact.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate-500">No competency has changed through this course yet.</p>
        ) : (
          <HorizontalBars
            data={data.competencyImpact.map((row) => ({ name: row.competencyName, gain: row.averageGain }))}
            nameKey="name"
            series={[{ key: 'gain', name: 'Average gain (points)', color: CHART_COLORS.teal }]}
            domain={[0, Math.max(20, ...data.competencyImpact.map((row) => row.averageGain))]}
            nameWidth={160}
            height={Math.max(160, data.competencyImpact.length * 48)}
          />
        )}
      </Card>
    </div>
  );
}

export function AnalyticsTab({ courseId }: { courseId: string }) {
  const query = useQuery({ queryKey: keys.courseAnalytics(courseId), queryFn: () => fetchCourseAnalytics(courseId) });
  return <QueryBoundary query={query}>{(data) => <Analytics data={data} />}</QueryBoundary>;
}
