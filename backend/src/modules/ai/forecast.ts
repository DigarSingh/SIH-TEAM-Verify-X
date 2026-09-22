/**
 * Transparent trend forecasting for training needs. This is plain least-squares arithmetic that anyone
 * can reproduce in a spreadsheet: no model, no hidden state. (An AI model may later PHRASE a summary of
 * these numbers, but it never produces them.)
 */

export interface Trend {
  /** Change in the average level per month (points): the pace. */
  slope: number;
  /** Share of the variation the straight line explains (0-1). */
  r2: number;
  points: number;
}

export type Outlook = 'MET' | 'CLOSING' | 'STAGNANT' | 'WIDENING' | 'UNKNOWN';
export type Confidence = 'HIGH' | 'MEDIUM' | 'LOW';

/** Fewer points than this and a "trend" would be noise. */
export const MIN_POINTS = 3;
/** A monthly change smaller than this (in level points) is treated as "no movement". */
export const FLAT_SLOPE = 0.25;

const round1 = (value: number) => Math.round(value * 10) / 10;
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/** Least-squares line through `values` observed at months 0, 1, 2, ... (oldest first). */
export function linearTrend(values: number[]): Trend | null {
  const n = values.length;
  if (n < MIN_POINTS) return null;
  const meanX = (n - 1) / 2;
  const meanY = values.reduce((sum, value) => sum + value, 0) / n;
  let sxx = 0;
  let sxy = 0;
  let syy = 0;
  values.forEach((value, index) => {
    const dx = index - meanX;
    const dy = value - meanY;
    sxx += dx * dx;
    sxy += dx * dy;
    syy += dy * dy;
  });
  const slope = sxy / sxx;
  const r2 = syy === 0 ? 1 : (sxy * sxy) / (sxx * syy);
  return { slope, r2, points: n };
}

/** Where `level` ends up `monthsAhead` months later if it keeps moving at `slope` points a month, kept on the 0-100 scale. */
export function projectFrom(level: number, slope: number, monthsAhead: number): number {
  return round1(clamp(level + slope * monthsAhead, 0, 100));
}

export function confidenceOf(trend: Trend): Confidence {
  if (trend.points >= 8 && trend.r2 >= 0.6) return 'HIGH';
  if (trend.points >= 5 && trend.r2 >= 0.3) return 'MEDIUM';
  return 'LOW';
}

/** Months until the average gap is closed at the current pace, or null when the trend is not closing it. */
export function monthsToClose(gap: number, slope: number): number | null {
  if (gap <= 0) return 0;
  if (slope <= FLAT_SLOPE) return null;
  return round1(gap / slope);
}

export function outlookOf(input: { currentGap: number; projectedGap: number; slope: number | null }): Outlook {
  if (input.currentGap <= 0 && input.projectedGap <= 0) return 'MET';
  if (input.slope === null) return 'UNKNOWN';
  if (input.slope < -FLAT_SLOPE || input.projectedGap > input.currentGap + 1) return 'WIDENING';
  if (input.slope > FLAT_SLOPE && input.projectedGap < input.currentGap) return 'CLOSING';
  return 'STAGNANT';
}

/** `2026-09` + 3 → `2026-12` */
export function addMonths(monthKey: string, months: number): string {
  const [year, month] = monthKey.split('-').map(Number) as [number, number];
  const date = new Date(Date.UTC(year, month - 1 + months, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}
