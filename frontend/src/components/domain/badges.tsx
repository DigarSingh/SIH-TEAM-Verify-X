import type { AssessmentState, Difficulty, EnrollmentStatus, LearningStatus, PriorityLevel, Role, Severity, CourseStatus, UserStatus } from '../../types';
import { ASSESSMENT_STATE_META, DIFFICULTY_META, ENROLLMENT_STATUS_META, LEARNING_STATUS_META, PRIORITY_META, ROLE_META, SEVERITY_META, type Tone } from '../../utils/constants';
import { Badge } from '../ui';

export const SeverityBadge = ({ severity, met }: { severity: Severity; met?: boolean }) =>
  met ? (
    <Badge tone="success" title="The role requirement is met">
      Requirement met
    </Badge>
  ) : (
    <Badge tone={SEVERITY_META[severity].tone} title={`Gap severity ${SEVERITY_META[severity].label} (${SEVERITY_META[severity].range} points)`}>
      {SEVERITY_META[severity].label} gap
    </Badge>
  );

export const PriorityBadge = ({ level, score }: { level: PriorityLevel; score?: number }) => (
  <Badge tone={PRIORITY_META[level].tone} title="Training priority = gap × importance × role criticality, normalised to 0-100">
    {PRIORITY_META[level].label} priority{score !== undefined ? ` · ${score}` : ''}
  </Badge>
);

export const DifficultyBadge = ({ difficulty }: { difficulty: Difficulty }) => <Badge tone={DIFFICULTY_META[difficulty].tone}>{DIFFICULTY_META[difficulty].label}</Badge>;

export const LearningStatusBadge = ({ status }: { status: LearningStatus }) => <Badge tone={LEARNING_STATUS_META[status].tone}>{LEARNING_STATUS_META[status].label}</Badge>;

export const EnrollmentStatusBadge = ({ status }: { status: EnrollmentStatus }) => <Badge tone={ENROLLMENT_STATUS_META[status].tone}>{ENROLLMENT_STATUS_META[status].label}</Badge>;

export const AssessmentStateBadge = ({ state }: { state: AssessmentState }) => <Badge tone={ASSESSMENT_STATE_META[state].tone}>{ASSESSMENT_STATE_META[state].label}</Badge>;

export const RoleBadge = ({ role }: { role: Role }) => <Badge tone={ROLE_META[role].tone}>{ROLE_META[role].label}</Badge>;

const COURSE_STATUS: Record<CourseStatus, { label: string; tone: Tone }> = {
  DRAFT: { label: 'Draft', tone: 'warning' },
  PUBLISHED: { label: 'Published', tone: 'success' },
  ARCHIVED: { label: 'Archived', tone: 'neutral' },
};
export const CourseStatusBadge = ({ status }: { status: CourseStatus }) => <Badge tone={COURSE_STATUS[status].tone}>{COURSE_STATUS[status].label}</Badge>;

const USER_STATUS: Record<UserStatus, { label: string; tone: Tone }> = {
  ACTIVE: { label: 'Active', tone: 'success' },
  PENDING: { label: 'Pending approval', tone: 'warning' },
  REJECTED: { label: 'Rejected', tone: 'danger' },
  SUSPENDED: { label: 'Suspended', tone: 'neutral' },
};
export const UserStatusBadge = ({ status }: { status: UserStatus }) => <Badge tone={USER_STATUS[status].tone}>{USER_STATUS[status].label}</Badge>;
export const USER_STATUS_LABEL = (status: UserStatus) => USER_STATUS[status].label;
