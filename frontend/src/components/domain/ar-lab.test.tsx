import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import ARLabPage from '../../pages/trainee/ARLabPage';
import type { ARModuleSummary, ARSubmitResult } from '../../types';
import { mockApi, okBody, renderApp } from '../../test/utils';
import { ARResult } from './ARResult';

/**
 * The AR lab's screens.
 *
 * The viewer itself needs WebGL, which jsdom does not have, so these cover the
 * parts that carry the meaning: whether a decayed competency surfaces a
 * refresher, and whether a result explains where the number came from.
 */

const module = (overrides: Partial<ARModuleSummary> = {}): ARModuleSummary => ({
  id: 'mod-1',
  key: 'doppler-radar',
  title: 'Doppler Radar Lab',
  subtitle: 'AR practical',
  description: 'Place a Doppler weather radar in the room in front of you.',
  objectives: ['Identify the major components.'],
  modelUrl: '/models/doppler-radar.glb',
  modelHeightM: 1.2,
  kind: 'FULL_LAB',
  difficulty: 'INTERMEDIATE',
  durationMinutes: 10,
  passingScore: 70,
  theoryWeight: 0.4,
  isPublished: true,
  isSimulation: true,
  competency: { id: 'c-radar', name: 'Radar Meteorology', code: 'RADAR', category: 'Core Operations' },
  course: { id: 'course-1', title: 'Doppler Radar Analysis' },
  taskCount: 5,
  componentCount: 6,
  standing: { currentLevel: 35, effectiveLevel: 35, requiredLevel: 80, freshnessStatus: 'WATCH', needsRefresher: false },
  progress: { attempts: 0, completed: 0, bestScore: null, bestPractical: null, lastTheory: null, passed: false, lastAttemptAt: null, lastCompletedAt: null },
  ...overrides,
});

describe('AR Instrument Lab landing page', () => {
  it('shows each lab with where the trainee stands on the competency behind it', async () => {
    const server = mockApi();
    server.on('GET', '/ar/modules', okBody({ modules: [module()], asOf: { date: '2026-09-22T00:00:00.000Z', offsetDays: 0, simulated: false } }));
    server.on('GET', '/ar/refresher', okBody({ recommendation: null }));

    renderApp(<ARLabPage />, { user: null });

    expect(await screen.findByText('Doppler Radar Lab')).toBeInTheDocument();
    const card = within(screen.getByText('Doppler Radar Lab').closest('section') as HTMLElement);
    expect(card.getAllByText(/Radar Meteorology/).length).toBeGreaterThan(0);
    expect(card.getByText('35%')).toBeInTheDocument();
    expect(card.getByText(/of 80% needed/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /start ar lab/i })).toHaveAttribute('href', '/trainee/ar-lab/doppler-radar');
  });

  it('says plainly that AR is not required', async () => {
    const server = mockApi();
    server.on('GET', '/ar/modules', okBody({ modules: [module()], asOf: { date: '2026-09-22T00:00:00.000Z', offsetDays: 0, simulated: false } }));
    server.on('GET', '/ar/refresher', okBody({ recommendation: null }));

    renderApp(<ARLabPage />, { user: null });

    expect(await screen.findByText(/AR is never required to complete a lab/i)).toBeInTheDocument();
  });

  /** The join between the decay engine and the lab, which is the point of the feature. */
  it('offers the refresher when the freshness engine says the competency has faded', async () => {
    const server = mockApi();
    server.on('GET', '/ar/modules', okBody({ modules: [module({ standing: { currentLevel: 72, effectiveLevel: 51, requiredLevel: 80, freshnessStatus: 'AT_RISK', needsRefresher: true } })], asOf: { date: '2026-12-22T00:00:00.000Z', offsetDays: 0, simulated: false } }));
    server.on(
      'GET',
      '/ar/refresher',
      okBody({
        recommendation: {
          module: { id: 'mod-2', key: 'doppler-radar-refresher', title: 'Radar Refresher', durationMinutes: 5, modelUrl: '/models/doppler-radar.glb' },
          competency: { id: 'c-radar', name: 'Radar Meteorology' },
          freshness: { baselineLevel: 72, effectiveLevel: 51, decayPoints: 21, requiredLevel: 80, gap: 29, status: 'AT_RISK', statusLabel: 'At risk', needsRefresher: true, reason: 'Last practised 90 days ago; 72% has decayed to 51% against the 80% this role needs.' },
          reason: 'Radar Meteorology is at risk.',
          asOf: { date: '2026-12-22T00:00:00.000Z', offsetDays: 0, simulated: false },
        },
      }),
    );

    renderApp(<ARLabPage />, { user: null });

    expect(await screen.findByText(/Radar Meteorology needs attention/i)).toBeInTheDocument();
    expect(screen.getByText(/decayed to 51%/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /start the 5-minute refresher/i })).toHaveAttribute('href', '/trainee/ar-lab/doppler-radar-refresher');
  });
});

describe('AR practical result', () => {
  const result = (overrides: Partial<ARSubmitResult> = {}): ARSubmitResult => ({
    attempt: {
      id: 'attempt-1',
      attemptNumber: 1,
      status: 'COMPLETED',
      startedAt: '2026-09-22T09:00:00.000Z',
      completedAt: '2026-09-22T09:08:32.000Z',
      durationSeconds: 512,
      score: 80,
      totalPoints: 100,
      practicalPercentage: 80,
      theoryPercentage: 84,
      combinedPercentage: 81.6,
      passed: true,
      hintsUsed: 2,
      competencyBefore: 35,
      competencyAfter: 72,
    },
    module: { id: 'mod-1', key: 'doppler-radar', title: 'Doppler Radar Lab', passingScore: 70, theoryWeight: 0.4, competencyName: 'Radar Meteorology' },
    review: [
      { taskId: 't1', instruction: 'Select the antenna.', points: 20, pointsAwarded: 20, correct: true, selectedComponentId: 'c1', selectedComponentName: 'Antenna', correctComponentId: 'c1', correctComponentName: 'Antenna', explanation: 'The antenna forms the beam.' },
      { taskId: 't2', instruction: 'Select the rotator.', points: 20, pointsAwarded: 0, correct: false, selectedComponentId: 'c2', selectedComponentName: 'Radome', correctComponentId: 'c3', correctComponentName: 'Rotator (pedestal)', explanation: 'The rotator turns the antenna in azimuth.' },
    ],
    scoring: { practical: 80, theory: 84, theoryWeight: 0.4, combined: 81.6, explanation: 'Theory 84% x 40% + practical 80% x 60% = 81.6%.' },
    competencyImpacts: [
      {
        competencyId: 'c-radar',
        competencyName: 'Radar Meteorology',
        previousLevel: 35,
        newLevel: 72,
        changed: true,
        requiredLevel: 80,
        gapBefore: 45,
        gapAfter: 8,
        requirementMet: false,
        limitedBy: 'none',
        explanation: 'Blended the previous 35% with the practical and assessment evidence to 72%.',
      },
    ],
    replayed: false,
    ...overrides,
  });

  it('shows the practical, the theory and how they combine', () => {
    mockApi();
    renderApp(<ARResult result={result()} moduleKey="doppler-radar" />, { user: null });

    // Scoped to the summary: the same percentages also appear in the competency meter below it.
    const summary = within(screen.getByRole('region', { name: /practical result/i }));
    expect(summary.getByText('80%')).toBeInTheDocument();
    expect(summary.getByText('84%')).toBeInTheDocument();
    expect(summary.getByText('81.6%')).toBeInTheDocument();
    expect(summary.getByText(/Theory 84% x 40% \+ practical 80% x 60% = 81.6%/)).toBeInTheDocument();
    expect(summary.getByText(/80 of 100 points/)).toBeInTheDocument();
  });

  it('reports the competency change as the engine’s work, not as the score', () => {
    mockApi();
    renderApp(<ARResult result={result()} moduleKey="doppler-radar" />, { user: null });

    expect(screen.getByText(/35% → 72%/)).toBeInTheDocument();
    expect(screen.getByText(/Calculated by the competency engine/i)).toBeInTheDocument();
    expect(screen.getByText(/not set to this score/i)).toBeInTheDocument();
    expect(screen.getByText(/Blended the previous 35%/)).toBeInTheDocument();
  });

  it('names the right answer for a task the trainee got wrong', () => {
    mockApi();
    renderApp(<ARResult result={result()} moduleKey="doppler-radar" />, { user: null });

    const wrong = screen.getByText('2. Select the rotator.').closest('li') as HTMLElement;
    expect(within(wrong).getByText(/Radome/)).toBeInTheDocument();
    expect(within(wrong).getByText(/Rotator \(pedestal\)/)).toBeInTheDocument();
    expect(within(wrong).getByText(/0 \/ 20/)).toBeInTheDocument();
  });

  it('does not claim a pass when the combined score is below the pass mark', () => {
    mockApi();
    const failed = result();
    failed.attempt = { ...failed.attempt, passed: false, combinedPercentage: 52 };
    failed.scoring = { ...failed.scoring, combined: 52 };
    renderApp(<ARResult result={failed} moduleKey="doppler-radar" />, { user: null });

    expect(screen.getByRole('heading', { name: /not passed this time/i })).toBeInTheDocument();
  });
});
