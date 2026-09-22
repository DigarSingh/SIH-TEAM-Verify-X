import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Award,
  Bell,
  Boxes,
  BookOpen,
  Briefcase,
  CalendarClock,
  Building2,
  CheckCheck,
  CloudDownload,
  ChevronDown,
  ClipboardCheck,
  GraduationCap,
  Handshake,
  Gauge,
  Grid3x3,
  IdCard,
  LayoutDashboard,
  Library,
  LogOut,
  Megaphone,
  Menu,
  Route as RouteIcon,
  ScrollText,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Star,
  Target,
  Trophy,
  UserRound,
  UsersRound,
  X,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { ErrorBoundary } from '../components/domain/ErrorBoundary';
import { keys } from '../api/keys';
import { LogoMark } from '../components/domain/LogoMark';
import { SyncStatusChip } from '../components/domain/OfflineParts';
import { Avatar, Badge, IconButton, Spinner } from '../components/ui';
import { useDebounce } from '../hooks/misc';
import { useAuth, useCurrentUser } from '../hooks/useAuth';
import { useOfflineRuntime } from '../offline/useOffline';
import { fetchUnreadCount, listNotifications, markAllNotificationsRead, markNotificationRead, searchEverything } from '../services/notifications';
import type { Role } from '../types';
import { cn } from '../utils/cn';
import { NOTIFICATION_META } from '../utils/constants';
import { timeAgo } from '../utils/format';
import { paths, resolveNotificationLink } from '../utils/links';

interface NavItem {
  label: string;
  path: string;
  icon: LucideIcon;
  end?: boolean;
}
interface NavGroup {
  heading?: string;
  items: NavItem[];
}

/** Pages that are reached from other pages rather than from the menu still get an accurate breadcrumb. */
const DETAIL_PAGES: { label: string; path: string; end: boolean }[] = [
  { label: 'Course player', path: '/trainee/learn', end: false },
  { label: 'Assessment result', path: '/trainee/results', end: false },
  { label: 'Assessment result', path: '/trainer/attempts', end: false },
  { label: 'Course preview', path: '/trainer/preview', end: false },
  { label: 'Course preview', path: '/admin/preview', end: false },
  { label: 'Search results', path: '/search', end: false },
  { label: 'Announcements', path: '/announcements', end: false },
  { label: 'Competency', path: '/competencies', end: false },
  { label: 'Offline library', path: '/offline-library', end: true },
  { label: 'AR Instrument Lab', path: '/trainee/ar-lab', end: false },
];

const NAV: Record<Role, NavGroup[]> = {
  TRAINEE: [
    {
      heading: 'My competency',
      items: [
        { label: 'Dashboard', path: '/trainee', icon: LayoutDashboard, end: true },
        { label: 'Competency Passport', path: '/trainee/passport', icon: IdCard },
        { label: 'Skill Gaps', path: '/trainee/skill-gaps', icon: Target },
        { label: 'My Readiness', path: '/trainee/readiness', icon: Gauge },
        { label: 'Learning Path', path: '/trainee/learning-path', icon: RouteIcon },
      ],
    },
    {
      heading: 'Learning',
      items: [
        { label: 'Course Catalog', path: '/trainee/courses', icon: BookOpen },
        { label: 'My Courses', path: '/trainee/my-courses', icon: GraduationCap },
        { label: 'Assessments', path: '/trainee/assessments', icon: ClipboardCheck },
        { label: 'AR Instrument Lab', path: '/trainee/ar-lab', icon: Boxes },
        { label: 'Certificates', path: '/trainee/certificates', icon: Award },
        { label: 'Achievements', path: '/trainee/achievements', icon: Trophy },
        { label: 'Offline Library', path: '/offline-library', icon: CloudDownload },
      ],
    },
    { heading: 'Account', items: [{ label: 'Notifications', path: '/trainee/notifications', icon: Bell }, { label: 'My Profile', path: '/trainee/profile', icon: UserRound }] },
  ],
  TRAINER: [
    {
      heading: 'Teaching',
      items: [
        { label: 'Dashboard', path: '/trainer', icon: LayoutDashboard, end: true },
        { label: 'My Courses', path: '/trainer/courses', icon: BookOpen },
        { label: 'Assessments', path: '/trainer/assessments', icon: ClipboardCheck },
        { label: 'Trainees', path: '/trainer/trainees', icon: UsersRound },
        { label: 'Evaluations', path: '/trainer/evaluations', icon: Star },
        { label: 'AI Quiz Generator', path: '/trainer/quiz-generator', icon: Sparkles },
        { label: 'AR Practicals', path: '/trainer/ar-practicals', icon: Boxes },
      ],
    },
    { heading: 'Account', items: [{ label: 'Notifications', path: '/trainer/notifications', icon: Bell }, { label: 'My Profile', path: '/trainer/profile', icon: UserRound }] },
  ],
  ADMIN: [
    {
      heading: 'Insights',
      items: [
        { label: 'Dashboard', path: '/admin', icon: LayoutDashboard, end: true },
        { label: 'Operational Readiness', path: '/admin/readiness', icon: Gauge, end: true },
        { label: 'Readiness Calendar', path: '/admin/readiness/events', icon: CalendarClock },
        { label: 'Knowledge Continuity', path: '/admin/succession', icon: Handshake, end: true },
        { label: 'Competency Heatmap', path: '/admin/heatmap', icon: Grid3x3 },
        { label: 'Training Needs', path: '/admin/training-needs', icon: Target },
      ],
    },
    {
      heading: 'People & framework',
      items: [
        { label: 'Users', path: '/admin/users', icon: UsersRound },
        { label: 'Departments', path: '/admin/departments', icon: Building2 },
        { label: 'Job Roles', path: '/admin/roles', icon: Briefcase },
        { label: 'Competencies', path: '/admin/competencies', icon: Library },
        { label: 'Engine Settings', path: '/admin/settings', icon: SlidersHorizontal },
      ],
    },
    {
      heading: 'Learning & governance',
      items: [
        { label: 'Courses', path: '/admin/courses', icon: BookOpen },
        { label: 'AI Quiz Generator', path: '/admin/quiz-generator', icon: Sparkles },
        { label: 'AR Practicals', path: '/admin/ar-practicals', icon: Boxes },
        { label: 'Certificates', path: '/admin/certificates', icon: Award },
        { label: 'Announcements', path: '/admin/announcements', icon: Megaphone },
        { label: 'Audit Logs', path: '/admin/audit-logs', icon: ScrollText },
      ],
    },
    { heading: 'Account', items: [{ label: 'Notifications', path: '/admin/notifications', icon: Bell }, { label: 'My Profile', path: '/admin/profile', icon: UserRound }] },
  ],
};

function useOutsideClick(ref: React.RefObject<HTMLElement | null>, onOutside: () => void, active: boolean) {
  useEffect(() => {
    if (!active) return undefined;
    const handler = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) onOutside();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [ref, onOutside, active]);
}

// ---------------------------------------------------------------------------------------------
// Header widgets
// ---------------------------------------------------------------------------------------------

function GlobalSearch() {
  const user = useCurrentUser();
  const navigate = useNavigate();
  const [text, setText] = useState('');
  const [open, setOpen] = useState(false);
  const debounced = useDebounce(text.trim(), 250);
  const box = useRef<HTMLDivElement>(null);
  useOutsideClick(box, () => setOpen(false), open);

  const enabled = debounced.length >= 2;
  const query = useQuery({ queryKey: keys.search(debounced), queryFn: () => searchEverything(debounced), enabled, staleTime: 30_000 });

  const go = (to: string) => {
    setOpen(false);
    setText('');
    navigate(to);
  };
  const results = query.data;
  const empty = results && !results.courses.length && !results.competencies.length && !results.materials.length && !results.employees.length;

  const Group = ({ title, children }: { title: string; children: ReactNode }) => (
    <div className="py-1">
      <p className="px-3 pb-1 pt-2 text-[10px] font-bold uppercase tracking-wide text-slate-500">{title}</p>
      {children}
    </div>
  );
  const Row = ({ label, sub, onClick }: { label: string; sub?: string | null; onClick: () => void }) => (
    <button type="button" role="option" aria-selected={false} onClick={onClick} className="flex w-full flex-col rounded-lg px-3 py-2 text-left hover:bg-mist">
      <span className="text-sm font-semibold text-navy">{label}</span>
      {sub && <span className="line-clamp-1 text-xs text-slate-500">{sub}</span>}
    </button>
  );

  return (
    <div ref={box} className="relative hidden w-72 md:block lg:w-96" role="search" aria-label="Workspace">
      <div className="flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-2.5 text-sm text-slate-500 focus-within:ring-4 focus-within:ring-sky/10">
        <Search size={16} aria-hidden />
        <input
          aria-label="Search courses, competencies, materials and people"
          value={text}
          onChange={(event) => {
            setText(event.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && text.trim().length >= 2) go(`/search?q=${encodeURIComponent(text.trim())}`);
            if (event.key === 'Escape') setOpen(false);
          }}
          placeholder="Search courses, competencies…"
          className="w-full bg-transparent text-navy outline-none placeholder:text-slate-500"
        />
        {query.isFetching && <Spinner label="Searching" className="[&>span:last-child]:sr-only" />}
      </div>
      {open && text.trim().length >= 2 && (
        <div role="listbox" aria-label="Search results" className="absolute right-0 top-12 z-50 max-h-[70vh] w-full min-w-[22rem] overflow-y-auto rounded-xl border border-slate-100 bg-white p-2 shadow-lift">
          {query.isError && <p className="px-3 py-3 text-xs text-red-600">Search is unavailable right now.</p>}
          {empty && <p className="px-3 py-3 text-xs text-slate-500">No results for “{text.trim()}” in your workspace.</p>}
          {results && results.courses.length > 0 && (
            <Group title="Courses">
              {results.courses.map((course) => (
                <Row key={course.id} label={course.title} sub={course.category} onClick={() => go(paths.course(user.role, course.id))} />
              ))}
            </Group>
          )}
          {results && results.competencies.length > 0 && (
            <Group title="Competencies">
              {results.competencies.map((competency) => (
                <Row key={competency.id} label={competency.name} sub={competency.snippet ?? competency.category} onClick={() => go(`/competencies/${competency.id}`)} />
              ))}
            </Group>
          )}
          {results && results.materials.length > 0 && (
            <Group title="Learning materials">
              {results.materials.map((material) => (
                <Row key={material.id} label={material.title} sub={material.snippet ?? `${material.courseTitle} · ${material.moduleTitle}`} onClick={() => go(paths.course(user.role, material.courseId))} />
              ))}
            </Group>
          )}
          {results && results.employees.length > 0 && (
            <Group title="Employees">
              {results.employees.map((employee) => (
                <Row key={employee.id} label={employee.name} sub={`${employee.employeeId ?? employee.email}${employee.department ? ` · ${employee.department}` : ''}`} onClick={() => go(paths.employee(user.role, employee.id))} />
              ))}
            </Group>
          )}
          {results && !empty && (
            <button type="button" onClick={() => go(`/search?q=${encodeURIComponent(text.trim())}`)} className="mt-1 w-full rounded-lg px-3 py-2 text-left text-xs font-bold text-sky-deep hover:bg-mist">
              See all results →
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function NotificationBell() {
  const user = useCurrentUser();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useOutsideClick(box, () => setOpen(false), open);

  const unread = useQuery({ queryKey: keys.unreadCount, queryFn: fetchUnreadCount, refetchInterval: 60_000 });
  const latest = useQuery({ queryKey: keys.notifications({ pageSize: 6 }), queryFn: () => listNotifications({ pageSize: 6 }), enabled: open });
  const invalidate = () => queryClient.invalidateQueries({ queryKey: keys.notificationsAll });
  const readAll = useMutation({ mutationFn: markAllNotificationsRead, onSuccess: invalidate });
  const readOne = useMutation({ mutationFn: markNotificationRead, onSuccess: invalidate });
  const count = unread.data ?? 0;

  return (
    <div ref={box} className="relative">
      <button
        type="button"
        aria-label={count > 0 ? `Notifications, ${count} unread` : 'Notifications'}
        aria-expanded={open}
        aria-haspopup="true"
        onClick={() => setOpen((value) => !value)}
        className="relative rounded-xl p-2.5 text-slate-500 hover:bg-mist hover:text-navy"
      >
        <Bell size={19} />
        {count > 0 && <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-orange-700 px-1 text-[10px] font-bold text-white ring-2 ring-white">{count > 99 ? '99+' : count}</span>}
      </button>
      {open && (
        <div className="absolute right-0 top-12 z-50 w-[22rem] max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-slate-100 bg-white shadow-lift">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <p className="font-display text-sm font-bold text-navy">Notifications</p>
            <button type="button" disabled={count === 0 || readAll.isPending} onClick={() => readAll.mutate()} className="flex items-center gap-1 text-xs font-bold text-sky-deep disabled:text-slate-300">
              <CheckCheck size={13} /> Mark all read
            </button>
          </div>
          <div className="max-h-96 overflow-y-auto">
            {latest.isLoading && <p className="px-4 py-6 text-center text-xs text-slate-500">Loading…</p>}
            {latest.isError && <p className="px-4 py-6 text-center text-xs text-red-600">Could not load notifications.</p>}
            {latest.data?.items.length === 0 && <p className="px-4 py-8 text-center text-xs text-slate-500">You are all caught up.</p>}
            {latest.data?.items.map((notification) => (
              <button
                key={notification.id}
                type="button"
                onClick={() => {
                  if (!notification.isRead) readOne.mutate(notification.id);
                  setOpen(false);
                  navigate(resolveNotificationLink(notification.link, user.role) ?? paths.notifications(user.role));
                }}
                className={cn('flex w-full gap-3 border-b border-slate-50 px-4 py-3 text-left hover:bg-mist', !notification.isRead && 'bg-sky/[0.04]')}
              >
                <span className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-full', notification.isRead ? 'bg-transparent' : 'bg-coral')} aria-hidden />
                <span className="min-w-0">
                  <span className="block text-[10px] font-bold uppercase tracking-wide text-slate-500">{NOTIFICATION_META[notification.type].label}</span>
                  <span className="block text-sm font-semibold leading-5 text-navy">{notification.title}</span>
                  <span className="mt-0.5 line-clamp-2 block text-xs leading-5 text-slate-500">{notification.message}</span>
                  <span className="mt-1 block text-[11px] text-slate-500">{timeAgo(notification.createdAt)}</span>
                </span>
              </button>
            ))}
          </div>
          <button type="button" onClick={() => { setOpen(false); navigate(paths.notifications(user.role)); }} className="w-full border-t border-slate-100 px-4 py-3 text-center text-xs font-bold text-sky-deep hover:bg-mist">
            View all notifications
          </button>
        </div>
      )}
    </div>
  );
}

function ProfileMenu() {
  const user = useCurrentUser();
  const { logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useOutsideClick(box, () => setOpen(false), open);
  return (
    <div ref={box} className="relative">
      <button type="button" aria-haspopup="true" aria-expanded={open} onClick={() => setOpen((value) => !value)} className="flex items-center gap-2 rounded-xl p-1.5 hover:bg-slate-50">
        <Avatar name={user.name} size="sm" />
        <span className="sr-only text-left sm:not-sr-only">
          <span className="block max-w-[9rem] truncate text-sm font-bold leading-4 text-navy">{user.name}</span>
          <span className="block text-[11px] capitalize leading-4 text-slate-500">{user.role.toLowerCase()}</span>
        </span>
        <ChevronDown size={15} className="hidden text-slate-500 sm:block" aria-hidden />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-12 z-50 w-56 rounded-xl border border-slate-100 bg-white p-2 shadow-lift">
          <div className="border-b border-slate-100 px-3 pb-2 pt-1">
            <p className="truncate text-sm font-bold text-navy">{user.name}</p>
            <p className="truncate text-xs text-slate-500">{user.email}</p>
          </div>
          <button type="button" role="menuitem" onClick={() => { setOpen(false); navigate(paths.profile(user.role)); }} className="mt-1 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-mist">
            <UserRound size={15} /> My profile
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={async () => {
              setOpen(false);
              await logout();
              navigate('/login', { replace: true });
            }}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50"
          >
            <LogOut size={15} /> Sign out
          </button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// Shell
// ---------------------------------------------------------------------------------------------

export function AppShell() {
  const user = useCurrentUser();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const groups = NAV[user.role];
  useOfflineRuntime(); // watches the connection and drains the offline queue
  const unread = useQuery({ queryKey: keys.unreadCount, queryFn: fetchUnreadCount, refetchInterval: 60_000 });

  // Close the mobile menu after navigating, and move focus to the page for keyboard / screen-reader users.
  useEffect(() => {
    setMobileOpen(false);
    document.getElementById('main-content')?.focus({ preventScroll: true });
  }, [location.pathname]);

  const currentLabel = useMemo(() => {
    const candidates = [...groups.flatMap((group) => group.items.map(({ label, path, end }) => ({ label, path, end: Boolean(end) }))), ...DETAIL_PAGES];
    const matches = candidates.filter((item) => location.pathname === item.path || (!item.end && location.pathname.startsWith(`${item.path}/`)));
    return matches.sort((a, b) => b.path.length - a.path.length)[0]?.label;
  }, [groups, location.pathname]);

  return (
    <div className="min-h-screen bg-cloud text-slate-700">
      <a href="#main-content" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[70] focus:rounded-lg focus:bg-white focus:px-4 focus:py-2 focus:font-bold focus:text-navy">
        Skip to main content
      </a>

      <aside
        aria-label="Main navigation"
        className={cn('no-print fixed inset-y-0 left-0 z-40 flex w-[264px] flex-col border-r border-white/10 bg-navy px-4 py-5 text-white transition-transform duration-300 lg:translate-x-0', mobileOpen ? 'translate-x-0' : '-translate-x-full')}
      >
        <div className="flex items-center justify-between px-3">
          <LogoMark />
          <IconButton label="Close navigation" onClick={() => setMobileOpen(false)} className="!text-white/60 hover:!bg-white/10 hover:!text-white lg:hidden">
            <X size={19} />
          </IconButton>
        </div>

        <div className="mx-3 mt-6 rounded-2xl border border-white/10 bg-white/5 p-3">
          <div className="flex items-center gap-3">
            <Avatar name={user.name} tone="navy" />
            <div className="min-w-0">
              <p className="truncate text-sm font-bold">{user.name}</p>
              <p className="mt-0.5 truncate text-[11px] text-white/50">{user.jobRole?.name ?? `${user.role.charAt(0)}${user.role.slice(1).toLowerCase()} workspace`}</p>
            </div>
          </div>
        </div>

        <nav className="mt-3 flex-1 space-y-4 overflow-y-auto pb-4 pr-1">
          {groups.map((group, index) => (
            <div key={group.heading ?? index}>
              {group.heading && <p className="mb-1.5 mt-3 px-3 text-[10px] font-bold uppercase tracking-[0.2em] text-white/60">{group.heading}</p>}
              <ul className="space-y-0.5">
                {group.items.map(({ label, path, icon: Icon, end }) => (
                  <li key={path}>
                    <NavLink
                      to={path}
                      end={end ?? false}
                      className={({ isActive }) => cn('flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition', isActive ? 'bg-sky-deep text-white shadow-lg shadow-sky/20' : 'text-white/60 hover:bg-white/10 hover:text-white')}
                    >
                      <Icon size={17} strokeWidth={1.8} aria-hidden />
                      <span className="truncate">{label}</span>
                      {label === 'Notifications' && (unread.data ?? 0) > 0 && <span className="ml-auto rounded-full bg-orange-700 px-1.5 py-0.5 text-[10px] text-white">{unread.data}</span>}
                    </NavLink>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>

        <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-white/10 to-transparent p-4">
          <div className="mb-2 flex items-center gap-2 text-sky-light">
            <ShieldCheck size={18} aria-hidden />
            <span className="text-xs font-bold">Competency intelligence</span>
          </div>
          <p className="text-xs leading-5 text-white/55">From course completion to competency development.</p>
        </div>
      </aside>

      {mobileOpen && <button type="button" aria-label="Close menu overlay" className="fixed inset-0 z-30 bg-navy/40 lg:hidden" onClick={() => setMobileOpen(false)} />}

      <div className="lg:pl-[264px]">
        <header className="no-print sticky top-0 z-20 flex h-[72px] items-center justify-between gap-4 border-b border-slate-100 bg-white/90 px-4 backdrop-blur-md md:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <IconButton label="Open navigation" onClick={() => setMobileOpen(true)} className="lg:hidden">
              <Menu size={21} />
            </IconButton>
            <div className="hidden min-w-0 items-center gap-2 text-xs text-slate-500 md:flex">
              <span>Capacity Connect</span>
              <span aria-hidden>/</span>
              <span className="truncate font-semibold text-slate-600">{currentLabel ?? 'Workspace'}</span>
            </div>
          </div>
          <div className="flex items-center gap-1 md:gap-3">
            <GlobalSearch />
            <SyncStatusChip className="hidden sm:block" />
            <NotificationBell />
            <ProfileMenu />
          </div>
        </header>

        <main id="main-content" tabIndex={-1} className="mx-auto max-w-[1500px] p-4 outline-none md:p-8">
          <ErrorBoundary resetKey={location.pathname}>
            <Outlet />
          </ErrorBoundary>
        </main>
      </div>
    </div>
  );
}

export function RoleBadgeInline({ role }: { role: Role }) {
  return <Badge tone={role === 'ADMIN' ? 'purple' : role === 'TRAINER' ? 'success' : 'info'}>{role.toLowerCase()}</Badge>;
}
