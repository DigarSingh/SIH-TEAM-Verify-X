export type LevelBand = 'FOUNDATION' | 'DEVELOPING' | 'PROFICIENT' | 'EXPERT';

export const LEVEL_BAND_LABELS: Record<LevelBand, string> = {
  FOUNDATION: 'Foundation',
  DEVELOPING: 'Developing',
  PROFICIENT: 'Proficient',
  EXPERT: 'Expert',
};

/** Descriptive proficiency band for a 0-100 competency level. */
export function levelBand(level: number): LevelBand {
  if (level >= 90) return 'EXPERT';
  if (level >= 70) return 'PROFICIENT';
  if (level >= 40) return 'DEVELOPING';
  return 'FOUNDATION';
}
