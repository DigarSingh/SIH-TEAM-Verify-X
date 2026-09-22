import type { ReactNode } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import type { Role } from '../types';
import { HOME_PATH } from '../utils/constants';
import { isInternalPath } from '../utils/links';
import { ButtonLink } from '../components/ui';
import { LogoMark } from '../components/domain/LogoMark';

/** Full-screen splash while the session is being restored. */
export function SessionSplash() {
  return (
    <div role="status" aria-label="Restoring your session" className="flex min-h-screen items-center justify-center bg-navy">
      <div className="flex animate-pulse flex-col items-center gap-4">
        <LogoMark />
        <span className="text-xs font-semibold uppercase tracking-[0.2em] text-white/60">Loading workspace</span>
      </div>
    </div>
  );
}

/**
 * Everything inside requires a signed-in user. A pending forced password change
 * sends the user to the change-password screen first.
 */
export function RequireAuth() {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <SessionSplash />;
  if (!user) return <Navigate to="/login" state={{ from: `${location.pathname}${location.search}` }} replace />;
  if (user.mustChangePassword && location.pathname !== '/account/password') return <Navigate to="/account/password" replace />;
  return <Outlet />;
}

/** Only these roles may see the nested routes (the API enforces the same rule on the server). */
export function RequireRole({ roles }: { roles: Role[] }) {
  const { user } = useAuth();
  if (!user) return null;
  if (!roles.includes(user.role)) return <Forbidden role={user.role} />;
  return <Outlet />;
}

/** Login / register are not shown to people who are already signed in. */
export function PublicOnly({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <SessionSplash />;
  if (user) {
    const from = (location.state as { from?: string } | null)?.from;
    return <Navigate to={from && isInternalPath(from) && from.startsWith(HOME_PATH[user.role]) ? from : HOME_PATH[user.role]} replace />;
  }
  return <>{children}</>;
}

export function Forbidden({ role }: { role: Role }) {
  return (
    <div className="mx-auto flex max-w-lg flex-col items-center py-24 text-center">
      <p className="font-display text-6xl font-bold text-navy/20">403</p>
      <h1 className="mt-2 font-display text-2xl font-bold text-navy">You do not have access to this page</h1>
      <p className="mt-2 text-sm text-slate-500">Your account ({role.toLowerCase()}) is not permitted to open this area. Access is enforced by the server, not just hidden in the menu.</p>
      <ButtonLink to={HOME_PATH[role]} className="mt-6">
        Go to my dashboard
      </ButtonLink>
    </div>
  );
}
