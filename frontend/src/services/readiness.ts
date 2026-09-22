import { api } from '../api/client';
import type {
  AsOf,
  EventReadinessReport,
  Mentorship,
  MentorshipStatus,
  ReadinessAssignment,
  ReadinessEvent,
  ReadinessEventInput,
  ReadinessEventStatus,
  ReadinessEventSummary,
  ReadinessOverview,
  SuccessionRisk,
} from '../types';

/**
 * Operational readiness.
 *
 * Every endpoint here accepts `offsetDays` for the readiness simulation. It is
 * read-only: the server recalculates for that date and changes nothing.
 */
const simulate = (offsetDays: number) => (offsetDays ? { offsetDays } : {});

/** Everything the Operational Readiness dashboard shows, in one request. */
export const fetchReadinessOverview = async (offsetDays = 0) => (await api.get<ReadinessOverview>('/readiness/overview', simulate(offsetDays))).data;

export const fetchReadinessCalendar = async (offsetDays = 0) =>
  (await api.get<{ events: ReadinessEventSummary[]; asOf: AsOf }>('/readiness/calendar', simulate(offsetDays))).data;

export const fetchEventReadiness = async (eventId: string, offsetDays = 0) =>
  (await api.get<EventReadinessReport>(`/readiness/events/${eventId}/readiness`, simulate(offsetDays))).data;

/** Assigns preparation to everyone short for an event. Safe to run again. */
export const assignPreparation = async (eventId: string) =>
  (await api.post<{ created: number; existing: number; total: number; notified: number }>(`/readiness/events/${eventId}/assign`)).data;

// ---- the readiness calendar (admin) -----------------------------------------------------------------------------

export const fetchReadinessEvents = async (params: { status?: ReadinessEventStatus; includeCompleted?: boolean } = {}) =>
  (await api.get<{ events: ReadinessEvent[] }>('/readiness/events', { status: params.status, includeCompleted: params.includeCompleted ? 'true' : undefined })).data.events;

export const fetchReadinessEvent = async (eventId: string) => (await api.get<{ event: ReadinessEvent }>(`/readiness/events/${eventId}`)).data.event;

export const createReadinessEvent = async (input: ReadinessEventInput) => (await api.post<{ event: ReadinessEvent }>('/readiness/events', input)).data.event;

/** Replaces an event wholesale, including its requirements and departments. */
export const updateReadinessEvent = async (eventId: string, input: ReadinessEventInput) => (await api.put<{ event: ReadinessEvent }>(`/readiness/events/${eventId}`, input)).data.event;

export const deleteReadinessEvent = async (eventId: string) => (await api.delete<{ deleted: boolean }>(`/readiness/events/${eventId}`)).data;

export const fetchEventAssignments = async (eventId: string) => (await api.get<{ assignments: ReadinessAssignment[] }>(`/readiness/events/${eventId}/assignments`)).data.assignments;

/** What the signed-in user has been asked to prepare before an operational period. */
export const fetchMyReadinessAssignments = async () => (await api.get<{ assignments: ReadinessAssignment[] }>('/readiness/assignments/me')).data.assignments;

// ---- knowledge continuity --------------------------------------------------------------------------------------------

export const fetchSuccession = async (offsetDays = 0) =>
  (await api.get<{ risks: SuccessionRisk[]; summary: Record<string, unknown>; asOf: AsOf }>('/succession', simulate(offsetDays))).data;

export const fetchSuccessionDetail = async (competencyId: string, offsetDays = 0) =>
  (
    await api.get<{
      risk: SuccessionRisk;
      mentorships: Mentorship[];
      suggestions: { mentor: SuccessionRisk['experts'][number]; candidates: SuccessionRisk['developing'] }[];
      asOf: AsOf;
    }>(`/succession/competencies/${competencyId}`, simulate(offsetDays))
  ).data;

export const createMentorship = async (input: { mentorId: string; menteeId: string; competencyId: string; note?: string }) =>
  (await api.post<{ mentorship: Mentorship }>('/succession/mentorships', input)).data;

export const updateMentorshipStatus = async (id: string, status: MentorshipStatus) =>
  (await api.patch<{ mentorship: Mentorship }>(`/succession/mentorships/${id}`, { status })).data;

/** The signed-in user's own mentorships, as mentee and as mentor. */
export const fetchMyMentorships = async () => (await api.get<{ asMentee: Mentorship[]; asMentor: Mentorship[] }>('/succession/mentorships/me')).data;
