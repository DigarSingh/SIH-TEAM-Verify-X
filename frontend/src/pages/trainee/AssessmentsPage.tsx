import { useQuery } from '@tanstack/react-query';
import { ClipboardCheck } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { keys } from '../../api/keys';
import { AssessmentStateBadge } from '../../components/domain/badges';
import { QueryBoundary } from '../../components/domain/QueryBoundary';
import { ButtonLink, Card, DataTable, EmptyState, PageHeader, Segmented, Td, Th } from '../../components/ui';
import { usePageTitle } from '../../hooks/misc';
import { fetchMyAssessments } from '../../services/assessments';
import type { AssessmentState, MyAssessment } from '../../types';
import { AVAILABILITY_REASON } from '../../utils/constants';
import { daysUntil, formatDate } from '../../utils/format';

type Filter = 'all' | 'todo' | 'passed';

function action(assessment: MyAssessment) {
  if (assessment.state === 'AVAILABLE') return { label: assessment.attemptsUsed > 0 ? 'Retake' : 'Start', primary: true };
  if (assessment.state === 'IN_PROGRESS') return { label: 'Resume', primary: true };
  if (assessment.state === 'LOCKED') return { label: 'Course', primary: false, to: `/trainee/learn/${assessment.courseId}` };
  return { label: 'View results', primary: false };
}

function DeadlineCell({ iso }: { iso: string | null }) {
  if (!iso) return <span className="text-slate-500">None</span>;
  const days = daysUntil(iso);
  return (
    <span className={days <= 3 ? 'font-bold text-orange-700' : ''}>
      {formatDate(iso)}
      <span className="block text-xs font-normal text-slate-500">{days < 0 ? 'overdue' : days === 0 ? 'due today' : `in ${days} day${days === 1 ? '' : 's'}`}</span>
    </span>
  );
}

function Content({ assessments }: { assessments: MyAssessment[] }) {
  const [filter, setFilter] = useState<Filter>('all');
  const todo: AssessmentState[] = ['AVAILABLE', 'IN_PROGRESS', 'LOCKED'];
  const rows = assessments.filter((assessment) => (filter === 'all' ? true : filter === 'passed' ? assessment.state === 'PASSED' : todo.includes(assessment.state)));

  return (
    <div className="animate-fade-in">
      <PageHeader eyebrow="Trainee workspace" title="Assessments" description="Every course ends with an assessment. Passing it updates your competency levels and issues your certificate." />
      {assessments.length === 0 ? (
        <EmptyState title="No assessments yet" description="Enroll in a course to see its assessment here." icon={<ClipboardCheck size={18} />} action={<ButtonLink to="/trainee/courses">Browse the catalog</ButtonLink>} />
      ) : (
        <>
          <div className="mb-4">
            <Segmented
              label="Filter assessments"
              value={filter}
              onChange={setFilter}
              items={[
                { id: 'all', label: `All (${assessments.length})` },
                { id: 'todo', label: 'To do' },
                { id: 'passed', label: 'Passed' },
              ]}
            />
          </div>
          <Card padded={false}>
            <DataTable caption="My assessments">
              <thead>
                <tr>
                  <Th>Assessment</Th>
                  <Th>Status</Th>
                  <Th>Deadline</Th>
                  <Th>Attempts</Th>
                  <Th>Best score</Th>
                  <Th align="right">Action</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((assessment) => {
                  const next = action(assessment);
                  return (
                    <tr key={assessment.assessmentId} className="hover:bg-slate-50/60">
                      <Td>
                        <Link to={`/trainee/assessments/${assessment.assessmentId}`} className="font-semibold text-navy hover:text-sky-deep">
                          {assessment.title}
                        </Link>
                        <p className="text-xs text-slate-500">
                          {assessment.courseTitle} · {assessment.questionCount} questions{assessment.timeLimitMinutes ? ` · ${assessment.timeLimitMinutes} min` : ''} · pass at {assessment.passingScore}%
                        </p>
                        {assessment.state === 'LOCKED' && assessment.reasons[0] && <p className="mt-1 text-xs text-slate-500">{AVAILABILITY_REASON[assessment.reasons[0]] ?? assessment.reasons[0]}</p>}
                      </Td>
                      <Td>
                        <AssessmentStateBadge state={assessment.state} />
                      </Td>
                      <Td>
                        <DeadlineCell iso={assessment.deadline} />
                      </Td>
                      <Td>
                        {assessment.attemptsUsed}
                        {assessment.attemptsRemaining !== null && <span className="text-slate-500"> / {assessment.attemptsUsed + assessment.attemptsRemaining}</span>}
                      </Td>
                      <Td>{assessment.bestScore !== null ? <strong className="text-navy">{assessment.bestScore}%</strong> : <span className="text-slate-500">-</span>}</Td>
                      <Td align="right">
                        <ButtonLink to={next.to ?? `/trainee/assessments/${assessment.assessmentId}`} size="sm" variant={next.primary ? 'primary' : 'secondary'}>
                          {next.label}
                        </ButtonLink>
                      </Td>
                    </tr>
                  );
                })}
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-10 text-center text-sm text-slate-500">
                      Nothing matches this filter.
                    </td>
                  </tr>
                )}
              </tbody>
            </DataTable>
          </Card>
        </>
      )}
    </div>
  );
}

export default function AssessmentsPage() {
  usePageTitle('Assessments');
  const query = useQuery({ queryKey: keys.myAssessments, queryFn: fetchMyAssessments });
  return <QueryBoundary query={query}>{(assessments) => <Content assessments={assessments} />}</QueryBoundary>;
}
