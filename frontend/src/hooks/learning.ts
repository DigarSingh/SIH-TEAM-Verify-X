import { useNavigate } from 'react-router-dom';
import { keys } from '../api/keys';
import { enrollInCourse } from '../services/learner';
import { useApiMutation } from './misc';

/** Everything that changes when a learner enrolls or makes progress. */
export const LEARNING_KEYS = [
  keys.enrollmentsAll,
  keys.coursesAll,
  keys.dashboardTrainee,
  keys.recommendations,
  keys.skillGaps,
  keys.passport,
  keys.myAssessments,
  keys.notificationsAll,
  keys.achievements,
  keys.certificates,
] as const;

/** Enroll in a course and (by default) jump straight into the course player. */
export function useEnroll(options: { goToPlayer?: boolean } = {}) {
  const navigate = useNavigate();
  const goToPlayer = options.goToPlayer ?? true;
  return useApiMutation({
    mutationFn: (courseId: string) => enrollInCourse(courseId),
    successMessage: 'You are enrolled. Happy learning!',
    invalidate: [...LEARNING_KEYS],
    onSuccess: (_data, courseId) => {
      if (goToPlayer) navigate(`/trainee/learn/${courseId}`);
    },
  });
}
