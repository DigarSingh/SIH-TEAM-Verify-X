import type { Role } from '../types';

/** Role-aware links so the same component works in every workspace. */
export const paths = {
  course: (role: Role, id: string) => (role === 'TRAINEE' ? `/trainee/courses/${id}` : role === 'TRAINER' ? `/trainer/courses/${id}` : `/admin/courses/${id}`),
  competencies: (role: Role) => (role === 'TRAINEE' ? '/trainee/passport' : role === 'ADMIN' ? '/admin/competencies' : '/trainer'),
  notifications: (role: Role) => `/${role.toLowerCase()}/notifications`,
  profile: (role: Role) => `/${role.toLowerCase()}/profile`,
  employee: (role: Role, id: string) => (role === 'ADMIN' ? `/admin/users/${id}` : `/trainer/trainees/${id}`),
  learn: (courseId: string) => `/trainee/learn/${courseId}`,
  assessment: (assessmentId: string) => `/trainee/assessments/${assessmentId}`,
  certificate: '/trainee/certificates',
};

/**
 * True for a path inside this app (`/trainee/passport`, `/search?q=radar`) and false for anything that could send the
 * browser elsewhere: an absolute URL, a protocol-relative one (`//host`), a backslash variant or a `javascript:` URL.
 * Every navigation target that comes from data rather than from our own code goes through it.
 */
export const isInternalPath = (value: string): boolean => /^\/(?![/\\])[^\\\s]*$/.test(value);

/**
 * Turns the in-app link stored on a notification into a route that exists in the
 * current workspace (notifications are created by the server without role knowledge).
 */
export function resolveNotificationLink(link: string | null, role: Role): string | null {
  if (!link || !isInternalPath(link)) return null;
  if (link === '/announcements') return '/announcements';
  const workspace = `/${role.toLowerCase()}`;
  if (link.startsWith(workspace)) return link;
  if (link.startsWith('/admin/') || link.startsWith('/trainee/') || link.startsWith('/trainer/')) return workspace;
  return link;
}
