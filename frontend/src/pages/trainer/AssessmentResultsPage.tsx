import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { ArrowLeft, CheckCircle2, Gauge, UsersRound } from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { keys } from '../../api/keys';
import { CHART_COLORS, Columns } from '../../charts';
import { Badge, Card, DataTable, EmptyState, ErrorState, PageHeader, Pagination, Segmented, Skeleton, StatCard, Td, Th } from '../../components/ui';
import { useCurrentUser } from '../../hooks/useAuth';
import { usePageTitle } from '../../hooks/misc';
import { fetchAssessmentResults } from '../../services/assessments';
import { formatDateTime, formatPercent } from '../../utils/format';
import { paths } from '../../utils/links';

type Filter = 'all' | 'true' | 'false';

/** Results and item analysis of one assessment, for its trainer (or an administrator). */
export default function AssessmentResultsPage() {
  const { assessmentId = '' } = useParams();
  const user = useCurrentUser();
  const base = user.role === 'ADMIN' ? '/admin' : '/trainer';
  const [filter, setFilter] = useState<Filter>('all');
  const [page, setPage] = useState(1);
  const passed = filter === 'all' ? undefined : filter;
  const query = useQuery({
    queryKey: keys.assessmentResults(assessmentId, { page, passed }),
    queryFn: () => fetchAssessmentResults(assessmentId, page, passed),
    enabled: Boolean(assessmentId),
    placeholderData: keepPreviousData,
  });
  usePageTitle(query.data ? `${query.data.meta.assessment.title} - results` : 'Assessment results');

  if (query.isLoading) return <Skeleton className="h-96 rounded-2xl" />;
  if (query.isError) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;
  if (!query.data) return null;
  const { items, meta } = query.data;
  const { stats, assessment } = meta;

  return (
    <div className="animate-fade-in">
      <Link to={`${base}/assessments/${assessmentId}`} className="mb-4 inline-flex items-center gap-1.5 text-xs font-bold text-sky-deep hover:text-navy">
        <ArrowLeft size={13} aria-hidden /> Back to the assessment builder
      </Link>
      <PageHeader eyebrow={assessment.courseTitle} title={`${assessment.title}: results`} description={`Pass mark ${assessment.passingScore}%. Only submitted attempts are counted.`} />

      {stats.attempts === 0 ? (
        <EmptyState title="No attempts yet" description="Results and question statistics appear once learners submit this assessment." icon={<UsersRound size={18} />} />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Attempts" value={stats.attempts} meta={`${stats.learners} learners`} icon={<UsersRound size={19} />} tone="sky" />
            <StatCard label="Pass rate" value={formatPercent(stats.passRate)} meta={`${stats.passedLearners} learners passed`} icon={<CheckCircle2 size={19} />} tone="green" />
            <StatCard label="Average score" value={formatPercent(stats.averageScore)} meta={`${formatPercent(stats.lowestScore)} to ${formatPercent(stats.highestScore)}`} icon={<Gauge size={19} />} tone="teal" />
            <StatCard label="Average time" value={stats.averageTimeMinutes !== null ? `${stats.averageTimeMinutes} min` : '-'} icon={<Gauge size={19} />} tone="purple" />
          </div>

          <div className="mt-8 grid grid-cols-1 gap-6 xl:grid-cols-2">
            <Card title="Score distribution">
              <Columns data={stats.distribution.map((bucket) => ({ label: bucket.label, count: bucket.count }))} xKey="label" series={[{ key: 'count', name: 'Attempts', color: CHART_COLORS.violet }]} />
            </Card>
            <Card title="Question analysis" description="Questions answered correctly by fewer than half of learners are highlighted" padded={false}>
              <DataTable caption="Question statistics">
                <thead>
                  <tr>
                    <Th>#</Th>
                    <Th>Question</Th>
                    <Th align="right">Answered</Th>
                    <Th align="right">Correct</Th>
                  </tr>
                </thead>
                <tbody>
                  {stats.questions.map((question) => (
                    <tr key={question.questionId}>
                      <Td>{question.position + 1}</Td>
                      <Td className="max-w-[280px]">
                        <span className="line-clamp-2" title={question.text}>
                          {question.text}
                        </span>
                      </Td>
                      <Td align="right">{question.answers}</Td>
                      <Td align="right">{question.correctRate === null ? '-' : <strong className={question.correctRate < 50 ? 'text-orange-700' : 'text-navy'}>{formatPercent(question.correctRate)}</strong>}</Td>
                    </tr>
                  ))}
                </tbody>
              </DataTable>
            </Card>
          </div>

          <section className="mt-8" aria-labelledby="attempts-heading">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <h2 id="attempts-heading" className="font-display text-lg font-bold text-navy">
                Attempts
              </h2>
              <Segmented
                label="Filter attempts"
                value={filter}
                onChange={(value) => {
                  setFilter(value);
                  setPage(1);
                }}
                items={[
                  { id: 'all', label: 'All' },
                  { id: 'true', label: 'Passed' },
                  { id: 'false', label: 'Not passed' },
                ]}
              />
            </div>
            <Card padded={false}>
              <DataTable caption="Attempts">
                <thead>
                  <tr>
                    <Th>Learner</Th>
                    <Th>Attempt</Th>
                    <Th>Submitted</Th>
                    <Th>Score</Th>
                    <Th>Result</Th>
                    <Th align="right">Review</Th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((attempt) => (
                    <tr key={attempt.id} className="hover:bg-slate-50/60">
                      <Td>
                        <Link to={paths.employee(user.role, attempt.learner.id)} className="font-semibold text-navy hover:text-sky-deep">
                          {attempt.learner.name}
                        </Link>
                        <p className="text-xs text-slate-500">{[attempt.learner.department, attempt.learner.employeeId].filter(Boolean).join(' · ')}</p>
                      </Td>
                      <Td>#{attempt.attemptNumber}</Td>
                      <Td className="whitespace-nowrap text-xs">{formatDateTime(attempt.submittedAt)}</Td>
                      <Td>
                        <strong className="text-navy">{formatPercent(attempt.percentage)}</strong>{' '}
                        <span className="text-xs text-slate-500">
                          ({attempt.score}/{attempt.totalMarks})
                        </span>
                      </Td>
                      <Td>{attempt.passed ? <Badge tone="success">Passed</Badge> : <Badge tone="danger">Not passed</Badge>}</Td>
                      <Td align="right">
                        <Link to={`${base}/attempts/${attempt.id}`} className="text-xs font-bold text-sky-deep hover:text-navy">
                          View answers
                        </Link>
                      </Td>
                    </tr>
                  ))}
                  {items.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-4 py-10 text-center text-sm text-slate-500">
                        No attempts match this filter.
                      </td>
                    </tr>
                  )}
                </tbody>
              </DataTable>
              <Pagination meta={meta} onPage={setPage} label="Attempt pages" />
            </Card>
          </section>
        </>
      )}
    </div>
  );
}
