import { api } from '../api/client';
import type {
  AdminAnalytics,
  Announcement,
  AuditLogEntry,
  Competency,
  Department,
  Difficulty,
  Heatmap,
  HeatmapEmployee,
  JobRole,
  JobRoleDetail,
  PageMeta,
  Role,
  SkillGapAnalytics,
  TrainingNeedDetail,
  TrainingNeeds,
  User,
  UserStatus,
} from '../types';

// ---- users ----------------------------------------------------------------------------------------------------------------

export interface UserFilters {
  q?: string;
  role?: Role | '';
  status?: UserStatus | '';
  departmentId?: string;
  jobRoleId?: string;
  page?: number;
  pageSize?: number;
  sort?: 'name' | 'createdAt' | 'lastLoginAt';
  order?: 'asc' | 'desc';
}

export async function fetchUsers(filters: UserFilters) {
  const { data, meta } = await api.get<User[], { statusCounts: Record<UserStatus, number> }>('/users', {
    q: filters.q || undefined,
    role: filters.role || undefined,
    status: filters.status || undefined,
    departmentId: filters.departmentId || undefined,
    jobRoleId: filters.jobRoleId || undefined,
    page: filters.page ?? 1,
    pageSize: filters.pageSize ?? 15,
    sort: filters.sort ?? 'createdAt',
    order: filters.order ?? 'desc',
  });
  return { items: data, meta: meta as PageMeta & { statusCounts: Record<UserStatus, number> } };
}

export type UserDetail = User & { stats: { enrollments: number; certificates: number; assessmentAttempts: number } };
export const fetchUser = async (id: string) => (await api.get<UserDetail>(`/users/${id}`)).data;

export interface CreateUserInput {
  name: string;
  email: string;
  role: Role;
  employeeId?: string;
  designation?: string;
  location?: string;
  departmentId?: string;
  jobRoleId?: string;
}
export const createUser = async (input: CreateUserInput) => (await api.post<{ user: User; temporaryPassword?: string }>('/users', input)).data;
export const updateUser = async (id: string, input: Partial<{ name: string; employeeId: string | null; designation: string | null; location: string | null; departmentId: string | null; jobRoleId: string | null }>) =>
  (await api.patch<User>(`/users/${id}`, input)).data;
export const approveUser = async (id: string, input: { departmentId?: string; jobRoleId?: string } = {}) => (await api.post<User>(`/users/${id}/approve`, input)).data;
export const rejectUser = async (id: string, reason: string) => (await api.post<User>(`/users/${id}/reject`, { reason })).data;
export const changeUserRole = async (id: string, role: Role) => (await api.patch<User>(`/users/${id}/role`, { role })).data;
export const changeUserStatus = async (id: string, status: 'ACTIVE' | 'SUSPENDED') => (await api.patch<User>(`/users/${id}/status`, { status })).data;
export const resetUserPassword = async (id: string) => (await api.post<{ temporaryPassword: string }>(`/users/${id}/reset-password`)).data;
export const deleteUser = async (id: string) => (await api.delete(`/users/${id}`)).data;
export const adjustCompetency = async (userId: string, competencyId: string, input: { level: number; reason: string }) => (await api.put(`/users/${userId}/competencies/${competencyId}`, input)).data;

// ---- departments ------------------------------------------------------------------------------------------------------

export const fetchDepartments = async (includeInactive = false) => (await api.get<Department[]>('/departments', { includeInactive: includeInactive ? 'true' : undefined })).data;
export interface DepartmentInput {
  name: string;
  code: string;
  description?: string | null;
  isActive?: boolean;
}
export const createDepartment = async (input: DepartmentInput) => (await api.post<Department>('/departments', input)).data;
export const updateDepartment = async (id: string, input: Partial<DepartmentInput>) => (await api.patch<Department>(`/departments/${id}`, input)).data;
export const deleteDepartment = async (id: string) => (await api.delete(`/departments/${id}`)).data;

// ---- job roles and required competencies -----------------------------------------------------------------------------------

export const fetchRoles = async (includeInactive = false) => (await api.get<JobRole[]>('/roles', { includeInactive: includeInactive ? 'true' : undefined })).data;
export const fetchRole = async (id: string) => (await api.get<JobRoleDetail>(`/roles/${id}`)).data;
export interface RoleInput {
  name: string;
  code: string;
  description?: string | null;
  criticality?: number;
  isActive?: boolean;
}
export const createRole = async (input: RoleInput) => (await api.post<JobRole>('/roles', input)).data;
export const updateRole = async (id: string, input: Partial<RoleInput>) => (await api.patch<JobRole>(`/roles/${id}`, input)).data;
export const deleteRole = async (id: string) => (await api.delete(`/roles/${id}`)).data;
export const setRoleRequirement = async (roleId: string, competencyId: string, input: { requiredLevel: number; importance: number }) => (await api.put(`/roles/${roleId}/competencies/${competencyId}`, input)).data;
export const removeRoleRequirement = async (roleId: string, competencyId: string) => (await api.delete(`/roles/${roleId}/competencies/${competencyId}`)).data;

// ---- competency framework --------------------------------------------------------------------------------------------------

export interface CompetencyInput {
  name: string;
  code?: string;
  description: string;
  category: string;
  levelDescriptors?: Partial<Record<'foundation' | 'developing' | 'proficient' | 'expert', string>> | null;
  isActive?: boolean;
}
export const createCompetency = async (input: CompetencyInput) => (await api.post<Competency>('/competencies', input)).data;
export const updateCompetency = async (id: string, input: Partial<CompetencyInput>) => (await api.patch<Competency>(`/competencies/${id}`, input)).data;
export const deleteCompetency = async (id: string) => (await api.delete(`/competencies/${id}`)).data;

export interface CompetencyDetail extends Competency {
  courses: { id: string; title: string; difficulty: Difficulty; durationMinutes: number; levelFrom: number; levelTo: number }[];
  roles?: { roleId: string; name: string; criticality: number; requiredLevel: number; importance: number }[];
  stats?: { employeesAssessed: number; averageLevel: number };
}
export const fetchCompetencyDetail = async (id: string) => (await api.get<CompetencyDetail>(`/competencies/${id}`)).data;

// ---- analytics ---------------------------------------------------------------------------------------------------------------

export interface OrgFilters {
  departmentId?: string;
  jobRoleId?: string;
  competencyId?: string;
}

export const fetchAdminAnalytics = async (months = 12) => (await api.get<AdminAnalytics>('/admin/analytics', { months })).data;

export interface HeatmapFilters extends OrgFilters {
  groupBy: 'department' | 'role';
  period: '30d' | '90d' | '180d' | '365d';
  /** `freshness` decays every level before the grid is built. */
  layer?: 'competency' | 'freshness';
  /** Simulates a future date on the freshness layer. Read-only: nothing stored changes. */
  offsetDays?: number;
}
export const fetchHeatmap = async (filters: HeatmapFilters) =>
  (
    await api.get<Heatmap>('/admin/heatmap', {
      groupBy: filters.groupBy,
      period: filters.period,
      departmentId: filters.departmentId || undefined,
      jobRoleId: filters.jobRoleId || undefined,
      competencyId: filters.competencyId || undefined,
      layer: filters.layer ?? undefined,
      offsetDays: filters.offsetDays || undefined,
    })
  ).data;

export interface HeatmapCellResult {
  items: HeatmapEmployee[];
  meta: PageMeta & {
    competency: { id: string; name: string; code: string; category: string } | null;
    summary: { employees: number; affected: number; averageCurrent: number | null; averageRequired: number | null; averageGap: number | null };
    recommendedCourses: { courseId: string; title: string; difficulty: Difficulty; levelFrom: number; levelTo: number }[];
  };
}
export async function fetchHeatmapCell(params: { competencyId: string; groupBy: 'department' | 'role'; groupId: string; page?: number; onlyGaps?: boolean }): Promise<HeatmapCellResult> {
  const { data, meta } = await api.get<HeatmapEmployee[], HeatmapCellResult['meta']>('/admin/heatmap/cell', {
    competencyId: params.competencyId,
    groupBy: params.groupBy,
    groupId: params.groupId,
    page: params.page ?? 1,
    pageSize: 10,
    onlyGaps: params.onlyGaps === false ? 'false' : 'true',
  });
  return { items: data, meta: meta as HeatmapCellResult['meta'] };
}

export const fetchTrainingNeeds = async (filters: OrgFilters = {}) => (await api.get<TrainingNeeds>('/admin/training-needs', { departmentId: filters.departmentId || undefined, jobRoleId: filters.jobRoleId || undefined })).data;
export const fetchTrainingNeed = async (competencyId: string, filters: OrgFilters = {}) =>
  (await api.get<TrainingNeedDetail>(`/admin/training-needs/${competencyId}`, { departmentId: filters.departmentId || undefined, jobRoleId: filters.jobRoleId || undefined })).data;
export const fetchSkillGapAnalytics = async (filters: OrgFilters = {}) =>
  (await api.get<SkillGapAnalytics>('/admin/skill-gaps', { departmentId: filters.departmentId || undefined, jobRoleId: filters.jobRoleId || undefined, competencyId: filters.competencyId || undefined })).data;

// ---- announcements ---------------------------------------------------------------------------------------------------------------

export interface AdminAnnouncement extends Announcement {
  department: string | null;
  departmentId: string | null;
}
export async function fetchAdminAnnouncements(page = 1) {
  const { data, meta } = await api.get<AdminAnnouncement[]>('/admin/announcements', { page, pageSize: 10 });
  return { items: data, meta: meta as PageMeta };
}
export interface AnnouncementInput {
  title: string;
  body: string;
  audience: Announcement['audience'];
  departmentId?: string | null;
  expiresAt?: string | null;
  notify?: boolean;
}
export const createAnnouncement = async (input: AnnouncementInput) => (await api.post<AdminAnnouncement>('/admin/announcements', input)).data;
export const updateAnnouncement = async (id: string, input: Partial<Omit<AnnouncementInput, 'notify'>>) => (await api.patch<AdminAnnouncement>(`/admin/announcements/${id}`, input)).data;
export const deleteAnnouncement = async (id: string) => (await api.delete(`/admin/announcements/${id}`)).data;
export interface ReminderSummary {
  deadlineReminders: number;
  trainingReminders: number;
  gapNudges: number;
}
export const runReminders = async () => (await api.post<ReminderSummary>('/admin/jobs/reminders')).data;

// ---- audit log --------------------------------------------------------------------------------------------------------------------

export interface AuditFilters {
  q?: string;
  action?: string;
  entityType?: string;
  userId?: string;
  from?: string;
  to?: string;
  page?: number;
}
export async function fetchAuditLogs(filters: AuditFilters) {
  const { data, meta } = await api.get<AuditLogEntry[], { actions: string[]; entityTypes: string[] }>('/admin/audit-logs', {
    q: filters.q || undefined,
    action: filters.action || undefined,
    entityType: filters.entityType || undefined,
    userId: filters.userId || undefined,
    from: filters.from || undefined,
    to: filters.to || undefined,
    page: filters.page ?? 1,
    pageSize: 20,
  });
  return { items: data, meta: meta as PageMeta & { actions: string[]; entityTypes: string[] } };
}
