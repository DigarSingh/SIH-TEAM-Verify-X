import { describe, expect, it } from 'vitest';
import { contrastRatio, gapColor, levelColor } from './constants';

const parse = (css: string): [number, number, number] => {
  const hex = /^#([0-9a-f]{6})$/i.exec(css);
  if (hex) {
    const value = parseInt(hex[1]!, 16);
    return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
  }
  const rgb = /^rgb\((\d+), (\d+), (\d+)\)$/.exec(css);
  if (!rgb) throw new Error(`Unrecognised colour ${css}`);
  return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])];
};
const contrastOf = ({ background, color }: { background: string; color: string }) => contrastRatio(parse(background), parse(color));

describe('contrastRatio', () => {
  it('matches the WCAG reference values', () => {
    expect(contrastRatio([0, 0, 0], [255, 255, 255])).toBeCloseTo(21, 5);
    expect(contrastRatio([255, 255, 255], [255, 255, 255])).toBe(1);
    expect(contrastRatio([148, 163, 184], [255, 255, 255])).toBeCloseTo(2.56, 2); // slate-400 on white
  });
});

describe('heatmap colours', () => {
  it('keep the text readable (WCAG AA, 4.5:1) at every level from 0 to 100', () => {
    for (let level = 0; level <= 100; level += 0.5) expect(contrastOf(levelColor(level)), `level ${level}`).toBeGreaterThanOrEqual(4.5);
  });

  it('keep the text readable at every average gap and in the not-assessed cell', () => {
    for (let gap = 0; gap <= 100; gap += 0.5) expect(contrastOf(gapColor(gap)), `gap ${gap}`).toBeGreaterThanOrEqual(4.5);
    expect(contrastOf(levelColor(null))).toBeGreaterThanOrEqual(4.5);
    expect(contrastOf(gapColor(null))).toBeGreaterThanOrEqual(4.5);
  });

  it('still run from red (low) through amber to green (high)', () => {
    expect(levelColor(0).background).toBe('rgb(220, 38, 38)');
    expect(levelColor(50).background).toBe('rgb(245, 158, 11)');
    expect(levelColor(100).background).toBe('rgb(34, 197, 94)');
    expect(gapColor(0).background).toBe(levelColor(100).background);
  });
});
