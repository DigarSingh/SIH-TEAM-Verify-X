import { api } from '../api/client';
import type { ARAnalytics, ARAttemptRow, ARModuleDetail, ARModuleSummary, ARRefresherRecommendation, ARStartedAttempt, ARSubmitResult, AsOf } from '../types';

/**
 * The AR Instrument Lab.
 *
 * Note what is not here: no function sends a score. The browser reports which
 * component the trainee selected; the server does the marking, the weighting
 * and the competency update.
 */

export const fetchARModules = async (offsetDays = 0) =>
  (await api.get<{ modules: ARModuleSummary[]; asOf: AsOf }>('/ar/modules', offsetDays ? { offsetDays } : {})).data;

export const fetchARModule = async (idOrKey: string) => (await api.get<ARModuleDetail>(`/ar/modules/${idOrKey}`)).data;

/** Begins a practical, or resumes one already in progress on another device. */
export const startARAttempt = async (idOrKey: string) => (await api.post<ARStartedAttempt>(`/ar/modules/${idOrKey}/start`)).data;

export interface ARSubmission {
  attemptId: string;
  responses: { taskId: string; selectedComponentId: string | null; timeMs?: number }[];
  hintsUsed?: number;
  /** Makes the submission safe to retry after a dropped connection. */
  idempotencyKey?: string;
}

export const submitARAttempt = async (idOrKey: string, submission: ARSubmission) =>
  (await api.post<ARSubmitResult>(`/ar/modules/${idOrKey}/submit`, submission)).data;

export const fetchARAttempt = async (attemptId: string) => (await api.get<ARSubmitResult>(`/ar/attempts/${attemptId}`)).data;

/** What the freshness engine says this trainee should refresh, or null. */
export const fetchARRefresher = async (offsetDays = 0) =>
  (await api.get<{ recommendation: ARRefresherRecommendation | null }>('/ar/refresher', offsetDays ? { offsetDays } : {})).data.recommendation;

// ---- oversight ---------------------------------------------------------------------------------

export const fetchARAttempts = async (filter: { arModuleId?: string; userId?: string } = {}) =>
  (await api.get<{ attempts: ARAttemptRow[] }>('/ar/attempts', filter)).data.attempts;

export const fetchARAnalytics = async () => (await api.get<ARAnalytics>('/ar/analytics')).data;
