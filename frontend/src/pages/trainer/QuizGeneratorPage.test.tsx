import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { CourseCard } from '../../types';
import { errorBody, makeUser, mockApi, okBody, renderApp } from '../../test/utils';
import QuizGeneratorPage from './QuizGeneratorPage';

const trainer = makeUser({ role: 'TRAINER', name: 'Dr. Arjun Mehta' });

const course = { id: 'c1', title: 'Doppler Radar Analysis' } as CourseCard;
const assessment = (overrides: Record<string, unknown> = {}) => ({
  id: 'a1',
  courseId: 'c1',
  courseTitle: 'Doppler Radar Analysis',
  title: 'Doppler Final Assessment',
  isPublished: false,
  passingScore: 70,
  maxAttempts: 3,
  timeLimitMinutes: 30,
  deadline: null,
  questionCount: 8,
  attemptsSubmitted: 0,
  passRate: null,
  averageScore: null,
  updatedAt: '2026-09-01T00:00:00.000Z',
  ...overrides,
});

const draftQuestion = (n: number, overrides: Record<string, unknown> = {}) => ({
  text: `Which statement ${n} is supported by the course materials?`,
  type: 'SINGLE',
  marks: 1,
  explanation: `Explanation ${n}.`,
  options: [
    { text: `Correct answer ${n}`, isCorrect: true },
    { text: `Wrong answer ${n}a`, isCorrect: false },
    { text: `Wrong answer ${n}b`, isCorrect: false },
  ],
  ...overrides,
});
const coverage = { readableMaterials: 3, includedMaterials: 3, omittedMaterials: 0, truncated: false };

function serve({ assessments = [assessment()] }: { assessments?: unknown[] } = {}) {
  const server = mockApi();
  server.on('GET', '/courses', okBody([course], { categories: [], page: 1, pageSize: 100, total: 1, totalPages: 1 }));
  server.on('GET', '/assessments', okBody(assessments));
  return server;
}

/** Waits for the trainer's courses to load (the list is fetched), then picks one. */
async function chooseCourse(typing: ReturnType<typeof userEvent.setup>) {
  await screen.findByRole('option', { name: 'Doppler Radar Analysis' });
  await typing.selectOptions(screen.getByLabelText(/^Course/), 'c1');
}

async function generate(typing: ReturnType<typeof userEvent.setup>) {
  await chooseCourse(typing);
  await typing.click(screen.getByRole('button', { name: /generate questions/i }));
}

describe('AI quiz generator', () => {
  it('explains that AI is off and points to the manual route', async () => {
    serve();
    renderApp(<QuizGeneratorPage />, { user: trainer, ai: false });
    expect(await screen.findByText('The AI features are not switched on')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open assessments' })).toHaveAttribute('href', '/trainer/assessments');
    expect(screen.queryByRole('button', { name: /generate questions/i })).not.toBeInTheDocument();
  });

  it('drafts questions for review, and adds only the ones the trainer keeps', async () => {
    const server = serve();
    server.on('POST', '/ai/courses/c1/quiz-draft', okBody({ questions: [draftQuestion(1), draftQuestion(2), draftQuestion(3)], requested: 5, rejected: 2, coverage, model: 'claude-opus-5' }));
    server.on('POST', '/assessments/a1/questions', okBody({}));
    renderApp(<QuizGeneratorPage />, { user: trainer, ai: true });
    const typing = userEvent.setup();

    await generate(typing);

    // the request carries the chosen options, and no empty focus
    expect(server.callsTo('POST', '/ai/courses/c1/quiz-draft')[0]?.body).toEqual({ questionCount: 5, difficulty: 'MEDIUM', includeMultipleAnswer: true });

    // drafts are reviewed before anything is saved
    expect(await screen.findByRole('heading', { name: '2. Review the drafts' })).toBeInTheDocument();
    expect(screen.getByText(/3 questions left for “Doppler Radar Analysis” · 2 suggestions dropped as duplicates or invalid/)).toBeInTheDocument();
    expect(screen.getByText('Which statement 2 is supported by the course materials?')).toBeInTheDocument();
    expect(server.callsTo('POST', '/assessments/a1/questions')).toHaveLength(0);

    // keep questions 1 and 3
    await typing.click(screen.getByLabelText('Include question 2'));
    const add = await screen.findByRole('button', { name: 'Add 2 selected questions' });
    await typing.click(add);

    expect(await screen.findByText(/2 questions added to “Doppler Final Assessment”/)).toBeInTheDocument();
    const [call] = server.callsTo('POST', '/assessments/a1/questions');
    const sent = (call?.body as { questions: { text: string }[] }).questions.map((question) => question.text);
    expect(sent).toEqual(['Which statement 1 is supported by the course materials?', 'Which statement 3 is supported by the course materials?']);
    // what was added leaves the list; the deselected draft stays for a later decision
    expect(screen.getByText(/1 question left/)).toBeInTheDocument();
    expect(screen.queryByText('Which statement 1 is supported by the course materials?')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open the assessment builder' })).toHaveAttribute('href', '/trainer/assessments/a1');
  });

  it('marks the correct answers and shows the explanation and marks', async () => {
    const server = serve();
    server.on('POST', '/ai/courses/c1/quiz-draft', okBody({ questions: [draftQuestion(1, { type: 'MULTIPLE', marks: 2 })], requested: 1, rejected: 0, coverage, model: 'claude-opus-5' }));
    renderApp(<QuizGeneratorPage />, { user: trainer, ai: true });
    await generate(userEvent.setup());

    const card = (await screen.findByText('Which statement 1 is supported by the course materials?')).closest('li') as HTMLElement;
    expect(within(card).getByText('Multiple answers')).toBeInTheDocument();
    expect(within(card).getByText('2 marks')).toBeInTheDocument();
    expect(within(card).getByText('(correct answer)')).toBeInTheDocument(); // announced to screen readers, not only shown in green
    expect(within(card).getByText(/Explanation 1\./)).toBeInTheDocument();
  });

  it('sends a single question as it is, and includes the focus when one is given', async () => {
    const server = serve();
    server.on('POST', '/ai/courses/c1/quiz-draft', okBody({ questions: [draftQuestion(1)], requested: 3, rejected: 0, coverage, model: 'claude-opus-5' }));
    server.on('POST', '/assessments/a1/questions', okBody({}));
    renderApp(<QuizGeneratorPage />, { user: trainer, ai: true });
    const typing = userEvent.setup();

    await chooseCourse(typing);
    await typing.clear(screen.getByLabelText('Number of questions'));
    await typing.type(screen.getByLabelText('Number of questions'), '3');
    await typing.selectOptions(screen.getByLabelText('Difficulty'), 'HARD');
    await typing.type(screen.getByLabelText(/^Focus/), 'range ambiguity');
    await typing.click(screen.getByLabelText(/more than one correct answer/));
    await typing.click(screen.getByRole('button', { name: /generate questions/i }));

    await screen.findByRole('heading', { name: '2. Review the drafts' });
    expect(server.callsTo('POST', '/ai/courses/c1/quiz-draft')[0]?.body).toEqual({ questionCount: 3, difficulty: 'HARD', includeMultipleAnswer: false, focus: 'range ambiguity' });

    await typing.click(await screen.findByRole('button', { name: 'Add 1 selected question' }));
    await screen.findByText(/1 question added to “Doppler Final Assessment”/); // the on-page notice (the toast has a shorter text)
    expect(server.callsTo('POST', '/assessments/a1/questions')[0]?.body).toMatchObject({ text: 'Which statement 1 is supported by the course materials?', marks: 1 }); // one question is not wrapped in a list
  });

  it('validates the form before spending an AI request', async () => {
    const server = serve();
    renderApp(<QuizGeneratorPage />, { user: trainer, ai: true });
    const typing = userEvent.setup();

    await typing.click(await screen.findByRole('button', { name: /generate questions/i }));
    expect(await screen.findByText('Choose a course')).toBeInTheDocument();

    await chooseCourse(typing);
    await typing.clear(screen.getByLabelText('Number of questions'));
    await typing.type(screen.getByLabelText('Number of questions'), '25');
    await typing.click(screen.getByRole('button', { name: /generate questions/i }));
    expect(await screen.findByText('Enter a whole number from 1 to 20')).toBeInTheDocument();
    expect(server.callsTo('POST', '/ai/courses/c1/quiz-draft')).toHaveLength(0);
  });

  it('shows why nothing could be drafted', async () => {
    const server = serve();
    server.on('POST', '/ai/courses/c1/quiz-draft', errorBody(422, 'NO_READABLE_MATERIALS', 'Add at least one text reading (or a text document) to the course first: questions are written from the course materials.'));
    renderApp(<QuizGeneratorPage />, { user: trainer, ai: true });
    await generate(userEvent.setup());
    expect(await screen.findByRole('alert')).toHaveTextContent('Add at least one text reading');
    expect(screen.queryByRole('heading', { name: '2. Review the drafts' })).not.toBeInTheDocument();
  });

  it('keeps the drafts on screen when the course has no assessment yet, and says what to do', async () => {
    const server = serve({ assessments: [] });
    server.on('POST', '/ai/courses/c1/quiz-draft', okBody({ questions: [draftQuestion(1)], requested: 1, rejected: 0, coverage, model: 'claude-opus-5' }));
    renderApp(<QuizGeneratorPage />, { user: trainer, ai: true });
    await generate(userEvent.setup());

    expect(await screen.findByText(/has no assessment yet/)).toBeInTheDocument();
    expect(screen.getByText('Which statement 1 is supported by the course materials?')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Add \d+ selected/ })).not.toBeInTheDocument();
  });

  it('warns that adding to a published assessment reaches learners straight away', async () => {
    const server = serve({ assessments: [assessment({ isPublished: true })] });
    server.on('POST', '/ai/courses/c1/quiz-draft', okBody({ questions: [draftQuestion(1)], requested: 1, rejected: 0, coverage, model: 'claude-opus-5' }));
    renderApp(<QuizGeneratorPage />, { user: trainer, ai: true });
    await generate(userEvent.setup());
    expect(await screen.findByText(/already published, so the new questions become available to learners straight away/)).toBeInTheDocument();
  });

  it('tells the trainer when the AI could not read the whole course', async () => {
    const server = serve();
    server.on('POST', '/ai/courses/c1/quiz-draft', okBody({ questions: [draftQuestion(1)], requested: 1, rejected: 0, coverage: { readableMaterials: 10, includedMaterials: 6, omittedMaterials: 4, truncated: true }, model: 'claude-opus-5' }));
    renderApp(<QuizGeneratorPage />, { user: trainer, ai: true });
    await generate(userEvent.setup());
    expect(await screen.findByText(/Only 6 of 10 readable materials fit/)).toBeInTheDocument();
  });

  it('links to the admin workspace when an administrator uses it', async () => {
    serve();
    renderApp(<QuizGeneratorPage />, { user: makeUser({ role: 'ADMIN' }), ai: false });
    expect(await screen.findByRole('link', { name: 'Open assessments' })).toHaveAttribute('href', '/admin/assessments');
  });
});
