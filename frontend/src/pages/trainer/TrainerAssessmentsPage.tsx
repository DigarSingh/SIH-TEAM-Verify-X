import { useQuery } from '@tanstack/react-query';
import { ClipboardCheck } from 'lucide-react';
import { Link } from 'react-router-dom';
import { keys } from '../../api/keys';
import { QueryBoundary } from '../../components/domain/QueryBoundary';
import { Badge, ButtonLink, Card, DataTable, EmptyState, PageHeader, Td, Th } from '../../components/ui';
import { useCurrentUser } from '../../hooks/useAuth';
import { usePageTitle } from '../../hooks/misc';
import { fetchManagedAssessments } from '../../services/assessments';
import { formatDate, formatPercent } from '../../utils/format';

/** Assessments of the courses the signed-in trainer manages (administrators see all). */
export default function TrainerAssessmentsPage() {
  usePageTitle('Assessments');
  const user = useCurrentUser();
  const base = user.role === 'ADMIN' ? '/admin' : '/trainer';
  const query = useQuery({ queryKey: keys.managedAssessments(), queryFn: () => fetchManagedAssessments() });
  return (
    <div className="animate-fade-in">
      <PageHeader eyebrow="Trainer workspace" title="Assessments" description="Every course has one assessment. Build the questions, publish it, and review how learners perform." />
      <QueryBoundary query={query}>
        {(assessments) =>
          assessments.length === 0 ? (
            <EmptyState title="No assessments yet" description="Open a course and create its assessment from the Assessment tab." icon={<ClipboardCheck size={18} />} action={<ButtonLink to={`${base}/courses`}>Go to my courses</ButtonLink>} />
          ) : (
            <Card padded={false}>
              <DataTable caption="Assessments">
                <thead>
                  <tr>
                    <Th>Assessment</Th>
                    <Th>Status</Th>
                    <Th>Questions</Th>
                    <Th>Submitted</Th>
                    <Th>Pass rate</Th>
                    <Th>Average</Th>
                    <Th>Updated</Th>
                    <Th align="right">Actions</Th>
                  </tr>
                </thead>
                <tbody>
                  {assessments.map((assessment) => (
                    <tr key={assessment.id} className="hover:bg-slate-50/60">
                      <Td>
                        <Link to={`${base}/assessments/${assessment.id}`} className="font-semibold text-navy hover:text-sky-deep">
                          {assessment.title}
                        </Link>
                        <p className="text-xs text-slate-500">
                          <Link to={`${base}/courses/${assessment.courseId}`} className="hover:text-sky-deep">
                            {assessment.courseTitle}
                          </Link>
                          {' · '}pass at {assessment.passingScore}%{assessment.timeLimitMinutes ? ` · ${assessment.timeLimitMinutes} min` : ''}
                        </p>
                      </Td>
                      <Td>{assessment.isPublished ? <Badge tone="success">Published</Badge> : <Badge tone="warning">Draft</Badge>}</Td>
                      <Td>{assessment.questionCount}</Td>
                      <Td>{assessment.attemptsSubmitted}</Td>
                      <Td>{formatPercent(assessment.passRate)}</Td>
                      <Td>{formatPercent(assessment.averageScore)}</Td>
                      <Td className="whitespace-nowrap text-xs">{formatDate(assessment.updatedAt)}</Td>
                      <Td align="right">
                        <div className="flex justify-end gap-2">
                          <ButtonLink to={`${base}/assessments/${assessment.id}`} size="sm" variant="secondary">
                            Builder
                          </ButtonLink>
                          <ButtonLink to={`${base}/assessments/${assessment.id}/results`} size="sm" variant="secondary">
                            Results
                          </ButtonLink>
                        </div>
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </DataTable>
            </Card>
          )
        }
      </QueryBoundary>
    </div>
  );
}
