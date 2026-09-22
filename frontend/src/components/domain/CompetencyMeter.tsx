import { ArrowRight } from 'lucide-react';
import { Fragment } from 'react';
import { cn } from '../../utils/cn';
import { SEVERITY_META } from '../../utils/constants';
import type { Severity } from '../../types';

/**
 * Horizontal competency meter: the fill is the CURRENT level, the notch is the
 * REQUIRED level, and the shaded stretch between them is the skill gap.
 */
export function CompetencyMeter({
  current,
  required,
  severity,
  height = 'h-3',
  showScale = true,
  label,
}: {
  current: number;
  required: number | null;
  severity?: Severity;
  height?: string;
  showScale?: boolean;
  label: string;
}) {
  const met = required !== null && current >= required;
  const fill = met ? '#10B981' : severity ? SEVERITY_META[severity].hex : '#2D8CFF';
  const description = required === null ? `${label}: ${current}%` : `${label}: currently ${current}%, required ${required}%`;
  return (
    <div>
      <div role="img" aria-label={description} className={cn('relative w-full rounded-full bg-slate-100', height)}>
        {required !== null && required > current && <div className="absolute inset-y-0 rounded-full bg-slate-200/80" style={{ left: `${current}%`, width: `${required - current}%` }} />}
        <div className="absolute inset-y-0 left-0 rounded-full transition-all duration-700" style={{ width: `${Math.min(100, current)}%`, background: fill }} />
        {required !== null && (
          <div className="absolute -inset-y-1 w-0.5 rounded bg-navy" style={{ left: `calc(${Math.min(100, required)}% - 1px)` }} aria-hidden>
            <span className="absolute -top-4 left-1/2 -translate-x-1/2 whitespace-nowrap text-[10px] font-bold text-navy">{required}%</span>
          </div>
        )}
      </div>
      {showScale && (
        <div className="mt-1.5 flex justify-between text-[10px] font-semibold text-slate-500" aria-hidden>
          <span>0</span>
          <span>50</span>
          <span>100</span>
        </div>
      )}
    </div>
  );
}

/** `35% → 52% → 72%` - how a competency moved over time. */
export function ProgressionChips({ values, required }: { values: number[]; required?: number | null }) {
  if (values.length === 0) return null;
  const last = values.length - 1;
  return (
    <ol className="flex flex-wrap items-center gap-1.5" aria-label={`Competency progression: ${values.map((value) => `${value}%`).join(' then ')}`}>
      {values.map((value, index) => (
        <Fragment key={`${index}-${value}`}>
          <li className={cn('rounded-lg px-2.5 py-1 text-xs font-bold', index === last ? (required !== undefined && required !== null && value >= required ? 'bg-emerald-50 text-emerald-700' : 'bg-sky/10 text-sky-deep') : 'bg-slate-100 text-slate-600')}>{value}%</li>
          {index < last && <ArrowRight size={12} className="text-slate-300" aria-hidden />}
        </Fragment>
      ))}
    </ol>
  );
}

/** Tiny SVG line of the progression (no axes) for compact cards. */
export function Sparkline({ values, width = 120, height = 36, color = '#2D8CFF' }: { values: number[]; width?: number; height?: number; color?: string }) {
  if (values.length < 2) return <span className="text-xs text-slate-500">No history yet</span>;
  const min = Math.min(...values) - 5;
  const max = Math.max(...values) + 5;
  const points = values.map((value, index) => [(index / (values.length - 1)) * (width - 8) + 4, height - 4 - ((value - min) / (max - min || 1)) * (height - 8)] as const);
  const path = points.map(([x, y], index) => `${index === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`Trend: ${values.join(', ')}`}>
      <path d={path} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      {points.map(([x, y], index) => (
        <circle key={index} cx={x} cy={y} r={index === points.length - 1 ? 3.5 : 2.5} fill={index === points.length - 1 ? color : '#fff'} stroke={color} strokeWidth="1.6" />
      ))}
    </svg>
  );
}
