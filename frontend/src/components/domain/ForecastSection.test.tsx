import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { CompetencyForecast, TrainingNeedsForecast } from '../../types';
import { errorBody, makeUser, mockApi, okBody, renderApp } from '../../test/utils';
import { ForecastSection } from './ForecastSection';

// Recharts needs real layout; the chart is exercised in the browser checks. Here it only has to receive the right data.
vi.mock('../../charts', () => ({
  ForecastChart: ({ required, projection }: { required: number; projection: unknown[] }) => <div data-testid="forecast-chart">required {required}, {projection.length} projected months</div>,
}));

const user = makeUser({ role: 'ADMIN' });

const competency = (overrides: Partial<CompetencyForecast>): CompetencyForecast => ({
  competencyId: 'c-radar',
  name: 'Radar Meteorology',
  category: 'Core Operations',
  employees: 2,
  currentAverage: 60,
  requiredAverage: 80,
  affectedNow: 2,
  trendPerMonth: 5,
  projectedAverage: 90,
  projectedGap: 0,
  projectedAffected: 0,
  monthsToClose: 4,
  outlook: 'CLOSING',
  confidence: 'MEDIUM',
  history: [{ month: '2026-08', value: 55 }, { month: '2026-09', value: 60 }],
  projection: [{ month: '2026-10', value: 65 }, { month: '2026-11', value: 70 }],
  ...overrides,
});

const forecast = (overrides: Partial<TrainingNeedsForecast> = {}): TrainingNeedsForecast => ({
  generatedAt: '2026-09-21T00:00:00.000Z',
  horizonMonths: 6,
  historyMonths: 12,
  method: 'A straight line is fitted (least squares) through the monthly averages.',
  summary: { employees: 2, competencies: 3, affectedNow: 6, projectedAffected: 4, atRisk: 2 },
  competencies: [
    competency({ competencyId: 'c-drm', name: 'Disaster Risk Management', currentAverage: 62, requiredAverage: 80, trendPerMonth: -2, projectedAverage: 50, projectedGap: 30, projectedAffected: 2, monthsToClose: null, outlook: 'WIDENING' }),
    competency({ competencyId: 'c-wx', name: 'Weather Forecasting', currentAverage: 60, requiredAverage: 85, trendPerMonth: 0, projectedAverage: 60, projectedGap: 25, projectedAffected: 2, monthsToClose: null, outlook: 'STAGNANT' }),
    competency({}),
  ],
  ...overrides,
});

const serve = (data = forecast()) => {
  const server = mockApi();
  server.on('GET', '/admin/predictive-needs', (call) => okBody({ ...data, horizonMonths: Number(call.query.get('horizon')) }));
  return server;
};

describe('training-needs forecast', () => {
  it('shows today against the projection, and what the trend means for each competency', async () => {
    serve();
    renderApp(<ForecastSection />, { user, ai: false });

    expect(await screen.findByText('Below target now')).toBeInTheDocument();
    expect(screen.getByText('Below target in 6 months')).toBeInTheDocument();

    const table = screen.getByRole('table', { name: /Forecast for the next 6 months/ });
    const rows = within(table).getAllByRole('row').slice(1);
    expect(rows).toHaveLength(3);

    const drm = within(rows[0] as HTMLElement);
    expect(drm.getByText('Disaster Risk Management')).toBeInTheDocument();
    expect(drm.getByText('-2 / month')).toBeInTheDocument();
    expect(drm.getByText('50%')).toBeInTheDocument();
    expect(drm.getByText('not closing')).toBeInTheDocument();
    expect(drm.getByText('Widening')).toBeInTheDocument();

    expect(within(rows[1] as HTMLElement).getByText('Stagnant')).toBeInTheDocument();
    const radar = within(rows[2] as HTMLElement);
    expect(radar.getByText('+5 / month')).toBeInTheDocument();
    expect(radar.getByText('Closing')).toBeInTheDocument();
    expect(radar.getByText('4')).toBeInTheDocument(); // months to close
  });

  it('says "n/a" rather than inventing a trend when there is not enough history', async () => {
    serve(forecast({ competencies: [competency({ trendPerMonth: null, projectedAverage: null, monthsToClose: null, outlook: 'UNKNOWN', confidence: null, projection: [] })] }));
    renderApp(<ForecastSection />, { user, ai: false });
    const row = within((await screen.findAllByRole('row'))[1] as HTMLElement);
    expect(row.getByText('Not enough history')).toBeInTheDocument();
    expect(row.getAllByText('n/a').length).toBeGreaterThanOrEqual(3); // trend, projection, confidence
    expect(screen.getByText(/not enough recorded history to project/i)).toBeInTheDocument();
  });

  it('charts the most affected competency first, and another one on request', async () => {
    serve();
    renderApp(<ForecastSection />, { user, ai: false });
    expect(await screen.findByRole('heading', { name: 'Trend and projection: Disaster Risk Management' })).toBeInTheDocument();
    expect(screen.getByTestId('forecast-chart')).toHaveTextContent('required 80, 2 projected months');

    await userEvent.setup().click(screen.getByRole('button', { name: 'Show the chart for Weather Forecasting' }));
    expect(screen.getByRole('heading', { name: 'Trend and projection: Weather Forecasting' })).toBeInTheDocument();
    expect(screen.getByTestId('forecast-chart')).toHaveTextContent('required 85');
  });

  it('looks further ahead on request', async () => {
    const server = serve();
    renderApp(<ForecastSection />, { user, ai: false });
    await screen.findByText('Below target in 6 months');

    await userEvent.setup().click(screen.getByRole('button', { name: '12 months' }));

    expect(await screen.findByText('Below target in 12 months')).toBeInTheDocument();
    expect(server.callsTo('GET', '/admin/predictive-needs').map((call) => call.query.get('horizon'))).toEqual(['6', '12']);
  });

  it('explains how it was calculated', async () => {
    serve();
    renderApp(<ForecastSection />, { user, ai: false });
    await screen.findByText('Below target now');
    expect(screen.getByText('How this forecast is calculated')).toBeInTheDocument();
    expect(screen.getByText(/least squares/)).toBeInTheDocument();
  });

  it('handles an organisation with nothing to forecast, and a failing server', async () => {
    serve(forecast({ competencies: [], summary: { employees: 0, competencies: 0, affectedNow: 0, projectedAffected: 0, atRisk: 0 } }));
    const { unmount } = renderApp(<ForecastSection />, { user, ai: false });
    expect(await screen.findByText('Nothing to forecast yet')).toBeInTheDocument();
    unmount();

    const server = mockApi();
    server.on('GET', '/admin/predictive-needs', errorBody(500, 'INTERNAL_ERROR', 'An unexpected error occurred. Please try again later.'));
    renderApp(<ForecastSection />, { user, ai: false });
    expect(await screen.findByRole('alert')).toHaveTextContent('An unexpected error occurred');
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });

  describe('written briefing', () => {
    it('is offered only when an AI service is configured', async () => {
      serve();
      const { unmount } = renderApp(<ForecastSection />, { user, ai: false });
      await screen.findByText('Below target now');
      expect(screen.queryByText('Written briefing')).not.toBeInTheDocument();
      unmount();

      serve();
      renderApp(<ForecastSection />, { user, ai: true });
      expect(await screen.findByText('Written briefing')).toBeInTheDocument();
    });

    it('describes the numbers, and stops applying when the look-ahead changes', async () => {
      const server = serve();
      server.on('POST', '/ai/predictive-needs/summary', okBody({ horizonMonths: 6, summary: 'Radar is closing on its own.', priorities: [{ competencyId: 'c-drm', competency: 'Disaster Risk Management', action: 'Commission a refresher course.' }], model: 'claude-opus-5' }));
      renderApp(<ForecastSection />, { user, ai: true });
      const typing = userEvent.setup();

      await typing.click(await screen.findByRole('button', { name: 'Write a briefing' }));
      expect(await screen.findByText('Radar is closing on its own.')).toBeInTheDocument();
      expect(screen.getByText('Commission a refresher course.', { exact: false })).toBeInTheDocument();
      expect(server.callsTo('POST', '/ai/predictive-needs/summary')[0]?.body).toEqual({ horizon: 6 });
      expect(screen.getByText(/no employee names/)).toBeInTheDocument();

      await typing.click(screen.getByRole('button', { name: '3 months' }));
      expect(await screen.findByRole('button', { name: 'Write a briefing' })).toBeInTheDocument();
      expect(screen.queryByText('Radar is closing on its own.')).not.toBeInTheDocument();
    });

    it('shows why a briefing could not be written', async () => {
      const server = serve();
      server.on('POST', '/ai/predictive-needs/summary', errorBody(503, 'AI_UNAVAILABLE', 'The AI service could not be reached. Please try again shortly.'));
      renderApp(<ForecastSection />, { user, ai: true });
      await userEvent.setup().click(await screen.findByRole('button', { name: 'Write a briefing' }));
      expect(await screen.findByText('The AI service could not be reached. Please try again shortly.')).toBeInTheDocument();
    });
  });
});
