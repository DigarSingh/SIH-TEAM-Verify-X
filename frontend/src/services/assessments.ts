import { api } from '../api/client';
import type {
  AssessmentInfo,
  AssessmentStats,
  AttemptDetail,
  AttemptSummary,
  Availability,
  ManagedAssessment,
  ManagedAssessmentListItem,
  ManagerAttemptRow,
  MyAssessment,
  PageMeta,
  QuestionType,
  StartedAttempt,
  SubmitResult,
} from '../types';

export const fetchMyAssessments = async () => (await api.get<MyAssessment[]>('/assessments/me')).data;
export const fetchAssessmentInfo = async (id: string) => (await api.get<AssessmentInfo>(`/assessments/${id}`)).data;
export const startAssessment = async (id: string) => (await api.post<StartedAttempt>(`/assessments/${id}/start`)).data;
/**
 * Submits an attempt.
 *
 * `idempotencyKey` makes the call safe to repeat: a device that loses the network
 * mid-submit sends the same key again and gets the original result back instead
 * of burning a second attempt. The offline queue always supplies one.
 */
export const submitAssessment = async (
  id: string,
  attemptId: string,
  answers: { questionId: string; optionIds: string[] }[],
  options: { practical?: { stepId: string; optionId: string }[] | undefined; idempotencyKey?: string | undefined } = {},
) => (await api.post<SubmitResult>(`/assessments/${id}/submit`, { attemptId, answers, practical: options.practical, idempotencyKey: options.idempotencyKey })).data;
export const fetchAttemptDetail = async (attemptId: string) => (await api.get<AttemptDetail>(`/assessments/attempts/${attemptId}`)).data;

export async function fetchMyAttempts(id: string) {
  return (await api.get<{ assessment: { id: string; title: string; courseId: string; courseTitle: string; passingScore: number; maxAttempts: number; deadline: string | null; timeLimitMinutes: number | null }; attempts: AttemptSummary[]; availability: Availability }>(`/assessments/${id}/results`)).data;
}

// ---- trainer / admin ----------------------------------------------------------------------------------------------

export const fetchManagedAssessments = async (courseId?: string) => (await api.get<ManagedAssessmentListItem[]>('/assessments', { courseId })).data;
export const fetchManagedAssessment = async (id: string) => (await api.get<ManagedAssessment>(`/assessments/${id}`)).data;

export interface AssessmentSettings {
  title?: string;
  description?: string | null;
  instructions?: string | null;
  timeLimitMinutes?: number | null;
  passingScore?: number;
  maxAttempts?: number;
  deadline?: string | null;
  questionsPerAttempt?: number | null;
  isPublished?: boolean;
  shuffleQuestions?: boolean;
  shuffleOptions?: boolean;
  showCorrectAnswers?: boolean;
}

export interface QuestionInput {
  text: string;
  type: QuestionType;
  marks: number;
  explanation?: string | undefined;
  options: { text: string; isCorrect: boolean }[];
}

export const createAssessment = async (input: AssessmentSettings & { courseId: string; title: string; questions?: QuestionInput[] }) => (await api.post<ManagedAssessment>('/assessments', input)).data;
export const updateAssessment = async (id: string, input: AssessmentSettings) => (await api.patch<ManagedAssessment>(`/assessments/${id}`, input)).data;
export const deleteAssessment = async (id: string) => (await api.delete(`/assessments/${id}`)).data;
export const addQuestions = async (id: string, questions: QuestionInput[]) => (await api.post<ManagedAssessment>(`/assessments/${id}/questions`, questions.length === 1 ? questions[0] : { questions })).data;
export const updateQuestion = async (id: string, questionId: string, input: Partial<Omit<QuestionInput, 'explanation'>> & { explanation?: string | null }) => (await api.patch<ManagedAssessment>(`/assessments/${id}/questions/${questionId}`, input)).data;
export const deleteQuestion = async (id: string, questionId: string) => (await api.delete<ManagedAssessment>(`/assessments/${id}/questions/${questionId}`)).data;
export const reorderQuestions = async (id: string, questionIds: string[]) => (await api.put<ManagedAssessment>(`/assessments/${id}/questions/order`, { questionIds })).data;

export async function fetchAssessmentResults(id: string, page = 1, passed?: 'true' | 'false') {
  const { data, meta } = await api.get<ManagerAttemptRow[], { assessment: { id: string; title: string; courseTitle: string; passingScore: number }; stats: AssessmentStats }>(`/assessments/${id}/results`, { page, pageSize: 15, passed });
  return { items: data, meta: meta as PageMeta & { assessment: { id: string; title: string; courseTitle: string; passingScore: number }; stats: AssessmentStats } };
}
