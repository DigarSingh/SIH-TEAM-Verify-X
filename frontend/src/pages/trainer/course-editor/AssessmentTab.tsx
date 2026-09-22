import { ClipboardCheck } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { keys } from '../../../api/keys';
import { Badge, Button, ButtonLink, Card, EmptyState } from '../../../components/ui';
import { useApiMutation } from '../../../hooks/misc';
import { useCurrentUser } from '../../../hooks/useAuth';
import { createAssessment } from '../../../services/assessments';
import type { CourseDetail } from '../../../types';
import { formatDate } from '../../../utils/format';

export function AssessmentTab({ course }: { course: CourseDetail }) {
  const user = useCurrentUser();
  const navigate = useNavigate();
  const base = user.role === 'ADMIN' ? '/admin' : '/trainer';
  const { assessment } = course;

  const create = useApiMutation({
    mutationFn: () => createAssessment({ courseId: course.id, title: `${course.title} - Final Assessment`, passingScore: course.passingScore }),
    successMessage: 'Assessment created. Add questions to it next.',
    invalidate: [keys.course(course.id), keys.managedAssessments()],
    onSuccess: (created) => navigate(`${base}/assessments/${created.id}`),
  });

  if (!assessment) {
    return (
      <EmptyState
        title="This course has no assessment"
        description="An assessment lets learners earn a certificate and updates their competency levels. Without one, completing the modules records progress only."
        icon={<ClipboardCheck size={18} />}
        action={
          <Button loading={create.isPending} onClick={() => create.mutate()}>
            Create the assessment
          </Button>
        }
      />
    );
  }

  return (
    <Card title={assessment.title} description={assessment.description ?? 'Course assessment'} action={assessment.isPublished ? <Badge tone="success">Published</Badge> : <Badge tone="warning">Draft</Badge>}>
      <dl className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-2 lg:grid-cols-5">
        <div>
          <dt className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Questions</dt>
          <dd className="font-display text-xl font-bold text-navy">{assessment.questionCount}</dd>
        </div>
        <div>
          <dt className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Pass mark</dt>
          <dd className="font-display text-xl font-bold text-navy">{assessment.passingScore}%</dd>
        </div>
        <div>
          <dt className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Time limit</dt>
          <dd className="font-display text-xl font-bold text-navy">{assessment.timeLimitMinutes ? `${assessment.timeLimitMinutes} min` : 'None'}</dd>
        </div>
        <div>
          <dt className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Attempts</dt>
          <dd className="font-display text-xl font-bold text-navy">{assessment.maxAttempts === 0 ? 'Unlimited' : assessment.maxAttempts}</dd>
        </div>
        <div>
          <dt className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Deadline</dt>
          <dd className="font-display text-xl font-bold text-navy">{assessment.deadline ? formatDate(assessment.deadline) : 'None'}</dd>
        </div>
      </dl>
      {!assessment.isPublished && <p className="mt-4 text-sm text-amber-700">Learners cannot take the assessment until it is published.</p>}
      <div className="mt-6 flex flex-wrap gap-3">
        <ButtonLink to={`${base}/assessments/${assessment.id}`}>Open the assessment builder</ButtonLink>
        <ButtonLink to={`${base}/assessments/${assessment.id}/results`} variant="secondary">
          View results
        </ButtonLink>
      </div>
    </Card>
  );
}
