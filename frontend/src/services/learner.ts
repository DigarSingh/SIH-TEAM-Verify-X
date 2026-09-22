import { api } from '../api/client';
import type {
  Achievement,
  CourseAnalytics,
  CourseCard,
  CourseDetail,
  Enrollment,
  EnrollmentStatus,
  Evaluation,
  FeedbackItem,
  FeedbackSummary,
  LearnContent,
  PageMeta,
  Passport,
  RecommendationReport,
  SkillGapReport,
  TraineeDashboard,
  Competency,
  CompetencyRecord,
  GapSummary,
  JobRoleRef,
  TimelineEvent,
} from '../types';

// ---- competency ---------------------------------------------------------------------------------------------

export const fetchTraineeDashboard = async () => (await api.get<TraineeDashboard>('/dashboard/trainee')).data;
export const fetchPassport = async () => (await api.get<Passport>('/competencies/me/passport')).data;
export const fetchEmployeePassport = async (userId: string) => (await api.get<Passport>(`/users/${userId}/passport`)).data;
/** `offsetDays` runs the same analysis at a simulated future date; it never changes stored data. */
export const fetchSkillGaps = async (offsetDays = 0) => (await api.get<SkillGapReport>('/skill-gaps/me', offsetDays ? { offsetDays } : {})).data;
export const fetchEmployeeSkillGaps = async (userId: string, offsetDays = 0) =>
  (await api.get<SkillGapReport>(`/skill-gaps/users/${userId}`, offsetDays ? { offsetDays } : {})).data;
export const fetchRecommendations = async (limit?: number) => (await api.get<RecommendationReport>('/recommendations/me', { limit })).data;
export const fetchMyCompetencies = async () => (await api.get<{ jobRole: JobRoleRef | null; summary: GapSummary; competencies: CompetencyRecord[] }>('/competencies/me')).data;
export const fetchCompetencyHistory = async (competencyId?: string) => (await api.get<TimelineEvent[]>('/competencies/me/history', { competencyId })).data;
export const fetchAchievements = async () => (await api.get<{ items: Achievement[]; earnedCount: number; totalCount: number }>('/achievements/me')).data;
export const fetchMyEvaluations = async () => (await api.get<Evaluation[]>('/evaluations/me')).data;

// ---- courses & enrollments --------------------------------------------------------------------------------------

export interface CourseFilters {
  q?: string;
  category?: string;
  difficulty?: string;
  competencyId?: string;
  departmentId?: string;
  status?: string;
  mine?: boolean;
  completion?: string;
  sort?: string;
  page?: number;
  pageSize?: number;
}

export async function fetchCourses(filters: CourseFilters) {
  const { data, meta } = await api.get<CourseCard[], { categories: string[] }>('/courses', {
    q: filters.q,
    category: filters.category,
    difficulty: filters.difficulty,
    competencyId: filters.competencyId,
    departmentId: filters.departmentId,
    status: filters.status,
    mine: filters.mine ? 'true' : undefined,
    completion: filters.completion,
    sort: filters.sort,
    page: filters.page ?? 1,
    pageSize: filters.pageSize ?? 12,
  });
  return { items: data, meta: meta as PageMeta & { categories: string[] } };
}

export const fetchCourse = async (id: string) => (await api.get<CourseDetail>(`/courses/${id}`)).data;
export const fetchLearnContent = async (courseId: string) => (await api.get<LearnContent>(`/courses/${courseId}/learn`)).data;
export const enrollInCourse = async (courseId: string) => (await api.post<Enrollment>(`/courses/${courseId}/enroll`)).data;
export const fetchMyEnrollments = async (status?: EnrollmentStatus) => (await api.get<Enrollment[]>('/enrollments/me', { status })).data;
export const completeModule = async (enrollmentId: string, moduleId: string) => (await api.post(`/enrollments/${enrollmentId}/modules/${moduleId}/complete`)).data;
export const uncompleteModule = async (enrollmentId: string, moduleId: string) => (await api.delete(`/enrollments/${enrollmentId}/modules/${moduleId}/complete`)).data;
export const withdrawFromCourse = async (enrollmentId: string) => (await api.post(`/enrollments/${enrollmentId}/withdraw`)).data;

export async function fetchCourseFeedback(courseId: string, page = 1) {
  const { data, meta } = await api.get<FeedbackItem[], { summary: FeedbackSummary; mine: { rating: number; trainerRating: number | null; comment: string | null } | null }>(`/courses/${courseId}/feedback`, { page, pageSize: 5 });
  return { items: data, meta: meta as PageMeta & { summary: FeedbackSummary; mine: { rating: number; trainerRating: number | null; comment: string | null } | null } };
}
export const submitCourseFeedback = async (courseId: string, input: { rating: number; trainerRating?: number; comment?: string }) => (await api.post(`/courses/${courseId}/feedback`, input)).data;

export const fetchCompetencies = async (params: { q?: string; includeInactive?: boolean; page?: number; pageSize?: number; category?: string } = {}) => {
  const { data, meta } = await api.get<Competency[], { categories: string[] }>('/competencies', { q: params.q, category: params.category, includeInactive: params.includeInactive ? 'true' : undefined, page: params.page ?? 1, pageSize: params.pageSize ?? 100 });
  return { items: data, meta: meta as PageMeta & { categories: string[] } };
};

export type { CourseAnalytics };
