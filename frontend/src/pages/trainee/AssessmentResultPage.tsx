import { useQuery } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { keys } from '../../api/keys';
import { AttemptResultView } from '../../components/domain/AttemptResult';
import { QueryBoundary } from '../../components/domain/QueryBoundary';
import { usePageTitle } from '../../hooks/misc';
import { fetchAttemptDetail } from '../../services/assessments';
import { useCurrentUser } from '../../hooks/useAuth';

/** Result of one assessment attempt. Learners see their own; trainers and admins can open any attempt they manage. */
export default function AssessmentResultPage() {
  const { attemptId = '' } = useParams();
  const user = useCurrentUser();
  const query = useQuery({ queryKey: keys.attempt(attemptId), queryFn: () => fetchAttemptDetail(attemptId), enabled: Boolean(attemptId) });
  usePageTitle('Assessment result');
  return <QueryBoundary query={query}>{(detail) => <AttemptResultView detail={detail} viewer={user.role === 'TRAINEE' ? 'learner' : 'manager'} />}</QueryBoundary>;
}
