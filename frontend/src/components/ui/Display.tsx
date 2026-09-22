import type { ReactNode } from 'react';
import { cn } from '../../utils/cn';
import { initials } from '../../utils/format';
import { TONE_CLASSES, type Tone } from '../../utils/constants';

export function Card({ children, className, title, description, action, padded = true }: { children: ReactNode; className?: string; title?: ReactNode; description?: ReactNode; action?: ReactNode; padded?: boolean }) {
  return (
    <section className={cn('min-w-0 rounded-2xl border border-slate-100 bg-white shadow-card', className)}>
      {(title || action) && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-5 py-4">
          <div>
            {title && <h2 className="font-display text-base font-bold text-navy">{title}</h2>}
            {description && <p className="mt-0.5 text-xs text-slate-500">{description}</p>}
          </div>
          {action}
        </div>
      )}
      {padded ? <div className="p-5">{children}</div> : children}
    </section>
  );
}

export function Badge({ children, tone = 'neutral', className, title }: { children: ReactNode; tone?: Tone; className?: string; title?: string }) {
  return (
    <span title={title} className={cn('inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-bold', TONE_CLASSES[tone], className)}>
      {children}
    </span>
  );
}

const BAR_COLORS = { sky: 'bg-sky', teal: 'bg-teal', green: 'bg-emerald-500', amber: 'bg-amber-400', red: 'bg-red-500', navy: 'bg-navy', violet: 'bg-violet-500' };

export function ProgressBar({ value, color = 'sky', height = 'h-2', showLabel = false, label }: { value: number; color?: keyof typeof BAR_COLORS; height?: string; showLabel?: boolean; label?: string }) {
  const clamped = Math.min(100, Math.max(0, value));
  return (
    <div className="flex items-center gap-3">
      <div role="progressbar" aria-valuenow={Math.round(clamped)} aria-valuemin={0} aria-valuemax={100} aria-label={label ?? 'Progress'} className={cn('min-w-0 flex-1 overflow-hidden rounded-full bg-slate-100', height)}>
        <div className={cn('h-full rounded-full transition-all duration-500', BAR_COLORS[color])} style={{ width: `${clamped}%` }} />
      </div>
      {showLabel && <span className="w-10 text-right text-xs font-bold text-slate-600">{Math.round(clamped)}%</span>}
    </div>
  );
}

const STAT_TONES = { sky: 'bg-sky/10 text-sky-deep', teal: 'bg-teal/10 text-teal-deep', amber: 'bg-amber-50 text-amber-700', purple: 'bg-violet-50 text-violet-600', coral: 'bg-orange-50 text-orange-700', green: 'bg-emerald-50 text-emerald-700' };

export function StatCard({ label, value, meta, icon, tone = 'sky', trend, onClick }: { label: string; value: ReactNode; meta?: ReactNode; icon: ReactNode; tone?: keyof typeof STAT_TONES; trend?: ReactNode; onClick?: () => void }) {
  const content = (
    <>
      <div className="flex items-start justify-between">
        <div className="min-w-0 text-left">
          <p className="text-xs font-semibold text-slate-500">{label}</p>
          <p className="mt-2 font-display text-3xl font-bold text-navy">{value}</p>
        </div>
        <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl', STAT_TONES[tone])} aria-hidden>
          {icon}
        </div>
      </div>
      {(meta || trend) && (
        <div className="mt-4 flex items-center justify-between gap-2 text-xs">
          <span className="text-slate-500">{meta}</span>
          {trend && <span className="font-bold text-emerald-700">{trend}</span>}
        </div>
      )}
    </>
  );
  const classes = 'block w-full rounded-2xl border border-slate-100 bg-white p-5 shadow-card transition hover:-translate-y-0.5 hover:shadow-lift';
  return onClick ? (
    <button type="button" onClick={onClick} className={classes}>
      {content}
    </button>
  ) : (
    <div className={classes}>{content}</div>
  );
}

export function PageHeader({ eyebrow, title, description, actions }: { eyebrow?: string; title: ReactNode; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-7 flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
      <div className="min-w-0">
        {eyebrow && <p className="mb-2 text-xs font-bold uppercase tracking-[0.18em] text-sky-deep">{eyebrow}</p>}
        <h1 className="font-display text-3xl font-bold tracking-tight text-navy md:text-4xl">{title}</h1>
        {description && <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">{description}</p>}
      </div>
      {actions && <div className="no-print flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function SectionLabel({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-4 flex items-center justify-between gap-3">
      <div className="flex items-center gap-2">
        <span className="h-5 w-1 rounded-full bg-sky" aria-hidden />
        <h2 className="font-display text-lg font-bold text-navy">{children}</h2>
      </div>
      {action}
    </div>
  );
}

export function Avatar({ name, size = 'md', tone = 'sky' }: { name: string; size?: 'sm' | 'md' | 'lg' | 'xl'; tone?: 'sky' | 'navy' | 'teal' }) {
  const sizes = { sm: 'h-8 w-8 text-[11px]', md: 'h-10 w-10 text-sm', lg: 'h-14 w-14 text-lg', xl: 'h-20 w-20 text-2xl' };
  const tones = { sky: 'bg-mist text-sky-deep', navy: 'bg-sky-deep text-white', teal: 'bg-teal/10 text-teal-deep' };
  return (
    <span aria-hidden className={cn('inline-flex shrink-0 items-center justify-center rounded-full font-bold', sizes[size], tones[tone])}>
      {initials(name)}
    </span>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn('animate-pulse rounded-lg bg-slate-100', className)} />;
}

export function Divider({ className }: { className?: string }) {
  return <hr className={cn('border-slate-100', className)} />;
}

export function KeyValue({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-[11px] font-bold uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="mt-0.5 text-sm font-semibold text-navy">{children ?? '-'}</dd>
    </div>
  );
}

/** A star rating display (read-only). */
export function Stars({ value, size = 14 }: { value: number; size?: number }) {
  const rounded = Math.round(value);
  return (
    <span role="img" aria-label={`${value.toFixed(1)} out of 5`} className="inline-flex gap-0.5 text-amber-400">
      {[1, 2, 3, 4, 5].map((star) => (
        <svg key={star} width={size} height={size} viewBox="0 0 24 24" fill={star <= rounded ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" aria-hidden>
          <path d="M12 2.5l2.95 6 6.55.95-4.75 4.6 1.15 6.5L12 17.5l-5.9 3.05 1.15-6.5L2.5 9.45l6.55-.95L12 2.5z" />
        </svg>
      ))}
    </span>
  );
}
