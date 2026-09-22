import { describe, expect, it } from 'vitest';
import { DEFAULT_ENGINE_CONFIG, type EngineConfig } from '../../src/modules/competencies/engine/config';
import {
  analyzeSuccession,
  classifyKnowledgeRisk,
  rankSuccessionRisks,
  suggestMentors,
  summarizeSuccession,
  type HolderInput,
  type SuccessionInput,
} from '../../src/modules/competencies/engine/succession';

const config = DEFAULT_ENGINE_CONFIG;
const NOW = new Date('2026-06-01T00:00:00Z');
const inDays = (days: number) => new Date(NOW.getTime() + days * 86_400_000);

const person = (name: string, effectiveLevel: number, retirementDate: Date | null = null): HolderInput => ({
  userId: name.toLowerCase().replace(/\s+/g, '-'),
  userName: name,
  effectiveLevel,
  retirementDate,
  departmentName: 'Radar Operations',
  jobRoleName: 'Radar Meteorologist',
});

const competency = (holders: HolderInput[], criticality = 4): SuccessionInput => ({
  competencyId: 'radar',
  competencyName: 'Advanced Radar Analysis',
  competencyCode: 'RADAR',
  category: 'Core Operations',
  criticality,
  holders,
});

describe('classifyKnowledgeRisk', () => {
  const t = config.succession;

  it('is CRITICAL when no expert would remain, whatever else is true', () => {
    expect(classifyKnowledgeRisk({ remainingExperts: 0, minimumExperts: 3, developingCount: 9, leavingCount: 1, criticality: 1 }, t)).toBe('CRITICAL');
  });

  it('is CRITICAL when a mission-critical competency is short of cover with nobody coming through', () => {
    expect(classifyKnowledgeRisk({ remainingExperts: 1, minimumExperts: 3, developingCount: 0, leavingCount: 1, criticality: 5 }, t)).toBe('CRITICAL');
  });

  it('is only HIGH when the same shortfall has people developing', () => {
    expect(classifyKnowledgeRisk({ remainingExperts: 1, minimumExperts: 3, developingCount: 3, leavingCount: 1, criticality: 5 }, t)).toBe('HIGH');
  });

  it('is HIGH for a shortfall on a competency that is not mission critical', () => {
    expect(classifyKnowledgeRisk({ remainingExperts: 1, minimumExperts: 3, developingCount: 0, leavingCount: 0, criticality: 2 }, t)).toBe('HIGH');
  });

  it('is WATCH when cover is exactly adequate, or when anyone is leaving', () => {
    expect(classifyKnowledgeRisk({ remainingExperts: 3, minimumExperts: 3, developingCount: 2, leavingCount: 0, criticality: 3 }, t)).toBe('WATCH');
    expect(classifyKnowledgeRisk({ remainingExperts: 5, minimumExperts: 3, developingCount: 2, leavingCount: 1, criticality: 3 }, t)).toBe('WATCH');
  });

  it('is LOW with comfortable cover and nobody leaving', () => {
    expect(classifyKnowledgeRisk({ remainingExperts: 6, minimumExperts: 3, developingCount: 2, leavingCount: 0, criticality: 3 }, t)).toBe('LOW');
  });
});

describe('analyzeSuccession', () => {
  it('reproduces the example from the brief: 2 experts, 1 retiring, 3 developing, high criticality', () => {
    const result = analyzeSuccession(
      competency(
        [
          person('Senior Radar Expert', 95, inDays(200)),
          person('Second Expert', 84),
          person('Developer One', 64),
          person('Developer Two', 58),
          person('Developer Three', 72),
          person('Novice', 20),
        ],
        5,
      ),
      NOW,
      config,
    );

    expect(result.expertCount).toBe(2);
    expect(result.leavingCount).toBe(1);
    expect(result.developingCount).toBe(3);
    expect(result.remainingExperts).toBe(1);
    expect(result.risk).toBe('HIGH');
  });

  it('counts someone as leaving only inside the configured window', () => {
    const inside = analyzeSuccession(competency([person('A', 90, inDays(700)), person('B', 90)]), NOW, config);
    const outside = analyzeSuccession(competency([person('A', 90, inDays(900)), person('B', 90)]), NOW, config);
    expect(inside.leavingCount).toBe(1);
    expect(outside.leavingCount).toBe(0);
  });

  it('treats a retirement date already in the past as leaving', () => {
    const result = analyzeSuccession(competency([person('A', 90, inDays(-30)), person('B', 90)]), NOW, config);
    expect(result.leavingCount).toBe(1);
    expect(result.experts[0]?.daysUntilRetirement).toBeLessThan(0);
  });

  it('expects one more expert of a mission-critical competency than of an ordinary one', () => {
    const ordinary = analyzeSuccession(competency([person('A', 90)], 2), NOW, config);
    const critical = analyzeSuccession(competency([person('A', 90)], 5), NOW, config);
    expect(ordinary.minimumExperts).toBe(2);
    expect(critical.minimumExperts).toBe(3);
  });

  it('is CRITICAL when nobody reaches the expert level at all', () => {
    const result = analyzeSuccession(competency([person('A', 70), person('B', 65)]), NOW, config);
    expect(result.expertCount).toBe(0);
    expect(result.risk).toBe('CRITICAL');
    expect(result.reason).toContain('Nobody currently reaches');
  });

  it('ignores people below the developing level entirely', () => {
    const result = analyzeSuccession(competency([person('A', 90), person('B', 90), person('Novice', 10)]), NOW, config);
    expect(result.developingCount).toBe(0);
  });

  it('uses the effective level, so a decayed expert no longer counts as one', () => {
    const decayed = analyzeSuccession(competency([person('Was expert, now decayed', 51), person('B', 90)]), NOW, config);
    expect(decayed.expertCount).toBe(1);
    expect(decayed.developingCount).toBe(1);
  });

  it('explains itself with the numbers behind the verdict', () => {
    const result = analyzeSuccession(competency([person('A', 95, inDays(200)), person('B', 84)], 5), NOW, config);
    expect(result.reason).toContain('2 people reach the 80% expert level');
    expect(result.reason).toContain('would leave 1 expert');
    expect(result.reason).toContain('No one is currently developing');
    expect(result.reason).toContain('criticality 5/5');
    // Mission critical, short of cover and with no successor coming through.
    expect(result.risk).toBe('CRITICAL');
    expect(result.reason).toContain('CRITICAL');
  });

  it('lists the strongest people first', () => {
    const result = analyzeSuccession(competency([person('Lower', 82), person('Higher', 96)]), NOW, config);
    expect(result.experts.map((expert) => expert.userName)).toEqual(['Higher', 'Lower']);
  });

  it('is a pure function of the date it is given', () => {
    const input = competency([person('A', 90, inDays(200)), person('B', 90)]);
    expect(analyzeSuccession(input, NOW, config)).toEqual(analyzeSuccession(input, NOW, config));
    // Looking further ahead brings a retirement inside the window.
    const later = analyzeSuccession(competency([person('A', 90, inDays(900)), person('B', 90)]), new Date(NOW.getTime() + 300 * 86_400_000), config);
    expect(later.leavingCount).toBe(1);
  });

  it('respects a changed configuration rather than any built-in constant', () => {
    const strict: EngineConfig = { ...config, succession: { ...config.succession, expertLevel: 95 } };
    const result = analyzeSuccession(competency([person('A', 90), person('B', 96)]), NOW, strict);
    expect(result.expertCount).toBe(1);
  });
});

describe('ranking and summary', () => {
  const risks = [
    analyzeSuccession({ ...competency([person('A', 90), person('B', 90), person('C', 90), person('D', 90)]), competencyId: 'low', competencyName: 'Low risk' }, NOW, config),
    analyzeSuccession({ ...competency([person('E', 70)]), competencyId: 'critical', competencyName: 'Critical risk' }, NOW, config),
    // One expert short of cover, but two people are coming through: serious, not yet critical.
    analyzeSuccession({ ...competency([person('F', 90), person('G', 70), person('H', 65)]), competencyId: 'high', competencyName: 'High risk' }, NOW, config),
  ];

  it('puts the most serious first', () => {
    expect(rankSuccessionRisks(risks).map((risk) => risk.competencyName)).toEqual(['Critical risk', 'High risk', 'Low risk']);
  });

  it('counts the organisation-wide picture', () => {
    const summary = summarizeSuccession(risks, config.succession);
    expect(summary.competencies).toBe(3);
    expect(summary.byRisk).toMatchObject({ CRITICAL: 1, HIGH: 1 });
    expect(summary.atRisk).toBe(2);
    expect(summary.thinlyCovered).toBe(2); // two competencies have at most 2 experts
  });

  it('counts each leaving expert once, even across several competencies', () => {
    const leaving = person('Leaver', 95, inDays(100));
    const summary = summarizeSuccession(
      [
        analyzeSuccession({ ...competency([leaving, person('X', 90)]), competencyId: 'a' }, NOW, config),
        analyzeSuccession({ ...competency([leaving, person('Y', 90)]), competencyId: 'b' }, NOW, config),
      ],
      config.succession,
    );
    expect(summary.expertsLeaving).toBe(1);
  });
});

describe('suggestMentors', () => {
  it('pairs the strongest people who are staying with those developing', () => {
    const risk = analyzeSuccession(competency([person('Staying', 95), person('Leaving', 92, inDays(100)), person('Learner', 60)]), NOW, config);
    const suggestions = suggestMentors(risk);
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0]?.mentor.userName).toBe('Staying');
    expect(suggestions[0]?.candidates.map((candidate) => candidate.userName)).toEqual(['Learner']);
  });

  it('suggests nobody when there is no one to learn from, or no one to teach', () => {
    expect(suggestMentors(analyzeSuccession(competency([person('Only expert', 95)]), NOW, config))).toEqual([]);
    expect(suggestMentors(analyzeSuccession(competency([person('Only learner', 60)]), NOW, config))).toEqual([]);
  });
});
