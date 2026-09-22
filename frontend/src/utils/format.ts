const TIME_ZONE = 'Asia/Kolkata';

const dateFormat = new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: TIME_ZONE });
const dateTimeFormat = new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true, timeZone: TIME_ZONE });
const shortDate = new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', timeZone: TIME_ZONE });

export const formatDate = (iso: string | Date | null | undefined): string => (iso ? dateFormat.format(new Date(iso)) : '-');
export const formatDateTime = (iso: string | Date | null | undefined): string => (iso ? dateTimeFormat.format(new Date(iso)) : '-');
export const formatShortDate = (iso: string | Date | null | undefined): string => (iso ? shortDate.format(new Date(iso)) : '-');

/** `2026-09` → `Sep 26` */
export function monthLabel(key: string): string {
  const [year, month] = key.split('-').map(Number);
  if (!year || !month) return key;
  return new Intl.DateTimeFormat('en-IN', { month: 'short', year: '2-digit', timeZone: 'UTC' }).format(new Date(Date.UTC(year, month - 1, 1)));
}

/** "just now", "5 min ago", "3 h ago", "yesterday", "4 d ago", then a date. */
export function timeAgo(iso: string | Date | null | undefined, now: number = Date.now()): string {
  if (!iso) return '-';
  const then = new Date(iso).getTime();
  const seconds = Math.round((now - then) / 1000);
  if (seconds < 45) return 'just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  if (days === 1) return 'yesterday';
  if (days < 14) return `${days} d ago`;
  return formatDate(iso);
}

/** Whole days from now until `iso` (negative when past). */
export function daysUntil(iso: string | Date, now: number = Date.now()): number {
  return Math.ceil((new Date(iso).getTime() - now) / 86_400_000);
}

export function formatDuration(minutes: number): string {
  if (minutes <= 0) return '-';
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest} min`;
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
}

export const formatPercent = (value: number | null | undefined, digits = 0): string =>
  value === null || value === undefined ? '-' : `${Number.isInteger(value) ? value : value.toFixed(digits)}%`;

export const formatNumber = (value: number): string => new Intl.NumberFormat('en-IN').format(value);

export function initials(name: string): string {
  return (
    name
      .replace(/^(dr|mr|mrs|ms|prof)\.?\s+/i, '')
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? '')
      .join('') || '?'
  );
}

export const plural = (count: number, singular: string, pluralForm = `${singular}s`): string => `${count} ${count === 1 ? singular : pluralForm}`;

export function formatFileSize(bytes: number | null | undefined): string {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** mm:ss for countdown timers. */
export function formatClock(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = seconds % 60;
  const pad = (value: number) => String(value).padStart(2, '0');
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(rest)}` : `${pad(minutes)}:${pad(rest)}`;
}
