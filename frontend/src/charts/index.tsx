import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useId } from 'react';
import { monthLabel } from '../utils/format';

const tooltipStyle = { borderRadius: 12, border: '1px solid #E6EDF3', boxShadow: '0 10px 25px rgba(15,42,67,.08)', fontSize: 12 };
const axisTick = { fill: '#8A9BAD', fontSize: 11 };

export const CHART_COLORS = { sky: '#2D8CFF', teal: '#0EA5A8', navy: '#0B1F3A', coral: '#EA6A47', amber: '#F59E0B', green: '#10B981', violet: '#8B5CF6', slate: '#94A3B8' };

interface RadarTickProps {
  x?: number;
  y?: number;
  cx?: number;
  payload?: { value: string };
}

/** Breaks a competency name into short lines so axis labels never run off the chart. */
function wrapLabel(text: string, maxChars = 12, maxLines = 3): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(' ')) {
    if (line && `${line} ${word}`.length > maxChars) {
      lines.push(line);
      line = word;
    } else {
      line = line ? `${line} ${word}` : word;
    }
  }
  if (line) lines.push(line);
  if (lines.length > maxLines) return [...lines.slice(0, maxLines - 1), `${lines.slice(maxLines - 1).join(' ').slice(0, maxChars - 1)}…`];
  return lines;
}

function RadarTick({ x = 0, y = 0, cx = 0, payload }: RadarTickProps) {
  const label = payload?.value ?? '';
  const lines = wrapLabel(label);
  const anchor = Math.abs(x - cx) < 8 ? 'middle' : x > cx ? 'start' : 'end';
  return (
    <text x={x} y={y} textAnchor={anchor} fill="#52667A" fontSize={10.5}>
      <title>{label}</title>
      {lines.map((line, index) => (
        <tspan key={index} x={x} dy={index === 0 ? 4 - (lines.length - 1) * 6.5 : 13}>
          {line}
        </tspan>
      ))}
    </text>
  );
}

/** Competency radar: current level against the level the role requires. */
export function CompetencyRadar({ data, height = 300 }: { data: { competency: string; current: number; required: number }[]; height?: number }) {
  if (data.length < 3) return <p className="py-10 text-center text-sm text-slate-500">A radar view needs at least three competencies.</p>;
  return (
    <div role="img" aria-label={`Radar chart of ${data.length} competencies: ${data.map((d) => `${d.competency} ${d.current} of ${d.required} required`).join('; ')}`}>
      <ResponsiveContainer width="100%" height={height}>
        <RadarChart data={data} outerRadius="58%" margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
          <PolarGrid stroke="#E2E8F0" />
          <PolarAngleAxis dataKey="competency" tick={<RadarTick />} />
          <PolarRadiusAxis angle={90} domain={[0, 100]} tick={{ fill: '#94A3B8', fontSize: 10 }} tickCount={5} axisLine={false} />
          <Radar name="Required" dataKey="required" stroke={CHART_COLORS.navy} strokeDasharray="4 3" fill={CHART_COLORS.navy} fillOpacity={0.05} />
          <Radar name="Current" dataKey="current" stroke={CHART_COLORS.sky} fill={CHART_COLORS.sky} fillOpacity={0.3} strokeWidth={2} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Tooltip contentStyle={tooltipStyle} />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
}

export interface Series {
  key: string;
  name: string;
  color: string;
}

/** Monthly trend (area) chart. `data` items need a `month` key (YYYY-MM). */
export function TrendChart({ data, series, height = 250, yDomain, unit = '' }: { data: Record<string, string | number | null>[]; series: Series[]; height?: number; yDomain?: [number, number]; unit?: string }) {
  // Gradient ids are global in the document, so make them unique per chart instance.
  const uid = useId().replace(/:/g, '');
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 10, right: 8, left: -18, bottom: 0 }}>
        <defs>
          {series.map((item) => (
            <linearGradient key={item.key} id={`fill-${uid}-${item.key}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={item.color} stopOpacity={0.24} />
              <stop offset="100%" stopColor={item.color} stopOpacity={0} />
            </linearGradient>
          ))}
        </defs>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E8EEF4" />
        <XAxis dataKey="month" tickFormatter={monthLabel} axisLine={false} tickLine={false} tick={axisTick} />
        <YAxis axisLine={false} tickLine={false} tick={axisTick} {...(yDomain ? { domain: yDomain } : {})} allowDecimals={false} />
        <Tooltip contentStyle={tooltipStyle} labelFormatter={(label) => monthLabel(String(label))} formatter={(value) => (value === null ? '-' : `${value}${unit}`)} />
        {series.length > 1 && <Legend wrapperStyle={{ fontSize: 12 }} />}
        {series.map((item) => (
          <Area key={item.key} type="monotone" dataKey={item.key} name={item.name} stroke={item.color} strokeWidth={3} fill={`url(#fill-${uid}-${item.key})`} connectNulls />
        ))}
      </AreaChart>
    </ResponsiveContainer>
  );
}

/** Line chart with dots (for scores and competency levels over time). */
export function LineTrend({ data, series, height = 240, yDomain = [0, 100], unit = '%' }: { data: Record<string, string | number | null>[]; series: Series[]; height?: number; yDomain?: [number, number]; unit?: string }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 10, right: 8, left: -18, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E8EEF4" />
        <XAxis dataKey="month" tickFormatter={monthLabel} axisLine={false} tickLine={false} tick={axisTick} />
        <YAxis domain={yDomain} axisLine={false} tickLine={false} tick={axisTick} />
        <Tooltip contentStyle={tooltipStyle} labelFormatter={(label) => monthLabel(String(label))} formatter={(value) => (value === null ? '-' : `${value}${unit}`)} />
        {series.length > 1 && <Legend wrapperStyle={{ fontSize: 12 }} />}
        {series.map((item) => (
          <Line key={item.key} type="monotone" dataKey={item.key} name={item.name} stroke={item.color} strokeWidth={3} dot={{ fill: item.color, strokeWidth: 2, r: 3.5 }} connectNulls />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

/** The recorded monthly average (solid) continued by the trend projection (dashed), against the required level. */
export function ForecastChart({ history, projection, required, height = 260 }: { history: { month: string; value: number }[]; projection: { month: string; value: number }[]; required: number; height?: number }) {
  const last = history[history.length - 1];
  // The dashed line starts at the last recorded point so the two lines join.
  const data: Record<string, string | number | null>[] = [
    ...history.map((point) => ({ month: point.month, recorded: point.value, projected: point === last ? point.value : null })),
    ...projection.map((point) => ({ month: point.month, recorded: null, projected: point.value })),
  ];
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 10, right: 8, left: -18, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E8EEF4" />
        <XAxis dataKey="month" tickFormatter={monthLabel} axisLine={false} tickLine={false} tick={axisTick} />
        <YAxis domain={[0, 100]} axisLine={false} tickLine={false} tick={axisTick} />
        <Tooltip contentStyle={tooltipStyle} labelFormatter={(label) => monthLabel(String(label))} formatter={(value) => (value === null ? '-' : `${value}%`)} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <ReferenceLine y={required} stroke={CHART_COLORS.coral} strokeDasharray="6 4" label={{ value: `Required ${required}%`, position: 'insideTopRight', fill: CHART_COLORS.coral, fontSize: 11 }} />
        <Line type="linear" dataKey="recorded" name="Recorded average" stroke={CHART_COLORS.sky} strokeWidth={3} dot={{ fill: CHART_COLORS.sky, strokeWidth: 2, r: 3.5 }} connectNulls />
        <Line type="linear" dataKey="projected" name="Projected trend" stroke={CHART_COLORS.violet} strokeWidth={3} strokeDasharray="6 4" dot={{ fill: CHART_COLORS.violet, strokeWidth: 2, r: 3 }} connectNulls />
      </LineChart>
    </ResponsiveContainer>
  );
}

/** Horizontal bar chart for ranked comparisons (departments, courses...). */
export function HorizontalBars({ data, nameKey, series, height = 260, domain = [0, 100], nameWidth = 120 }: { data: Record<string, string | number | null>[]; nameKey: string; series: Series[]; height?: number; domain?: [number, number]; nameWidth?: number }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} layout="vertical" margin={{ top: 5, right: 18, left: 4, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#E8EEF4" />
        <XAxis type="number" domain={domain} axisLine={false} tickLine={false} tick={axisTick} />
        <YAxis type="category" dataKey={nameKey} width={nameWidth} axisLine={false} tickLine={false} tick={{ fill: '#5F7387', fontSize: 11 }} />
        <Tooltip contentStyle={tooltipStyle} cursor={{ fill: '#F1F5F9' }} />
        {series.length > 1 && <Legend wrapperStyle={{ fontSize: 12 }} />}
        {series.map((item) => (
          <Bar key={item.key} dataKey={item.key} name={item.name} fill={item.color} radius={[0, 7, 7, 0]} barSize={series.length > 1 ? 10 : 18} />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Vertical column chart (score distributions, module funnels). */
export function Columns({ data, xKey, series, height = 220, colors }: { data: Record<string, string | number | null>[]; xKey: string; series: Series[]; height?: number; colors?: string[] }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 10, right: 8, left: -18, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E8EEF4" />
        <XAxis dataKey={xKey} axisLine={false} tickLine={false} tick={axisTick} interval={0} />
        <YAxis axisLine={false} tickLine={false} tick={axisTick} allowDecimals={false} />
        <Tooltip contentStyle={tooltipStyle} cursor={{ fill: '#F1F5F9' }} />
        {series.length > 1 && <Legend wrapperStyle={{ fontSize: 12 }} />}
        {series.map((item) => (
          <Bar key={item.key} dataKey={item.key} name={item.name} fill={item.color} radius={[7, 7, 0, 0]} maxBarSize={44}>
            {colors && data.map((_, index) => <Cell key={index} fill={colors[index % colors.length] ?? item.color} />)}
          </Bar>
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

export function Donut({ data, height = 190, center, stacked = false }: { data: { name: string; value: number; color: string }[]; height?: number; center?: { value: string; label: string }; stacked?: boolean }) {
  const total = data.reduce((sum, item) => sum + item.value, 0);
  return (
    <div className={stacked ? 'flex flex-col items-center gap-4' : 'flex flex-col items-center gap-4 sm:flex-row'}>
      <div className={stacked ? 'relative w-full max-w-[200px]' : 'relative w-full sm:w-1/2'} style={{ height }} role="img" aria-label={`Breakdown: ${data.map((d) => `${d.name} ${d.value}`).join(', ')}`}>
        {/* The wrapper above already describes the chart; hiding the drawing keeps its unlabeled sectors out of the accessibility tree. */}
        <div aria-hidden className="h-full w-full">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie rootTabIndex={-1} data={total === 0 ? [{ name: 'No data', value: 1, color: '#E2E8F0' }] : data} dataKey="value" nameKey="name" innerRadius="62%" outerRadius="88%" paddingAngle={total === 0 ? 0 : 3} stroke="none">
                {(total === 0 ? [{ color: '#E2E8F0' }] : data).map((item, index) => (
                  <Cell key={index} fill={item.color} />
                ))}
              </Pie>
              {total > 0 && <Tooltip contentStyle={tooltipStyle} />}
            </PieChart>
          </ResponsiveContainer>
        </div>
        {center && (
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
            <span className="font-display text-2xl font-bold text-navy">{center.value}</span>
            <span className="text-[11px] font-semibold text-slate-500">{center.label}</span>
          </div>
        )}
      </div>
      <ul className={stacked ? 'w-full space-y-2' : 'space-y-2.5'}>
        {data.map((item) => (
          <li key={item.name} className="flex items-center gap-2 text-xs">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: item.color }} aria-hidden />
            <span className="text-slate-500">{item.name}</span>
            <span className={stacked ? 'ml-auto font-bold text-navy' : 'font-bold text-navy'}>{item.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Circular gauge (0-100) used for workforce / personal readiness. */
export function ReadinessRing({ value, size = 132, stroke = 12, label, tone = 'light' }: { value: number; size?: number; stroke?: number; label: string; tone?: 'light' | 'dark' }) {
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.min(100, Math.max(0, value));
  const color = clamped >= 80 ? '#34D399' : clamped >= 60 ? '#2D8CFF' : clamped >= 40 ? '#FBBF24' : '#F87171';
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} role="img" aria-label={`${label}: ${Math.round(clamped)}%`}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={tone === 'dark' ? 'rgba(255,255,255,.14)' : '#E2E8F0'} strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={circumference * (1 - clamped / 100)} style={{ transition: 'stroke-dashoffset 900ms ease' }} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={`font-display text-3xl font-bold ${tone === 'dark' ? 'text-white' : 'text-navy'}`}>{Math.round(clamped)}%</span>
        <span className={`text-[10px] font-semibold uppercase tracking-wide ${tone === 'dark' ? 'text-white/50' : 'text-slate-500'}`}>{label}</span>
      </div>
    </div>
  );
}
