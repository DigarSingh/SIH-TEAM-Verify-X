import { api } from '../api/client';
import type { ProfessionalProfile, ProfileSkill, Qualification, User, WorkExperience } from '../types';

export const fetchProfile = async () => (await api.get<ProfessionalProfile>('/users/me/profile')).data;
export const updateProfile = async (input: { headline?: string | null; bio?: string | null; expertise?: string[] }) => (await api.put<ProfessionalProfile>('/users/me/profile', input)).data;
export const updateMyDetails = async (input: { name?: string; phone?: string | null; designation?: string | null; location?: string | null }) => (await api.patch<User>('/users/me', input)).data;

export interface QualificationInput {
  degree: string;
  institution: string;
  fieldOfStudy?: string | undefined;
  yearCompleted?: number | undefined;
}
export const addQualification = async (input: QualificationInput) => (await api.post<Qualification>('/users/me/qualifications', input)).data;
export const updateQualification = async (id: string, input: Partial<QualificationInput>) => (await api.patch<Qualification>(`/users/me/qualifications/${id}`, input)).data;
export const deleteQualification = async (id: string) => (await api.delete(`/users/me/qualifications/${id}`)).data;

export interface ExperienceInput {
  title: string;
  organization: string;
  location?: string | undefined;
  startDate: string;
  endDate?: string | null | undefined;
  description?: string | undefined;
}
export const addExperience = async (input: ExperienceInput) => (await api.post<WorkExperience>('/users/me/experiences', input)).data;
export const updateExperience = async (id: string, input: Partial<ExperienceInput>) => (await api.patch<WorkExperience>(`/users/me/experiences/${id}`, input)).data;
export const deleteExperience = async (id: string) => (await api.delete(`/users/me/experiences/${id}`)).data;

export const addSkill = async (input: { name: string; proficiency: number }) => (await api.post<ProfileSkill>('/users/me/skills', input)).data;
export const updateSkill = async (id: string, proficiency: number) => (await api.patch<ProfileSkill>(`/users/me/skills/${id}`, { proficiency })).data;
export const deleteSkill = async (id: string) => (await api.delete(`/users/me/skills/${id}`)).data;
