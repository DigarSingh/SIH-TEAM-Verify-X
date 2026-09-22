import { api } from '../api/client';
import type { AiAnswer, AiPlan, AiSearchResult, ForecastBriefing, QuizDraft, TrainingNeedsForecast } from '../types';

/**
 * Optional AI features. They add to the rule-based framework and never change a skill gap, priority or
 * competency level. Only the forecast is available without an AI service (it is calculated from history).
 */

export const askCourseAssistant = async (courseId: string, question: string) => (await api.post<AiAnswer>(`/ai/courses/${courseId}/ask`, { question })).data;

export interface QuizDraftRequest {
  questionCount: number;
  difficulty: 'EASY' | 'MEDIUM' | 'HARD';
  includeMultipleAnswer: boolean;
  focus?: string;
}
export const draftQuiz = async (courseId: string, input: QuizDraftRequest) => (await api.post<QuizDraft>(`/ai/courses/${courseId}/quiz-draft`, input)).data;

export const explainMyPlan = async () => (await api.post<AiPlan>('/ai/recommendations/me/plan')).data;

export const searchCoursesInPlainLanguage = async (query: string) => (await api.post<AiSearchResult>('/ai/search', { query })).data;

export const fetchForecast = async (horizon: number) => (await api.get<TrainingNeedsForecast>('/admin/predictive-needs', { horizon })).data;
export const briefForecast = async (horizon: number) => (await api.post<ForecastBriefing>('/ai/predictive-needs/summary', { horizon })).data;
