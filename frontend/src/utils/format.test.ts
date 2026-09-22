import { describe, expect, it } from 'vitest';
import { daysUntil, formatDuration, formatPercent, initials, monthLabel, plural, timeAgo } from './format';

describe('formatting helpers', () => {
  it('pluralises with the count', () => {
    expect(plural(1, 'course')).toBe('1 course');
    expect(plural(0, 'course')).toBe('0 courses');
    expect(plural(2, 'category', 'categories')).toBe('2 categories');
  });

  it('formats durations in the largest sensible unit', () => {
    expect(formatDuration(0)).toBe('-');
    expect(formatDuration(45)).toBe('45 min');
    expect(formatDuration(60)).toBe('1 h');
    expect(formatDuration(150)).toBe('2 h 30 min');
  });

  it('formats percentages, keeping whole numbers whole', () => {
    expect(formatPercent(null)).toBe('-');
    expect(formatPercent(72)).toBe('72%');
    expect(formatPercent(72.456, 1)).toBe('72.5%');
  });

  it('builds initials without titles', () => {
    expect(initials('Dr. Ananya Rao')).toBe('AR');
    expect(initials('Meera')).toBe('M');
    expect(initials('   ')).toBe('?');
  });

  it('labels months for charts, in UTC so the month never shifts with the time zone', () => {
    expect(monthLabel('2026-09')).toBe('Sept 26');
    expect(monthLabel('2027-01')).toBe('Jan 27');
    expect(monthLabel('not-a-month')).toBe('not-a-month');
  });

  it('describes elapsed time', () => {
    const now = Date.parse('2026-09-21T12:00:00Z');
    expect(timeAgo('2026-09-21T11:59:30Z', now)).toBe('just now');
    expect(timeAgo('2026-09-21T11:55:00Z', now)).toBe('5 min ago');
    expect(timeAgo('2026-09-21T09:00:00Z', now)).toBe('3 h ago');
    expect(timeAgo('2026-09-20T09:00:00Z', now)).toBe('yesterday');
    expect(timeAgo('2026-09-17T12:00:00Z', now)).toBe('4 d ago');
    expect(timeAgo(null, now)).toBe('-');
  });

  it('counts whole days until a date', () => {
    const now = Date.parse('2026-09-21T00:00:00Z');
    expect(daysUntil('2026-09-24T00:00:00Z', now)).toBe(3);
    expect(daysUntil('2026-09-20T00:00:00Z', now)).toBe(-1);
  });
});
