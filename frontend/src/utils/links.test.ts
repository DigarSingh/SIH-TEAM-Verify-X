import { describe, expect, it } from 'vitest';
import { isInternalPath, paths, resolveNotificationLink } from './links';

describe('internal paths (navigation targets that come from data)', () => {
  it.each(['/', '/trainee', '/trainee/passport', '/search?q=radar%20course', '/admin/users?status=PENDING', '/courses/3f2a#modules'])('accepts %s', (value) => {
    expect(isInternalPath(value)).toBe(true);
  });

  it.each([
    ['an absolute URL', 'https://evil.example/phish'],
    ['a protocol-relative URL', '//evil.example/phish'],
    ['a backslash variant', '/\\evil.example'],
    ['a backslash later in the path', '/trainee\\evil.example'],
    ['a javascript: URL', 'javascript:alert(1)'],
    ['a relative path', 'trainee/passport'],
    ['a path with whitespace', '/trainee /passport'],
    ['an empty string', ''],
  ])('rejects %s', (_label, value) => {
    expect(isInternalPath(value)).toBe(false);
  });
});

describe('notification links', () => {
  it('keeps a link inside the user’s own workspace', () => {
    expect(resolveNotificationLink('/trainee/passport', 'TRAINEE')).toBe('/trainee/passport');
    expect(resolveNotificationLink('/admin/users?status=PENDING', 'ADMIN')).toBe('/admin/users?status=PENDING');
  });

  it('sends a link from another workspace to the user’s own home instead of a page they cannot open', () => {
    expect(resolveNotificationLink('/admin/users?status=PENDING', 'TRAINER')).toBe('/trainer');
    expect(resolveNotificationLink('/trainee/assessments/x/result/y', 'ADMIN')).toBe('/admin');
  });

  it('understands the shared announcements page', () => {
    expect(resolveNotificationLink('/announcements', 'TRAINEE')).toBe('/announcements');
  });

  it('never navigates anywhere outside the app, whatever a notification says', () => {
    for (const link of ['https://evil.example', '//evil.example', '/\\evil.example', 'javascript:alert(1)']) {
      expect(resolveNotificationLink(link, 'TRAINEE')).toBeNull();
    }
    expect(resolveNotificationLink(null, 'TRAINEE')).toBeNull();
  });
});

describe('role-aware links', () => {
  it('points each role at its own workspace', () => {
    expect(paths.course('TRAINEE', 'c1')).toBe('/trainee/courses/c1');
    expect(paths.course('TRAINER', 'c1')).toBe('/trainer/courses/c1');
    expect(paths.course('ADMIN', 'c1')).toBe('/admin/courses/c1');
    expect(paths.employee('ADMIN', 'u1')).toBe('/admin/users/u1');
    expect(paths.employee('TRAINER', 'u1')).toBe('/trainer/trainees/u1');
    expect(paths.notifications('TRAINER')).toBe('/trainer/notifications');
  });
});
