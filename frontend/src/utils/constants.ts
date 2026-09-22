import type {
  AssessmentState,
  Difficulty,
  EnrollmentStatus,
  FreshnessStatus,
  HazardType,
  LearningStatus,
  LevelBand,
  NotificationType,
  PriorityLevel,
  ReadinessAssignmentStatus,
  ReadinessEventStatus,
  ReadinessState,
  Role,
  Severity,
} from '../types';

export type Tone = 'neutral' | 'success' | 'warning' | 'danger' | 'info' | 'purple' | 'orange';

export const SEVERITY_META: Record<Severity, { label: string; tone: Tone; hex: string; range: string }> = {
  LOW: { label: 'Low', tone: 'success', hex: '#10B981', range: '0-10' },
  MODERATE: { label: 'Moderate', tone: 'warning', hex: '#F59E0B', range: '11-25' },
  HIGH: { label: 'High', tone: 'orange', hex: '#EA6A47', range: '26-50' },
  CRITICAL: { label: 'Critical', tone: 'danger', hex: '#DC2626', range: '51+' },
};

/** Hazard seasons an operational readiness sprint can prepare for. */
export const HAZARD_META: Record<HazardType, { label: string; tone: Tone }> = {
  MONSOON: { label: 'Monsoon', tone: 'info' },
  CYCLONE: { label: 'Cyclone', tone: 'danger' },
  HEATWAVE: { label: 'Heatwave', tone: 'orange' },
  FLOOD: { label: 'Flood', tone: 'info' },
  WINTER: { label: 'Winter', tone: 'purple' },
  THUNDERSTORM: { label: 'Thunderstorm', tone: 'warning' },
  OTHER: { label: 'Other', tone: 'neutral' },
};

/** How ready one person is for one event. */
export const READINESS_STATE_META: Record<ReadinessState, { label: string; tone: Tone }> = {
  READY: { label: 'Ready', tone: 'success' },
  NEEDS_PREPARATION: { label: 'Needs preparation', tone: 'warning' },
  AT_RISK: { label: 'At risk', tone: 'orange' },
  CRITICAL: { label: 'Critical', tone: 'danger' },
};

export const READINESS_EVENT_STATUS_META: Record<ReadinessEventStatus, { label: string; tone: Tone }> = {
  PLANNED: { label: 'Planned', tone: 'info' },
  ACTIVE: { label: 'Active', tone: 'success' },
  COMPLETED: { label: 'Completed', tone: 'neutral' },
  CANCELLED: { label: 'Cancelled', tone: 'neutral' },
};

export const ASSIGNMENT_STATUS_META: Record<ReadinessAssignmentStatus, { label: string; tone: Tone }> = {
  ASSIGNED: { label: 'Assigned', tone: 'info' },
  IN_PROGRESS: { label: 'In progress', tone: 'warning' },
  COMPLETED: { label: 'Completed', tone: 'success' },
  WAIVED: { label: 'Waived', tone: 'neutral' },
};

/**
 * Competency freshness. The wording is deliberately about maintenance rather than
 * failure: a decayed competency was earned, it just needs using again.
 */
export const FRESHNESS_META: Record<FreshnessStatus, { label: string; tone: Tone; hex: string; hint: string }> = {
  CURRENT: { label: 'Current', tone: 'success', hex: '#10B981', hint: 'Meets the requirement and is recently practised.' },
  WATCH: { label: 'Watch', tone: 'info', hex: '#2E86C1', hint: 'Slightly short, or recertification is approaching.' },
  AT_RISK: { label: 'At risk', tone: 'warning', hex: '#F59E0B', hint: 'Has decayed meaningfully below the requirement.' },
  CRITICAL: { label: 'Critical', tone: 'danger', hex: '#DC2626', hint: 'Far below the requirement, or below the minimum safe level.' },
  EXPIRED: { label: 'Expired', tone: 'purple', hex: '#7C3AED', hint: 'Past its recertification date and must be reassessed.' },
};

export const PRIORITY_META: Record<PriorityLevel, { label: string; tone: Tone; hex: string }> = {
  LOW: { label: 'Low', tone: 'success', hex: '#10B981' },
  MEDIUM: { label: 'Medium', tone: 'warning', hex: '#F59E0B' },
  HIGH: { label: 'High', tone: 'orange', hex: '#EA6A47' },
  CRITICAL: { label: 'Critical', tone: 'danger', hex: '#DC2626' },
};

/** 1-5 scales used by the priority formula (the API returns the same labels). */
export const CRITICALITY_LABEL: Record<number, string> = { 1: 'Low', 2: 'Moderate', 3: 'Significant', 4: 'High', 5: 'Critical' };
export const IMPORTANCE_LABEL: Record<number, string> = { 1: 'Minor', 2: 'Supporting', 3: 'Important', 4: 'Major', 5: 'Essential' };

export const DIFFICULTY_META: Record<Difficulty, { label: string; tone: Tone; stage: number }> = {
  BEGINNER: { label: 'Beginner', tone: 'success', stage: 1 },
  INTERMEDIATE: { label: 'Intermediate', tone: 'info', stage: 2 },
  ADVANCED: { label: 'Advanced', tone: 'purple', stage: 3 },
};

export const LEARNING_STATUS_META: Record<LearningStatus, { label: string; tone: Tone }> = {
  NOT_STARTED: { label: 'Not started', tone: 'neutral' },
  STARTED: { label: 'Started', tone: 'info' },
  IN_PROGRESS: { label: 'In progress', tone: 'info' },
  ASSESSMENT_PENDING: { label: 'Assessment pending', tone: 'warning' },
  COMPLETED: { label: 'Completed', tone: 'success' },
  CERTIFIED: { label: 'Certified', tone: 'purple' },
};

export const ENROLLMENT_STATUS_META: Record<EnrollmentStatus, { label: string; tone: Tone }> = {
  ENROLLED: { label: 'Started', tone: 'info' },
  IN_PROGRESS: { label: 'In progress', tone: 'info' },
  ASSESSMENT_PENDING: { label: 'Assessment pending', tone: 'warning' },
  COMPLETED: { label: 'Completed', tone: 'success' },
  CERTIFIED: { label: 'Certified', tone: 'purple' },
  WITHDRAWN: { label: 'Withdrawn', tone: 'neutral' },
};

export const ASSESSMENT_STATE_META: Record<AssessmentState, { label: string; tone: Tone }> = {
  LOCKED: { label: 'Locked', tone: 'neutral' },
  AVAILABLE: { label: 'Ready to take', tone: 'success' },
  IN_PROGRESS: { label: 'In progress', tone: 'info' },
  PASSED: { label: 'Passed', tone: 'purple' },
  NO_ATTEMPTS_LEFT: { label: 'No attempts left', tone: 'danger' },
  OVERDUE: { label: 'Overdue', tone: 'danger' },
};

export const ROLE_META: Record<Role, { label: string; tone: Tone }> = {
  TRAINEE: { label: 'Trainee', tone: 'info' },
  TRAINER: { label: 'Trainer', tone: 'success' },
  ADMIN: { label: 'Admin', tone: 'purple' },
};

export const LEVEL_BAND_LABEL: Record<LevelBand, string> = {
  FOUNDATION: 'Foundation',
  DEVELOPING: 'Developing',
  PROFICIENT: 'Proficient',
  EXPERT: 'Expert',
};

export const NOTIFICATION_META: Record<NotificationType, { label: string; tone: Tone }> = {
  COURSE_RECOMMENDATION: { label: 'Recommendation', tone: 'info' },
  COURSE_ENROLLMENT: { label: 'Enrollment', tone: 'success' },
  ASSESSMENT_DEADLINE: { label: 'Deadline', tone: 'warning' },
  ASSESSMENT_RESULT: { label: 'Result', tone: 'purple' },
  CERTIFICATE_ISSUED: { label: 'Certificate', tone: 'purple' },
  TRAINING_REMINDER: { label: 'Reminder', tone: 'warning' },
  ANNOUNCEMENT: { label: 'Announcement', tone: 'orange' },
  COMPETENCY_UPDATE: { label: 'Competency', tone: 'success' },
  EVALUATION_RECEIVED: { label: 'Evaluation', tone: 'info' },
  ACHIEVEMENT: { label: 'Achievement', tone: 'purple' },
  ACCOUNT: { label: 'Account', tone: 'neutral' },
};

export const COMPETENCY_SOURCE_LABEL: Record<string, string> = {
  BASELINE: 'Baseline',
  ASSESSMENT: 'Assessment',
  TRAINER_EVALUATION: 'Trainer evaluation',
  PRACTICAL: 'Practical assessment',
  ADMIN_ADJUSTMENT: 'Admin adjustment',
};

/** Why an assessment cannot be started right now (codes come from the API's availability check). */
export const AVAILABILITY_REASON: Record<string, string> = {
  NOT_PUBLISHED: 'The assessment has not been published yet.',
  NO_QUESTIONS: 'The assessment does not have any questions yet.',
  NOT_ENROLLED: 'Enroll in the course to unlock this assessment.',
  MODULES_INCOMPLETE: 'Complete every module of the course to unlock this assessment.',
  ALREADY_PASSED: 'You have already passed this assessment.',
  DEADLINE_PASSED: 'The deadline for this assessment has passed.',
  NO_ATTEMPTS_LEFT: 'You have used all of your attempts.',
};

/** What capped a competency update (the engine's `limitedBy`). */
export const LIMITED_BY_LABEL: Record<string, string> = {
  none: '',
  'no-decrease': 'Your level was kept because a single result never lowers an assessed competency.',
  'course-ceiling': 'The level is capped at the level this course is designed to develop.',
  'no-evidence': 'No new evidence, so the level did not change.',
};

/** `COURSE_PUBLISHED` → `Course published` */
export function humanizeAction(action: string): string {
  const text = action.toLowerCase().replace(/_/g, ' ');
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export const HOME_PATH: Record<Role, string> = { TRAINEE: '/trainee', TRAINER: '/trainer', ADMIN: '/admin' };

export const TONE_CLASSES: Record<Tone, string> = {
  neutral: 'bg-slate-100 text-slate-600',
  success: 'bg-emerald-50 text-emerald-700',
  warning: 'bg-amber-50 text-amber-700',
  danger: 'bg-red-50 text-red-700',
  info: 'bg-sky/10 text-sky-deep',
  purple: 'bg-violet-50 text-violet-700',
  orange: 'bg-orange-50 text-orange-700',
};

type Rgb = readonly [number, number, number];

const MIN_TEXT_CONTRAST = 4.5; // WCAG AA for normal-size text
const INK: Rgb = [16, 42, 67]; // #102A43, the app's text colour

function luminanceOf([r, g, b]: Rgb): number {
  const channel = (value: number) => {
    const scaled = value / 255;
    return scaled <= 0.03928 ? scaled / 12.92 : ((scaled + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** WCAG 2.x contrast ratio between two sRGB colours (from 1 to 21). */
export function contrastRatio(a: Rgb, b: Rgb): number {
  const [lighter, darker] = [luminanceOf(a), luminanceOf(b)].sort((x, y) => y - x) as [number, number];
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * White text where it reads well on the cell, otherwise the app's dark text colour. Between red and amber neither reaches
 * 4.5:1, so those cells are lightened a little until the dark text does: every cell stays readable and the ramp keeps its shape.
 */
function readableOn(rgb: Rgb): { background: string; color: string } {
  if (contrastRatio(rgb, [255, 255, 255]) >= MIN_TEXT_CONTRAST) return { background: `rgb(${rgb.join(', ')})`, color: '#FFFFFF' };
  let background = rgb;
  while (contrastRatio(background, INK) < MIN_TEXT_CONTRAST) {
    background = background.map((channel) => Math.min(255, channel + Math.ceil((255 - channel) * 0.05))) as unknown as Rgb;
  }
  return { background: `rgb(${background.join(', ')})`, color: '#102A43' };
}

/**
 * Heatmap colour for a competency level (0-100): a red → amber → green ramp.
 * Returns the background colour and a text colour that is readable on it.
 */
export function levelColor(value: number | null): { background: string; color: string } {
  if (value === null) return { background: '#F1F5F9', color: '#475569' };
  const stops: [number, [number, number, number]][] = [
    [30, [220, 38, 38]],
    [50, [245, 158, 11]],
    [70, [250, 204, 21]],
    [90, [34, 197, 94]],
  ];
  const v = Math.min(100, Math.max(0, value));
  let lower = stops[0]!;
  let upper = stops[stops.length - 1]!;
  for (let i = 0; i < stops.length - 1; i += 1) {
    if (v >= stops[i]![0] && v <= stops[i + 1]![0]) {
      lower = stops[i]!;
      upper = stops[i + 1]!;
      break;
    }
  }
  if (v <= stops[0]![0]) upper = lower;
  if (v >= stops[stops.length - 1]![0]) lower = upper;
  const span = upper[0] - lower[0] || 1;
  const t = Math.min(1, Math.max(0, (v - lower[0]) / span));
  const mix = (a: number, b: number) => Math.round(a + (b - a) * t);
  const [r, g, b] = [mix(lower[1][0], upper[1][0]), mix(lower[1][1], upper[1][1]), mix(lower[1][2], upper[1][2])];
  return readableOn([r, g, b]);
}

/** Heatmap colour for a skill gap (0 = none, 50+ = critical). */
export function gapColor(gap: number | null): { background: string; color: string } {
  if (gap === null) return { background: '#F1F5F9', color: '#475569' };
  return levelColor(Math.max(0, 100 - gap * 1.7));
}
