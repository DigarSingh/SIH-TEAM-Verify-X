import { AlertTriangle, Info, Loader2, RefreshCw } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '../../utils/cn';
import { errorMessage, isApiError } from '../../api/client';
import { Button } from './Button';
import { Skeleton } from './Display';

export function EmptyState({ title, description, icon = <Info size={18} />, action }: { title: string; description?: string; icon?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50/60 px-6 py-12 text-center">
      <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-mist text-sky-deep" aria-hidden>
        {icon}
      </div>
      <h2 className="font-display font-bold text-navy">{title}</h2>
      {description && <p className="mt-1 max-w-sm text-sm text-slate-500">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/** Shown when a request fails. Offers a retry and never hides the underlying reason. */
export function ErrorState({ error, onRetry, title = 'We could not load this' }: { error: unknown; onRetry?: () => void; title?: string }) {
  const forbidden = isApiError(error) && error.status === 403;
  const missing = isApiError(error) && error.status === 404;
  return (
    <div role="alert" className="flex flex-col items-center justify-center rounded-2xl border border-red-100 bg-red-50/50 px-6 py-12 text-center">
      <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-red-100 text-red-600" aria-hidden>
        <AlertTriangle size={18} />
      </div>
      <h2 className="font-display font-bold text-navy">{forbidden ? 'Access denied' : missing ? 'Not found' : title}</h2>
      <p className="mt-1 max-w-md text-sm text-slate-600">{errorMessage(error)}</p>
      {onRetry && !forbidden && !missing && (
        <Button variant="secondary" size="sm" className="mt-4" onClick={onRetry} leftIcon={<RefreshCw size={14} />}>
          Try again
        </Button>
      )}
    </div>
  );
}

export function Spinner({ label = 'Loading', className }: { label?: string; className?: string }) {
  return (
    <span role="status" className={cn('inline-flex items-center gap-2 text-sm text-slate-500', className)}>
      <Loader2 size={16} className="animate-spin text-sky-deep" aria-hidden />
      <span>{label}…</span>
    </span>
  );
}

/** Page-level loading placeholder (skeleton cards). */
export function PageLoading({ label = 'Loading' }: { label?: string }) {
  return (
    <div role="status" aria-label={label} className="animate-fade-in space-y-6">
      <div className="space-y-3">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-9 w-72" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((item) => (
          <Skeleton key={item} className="h-32" />
        ))}
      </div>
      <Skeleton className="h-72" />
      <span className="sr-only">{label}…</span>
    </div>
  );
}

export function InlineAlert({ tone = 'info', children, className }: { tone?: 'info' | 'warning' | 'danger' | 'success'; children: ReactNode; className?: string }) {
  const tones = {
    info: 'border-sky/20 bg-sky/5 text-sky-900',
    warning: 'border-amber-200 bg-amber-50 text-amber-900',
    danger: 'border-red-200 bg-red-50 text-red-800',
    success: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  };
  return (
    <div role={tone === 'danger' ? 'alert' : 'status'} className={cn('rounded-xl border px-4 py-3 text-sm leading-6', tones[tone], className)}>
      {children}
    </div>
  );
}
