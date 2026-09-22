import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { CourseCard as CourseCardData } from '../../types';
import { errorBody, makeUser, mockApi, okBody, renderApp } from '../../test/utils';
import { CourseAssistant } from './CourseAssistant';
import { PlainLanguageSearch } from './PlainLanguageSearch';
import { StudyPlanCard } from './StudyPlanCard';

const user = makeUser();
const coverage = { readableMaterials: 3, includedMaterials: 3, omittedMaterials: 0, truncated: false };
const answer = (overrides: Record<string, unknown> = {}) => ({
  answer: 'The maximum unambiguous range is c / (2 x PRF).',
  grounded: true,
  sources: [{ id: 'm1', title: 'Pulse basics', moduleTitle: 'Module 1' }],
  coverage,
  model: 'claude-opus-5',
  ...overrides,
});

describe('course assistant', () => {
  it('is not shown at all when the server has no AI configured', () => {
    mockApi();
    renderApp(<CourseAssistant courseId="c1" />, { user, ai: false });
    expect(screen.queryByText(/Ask about this course/)).not.toBeInTheDocument();
  });

  it('answers a suggested question with the sources it used', async () => {
    const server = mockApi();
    server.on('POST', '/ai/courses/c1/ask', okBody(answer()));
    renderApp(<CourseAssistant courseId="c1" />, { user, ai: true });

    await userEvent.setup().click(screen.getByRole('button', { name: 'Summarise the key ideas of this course' }));

    expect(await screen.findByText('The maximum unambiguous range is c / (2 x PRF).')).toBeInTheDocument();
    expect(screen.getByText('Module 1 · Pulse basics')).toBeInTheDocument();
    const [call] = server.callsTo('POST', '/ai/courses/c1/ask');
    expect(call?.body).toEqual({ question: 'Summarise the key ideas of this course' });
    expect(call?.headers.get('X-Requested-With')).toBe('CapacityConnect');
    expect(screen.queryByRole('button', { name: 'Summarise the key ideas of this course' })).not.toBeInTheDocument(); // suggestions go once a conversation starts
  });

  it('asks a typed question, needs at least three characters, and clears the box', async () => {
    const server = mockApi();
    server.on('POST', '/ai/courses/c1/ask', okBody(answer()));
    renderApp(<CourseAssistant courseId="c1" />, { user, ai: true });
    const typing = userEvent.setup();
    const ask = screen.getByRole('button', { name: 'Ask' });
    const box = screen.getByLabelText('Your question');

    await typing.type(box, 'hi');
    expect(ask).toBeDisabled();
    await typing.type(box, ' there');
    expect(ask).toBeEnabled();
    await typing.click(ask);

    await screen.findByText('The maximum unambiguous range is c / (2 x PRF).');
    expect(server.callsTo('POST', '/ai/courses/c1/ask')[0]?.body).toEqual({ question: 'hi there' });
    expect(box).toHaveValue('');
  });

  it('warns when the materials do not back the answer, instead of presenting it as fact', async () => {
    const server = mockApi();
    server.on('POST', '/ai/courses/c1/ask', okBody(answer({ answer: 'The course materials do not cover this. Please ask the trainer.', grounded: false, sources: [] })));
    renderApp(<CourseAssistant courseId="c1" />, { user, ai: true });
    await userEvent.setup().click(screen.getByRole('button', { name: /learning outcomes/i }));
    expect(await screen.findByText(/do not back this answer/)).toBeInTheDocument();
    expect(screen.queryByText('Sources in this course')).not.toBeInTheDocument();
  });

  it('says when only part of a long course could be read', async () => {
    const server = mockApi();
    server.on('POST', '/ai/courses/c1/ask', okBody(answer({ coverage: { readableMaterials: 12, includedMaterials: 9, omittedMaterials: 3, truncated: true } })));
    renderApp(<CourseAssistant courseId="c1" />, { user, ai: true });
    await userEvent.setup().click(screen.getByRole('button', { name: /key ideas/i }));
    expect(await screen.findByText(/9 of 12 readable materials were used/)).toBeInTheDocument();
  });

  it('shows why a question failed and lets the learner try again', async () => {
    const server = mockApi();
    let attempts = 0;
    server.on('POST', '/ai/courses/c1/ask', () => {
      attempts += 1;
      return attempts === 1 ? errorBody(503, 'AI_BUSY', 'The AI service is busy right now. Please try again in a minute.') : okBody(answer());
    });
    renderApp(<CourseAssistant courseId="c1" />, { user, ai: true });
    const typing = userEvent.setup();

    await typing.click(screen.getByRole('button', { name: /key ideas/i }));
    expect(await screen.findByText('The AI service is busy right now. Please try again in a minute.')).toBeInTheDocument();

    await typing.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('The maximum unambiguous range is c / (2 x PRF).')).toBeInTheDocument();
    expect(screen.queryByText(/busy right now/)).not.toBeInTheDocument();
    expect(attempts).toBe(2);
  });

  it('tells the learner what leaves the platform', () => {
    mockApi();
    renderApp(<CourseAssistant courseId="c1" />, { user, ai: true });
    expect(screen.getByText(/sent to OpenAI/)).toHaveTextContent('Nothing else about you is sent');
  });
});

// ---------------------------------------------------------------------------------------------------------------

const course: CourseCardData = {
  id: 'course-1',
  title: 'Advanced Radar Analysis',
  description: 'Multi-radar mosaics and quantitative precipitation estimation.',
  category: 'Radar Meteorology',
  difficulty: 'ADVANCED',
  durationMinutes: 150,
  passingScore: 70,
  certificateEnabled: true,
  status: 'PUBLISHED',
  publishedAt: '2026-01-01T00:00:00.000Z',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  thumbnailUrl: null,
  trainer: { id: 't1', name: 'Dr. Arjun Mehta', designation: null },
  moduleCount: 5,
  enrolledCount: 3,
  hasAssessment: true,
  competencies: [],
  rating: { average: 0, count: 0 },
  myEnrollment: null,
};
const searchResult = (overrides: Record<string, unknown> = {}) => ({
  method: 'keywords',
  explanation: null,
  interpretation: ['Radar Meteorology', 'Advanced', 'up to 3 h'],
  filters: { keywords: '', competencyIds: ['c1'], difficulty: 'ADVANCED', category: null, maxDurationMinutes: 180 },
  courses: [course],
  ...overrides,
});

async function search(text: string) {
  const typing = userEvent.setup();
  await typing.type(screen.getByLabelText('What do you want to learn?'), text);
  await typing.click(screen.getByRole('button', { name: 'Find courses' }));
  return typing;
}

describe('plain-language search', () => {
  it('shows what was understood, so the learner can check it, and the matching courses', async () => {
    const server = mockApi();
    server.on('POST', '/ai/search', okBody(searchResult()));
    renderApp(<PlainLanguageSearch />, { user, ai: false });

    await search('advanced radar course under 3 hours');

    expect(await screen.findByText('Understood by keyword matching as')).toBeInTheDocument();
    for (const part of ['Radar Meteorology', 'Advanced', 'up to 3 h']) expect(screen.getAllByText(part).length).toBeGreaterThan(0);
    expect(screen.getByRole('link', { name: 'Advanced Radar Analysis' })).toHaveAttribute('href', '/trainee/courses/course-1');
    expect(server.callsTo('POST', '/ai/search')[0]?.body).toEqual({ query: 'advanced radar course under 3 hours' });
  });

  it('says so when the AI service interpreted the request, and shows its explanation', async () => {
    const server = mockApi();
    server.on('POST', '/ai/search', okBody(searchResult({ method: 'ai', explanation: 'You want a short advanced radar course.' })));
    renderApp(<PlainLanguageSearch />, { user, ai: true });
    await search('something short and hard about radar');
    expect(await screen.findByText('Understood with the AI service as')).toBeInTheDocument();
    expect(screen.getByText('You want a short advanced radar course.')).toBeInTheDocument();
  });

  it('does not answer a request it could not understand with unrelated courses', async () => {
    const server = mockApi();
    server.on('POST', '/ai/search', okBody(searchResult({ interpretation: [], courses: [course] })));
    renderApp(<PlainLanguageSearch />, { user, ai: false });
    await search('please help me');
    expect(await screen.findByText('Nothing specific was recognised.')).toBeInTheDocument();
    expect(screen.getByText(/Try naming a competency/)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Advanced Radar Analysis' })).not.toBeInTheDocument();
  });

  it('reports honestly when nothing fits', async () => {
    const server = mockApi();
    server.on('POST', '/ai/search', okBody(searchResult({ courses: [] })));
    renderApp(<PlainLanguageSearch />, { user, ai: false });
    await search('advanced radar under 3 hours');
    expect(await screen.findByText('No published course fits all of that')).toBeInTheDocument();
  });

  it('needs at least two characters, can be cleared, and shows failures', async () => {
    const server = mockApi();
    server.on('POST', '/ai/search', errorBody(429, 'AI_RATE_LIMITED', 'You have reached the hourly limit for AI requests. Please try again later.'));
    renderApp(<PlainLanguageSearch />, { user, ai: true });
    const typing = userEvent.setup();
    const find = screen.getByRole('button', { name: 'Find courses' });
    await typing.type(screen.getByLabelText('What do you want to learn?'), 'a');
    expect(find).toBeDisabled();
    await typing.type(screen.getByLabelText('What do you want to learn?'), 'b');
    await typing.click(find);
    expect(await screen.findByRole('alert')).toHaveTextContent('You have reached the hourly limit for AI requests. Please try again later.');
  });

  it('discloses what is sent to the AI service only when one is configured', () => {
    mockApi();
    const { unmount } = renderApp(<PlainLanguageSearch />, { user, ai: true });
    expect(screen.getByText(/sent to OpenAI/)).toBeInTheDocument();
    unmount();
    renderApp(<PlainLanguageSearch />, { user, ai: false });
    expect(screen.queryByText(/sent to /)).not.toBeInTheDocument();
  });

  it('names the provider the server reports, not a fixed company', () => {
    mockApi();
    renderApp(<PlainLanguageSearch />, { user, ai: true, aiProvider: 'gateway.example.gov.in' });
    expect(screen.getByText(/sent to gateway.example.gov.in to turn them into filters/)).toBeInTheDocument();
  });

  it('clears the result', async () => {
    const server = mockApi();
    server.on('POST', '/ai/search', okBody(searchResult()));
    renderApp(<PlainLanguageSearch />, { user, ai: false });
    const typing = await search('advanced radar');
    await screen.findByText('Understood by keyword matching as');
    await typing.click(screen.getByRole('button', { name: 'Clear' }));
    expect(screen.queryByText('Understood by keyword matching as')).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------------------------------------------

describe('study plan card', () => {
  it('is not shown without an AI service', () => {
    mockApi();
    renderApp(<StudyPlanCard />, { user, ai: false });
    expect(screen.queryByText('Your plan in plain language')).not.toBeInTheDocument();
  });

  it('explains the recommendations, linking each step to its course', async () => {
    const server = mockApi();
    server.on(
      'POST',
      '/ai/recommendations/me/plan',
      okBody({
        summary: 'Your most important gap is Radar Meteorology.',
        steps: [
          { courseId: 'course-1', title: 'Radar Fundamentals', rank: 1, note: 'Builds the base you need.' },
          { courseId: 'course-2', title: 'Doppler Radar Analysis', rank: 2, note: 'Unlocks after Radar Fundamentals.' },
        ],
        model: 'claude-opus-5',
      }),
    );
    renderApp(<StudyPlanCard />, { user, ai: true });

    await userEvent.setup().click(screen.getByRole('button', { name: 'Explain my plan' }));

    expect(await screen.findByText('Your most important gap is Radar Meteorology.')).toBeInTheDocument();
    const steps = within(screen.getByRole('list'));
    expect(steps.getByRole('link', { name: 'Radar Fundamentals' })).toHaveAttribute('href', '/trainee/courses/course-1');
    expect(steps.getByText('Unlocks after Radar Fundamentals.')).toBeInTheDocument();
    expect(screen.getByText(/rule-based engine/)).toBeInTheDocument(); // the disclosure says who decided the plan
  });

  it('explains a failure and lets the learner try again', async () => {
    const server = mockApi();
    server.on('POST', '/ai/recommendations/me/plan', errorBody(422, 'NOTHING_TO_EXPLAIN', 'There are no recommended courses to explain right now.'));
    renderApp(<StudyPlanCard />, { user, ai: true });
    await userEvent.setup().click(screen.getByRole('button', { name: 'Explain my plan' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('There are no recommended courses to explain right now.');
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });
});
