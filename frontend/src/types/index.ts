/** API contract types (mirrors the backend responses). */

export type Role = 'TRAINEE' | 'TRAINER' | 'ADMIN';
export type UserStatus = 'PENDING' | 'ACTIVE' | 'REJECTED' | 'SUSPENDED';
export type Difficulty = 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED';
export type CourseStatus = 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
export type EnrollmentStatus = 'ENROLLED' | 'IN_PROGRESS' | 'ASSESSMENT_PENDING' | 'COMPLETED' | 'CERTIFIED' | 'WITHDRAWN';
export type LearningStatus = 'NOT_STARTED' | 'STARTED' | 'IN_PROGRESS' | 'ASSESSMENT_PENDING' | 'COMPLETED' | 'CERTIFIED';
export type Severity = 'LOW' | 'MODERATE' | 'HIGH' | 'CRITICAL';
export type PriorityLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type MaterialType = 'VIDEO' | 'DOCUMENT' | 'LINK' | 'TEXT';
export type LevelBand = 'FOUNDATION' | 'DEVELOPING' | 'PROFICIENT' | 'EXPERT';
export type QuestionType = 'SINGLE' | 'MULTIPLE';
export type AssessmentState = 'LOCKED' | 'AVAILABLE' | 'IN_PROGRESS' | 'PASSED' | 'NO_ATTEMPTS_LEFT' | 'OVERDUE';
export type NotificationType =
  | 'COURSE_RECOMMENDATION'
  | 'COURSE_ENROLLMENT'
  | 'ASSESSMENT_DEADLINE'
  | 'ASSESSMENT_RESULT'
  | 'CERTIFICATE_ISSUED'
  | 'TRAINING_REMINDER'
  | 'ANNOUNCEMENT'
  | 'COMPETENCY_UPDATE'
  | 'EVALUATION_RECEIVED'
  | 'ACHIEVEMENT'
  | 'ACCOUNT';

export interface PageMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface Paged<T, M = Record<string, unknown>> {
  items: T[];
  meta: PageMeta & M;
}

// ---- users ----------------------------------------------------------------------------------------------

export interface DepartmentRef {
  id: string;
  name: string;
  code: string;
}
export interface JobRoleRef {
  id: string;
  name: string;
  code: string;
  criticality: number;
}

export interface User {
  id: string;
  email: string;
  name: string;
  employeeId: string | null;
  phone: string | null;
  designation: string | null;
  location: string | null;
  joiningDate: string | null;
  role: Role;
  status: UserStatus;
  mustChangePassword: boolean;
  lastLoginAt: string | null;
  approvedAt: string | null;
  rejectionReason: string | null;
  createdAt: string;
  department: DepartmentRef | null;
  jobRole: JobRoleRef | null;
  unreadNotifications?: number;
}

export interface Qualification {
  id: string;
  degree: string;
  institution: string;
  fieldOfStudy: string | null;
  yearCompleted: number | null;
}
export interface WorkExperience {
  id: string;
  title: string;
  organization: string;
  location: string | null;
  startDate: string;
  endDate: string | null;
  description: string | null;
}
export interface ProfileSkill {
  id: string;
  name: string;
  proficiency: number;
}
export interface ProfessionalProfile {
  id: string;
  headline: string | null;
  bio: string | null;
  expertise: string[];
  qualifications: Qualification[];
  experiences: WorkExperience[];
  skills: ProfileSkill[];
}

export interface RegistrationOptions {
  departments: DepartmentRef[];
  roles: { id: string; name: string; code: string }[];
  registration: { requiresApproval: boolean; allowedEmailDomains: string[] };
  passwordPolicy: { minLength: number; requires: string[] };
  /** `aiProvider` names who receives the text the AI features send (for example OpenAI); null while they are off. */
  features: { ai: boolean; aiProvider: string | null };
  uploads: { maxMb: number };
}

// ---- competencies ---------------------------------------------------------------------------------------------

export interface Competency {
  id: string;
  code: string;
  name: string;
  description: string;
  category: string;
  levelDescriptors: Partial<Record<'foundation' | 'developing' | 'proficient' | 'expert', string>> | null;
  isActive: boolean;
  courseCount?: number;
  roleCount?: number;
  employeeCount?: number;
}

export interface SkillGap {
  competencyId: string;
  competencyCode: string;
  competencyName: string;
  category: string;
  requiredLevel: number;
  currentLevel: number;
  importance: number;
  roleCriticality: number;
  gap: number;
  met: boolean;
  severity: Severity;
  priorityScore: number;
  priorityLevel: PriorityLevel;
  importanceLabel: string;
  criticalityLabel: string;
  reason: string;
}

export interface CompetencyRecord extends SkillGap {
  description: string;
  lastEvidenceAt: string | null;
  assessed: boolean;
  band: LevelBand;
  freshness: Freshness;
}

// ---- competency freshness (decay & recertification) ------------------------------------------------------------------

export type FreshnessStatus = 'CURRENT' | 'WATCH' | 'AT_RISK' | 'CRITICAL' | 'EXPIRED';

export interface DecayPolicy {
  decayEnabled: boolean;
  halfLifeDays: number;
  minimumSafeLevel: number;
  recertificationIntervalDays: number;
  criticality: number;
}

/**
 * How current a competency is at the analysed date. `currentLevel` on the record
 * is the effective (decayed) level; `baselineLevel` here is the verified level it
 * decayed from.
 */
export interface Freshness {
  baselineLevel: number;
  effectiveLevel: number;
  decayPoints: number;
  requiredLevel: number;
  gap: number;
  daysSincePractice: number | null;
  lastPracticedAt: string | null;
  lastAssessedAt: string | null;
  recertificationDueAt: string | null;
  daysUntilRecertification: number | null;
  status: FreshnessStatus;
  statusLabel: string;
  needsRefresher: boolean;
  decayApplied: boolean;
  policy: DecayPolicy;
  reason: string;
}

export interface FreshnessSummary {
  total: number;
  byStatus: Record<FreshnessStatus, number>;
  needingRefresher: number;
  averageEffectiveLevel: number;
  totalDecayPoints: number;
}

/** The date an analysis describes, and whether it is a readiness simulation. */
export interface AsOf {
  date: string;
  simulated: boolean;
  offsetDays: number;
}

export interface GapSummary {
  totalCompetencies: number;
  met: number;
  withGap: number;
  averageGap: number;
  bySeverity: Record<Severity, number>;
  byPriority: Record<PriorityLevel, number>;
  needsTraining: boolean;
  averageCurrent: number;
  averageRequired: number;
  readiness: number;
  freshness: FreshnessSummary;
}

export interface TimelineEvent {
  id: string;
  competencyId: string;
  competencyName: string;
  previousLevel: number;
  newLevel: number;
  delta: number;
  source: 'BASELINE' | 'ASSESSMENT' | 'TRAINER_EVALUATION' | 'PRACTICAL' | 'ADMIN_ADJUSTMENT';
  courseTitle: string | null;
  explanation: string | null;
  createdAt: string;
}

export interface PassportCompetency extends CompetencyRecord {
  progression: number[];
  events: TimelineEvent[];
}

export interface Passport {
  employee: {
    id: string;
    name: string;
    email: string;
    employeeId: string | null;
    designation: string | null;
    location: string | null;
    joiningDate: string | null;
    department: DepartmentRef | null;
    jobRole: JobRoleRef | null;
  };
  jobRole: JobRoleRef | null;
  summary: GapSummary & { remainingGapPoints: number };
  competencies: PassportCompetency[];
  additionalCompetencies: { competencyId: string; competencyName: string; category: string; currentLevel: number; band: LevelBand }[];
  training: {
    coursesCompleted: number;
    coursesInProgress: number;
    learningHours: number;
    completed: { courseId: string; title: string; category: string; completedAt: string | null; status: EnrollmentStatus }[];
    inProgress: { courseId: string; title: string; progress: number; status: EnrollmentStatus }[];
  };
  assessments: {
    attempted: number;
    passed: number;
    averageScore: number | null;
    bestScore: number | null;
    recent: { attemptId: string; assessmentTitle: string; courseTitle: string; percentage: number | null; passed: boolean | null; submittedAt: string | null }[];
  };
  certificates: { count: number; items: { id: string; certificateNumber: string; courseTitle: string; score: number | null; issuedAt: string }[] };
  evaluations: { id: string; type: string; weightedScore: number; trainerName: string; courseTitle: string | null; comments: string | null; createdAt: string }[];
}

export interface SkillGapReportItem extends CompetencyRecord {
  recommendedCourses: { courseId: string; title: string; stage: Difficulty; status: LearningStatus; locked: boolean; coverage: number }[];
}
export interface RefresherItem {
  competencyId: string;
  competencyName: string;
  status: FreshnessStatus;
  statusLabel: string;
  baselineLevel: number;
  effectiveLevel: number;
  requiredLevel: number;
  decayPoints: number;
  daysSincePractice: number | null;
  recertificationDueAt: string | null;
  reason: string;
  courses: SkillGapReportItem['recommendedCourses'];
}

export interface SkillGapReport {
  userId: string;
  jobRole: JobRoleRef | null;
  summary: GapSummary;
  gaps: SkillGapReportItem[];
  /** Competencies that decayed rather than were never earned: maintain, not learn. */
  refreshers: RefresherItem[];
  asOf: AsOf;
}

// ---- recommendations & learning path ---------------------------------------------------------------------------------

export interface AddressedGap {
  competencyId: string;
  competencyName: string;
  currentLevel: number;
  requiredLevel: number;
  gap: number;
  priorityLevel: PriorityLevel;
  coverage: number;
  courseLevelFrom: number;
  courseLevelTo: number;
}
/** A prerequisite course that must be completed first. */
export interface BlockingCourse {
  id: string;
  title: string;
}
export interface Recommendation {
  courseId: string;
  title: string;
  difficulty: Difficulty;
  category: string;
  durationMinutes: number;
  rating: number | null;
  rank: number;
  score: number;
  status: LearningStatus;
  progress: number;
  ready: boolean;
  blockedBy: BlockingCourse[];
  addresses: AddressedGap[];
  reasons: string[];
}
export interface PathStep {
  order: number;
  stage: Difficulty;
  courseId: string;
  title: string;
  levelFrom: number | null;
  levelTo: number | null;
  coverage: number;
  status: LearningStatus;
  progress: number;
  locked: boolean;
  blockedBy: BlockingCourse[];
  addedAsPrerequisite: boolean;
}
export interface LearningPath {
  competencyId: string;
  competencyName: string;
  currentLevel: number;
  requiredLevel: number;
  gap: number;
  priorityLevel: PriorityLevel;
  priorityScore: number;
  steps: PathStep[];
  completedSteps: number;
  nextStepCourseId: string | null;
}
export interface RecommendationReport {
  jobRole: JobRoleRef | null;
  summary: GapSummary;
  recommendations: Recommendation[];
  learningPaths: LearningPath[];
}

// ---- courses -------------------------------------------------------------------------------------------------------------------

export interface CourseCompetencyRef {
  id: string;
  name: string;
  code: string;
  levelFrom: number;
  levelTo: number;
}

export interface CourseCard {
  id: string;
  title: string;
  description: string;
  category: string;
  difficulty: Difficulty;
  durationMinutes: number;
  passingScore: number;
  certificateEnabled: boolean;
  status: CourseStatus;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  thumbnailUrl: string | null;
  trainer: { id: string; name: string; designation: string | null };
  moduleCount: number;
  enrolledCount: number;
  hasAssessment: boolean;
  competencies: CourseCompetencyRef[];
  rating: { average: number; count: number };
  myEnrollment: { id: string; status: EnrollmentStatus; progress: number } | null;
}

export interface Material {
  id: string;
  title: string;
  type: MaterialType;
  mimeType: string | null;
  sizeBytes: number | null;
  position: number;
}
export interface LearningMaterial extends Material {
  url: string | null;
  content: string | null;
  fileName: string | null;
  downloadUrl: string | null;
}
export interface CourseModule {
  id: string;
  title: string;
  description: string | null;
  position: number;
  durationMinutes: number;
  materials: Material[];
}

export interface AssessmentSummary {
  id: string;
  title: string;
  description: string | null;
  isPublished: boolean;
  timeLimitMinutes: number | null;
  passingScore: number;
  maxAttempts: number;
  deadline: string | null;
  questionCount: number;
  questionBankSize?: number;
}

export interface CourseDetail extends CourseCard {
  outcomes: string[];
  canManage: boolean;
  eligibility: { allowed: boolean; code?: string; message?: string; missingPrerequisites: { id: string; title: string }[] } | null;
  modules: CourseModule[];
  prerequisites: { id: string; title: string; status: CourseStatus; completed: boolean }[];
  assessment: AssessmentSummary | null;
  feedback: { average: number; trainerAverage: number; count: number };
}

export interface Availability {
  eligible: boolean;
  reasons: string[];
  attemptsUsed: number;
  attemptsAllowed: number | null;
  attemptsRemaining: number | null;
  passed: boolean;
  bestScore: number | null;
  deadline: string | null;
  deadlinePassed: boolean;
  inProgress: { id: string; startedAt: string; expiresAt: string | null } | null;
  enrollment: { id: string; status: string; progress: number } | null;
  state: AssessmentState;
}

export interface LearnContent {
  preview: boolean;
  course: { id: string; title: string; description: string; category: string; difficulty: Difficulty; status: CourseStatus; durationMinutes: number; outcomes: string[]; certificateEnabled: boolean; trainer: { id: string; name: string; designation: string | null } };
  modules: (Omit<CourseModule, 'materials'> & { completed: boolean; materials: LearningMaterial[] })[];
  enrollment: { id: string; status: EnrollmentStatus; progress: number; enrolledAt: string; lastAccessedAt: string | null; completedModuleIds: string[] } | null;
  assessment: (AssessmentSummary & { availability: Availability | null }) | null;
  certificate: { id: string; certificateNumber: string; status: string } | null;
}

export interface Enrollment {
  id: string;
  status: EnrollmentStatus;
  progress: number;
  enrolledAt: string;
  startedAt: string | null;
  completedAt: string | null;
  lastAccessedAt: string | null;
  course: { id: string; title: string; category: string; difficulty: Difficulty; durationMinutes: number; thumbnailUrl: string | null; trainer: { id: string; name: string } };
  modulesTotal: number;
  modulesCompleted: number;
  nextModule: { id: string; title: string } | null;
  assessment: { id: string; state: AssessmentState; deadline: string | null; bestScore: number | null; attemptsRemaining: number | null; inProgressAttemptId: string | null } | null;
  certificate: { id: string; certificateNumber: string; status: string } | null;
}

export interface FeedbackItem {
  id: string;
  rating: number;
  trainerRating: number | null;
  comment: string | null;
  updatedAt: string;
  author: { name: string; department: string | null };
}
export interface FeedbackSummary {
  count: number;
  averageRating: number;
  averageTrainerRating: number;
  distribution: { rating: number; count: number }[];
}

// ---- assessments ----------------------------------------------------------------------------------------------------------------

export interface MyAssessment {
  assessmentId: string;
  title: string;
  courseId: string;
  courseTitle: string;
  passingScore: number;
  timeLimitMinutes: number | null;
  questionCount: number;
  deadline: string | null;
  state: AssessmentState;
  reasons: string[];
  attemptsUsed: number;
  attemptsRemaining: number | null;
  bestScore: number | null;
  passed: boolean;
  inProgressAttemptId: string | null;
}

export interface AssessmentInfo {
  id: string;
  title: string;
  description: string | null;
  instructions: string | null;
  courseId: string;
  courseTitle: string;
  passingScore: number;
  timeLimitMinutes: number | null;
  maxAttempts: number;
  deadline: string | null;
  questionCount: number;
  availability: Availability;
}

export interface AttemptQuestion {
  id: string;
  text: string;
  type: QuestionType;
  marks: number;
  options: { id: string; text: string }[];
}
export type ScenarioStepType = 'IDENTIFY' | 'INTERPRET' | 'ACTION';

/** A scenario step as a trainee sees it while the attempt is open: no marking. */
export interface AttemptScenarioStep {
  id: string;
  type: ScenarioStepType;
  prompt: string;
  marks: number;
  options: { id: string; text: string }[];
}

export interface AttemptScenario {
  id: string;
  title: string;
  briefing: string;
  imageUrl: string | null;
  marks: number;
  steps: AttemptScenarioStep[];
}

export interface StartedAttempt {
  resumed: boolean;
  attempt: { id: string; attemptNumber: number; startedAt: string; expiresAt: string | null; remainingSeconds: number | null };
  assessment: {
    id: string;
    title: string;
    instructions: string | null;
    passingScore: number;
    timeLimitMinutes: number | null;
    totalMarks: number;
    /** Share of the final mark from the questions; 1 means there is no practical component. */
    mcqWeight: number;
    practicalMarks: number;
  };
  questions: AttemptQuestion[];
  scenarios: AttemptScenario[];
}

export interface AttemptSummary {
  id: string;
  attemptNumber: number;
  status: 'IN_PROGRESS' | 'SUBMITTED' | 'EXPIRED';
  startedAt: string;
  submittedAt: string | null;
  score: number | null;
  totalMarks: number | null;
  percentage: number | null;
  /** The two components behind `percentage`; null when the assessment had no practical part. */
  mcqPercentage?: number | null;
  practicalPercentage?: number | null;
  passed: boolean | null;
  timeTakenSeconds: number | null;
}

export interface ReviewRow {
  questionId: string;
  text: string;
  type: QuestionType;
  marks: number;
  marksAwarded: number;
  answered: boolean;
  selectedOptionIds: string[];
  isCorrect?: boolean;
  explanation?: string | null;
  options: { id: string; text: string; isCorrect?: boolean }[];
}

export interface CompetencyImpact {
  competencyId: string;
  competencyName: string;
  previousLevel: number;
  newLevel: number;
  changed: boolean;
  requiredLevel: number | null;
  gapBefore: number | null;
  gapAfter: number | null;
  requirementMet: boolean;
  limitedBy: string;
  explanation: string;
}

export interface SubmitResult {
  attempt: AttemptSummary;
  assessment: { id: string; title: string; passingScore: number; maxAttempts: number; attemptsRemaining: number | null; courseId: string; courseTitle: string };
  competencyImpacts: CompetencyImpact[];
  certificate: { id: string; certificateNumber: string; issuedAt: string } | null;
  enrollment: { id: string; status: EnrollmentStatus; progress: number };
  review: ReviewRow[];
}

/** One decision in a finished attempt, with the marking revealed. */
export interface PracticalStepResult {
  stepId: string;
  type: ScenarioStepType;
  prompt: string;
  marks: number;
  marksAwarded: number;
  creditAwarded: number;
  selectedOptionId: string | null;
  /** The choice that earns full credit, so the learner sees what good looked like. */
  bestOptionId: string | null;
  explanation: string | null;
  options: { id: string; text: string; credit: number; rationale: string | null }[];
}

export interface PracticalScenarioResult {
  scenarioId: string;
  title: string;
  briefing: string;
  imageUrl: string | null;
  marks: number;
  marksAwarded: number;
  steps: PracticalStepResult[];
}

export interface AttemptDetail {
  attempt: AttemptSummary;
  learner: { id: string; name: string; email?: string; employeeId?: string | null };
  assessment: { id: string; title: string; passingScore: number; courseId: string; courseTitle: string; mcqWeight?: number };
  competencyChanges: { competencyId: string; competencyName: string; previousLevel: number; newLevel: number }[];
  competencyImpacts: CompetencyImpact[];
  certificate: { id: string; certificateNumber: string } | null;
  review: ReviewRow[];
  /** The practical half, or null when the assessment had no scenarios. */
  practical: PracticalScenarioResult[] | null;
}

export interface ManagedQuestion {
  id: string;
  text: string;
  type: QuestionType;
  marks: number;
  explanation: string | null;
  position: number;
  options: { id: string; text: string; isCorrect: boolean; position: number }[];
}
export interface ManagedAssessment {
  id: string;
  courseId: string;
  courseTitle: string;
  title: string;
  description: string | null;
  instructions: string | null;
  timeLimitMinutes: number | null;
  passingScore: number;
  maxAttempts: number;
  deadline: string | null;
  questionsPerAttempt: number | null;
  isPublished: boolean;
  shuffleQuestions: boolean;
  shuffleOptions: boolean;
  showCorrectAnswers: boolean;
  createdAt: string;
  updatedAt: string;
  attemptCount: number;
  questionCount: number;
  totalMarks: number;
  questions: ManagedQuestion[];
}

export interface ManagedAssessmentListItem {
  id: string;
  courseId: string;
  courseTitle: string;
  title: string;
  isPublished: boolean;
  passingScore: number;
  maxAttempts: number;
  timeLimitMinutes: number | null;
  deadline: string | null;
  questionCount: number;
  attemptsSubmitted: number;
  passRate: number | null;
  averageScore: number | null;
  updatedAt: string;
}

export interface AssessmentStats {
  attempts: number;
  learners: number;
  passedLearners: number;
  passRate: number | null;
  averageScore: number | null;
  highestScore: number | null;
  lowestScore: number | null;
  averageTimeMinutes: number | null;
  distribution: { label: string; count: number }[];
  questions: { questionId: string; position: number; text: string; marks: number; answers: number; correctRate: number | null }[];
}

export interface ManagerAttemptRow extends AttemptSummary {
  learner: { id: string; name: string; email: string; employeeId: string | null; department: string | null };
}

// ---- certificates -----------------------------------------------------------------------------------------------------------------

export interface Certificate {
  id: string;
  certificateNumber: string;
  courseId: string;
  holderName: string;
  courseTitle: string;
  issuer: string;
  score: number | null;
  issuedAt: string;
  status: 'VALID' | 'REVOKED';
  revokedAt: string | null;
  revokedReason: string | null;
  verificationUrl: string;
}

/** The outcome of checking a certificate's Ed25519 signature. */
export type SignatureCheck =
  | { state: 'VALID'; keyId: string }
  | { state: 'INVALID'; keyId: string | null }
  | { state: 'UNSIGNED' }
  | { state: 'UNVERIFIABLE'; keyId: string | null; reason: string };

export type CertificateVerification =
  | {
      valid: true;
      certificateNumber: string;
      holderName: string;
      courseTitle: string;
      issuer: string;
      score: number | null;
      issuedAt: string;
      competencies: string[];
      signature: SignatureCheck;
      verificationUrl: string;
    }
  | {
      valid: false;
      reason: 'NOT_FOUND' | 'REVOKED' | 'TAMPERED';
      certificateNumber: string;
      revokedAt?: string | null;
      holderName?: string;
      courseTitle?: string;
      signature?: SignatureCheck;
      verificationUrl: string;
    };

// ---- operational readiness -------------------------------------------------------------------------------------------

export type KnowledgeRisk = 'LOW' | 'WATCH' | 'HIGH' | 'CRITICAL';
export type HazardType = 'MONSOON' | 'CYCLONE' | 'HEATWAVE' | 'FLOOD' | 'WINTER' | 'THUNDERSTORM' | 'OTHER';
export type ReadinessEventStatus = 'PLANNED' | 'ACTIVE' | 'COMPLETED' | 'CANCELLED';
export type ReadinessState = 'READY' | 'NEEDS_PREPARATION' | 'AT_RISK' | 'CRITICAL';
export type ReadinessIndexBand = 'STRONG' | 'ADEQUATE' | 'FRAGILE' | 'AT_RISK';

export interface ReadinessIndex {
  score: number;
  band: ReadinessIndexBand;
  label: string;
  components: { coverage: number; freshness: number; continuity: number; criticalGapPenalty: number };
  explanation: string;
}

export interface ReadinessEventSummary {
  id: string;
  name: string;
  hazardType: HazardType;
  startDate: string;
  endDate: string;
  priority: number;
  status: ReadinessEventStatus;
  isSimulation: boolean;
  daysUntilStart: number;
  workforceReady: number;
  averageReadiness: number;
  totalPeople: number;
  readyCount: number;
  needingPreparation: number;
  atRiskCount: number;
  criticalCount: number;
  weakestCompetencies: { competencyId: string; competencyName: string; peopleShort: number; averageShortfall: number }[];
  requirements: { competencyId: string; competencyName: string; requiredLevel: number }[];
}

export interface DepartmentReadiness {
  departmentId: string;
  departmentName: string;
  people: number;
  coverage: number;
  byStatus: Record<FreshnessStatus, number>;
  needingRefresher: number;
}

export interface CompetencyReadiness {
  competencyId: string;
  competencyName: string;
  category: string;
  averageLevel: number;
  averageDecay: number;
  byStatus: Record<FreshnessStatus, number>;
  peopleShort: number;
  criticality: number;
  knowledgeRisk: KnowledgeRisk | null;
}

export interface RecertificationDue {
  userId: string;
  userName: string;
  competencyId: string;
  competencyName: string;
  dueAt: string;
  daysUntil: number;
  overdue: boolean;
}

export interface ReadinessOverview {
  index: ReadinessIndex;
  headline: {
    overallReadiness: number;
    competenciesAtRisk: number;
    criticalSkillGaps: number;
    knowledgeLossRisks: number;
    upcomingEvents: number;
    peopleNeedingRefresher: number;
  };
  freshness: FreshnessSummary;
  byDepartment: DepartmentReadiness[];
  byCompetency: CompetencyReadiness[];
  recertifications: RecertificationDue[];
  succession: {
    competencies: number;
    byRisk: Record<KnowledgeRisk, number>;
    atRisk: number;
    thinlyCovered: number;
    expertsLeaving: number;
    top: { competencyId: string; competencyName: string; risk: KnowledgeRisk; remainingExperts: number; reason: string }[];
  };
  events: ReadinessEventSummary[];
  asOf: AsOf;
  isDemonstrationMetric: true;
}

/** An event on the readiness calendar, as the admin screens edit it. */
export interface ReadinessEvent {
  id: string;
  name: string;
  description: string | null;
  hazardType: HazardType;
  startDate: string;
  endDate: string;
  priority: number;
  status: ReadinessEventStatus;
  isSimulation: boolean;
  createdAt: string;
  requirements: { id: string; competencyId: string; requiredLevel: number; importance: number; competency: { id: string; name: string; code: string; category: string } }[];
  departments: { departmentId: string; department: { id: string; name: string; code: string } }[];
  _count: { assignments: number };
}

export interface PersonRequirementReadiness {
  competencyId: string;
  competencyName: string;
  requiredLevel: number;
  importance: number;
  freshness: Freshness;
}

/**
 * A person in an event report. The server sends their shortfalls, not their
 * whole requirement list: the two carry the same freshness objects and the
 * duplication is most of the payload on a large workforce.
 */
export interface PersonReadiness {
  userId: string;
  userName: string;
  departmentName: string | null;
  jobRoleName: string | null;
  state: ReadinessState;
  readiness: number;
  shortfalls: PersonRequirementReadiness[];
  reason: string;
}

/** One event, measured for everyone it applies to. */
export interface EventReadinessReport {
  eventId: string;
  eventName: string;
  event: ReadinessEvent;
  people: PersonReadiness[];
  workforceReady: number;
  averageReadiness: number;
  totalPeople: number;
  readyCount: number;
  needingPreparation: number;
  atRiskCount: number;
  criticalCount: number;
  weakestCompetencies: { competencyId: string; competencyName: string; peopleShort: number; averageShortfall: number }[];
  reason: string;
  /** The date readiness was measured at: the event's start, or a simulated date. */
  measuredAt: string;
  daysUntilStart: number;
  asOf: AsOf;
}

export type ReadinessAssignmentStatus = 'ASSIGNED' | 'IN_PROGRESS' | 'COMPLETED' | 'WAIVED';

export interface ReadinessAssignment {
  id: string;
  status: ReadinessAssignmentStatus;
  assignedAt: string;
  completedAt: string | null;
  note: string | null;
  event: { id: string; name: string; hazardType: HazardType; startDate: string; endDate: string; status: ReadinessEventStatus };
  competency: { id: string; name: string };
  user: { id: string; name: string };
}

/** What an administrator sends when creating or replacing an event. */
export interface ReadinessEventInput {
  name: string;
  description?: string | null;
  startDate: string;
  endDate: string;
  hazardType: HazardType;
  priority: number;
  status?: ReadinessEventStatus;
  isSimulation: boolean;
  departmentIds: string[];
  requirements: { competencyId: string; requiredLevel: number; importance: number }[];
}

export interface SuccessionHolder {
  userId: string;
  userName: string;
  effectiveLevel: number;
  retirementDate: string | null;
  daysUntilRetirement: number | null;
  leavingSoon: boolean;
  departmentName: string | null;
  jobRoleName: string | null;
}

export interface SuccessionRisk {
  competencyId: string;
  competencyName: string;
  competencyCode: string;
  category: string;
  criticality: number;
  experts: SuccessionHolder[];
  leavingExperts: SuccessionHolder[];
  developing: SuccessionHolder[];
  expertCount: number;
  leavingCount: number;
  developingCount: number;
  remainingExperts: number;
  minimumExperts: number;
  risk: KnowledgeRisk;
  reason: string;
}

export type MentorshipStatus = 'NOT_STARTED' | 'ACTIVE' | 'COMPLETED' | 'CANCELLED';

export interface Mentorship {
  id: string;
  status: MentorshipStatus;
  startedAt: string | null;
  completedAt: string | null;
  note: string | null;
  mentor: { id: string; name: string; email: string; designation: string | null };
  mentee: { id: string; name: string; email: string; designation: string | null };
  competency: { id: string; name: string; code: string };
}

// ---- notifications, announcements, achievements ------------------------------------------------------------------------------------

export interface AppNotification {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  link: string | null;
  isRead: boolean;
  readAt: string | null;
  createdAt: string;
}

export interface Announcement {
  id: string;
  title: string;
  body: string;
  audience: 'ALL' | 'TRAINEES' | 'TRAINERS' | 'ADMINS';
  publishedAt: string;
  expiresAt: string | null;
  author: string;
}

export interface Achievement {
  code: string;
  title: string;
  description: string;
  icon: string;
  tier: 'bronze' | 'silver' | 'gold';
  earned: boolean;
  awardedAt: string | null;
}

// ---- evaluations -------------------------------------------------------------------------------------------------------------------------

export interface EvaluationRatings {
  technicalKnowledge: number;
  practicalAbility: number;
  participation: number;
  applicationOfKnowledge: number;
  overallCompetency: number;
}
export interface Evaluation {
  id: string;
  type: 'EVALUATION' | 'PRACTICAL';
  ratings: EvaluationRatings;
  weightedScore: number;
  comments: string | null;
  createdAt: string;
  trainer: { name: string } | null;
  trainee: { id: string; name: string } | null;
  course: { id: string; title: string } | null;
  competency: { id: string; name: string } | null;
}
export interface RubricCriterion {
  key: keyof EvaluationRatings;
  label: string;
  weight: number;
}

// ---- dashboards ---------------------------------------------------------------------------------------------------------------------------

export interface ActivityItem {
  type: string;
  title: string;
  detail: string | null;
  at: string;
}

export interface TraineeDashboard {
  welcome: { name: string; department: string | null; jobRole: JobRoleRef | null };
  competency: {
    readiness: number;
    averageCurrent: number;
    averageRequired: number;
    summary: GapSummary;
    radar: { competency: string; current: number; required: number }[];
  };
  topGaps: CompetencyRecord[];
  recommendations: Recommendation[];
  learning: {
    inProgress: { enrollmentId: string; status: EnrollmentStatus; progress: number; lastAccessedAt: string | null; course: { id: string; title: string; category: string; difficulty: Difficulty; thumbnailUrl: string | null } }[];
    coursesCompleted: number;
    certificates: number;
  };
  upcomingAssessments: MyAssessment[];
  certificates: { id: string; certificateNumber: string; courseTitle: string; score: number | null; issuedAt: string }[];
  activity: ActivityItem[];
  unreadNotifications: number;
}

export interface TrainerDashboard {
  metrics: {
    activeCourses: number;
    draftCourses: number;
    totalTrainees: number;
    awaitingAssessment: number;
    completionRate: number;
    averageScore: number | null;
    passRate: number | null;
    averageCompetencyGain: number | null;
  };
  courses: { id: string; title: string; status: CourseStatus; difficulty: Difficulty; enrolled: number; completionRate: number; averageProgress: number; averageScore: number | null; hasAssessment: boolean }[];
  competencyImprovement: { competencyId: string; competencyName: string; learners: number; averageGain: number }[];
  scoreTrend: { month: string; averageScore: number | null; attempts: number }[];
  recentActivity: ActivityItem[];
  needsAttention: { userId: string; name: string; courseId: string; courseTitle: string; progress: number; lastActiveAt: string }[];
}

export interface CourseTraineeRow {
  enrollmentId: string;
  learner: { id: string; name: string; email: string; employeeId: string | null; department: string | null; jobRole: string | null };
  status: EnrollmentStatus;
  progress: number;
  enrolledAt: string;
  lastAccessedAt: string | null;
  completedAt: string | null;
  attempts: number;
  bestScore: number | null;
  passed: boolean;
  competencyChanges: { competencyName: string; previousLevel: number; newLevel: number }[];
}

export interface CourseAnalytics {
  course: { id: string; title: string; status: CourseStatus };
  enrollments: { total: number; active: number; byStatus: Record<string, number> };
  completionRate: number;
  averageProgress: number;
  moduleFunnel: { moduleId: string; title: string; completed: number }[];
  timeline: { month: string; enrolled: number; completed: number }[];
  assessment: (AssessmentStats & { id: string; title: string }) | null;
  feedback: { count: number; averageRating: number; averageTrainerRating: number };
  competencyImpact: { competencyId: string; competencyName: string; learners: number; averageGain: number }[];
}

// ---- administration ------------------------------------------------------------------------------------------------------------------------

export interface Department extends DepartmentRef {
  description: string | null;
  isActive: boolean;
  employeeCount?: number;
}
export interface JobRole {
  id: string;
  name: string;
  code: string;
  description: string | null;
  criticality: number;
  criticalityLabel: string;
  isActive: boolean;
  employeeCount: number;
  competencyCount: number;
}
export interface JobRoleDetail extends JobRole {
  competencies: { competencyId: string; code: string; name: string; category: string; isActive: boolean; requiredLevel: number; importance: number; importanceLabel: string }[];
}

export interface AdminMetrics {
  totalEmployees: number;
  trainees: number;
  activeTrainees: number;
  trainers: number;
  pendingApprovals: number;
  courses: number;
  totalCourses: number;
  enrollments: number;
  completionRate: number;
  certificatesIssued: number;
  averageAssessmentScore: number | null;
  assessmentPassRate: number | null;
  averageCompetency: number | null;
  averageRequired: number | null;
  workforceReadiness: number | null;
  employeesRequiringTraining: number;
  employeesWithRole: number;
}
export interface AdminAnalytics {
  generatedAt: string;
  metrics: AdminMetrics;
  enrollmentStatus: { status: string; count: number }[];
  trends: {
    months: string[];
    enrollments: { month: string; value: number }[];
    completions: { month: string; value: number }[];
    certifications: { month: string; value: number }[];
    assessmentPerformance: { month: string; averageScore: number | null; passRate: number | null; attempts: number }[];
    competency: { month: string; averageCompetency: number | null; employees: number }[];
  };
  departmentComparison: { departmentId: string; department: string; employees: number; averageCompetency: number | null; averageRequired: number | null; readiness: number | null; needingTraining: number; completionRate: number | null }[];
  topCourses: { courseId: string; title: string; difficulty: Difficulty; enrollments: number; completionRate: number }[];
}

export interface HeatmapCell {
  competencyId: string;
  employees: number;
  assessed: number;
  unassessed: number;
  average: number | null;
  required: number | null;
  averageGap: number | null;
  severity: Severity | null;
  affected: number;
  highPriority: number;
  change: number | null;
  /** Present only on the freshness layer: what decay has cost this cell. */
  decay?: { byStatus: Record<FreshnessStatus, number>; needingRefresher: number; averageDecay: number };
}
export interface HeatmapRow {
  id: string;
  name: string;
  employees: number;
  cells: HeatmapCell[];
}
export interface Heatmap {
  groupBy: 'department' | 'role';
  periodDays: number;
  /** Which question the grid answers: the training gap, or what has faded. */
  layer: 'competency' | 'freshness';
  /** The date the freshness layer was measured at; null on the competency layer. */
  measuredAt: string | null;
  filters: { departmentId: string | null; jobRoleId: string | null; competencyId: string | null };
  thresholds: { lowMax: number; moderateMax: number; highMax: number };
  columns: { competencyId: string; name: string; code: string; category: string }[];
  rows: HeatmapRow[];
  overall: HeatmapRow;
}
export interface HeatmapEmployee {
  userId: string;
  name: string;
  department: string | null;
  jobRole: string;
  currentLevel: number;
  requiredLevel: number;
  gap: number;
  severity: Severity;
  priorityScore: number;
  priorityLevel: PriorityLevel;
  assessed: boolean;
}

export interface TrainingNeed {
  competencyId: string;
  name: string;
  code: string;
  category: string;
  employeesRequired: number;
  employeesAffected: number;
  affectedShare: number;
  averageGap: number;
  severity: Severity;
  severityCounts: Record<Severity, number>;
  priorityScore: number;
  priorityLevel: PriorityLevel;
  demandScore: number;
  inTraining: number;
  unserved: number;
  recommendedCourses: number;
  courses: { courseId: string; title: string; difficulty: Difficulty; levelFrom: number; levelTo: number; enrolled: number }[];
  needsCourseDevelopment: boolean;
}
export interface TrainingNeeds {
  summary: { employees: number; employeesNeedingTraining: number; competenciesWithGaps: number; unservedDemand: number; competenciesWithoutCourses: number };
  needs: TrainingNeed[];
  thresholds: { mediumMin: number; highMin: number; criticalMin: number };
}
export interface TrainingNeedDetail {
  need: TrainingNeed | null;
  departments: { id: string; name: string; employees: number; affected: number; averageGap: number }[];
  employees: { userId: string; name: string; department: string | null; jobRole: string; currentLevel: number; requiredLevel: number; gap: number; priorityScore: number; priorityLevel: PriorityLevel }[];
  courses: { courseId: string; title: string; difficulty: Difficulty; durationMinutes: number; levelFrom: number; levelTo: number; enrolled: number; completed: number; affectedEnrolled: number }[];
}

export interface SkillGapAnalytics {
  employees: number;
  requirements: number;
  averageGap: number;
  needingTraining: number;
  readiness: number | null;
  severityDistribution: { severity: 'MET' | Severity; count: number }[];
  byDepartment: { id: string; name: string; employees: number; averageGap: number; needingTraining: number; readiness: number | null }[];
  byRole: { id: string; name: string; employees: number; averageGap: number; needingTraining: number; readiness: number | null }[];
  byCompetency: { id: string; name: string; employees: number; averageGap: number; needingTraining: number; readiness: number | null }[];
}

export interface AuditLogEntry {
  id: string;
  userId: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  metadata: Record<string, unknown> | null;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
  user: { id: string; name: string; email: string; role: Role } | null;
}

export interface EngineConfig {
  severity: { lowMax: number; moderateMax: number; highMax: number };
  priority: { mediumMin: number; highMin: number; criticalMin: number };
  update: {
    previousWeight: number;
    inputWeights: { assessment: number; trainerEvaluation: number; practical: number };
    evidenceWindowDays: number;
    updateOnFailedAttempt: boolean;
    allowDecrease: boolean;
    capAtCourseTarget: boolean;
  };
  evaluationWeights: EvaluationRatings;
}
export interface EngineConfigResponse {
  config: EngineConfig;
  defaults?: EngineConfig;
  customised: boolean;
  updatedAt: string | null;
}

export interface SimulationResult {
  before: SkillGap;
  after: SkillGap;
  update: {
    previousLevel: number;
    newLevel: number;
    changed: boolean;
    evidence: number | null;
    blended: number | null;
    limitedBy: string;
    explanation: string;
    components: { source: string; score: number; weight: number; share: number }[];
  };
}

export interface SearchResults {
  query: string;
  courses: { id: string; title: string; category: string; difficulty: Difficulty; status: CourseStatus }[];
  competencies: { id: string; name: string; category: string; snippet: string | null }[];
  materials: { id: string; title: string; type: MaterialType; moduleTitle: string; courseId: string; courseTitle: string; snippet: string | null }[];
  employees: { id: string; name: string; email: string; role: Role; employeeId: string | null; department: string | null }[];
}

// ---- AI features (optional; the platform works without them) ---------------------------------------------------------------

export interface AiCoverage {
  /** Materials with text the assistant can read. */
  readableMaterials: number;
  includedMaterials: number;
  omittedMaterials: number;
  /** True when some materials were too long to include. */
  truncated: boolean;
}

export interface AiAnswer {
  answer: string;
  /** False when the materials did not contain the answer (or nothing real was cited). */
  grounded: boolean;
  sources: { id: string; title: string; moduleTitle: string }[];
  coverage: AiCoverage;
  model: string;
}

export interface QuizDraftQuestion {
  text: string;
  type: QuestionType;
  marks: number;
  explanation?: string;
  options: { text: string; isCorrect: boolean }[];
}

export interface QuizDraft {
  questions: QuizDraftQuestion[];
  requested: number;
  /** Suggestions dropped because they were duplicates or broke the question rules. */
  rejected: number;
  coverage: AiCoverage;
  model: string;
}

export interface AiPlan {
  summary: string;
  steps: { courseId: string; title: string; rank: number; note: string }[];
  model: string;
}

export interface AiSearchResult {
  /** `ai` when the request was interpreted by the AI service, `keywords` for the built-in interpreter. */
  method: 'ai' | 'keywords';
  explanation: string | null;
  /** The understood filters, in words, so the user can check them. */
  interpretation: string[];
  filters: { keywords: string; competencyIds: string[]; difficulty: Difficulty | null; category: string | null; maxDurationMinutes: number | null };
  courses: CourseCard[];
}

export type ForecastOutlook = 'MET' | 'CLOSING' | 'STAGNANT' | 'WIDENING' | 'UNKNOWN';
export type ForecastConfidence = 'HIGH' | 'MEDIUM' | 'LOW';

export interface CompetencyForecast {
  competencyId: string;
  name: string;
  category: string;
  employees: number;
  currentAverage: number;
  requiredAverage: number;
  affectedNow: number;
  trendPerMonth: number | null;
  projectedAverage: number | null;
  projectedGap: number;
  projectedAffected: number;
  monthsToClose: number | null;
  outlook: ForecastOutlook;
  confidence: ForecastConfidence | null;
  history: { month: string; value: number }[];
  projection: { month: string; value: number }[];
}

export interface TrainingNeedsForecast {
  generatedAt: string;
  horizonMonths: number;
  historyMonths: number;
  method: string;
  summary: { employees: number; competencies: number; affectedNow: number; projectedAffected: number; atRisk: number };
  competencies: CompetencyForecast[];
}

export interface ForecastBriefing {
  horizonMonths: number;
  summary: string;
  priorities: { competencyId: string; competency: string; action: string }[];
  model: string;
}

// ---- AR Instrument Lab ------------------------------------------------------------------------

export type ARModuleKind = 'FULL_LAB' | 'REFRESHER';
export type ARTaskType = 'IDENTIFY' | 'INSPECT';
export type ARAttemptStatus = 'IN_PROGRESS' | 'COMPLETED' | 'ABANDONED';

/** A part of the instrument. `key` matches the node and material name in the .glb. */
export interface ARComponent {
  id: string;
  key: string;
  name: string;
  description: string;
  hotspotPosition: { x: number; y: number; z: number };
  hotspotNormal: { x: number; y: number; z: number } | null;
  isInteractive: boolean;
  position: number;
}

/** A task as the trainee receives it: never with the answer. */
export interface ARTask {
  id: string;
  type: ARTaskType;
  position: number;
  instruction: string;
  points: number;
  /** Guided training only. */
  hint?: string | null;
}

export interface ARModuleSummary {
  id: string;
  key: string;
  title: string;
  subtitle: string | null;
  description: string;
  objectives: string[];
  modelUrl: string;
  modelHeightM: number;
  kind: ARModuleKind;
  difficulty: Difficulty;
  durationMinutes: number;
  passingScore: number;
  theoryWeight: number;
  isPublished: boolean;
  isSimulation: boolean;
  competency: { id: string; name: string; code: string; category: string };
  course: { id: string; title: string } | null;
  taskCount: number;
  componentCount: number;
  /** Where this trainee stands on the competency the lab develops. */
  standing: {
    currentLevel: number;
    effectiveLevel: number;
    requiredLevel: number | null;
    freshnessStatus: FreshnessStatus;
    needsRefresher: boolean;
  };
  progress: {
    attempts: number;
    completed: number;
    bestScore: number | null;
    /** The practical component alone, as the Competency Passport reports it. */
    bestPractical: number | null;
    lastTheory: number | null;
    passed: boolean;
    lastAttemptAt: string | null;
    lastCompletedAt: string | null;
  };
}

export interface ARModuleDetail {
  module: Omit<ARModuleSummary, 'standing' | 'progress' | 'taskCount' | 'componentCount' | 'isPublished'>;
  components: ARComponent[];
  training: ARTask[];
  assessmentTaskCount: number;
  assessmentTotalPoints: number;
  theory: { percentage: number; weight: number } | null;
  attempts: ARAttempt[];
}

export interface ARAttempt {
  id: string;
  attemptNumber: number;
  status: ARAttemptStatus;
  startedAt: string;
  completedAt: string | null;
  durationSeconds: number | null;
  score: number;
  totalPoints: number;
  practicalPercentage: number;
  theoryPercentage: number | null;
  combinedPercentage: number | null;
  passed: boolean;
  hintsUsed: number;
  competencyBefore: number | null;
  competencyAfter: number | null;
}

export interface ARStartedAttempt {
  resumed: boolean;
  attempt: ARAttempt;
  tasks: ARTask[];
  components: ARComponent[];
}

export interface ARSubmitResult {
  attempt: ARAttempt;
  module: { id: string; key: string; title: string; passingScore: number; theoryWeight: number; competencyName: string };
  review: {
    taskId: string;
    instruction: string;
    points: number;
    pointsAwarded: number;
    correct: boolean;
    selectedComponentId: string | null;
    selectedComponentName: string | null;
    correctComponentId: string;
    correctComponentName: string;
    explanation: string | null;
  }[];
  scoring: { practical: number; theory: number | null; theoryWeight: number; combined: number; explanation: string };
  competencyImpacts: CompetencyImpact[];
  replayed: boolean;
}

/** What the decay engine says this trainee should refresh, if anything. */
export interface ARRefresherRecommendation {
  module: { id: string; key: string; title: string; durationMinutes: number; modelUrl: string };
  competency: { id: string; name: string };
  freshness: Freshness;
  reason: string;
  asOf: AsOf;
}

export interface ARAttemptRow extends ARAttempt {
  user: { id: string; name: string; email: string; department: { name: string } | null };
  module: { id: string; key: string; title: string; kind: ARModuleKind; competency: { id: string; name: string } };
}

export interface ARAnalytics {
  labsCompleted: number;
  distinctLearners: number;
  averagePractical: number | null;
  averageCombined: number | null;
  passRate: number | null;
  averageDurationSeconds: number | null;
  refresherCompletions: number;
  averageCompetencyGain: number | null;
  byModule: { moduleId: string; key: string; title: string; kind: ARModuleKind; completions: number; averagePractical: number | null; passRate: number | null }[];
  trend: { month: string; count: number }[];
  distribution: { band: string; count: number }[];
  hardestTasks: { taskId: string; instruction: string; moduleTitle: string; answered: number; correctRate: number }[];
  isDemonstrationData: true;
}
