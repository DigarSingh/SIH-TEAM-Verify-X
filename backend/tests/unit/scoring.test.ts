import { describe, expect, it } from 'vitest';
import { hashString, isPassing, scoreAnswers, seededRandom, shuffle, shuffledOptions, type ScorableQuestion } from '../../src/modules/assessments/scoring';

const single = (id: string, marks: number, correct: string, wrong: string[] = ['x', 'y', 'z']): ScorableQuestion => ({
  id,
  type: 'SINGLE',
  marks,
  options: [{ id: `${id}-${correct}`, isCorrect: true }, ...wrong.map((w) => ({ id: `${id}-${w}`, isCorrect: false }))],
});

const multiple = (id: string, marks: number): ScorableQuestion => ({
  id,
  type: 'MULTIPLE',
  marks,
  options: [
    { id: `${id}-a`, isCorrect: true },
    { id: `${id}-b`, isCorrect: true },
    { id: `${id}-c`, isCorrect: false },
    { id: `${id}-d`, isCorrect: false },
  ],
});

const answers = (entries: Record<string, string[]>) => new Map(Object.entries(entries));

describe('automatic scoring', () => {
  it('awards full marks for a correct single-answer question', () => {
    const result = scoreAnswers([single('q1', 2, 'a')], answers({ q1: ['q1-a'] }));
    expect(result).toMatchObject({ score: 2, totalMarks: 2, percentage: 100 });
    expect(result.perQuestion[0]).toMatchObject({ isCorrect: true, marksAwarded: 2 });
  });

  it('awards nothing for a wrong or missing answer', () => {
    const questions = [single('q1', 1, 'a'), single('q2', 1, 'a')];
    const result = scoreAnswers(questions, answers({ q1: ['q1-x'] }));
    expect(result.score).toBe(0);
    expect(result.perQuestion.map((r) => r.isCorrect)).toEqual([false, false]);
    expect(result.perQuestion[1]!.selectedOptionIds).toEqual([]);
  });

  it('is all-or-nothing for multiple-answer questions', () => {
    const q = multiple('m', 3);
    expect(scoreAnswers([q], answers({ m: ['m-a', 'm-b'] })).score).toBe(3);
    expect(scoreAnswers([q], answers({ m: ['m-a'] })).score).toBe(0); // incomplete
    expect(scoreAnswers([q], answers({ m: ['m-a', 'm-b', 'm-c'] })).score).toBe(0); // ticked a wrong one
    expect(scoreAnswers([q], answers({ m: ['m-a', 'm-b', 'm-c', 'm-d'] })).score).toBe(0); // "tick everything" does not work
  });

  it('ignores duplicates and option ids that do not belong to the question', () => {
    const q = single('q1', 1, 'a');
    expect(scoreAnswers([q], answers({ q1: ['q1-a', 'q1-a'] })).score).toBe(1);
    expect(scoreAnswers([q], answers({ q1: ['other-question-option'] })).score).toBe(0);
  });

  it('weights questions by their marks: 21 of 25 marks is 84%', () => {
    // 15 one-mark questions and 5 two-mark questions = 25 marks
    const questions = [...Array.from({ length: 15 }, (_, i) => single(`a${i}`, 1, 'a')), ...Array.from({ length: 5 }, (_, i) => single(`b${i}`, 2, 'a'))];
    const given: Record<string, string[]> = {};
    for (const q of questions) given[q.id] = [`${q.id}-a`]; // everything right ...
    given['b0'] = ['b0-x']; // ... except one 2-mark question
    given['a0'] = ['a0-x']; // ... and two 1-mark questions
    given['a1'] = ['a1-x'];
    const result = scoreAnswers(questions, answers(given));
    expect(result).toMatchObject({ score: 21, totalMarks: 25, percentage: 84 });
    expect(isPassing(result.percentage, 70)).toBe(true);
  });

  it('reports 0% (not NaN) for an assessment without questions', () => {
    expect(scoreAnswers([], new Map())).toMatchObject({ score: 0, totalMarks: 0, percentage: 0 });
  });

  it('rounds the percentage to two decimals', () => {
    const questions = [single('a', 1, 'a'), single('b', 1, 'a'), single('c', 1, 'a')];
    expect(scoreAnswers(questions, answers({ a: ['a-a'] })).percentage).toBe(33.33);
  });

  it('applies the pass mark inclusively (score equal to the pass mark passes)', () => {
    expect(isPassing(70, 70)).toBe(true);
    expect(isPassing(69.99, 70)).toBe(false);
  });
});

describe('deterministic shuffling', () => {
  it('produces the same option order for the same attempt and question', () => {
    const options = ['a', 'b', 'c', 'd', 'e'];
    expect(shuffledOptions(options, 'attempt-1', 'q1')).toEqual(shuffledOptions(options, 'attempt-1', 'q1'));
  });

  it('varies between attempts and keeps every option exactly once', () => {
    const options = Array.from({ length: 8 }, (_, i) => `o${i}`);
    const first = shuffledOptions(options, 'attempt-1', 'q1');
    const other = shuffledOptions(options, 'attempt-2', 'q1');
    expect([...first].sort()).toEqual([...options].sort());
    expect(first).not.toEqual(other);
  });

  it('shuffle never mutates its input and honours an injected random source', () => {
    const input = [1, 2, 3, 4];
    const out = shuffle(input, seededRandom(hashString('seed')));
    expect(input).toEqual([1, 2, 3, 4]);
    expect([...out].sort()).toEqual([1, 2, 3, 4]);
  });
});
