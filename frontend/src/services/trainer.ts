import { api } from '../api/client';
import type {
  CourseAnalytics,
  CourseCard,
  CourseDetail,
  CourseStatus,
  CourseTraineeRow,
  Difficulty,
  Evaluation,
  EvaluationRatings,
  EnrollmentStatus,
  LearnContent,
  MaterialType,
  PageMeta,
  RubricCriterion,
  TrainerDashboard,
} from '../types';

// ---- dashboard & monitoring -----------------------------------------------------------------------------------------

export const fetchTrainerDashboard = async () => (await api.get<TrainerDashboard>('/dashboard/trainer')).data;
export const fetchCourseAnalytics = async (courseId: string) => (await api.get<CourseAnalytics>(`/courses/${courseId}/analytics`)).data;

export async function fetchCourseTrainees(courseId: string, params: { page?: number; pageSize?: number; q?: string; status?: EnrollmentStatus | '' }) {
  const { data, meta } = await api.get<CourseTraineeRow[], { statusCounts: Record<string, number> }>(`/courses/${courseId}/trainees`, {
    page: params.page ?? 1,
    pageSize: params.pageSize ?? 15,
    q: params.q || undefined,
    status: params.status || undefined,
  });
  return { items: data, meta: meta as PageMeta & { statusCounts: Record<string, number> } };
}

// ---- courses ---------------------------------------------------------------------------------------------------------------

export interface CompetencyMappingInput {
  competencyId: string;
  levelFrom: number;
  levelTo: number;
}

export interface CourseInput {
  title: string;
  description: string;
  category: string;
  difficulty: Difficulty;
  durationMinutes?: number;
  outcomes?: string[];
  passingScore?: number;
  certificateEnabled?: boolean;
  competencies?: CompetencyMappingInput[];
  prerequisiteIds?: string[];
  trainerId?: string;
}

export const createCourse = async (input: CourseInput & { modules?: { title: string; description?: string; durationMinutes?: number }[] }) => (await api.post<CourseDetail>('/courses', input)).data;
export const updateCourse = async (id: string, input: Partial<CourseInput>) => (await api.patch<CourseDetail>(`/courses/${id}`, input)).data;
export const deleteCourse = async (id: string) => (await api.delete(`/courses/${id}`)).data;

export async function changeCourseStatus(id: string, status: CourseStatus) {
  const { data, meta } = await api.patch<CourseDetail, { warnings?: string[] }>(`/courses/${id}/status`, { status });
  return { course: data, warnings: (meta as { warnings?: string[] } | undefined)?.warnings ?? [] };
}

export const setCourseCompetencies = async (id: string, competencies: CompetencyMappingInput[]) => (await api.put<CourseDetail>(`/courses/${id}/competencies`, { competencies })).data;
export const setCoursePrerequisites = async (id: string, prerequisiteIds: string[]) => (await api.put<CourseDetail>(`/courses/${id}/prerequisites`, { prerequisiteIds })).data;

export async function uploadCourseThumbnail(id: string, file: File) {
  const form = new FormData();
  form.append('file', file);
  return (await api.upload<{ thumbnailUrl: string | null }>(`/courses/${id}/thumbnail`, form)).data;
}
export const removeCourseThumbnail = async (id: string) => (await api.delete(`/courses/${id}/thumbnail`)).data;

/** Every course the signed-in trainer owns (admins see all). */
export async function fetchMyCourses(params: { q?: string; status?: CourseStatus | ''; page?: number; pageSize?: number }) {
  const { data, meta } = await api.get<CourseCard[], { categories: string[] }>('/courses', {
    mine: 'true',
    q: params.q || undefined,
    status: params.status || undefined,
    page: params.page ?? 1,
    pageSize: params.pageSize ?? 12,
    sort: 'newest',
  });
  return { items: data, meta: meta as PageMeta & { categories: string[] } };
}

// ---- modules & materials -------------------------------------------------------------------------------------------------

/** The full course content as a learner would see it (includes links, texts and files) - used by the editor. */
export const fetchCourseContent = async (courseId: string) => (await api.get<LearnContent>(`/courses/${courseId}/learn`)).data;

export interface ModuleInput {
  title: string;
  description?: string | null;
  durationMinutes?: number;
}
export const createModule = async (courseId: string, input: ModuleInput) => (await api.post(`/courses/${courseId}/modules`, input)).data;
export const updateModule = async (courseId: string, moduleId: string, input: Partial<ModuleInput>) => (await api.patch(`/courses/${courseId}/modules/${moduleId}`, input)).data;
export const deleteModule = async (courseId: string, moduleId: string) => (await api.delete(`/courses/${courseId}/modules/${moduleId}`)).data;
export const reorderModules = async (courseId: string, moduleIds: string[]) => (await api.put(`/courses/${courseId}/modules/order`, { moduleIds })).data;

export interface MaterialInput {
  title: string;
  type: MaterialType;
  url?: string;
  content?: string;
  file?: File | null;
}

/** Links and texts are sent as JSON; a file (document or video) goes as multipart form data. */
export async function addMaterial(courseId: string, moduleId: string, input: MaterialInput) {
  const path = `/courses/${courseId}/modules/${moduleId}/materials`;
  if (input.file) {
    const form = new FormData();
    form.append('title', input.title);
    form.append('type', input.type);
    form.append('file', input.file);
    return (await api.upload(path, form)).data;
  }
  return (await api.post(path, { title: input.title, type: input.type, ...(input.url ? { url: input.url } : {}), ...(input.content ? { content: input.content } : {}) })).data;
}
export const updateMaterial = async (courseId: string, moduleId: string, materialId: string, input: { title?: string; url?: string; content?: string }) =>
  (await api.patch(`/courses/${courseId}/modules/${moduleId}/materials/${materialId}`, input)).data;
export const deleteMaterial = async (courseId: string, moduleId: string, materialId: string) => (await api.delete(`/courses/${courseId}/modules/${moduleId}/materials/${materialId}`)).data;

// ---- evaluations -----------------------------------------------------------------------------------------------------------

export const fetchRubric = async () => (await api.get<RubricCriterion[]>('/evaluations/rubric')).data;

export async function fetchEvaluations(params: { page?: number; pageSize?: number; traineeId?: string; courseId?: string }) {
  const { data, meta } = await api.get<Evaluation[]>('/evaluations', { page: params.page ?? 1, pageSize: params.pageSize ?? 10, traineeId: params.traineeId, courseId: params.courseId });
  return { items: data, meta: meta as PageMeta };
}

export interface EvaluationInput extends EvaluationRatings {
  traineeId: string;
  courseId?: string;
  competencyId?: string;
  type: 'EVALUATION' | 'PRACTICAL';
  comments?: string;
}
export const createEvaluation = async (input: EvaluationInput) => (await api.post<Evaluation>('/evaluations', input)).data;
