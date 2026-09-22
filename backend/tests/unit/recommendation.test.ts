import { describe, expect, it } from 'vitest';
import { DEFAULT_ENGINE_CONFIG } from '../../src/modules/competencies/engine/config';
import {
  buildRecommendations,
  learningStatus,
  type CatalogCourse,
  type LearnerCourseState,
} from '../../src/modules/competencies/engine/recommendation';
import { analyzeSkillGap, type GapInput } from '../../src/modules/competencies/engine/skill-gap';

const radarGap = (currentLevel: number): GapInput => ({
  competencyId: 'radar',
  competencyCode: 'RADAR',
  competencyName: 'Radar Meteorology',
  category: 'Core Operations',
  requiredLevel: 80,
  currentLevel,
  importance: 4,
  roleCriticality: 4,
});

const forecastingGap = (currentLevel: number): GapInput => ({
  competencyId: 'fc',
  competencyCode: 'FC',
  competencyName: 'Weather Forecasting',
  category: 'Core Operations',
  requiredLevel: 85,
  currentLevel,
  importance: 5,
  roleCriticality: 4,
});

const course = (partial: Partial<CatalogCourse> & Pick<CatalogCourse, 'id' | 'title'>): CatalogCourse => ({
  difficulty: 'BEGINNER',
  category: 'Radar',
  durationMinutes: 240,
  rating: null,
  mappings: [],
  prerequisiteIds: [],
  ...partial,
});

const fundamentals = course({ id: 'fund', title: 'Radar Fundamentals', difficulty: 'BEGINNER', mappings: [{ competencyId: 'radar', levelFrom: 0, levelTo: 75 }] });
const doppler = course({
  id: 'dop',
  title: 'Doppler Radar Analysis',
  difficulty: 'INTERMEDIATE',
  mappings: [{ competencyId: 'radar', levelFrom: 55, levelTo: 88 }],
  prerequisiteIds: ['fund'],
});
const advanced = course({
  id: 'adv',
  title: 'Advanced Radar Analysis',
  difficulty: 'ADVANCED',
  mappings: [{ competencyId: 'radar', levelFrom: 75, levelTo: 96 }],
  prerequisiteIds: ['dop'],
});
const unrelated = course({ id: 'py', title: 'Python for Meteorological Data', mappings: [{ competencyId: 'py', levelFrom: 0, levelTo: 70 }] });
const catalog = [advanced, unrelated, doppler, fundamentals]; // deliberately shuffled

const states = (entries: Record<string, LearnerCourseState>) => new Map(Object.entries(entries));
const analyze = (...inputs: GapInput[]) => inputs.map((input) => analyzeSkillGap(input, DEFAULT_ENGINE_CONFIG));

describe('rule-based recommendations for the Radar example (35% now, 80% required)', () => {
  const result = buildRecommendations({ gaps: analyze(radarGap(35)), catalog, states: new Map() });

  it('builds the ordered path Radar Fundamentals → Doppler Radar → Advanced Radar Analysis', () => {
    expect(result.learningPaths).toHaveLength(1);
    const path = result.learningPaths[0]!;
    expect(path.steps.map((step) => step.title)).toEqual(['Radar Fundamentals', 'Doppler Radar Analysis', 'Advanced Radar Analysis']);
    expect(path.steps.map((step) => step.stage)).toEqual(['BEGINNER', 'INTERMEDIATE', 'ADVANCED']);
    expect(path).toMatchObject({ gap: 45, priorityLevel: 'HIGH', completedSteps: 0, nextStepCourseId: 'fund' });
  });

  it('locks steps whose prerequisites are not completed', () => {
    const [first, second, third] = result.learningPaths[0]!.steps;
    expect(first).toMatchObject({ locked: false, blockedBy: [] });
    expect(second).toMatchObject({ locked: true, blockedBy: ['fund'] });
    expect(third).toMatchObject({ locked: true, blockedBy: ['dop'] });
  });

  it('never recommends courses that are unrelated to the gaps', () => {
    expect(result.recommendations.map((r) => r.courseId)).not.toContain('py');
    expect(result.recommendations).toHaveLength(3);
  });

  it('ranks the course the learner can start now above courses that are still blocked', () => {
    expect(result.recommendations[0]).toMatchObject({ courseId: 'fund', ready: true, rank: 1 });
    const blocked = result.recommendations.filter((r) => !r.ready).map((r) => r.courseId);
    expect(blocked.sort()).toEqual(['adv', 'dop']);
  });

  it('explains WHY each course is recommended', () => {
    const top = result.recommendations[0]!;
    const text = top.reasons.join(' ');
    expect(text).toContain('Radar Meteorology');
    expect(text).toContain('35%');
    expect(text).toContain('80%');
    expect(text).toContain('45 points');
    expect(text).toContain('high priority');
    expect(text).toContain('Step 1 of 3');
    const blocked = result.recommendations.find((r) => r.courseId === 'dop')!;
    expect(blocked.reasons.join(' ')).toContain('Complete Radar Fundamentals first');
  });

  it('reports how many points of the gap each course can close', () => {
    const top = result.recommendations.find((r) => r.courseId === 'fund')!;
    expect(top.addresses[0]).toMatchObject({ competencyId: 'radar', coverage: 40, gap: 45 }); // covers 35 → 75
  });
});

describe('progress through the learning path', () => {
  it('filters completed courses out of the recommendations but keeps them visible in the path', () => {
    const result = buildRecommendations({
      gaps: analyze(radarGap(72)), // after passing Radar Fundamentals with 84% the level is 72
      catalog,
      states: states({ fund: { status: 'CERTIFIED', progress: 100 } }),
    });
    expect(result.recommendations.map((r) => r.courseId)).not.toContain('fund');
    expect(result.recommendations[0]).toMatchObject({ courseId: 'dop', ready: true });

    const path = result.learningPaths[0]!;
    expect(path.steps.map((s) => [s.courseId, s.status])).toEqual([
      ['fund', 'CERTIFIED'],
      ['dop', 'NOT_STARTED'],
      ['adv', 'NOT_STARTED'],
    ]);
    expect(path).toMatchObject({ gap: 8, completedSteps: 1, nextStepCourseId: 'dop' });
    expect(path.steps[2]).toMatchObject({ locked: true });
  });

  it('tracks Started / In progress / Assessment pending / Completed / Certified', () => {
    expect(learningStatus(undefined)).toBe('NOT_STARTED');
    expect(learningStatus({ status: 'WITHDRAWN', progress: 10 })).toBe('NOT_STARTED');
    expect(learningStatus({ status: 'ENROLLED', progress: 0 })).toBe('STARTED');
    expect(learningStatus({ status: 'IN_PROGRESS', progress: 40 })).toBe('IN_PROGRESS');
    expect(learningStatus({ status: 'ASSESSMENT_PENDING', progress: 100 })).toBe('ASSESSMENT_PENDING');
    expect(learningStatus({ status: 'COMPLETED', progress: 100 })).toBe('COMPLETED');
    expect(learningStatus({ status: 'CERTIFIED', progress: 100 })).toBe('CERTIFIED');
  });

  it('nudges learners to finish a course they already started', () => {
    const other = course({ id: 'alt', title: 'Radar Practice Lab', mappings: [{ competencyId: 'radar', levelFrom: 0, levelTo: 75 }] });
    const result = buildRecommendations({
      gaps: analyze(radarGap(35)),
      catalog: [fundamentals, other],
      states: states({ alt: { status: 'IN_PROGRESS', progress: 60 } }),
    });
    expect(result.recommendations[0]).toMatchObject({ courseId: 'alt', status: 'IN_PROGRESS' });
    expect(result.recommendations[0]!.reasons.join(' ')).toContain('already enrolled (60% complete)');
  });

  it('omits everything when the requirement is already met', () => {
    const result = buildRecommendations({ gaps: analyze(radarGap(85)), catalog, states: new Map() });
    expect(result.recommendations).toEqual([]);
    expect(result.learningPaths).toEqual([]);
  });
});

describe('prioritisation across several gaps', () => {
  const forecastCourse = course({
    id: 'wf',
    title: 'Weather Forecasting Fundamentals',
    mappings: [{ competencyId: 'fc', levelFrom: 0, levelTo: 80 }],
  });

  it('puts the course for the highest-priority gap first', () => {
    // Forecasting: gap 40 × (5/5) × (4/5) = 32 ; Radar: gap 45 × (4/5) × (4/5) = 28.8
    const result = buildRecommendations({ gaps: analyze(radarGap(35), forecastingGap(45)), catalog: [...catalog, forecastCourse], states: new Map() });
    expect(result.recommendations[0]!.courseId).toBe('wf');
    expect(result.learningPaths.map((p) => p.competencyId)).toEqual(['fc', 'radar']);
  });

  it('honours the limit option', () => {
    const result = buildRecommendations({ gaps: analyze(radarGap(35)), catalog, states: new Map(), limit: 1 });
    expect(result.recommendations).toHaveLength(1);
  });

  it('is deterministic: identical input always gives identical output', () => {
    const run = () => JSON.stringify(buildRecommendations({ gaps: analyze(radarGap(35), forecastingGap(45)), catalog: [...catalog, forecastCourse], states: new Map() }));
    expect(run()).toBe(run());
  });

  it('survives a prerequisite cycle without looping forever', () => {
    const a = course({ id: 'a', title: 'A', mappings: [{ competencyId: 'radar', levelFrom: 0, levelTo: 90 }], prerequisiteIds: ['b'] });
    const b = course({ id: 'b', title: 'B', mappings: [{ competencyId: 'radar', levelFrom: 0, levelTo: 90 }], prerequisiteIds: ['a'] });
    const result = buildRecommendations({ gaps: analyze(radarGap(35)), catalog: [a, b], states: new Map() });
    expect(result.learningPaths[0]!.steps).toHaveLength(2);
  });
});
