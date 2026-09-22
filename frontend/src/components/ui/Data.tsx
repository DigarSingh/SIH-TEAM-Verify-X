import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '../../utils/cn';
import type { PageMeta } from '../../types';
import { Button } from './Button';

/**
 * Responsive table wrapper: scrolls horizontally on small screens instead of breaking the layout. The scroll area can take
 * keyboard focus so that people who do not use a mouse can scroll it too. It is `relative` so that visually hidden text
 * inside the table (absolutely positioned) is scrolled and clipped with it instead of widening the whole page.
 */
export function DataTable({ children, caption, className }: { children: ReactNode; caption?: string; className?: string }) {
  return (
    <div
      tabIndex={0}
      role={caption ? 'region' : undefined}
      aria-label={caption}
      className={cn('relative overflow-x-auto focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-inset focus-visible:ring-sky/40', className)}
    >
      <table className="w-full min-w-[640px] border-collapse text-left text-sm">
        {caption && <caption className="sr-only">{caption}</caption>}
        {children}
      </table>
    </div>
  );
}

export const Th = ({ children, className, align = 'left' }: { children?: ReactNode; className?: string; align?: 'left' | 'right' | 'center' }) => (
  <th scope="col" className={cn('whitespace-nowrap border-b border-slate-100 bg-slate-50/70 px-4 py-3 text-[11px] font-bold uppercase tracking-wide text-slate-500', align === 'right' && 'text-right', align === 'center' && 'text-center', className)}>
    {children}
  </th>
);

export const Td = ({ children, className, align = 'left' }: { children?: ReactNode; className?: string; align?: 'left' | 'right' | 'center' }) => (
  <td className={cn('border-b border-slate-100 px-4 py-3.5 align-middle text-slate-600', align === 'right' && 'text-right', align === 'center' && 'text-center', className)}>{children}</td>
);

export function Pagination({ meta, onPage, label = 'Pagination' }: { meta: Pick<PageMeta, 'page' | 'pageSize' | 'total' | 'totalPages'>; onPage: (page: number) => void; label?: string }) {
  if (meta.total === 0) return null;
  const from = (meta.page - 1) * meta.pageSize + 1;
  const to = Math.min(meta.total, meta.page * meta.pageSize);
  return (
    <nav aria-label={label} className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-4 py-3 text-xs text-slate-500">
      <p>
        Showing <span className="font-bold text-navy">{from}</span>-<span className="font-bold text-navy">{to}</span> of <span className="font-bold text-navy">{meta.total}</span>
      </p>
      <div className="flex items-center gap-2">
        <Button variant="secondary" size="sm" disabled={meta.page <= 1} onClick={() => onPage(meta.page - 1)} leftIcon={<ChevronLeft size={14} />}>
          Previous
        </Button>
        <span aria-current="page" className="px-2 font-semibold">
          Page {meta.page} of {meta.totalPages}
        </span>
        <Button variant="secondary" size="sm" disabled={meta.page >= meta.totalPages} onClick={() => onPage(meta.page + 1)} rightIcon={<ChevronRight size={14} />}>
          Next
        </Button>
      </div>
    </nav>
  );
}

export interface TabItem<T extends string> {
  id: T;
  label: string;
  count?: number;
  icon?: ReactNode;
}

/** Accessible tab bar (the panel content is rendered by the caller). */
export function Tabs<T extends string>({ items, value, onChange, label = 'Sections' }: { items: TabItem<T>[]; value: T; onChange: (id: T) => void; label?: string }) {
  return (
    <div role="tablist" aria-label={label} className="no-print mb-6 flex gap-1 overflow-x-auto border-b border-slate-200">
      {items.map((item) => {
        const active = item.id === value;
        return (
          <button
            key={item.id}
            type="button"
            role="tab"
            id={`tab-${item.id}`}
            aria-selected={active}
            aria-controls={`panel-${item.id}`}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(item.id)}
            onKeyDown={(event) => {
              const index = items.findIndex((candidate) => candidate.id === item.id);
              if (event.key === 'ArrowRight') onChange((items[(index + 1) % items.length] as TabItem<T>).id);
              if (event.key === 'ArrowLeft') onChange((items[(index - 1 + items.length) % items.length] as TabItem<T>).id);
            }}
            className={cn('-mb-px flex shrink-0 items-center gap-2 border-b-2 px-4 py-3 text-sm font-semibold transition', active ? 'border-sky text-sky-deep' : 'border-transparent text-slate-500 hover:text-navy')}
          >
            {item.icon}
            {item.label}
            {item.count !== undefined && <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-bold', active ? 'bg-sky/10 text-sky-deep' : 'bg-slate-100 text-slate-600')}>{item.count}</span>}
          </button>
        );
      })}
    </div>
  );
}

export function TabPanel({ id, active, children }: { id: string; active: boolean; children: ReactNode }) {
  if (!active) return null;
  return (
    <div role="tabpanel" id={`panel-${id}`} aria-labelledby={`tab-${id}`} className="animate-fade-in">
      {children}
    </div>
  );
}

/** Small segmented button group (e.g. "Level | Gap"). */
export function Segmented<T extends string>({ items, value, onChange, label }: { items: { id: T; label: string }[]; value: T; onChange: (id: T) => void; label: string }) {
  return (
    <div role="group" aria-label={label} className="inline-flex rounded-xl bg-slate-100 p-1">
      {items.map((item) => (
        <button key={item.id} type="button" aria-pressed={item.id === value} onClick={() => onChange(item.id)} className={cn('rounded-lg px-3 py-1.5 text-xs font-bold transition', item.id === value ? 'bg-white text-navy shadow-sm' : 'text-slate-600 hover:text-navy')}>
          {item.label}
        </button>
      ))}
    </div>
  );
}
