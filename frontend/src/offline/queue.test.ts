import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { errorBody, mockApi, okBody } from '../test/utils';
import { discardMutation, flushQueue, queueSnapshot, resetQueueForTesting, runOrQueue } from './queue';

/**
 * The mutation queue is what makes offline work safe rather than merely
 * possible, so these tests pin the promises it makes: nothing is lost, nothing
 * is sent twice, and order is kept.
 *
 * IndexedDB does not exist in jsdom, so the queue runs from memory here. That
 * is the same code path minus the write to disk.
 */

let online = true;
const setOnline = (value: boolean) => {
  online = value;
};

beforeEach(() => {
  online = true;
  vi.spyOn(navigator, 'onLine', 'get').mockImplementation(() => online);
  resetQueueForTesting();
});
afterEach(() => {
  vi.restoreAllMocks();
  resetQueueForTesting();
});

/** Fails the way a lost connection does: the client turns any fetch rejection into a network error. */
const networkDown = () => {
  throw new Error('network down');
};

const submitPayload = { assessmentId: 'a1', attemptId: 'att1', answers: [{ questionId: 'q1', optionIds: ['o1'] }] };

describe('runOrQueue: online', () => {
  it('sends straight away and returns the server result', async () => {
    const server = mockApi();
    server.on('POST', '/assessments/a1/submit', okBody({ attempt: { id: 'att1' } }));

    const outcome = await runOrQueue('assessment.submit', 'Submitted radar assessment', submitPayload);

    expect(outcome.queued).toBe(false);
    expect(outcome.result).toEqual({ attempt: { id: 'att1' } });
    expect(queueSnapshot().pending).toHaveLength(0);
    expect(server.callsTo('POST', '/assessments/a1/submit')).toHaveLength(1);
  });

  it('sends an idempotency key with every submission, so a retry cannot cost an attempt', async () => {
    const server = mockApi();
    server.on('POST', '/assessments/a1/submit', okBody({ attempt: { id: 'att1' } }));

    await runOrQueue('assessment.submit', 'Submitted radar assessment', submitPayload);

    const body = server.callsTo('POST', '/assessments/a1/submit')[0]?.body as { idempotencyKey?: string };
    expect(body.idempotencyKey).toEqual(expect.any(String));
    expect(body.idempotencyKey?.length).toBeGreaterThanOrEqual(8); // the server's minimum
  });

  it('queues a write the network lost rather than failing it', async () => {
    const server = mockApi();
    server.on('POST', '/enrollments/e1/modules/m1/complete', networkDown);

    const outcome = await runOrQueue('module.complete', 'Completed module 1', { enrollmentId: 'e1', moduleId: 'm1', courseId: 'c1' });

    expect(outcome.queued).toBe(true);
    expect(queueSnapshot().pending).toHaveLength(1);
    expect(server.callsTo('POST', '/enrollments/e1/modules/m1/complete')).toHaveLength(1);
  });

  it('does not queue a rejection: a 4xx is the learner\'s to see now', async () => {
    const server = mockApi();
    server.on('POST', '/assessments/a1/submit', errorBody(409, 'ATTEMPT_ALREADY_SUBMITTED', 'This attempt was already submitted.'));

    await expect(runOrQueue('assessment.submit', 'Submitted radar assessment', submitPayload)).rejects.toThrow('This attempt was already submitted.');
    expect(queueSnapshot().pending).toHaveLength(0);
    expect(server.calls).toHaveLength(1);
  });
});

describe('runOrQueue: offline', () => {
  it('stores the change without calling the server, and says it is queued', async () => {
    const server = mockApi();
    setOnline(false);

    const outcome = await runOrQueue('module.complete', 'Completed "Radar basics"', { enrollmentId: 'e1', moduleId: 'm1', courseId: 'c1' });

    expect(outcome.queued).toBe(true);
    expect(server.calls).toHaveLength(0);
    expect(queueSnapshot().state).toBe('OFFLINE');
    expect(queueSnapshot().pending[0]?.label).toBe('Completed "Radar basics"');
  });
});

describe('flushQueue', () => {
  it('sends what was queued offline, in the order the learner worked', async () => {
    const server = mockApi();
    setOnline(false);
    await runOrQueue('module.complete', 'Completed module 1', { enrollmentId: 'e1', moduleId: 'm1', courseId: 'c1' });
    await runOrQueue('module.complete', 'Completed module 2', { enrollmentId: 'e1', moduleId: 'm2', courseId: 'c1' });

    setOnline(true);
    server.on('POST', '/enrollments/e1/modules/m1/complete', okBody({}));
    server.on('POST', '/enrollments/e1/modules/m2/complete', okBody({}));

    const result = await flushQueue();

    expect(result).toEqual({ sent: 2, failed: 0 });
    expect(server.calls.map((call) => call.path)).toEqual(['/enrollments/e1/modules/m1/complete', '/enrollments/e1/modules/m2/complete']);
    expect(queueSnapshot().pending).toHaveLength(0);
    expect(queueSnapshot().state).toBe('SYNC COMPLETE');
    expect(queueSnapshot().lastSyncedAt).toEqual(expect.any(String));
  });

  it('replays a queued submission with the key it was given when the learner pressed submit', async () => {
    const server = mockApi();
    setOnline(false);
    await runOrQueue('assessment.submit', 'Submitted radar assessment', submitPayload);
    const keyAtSubmitTime = queueSnapshot().pending[0]?.id;

    setOnline(true);
    server.on('POST', '/assessments/a1/submit', okBody({ attempt: { id: 'att1' } }));
    await flushQueue();

    expect((server.callsTo('POST', '/assessments/a1/submit')[0]?.body as { idempotencyKey: string }).idempotencyKey).toBe(keyAtSubmitTime);
  });

  it('keeps everything and stops at the first network failure, so nothing overtakes anything', async () => {
    const server = mockApi();
    setOnline(false);
    await runOrQueue('module.complete', 'Completed module 1', { enrollmentId: 'e1', moduleId: 'm1', courseId: 'c1' });
    await runOrQueue('module.complete', 'Completed module 2', { enrollmentId: 'e1', moduleId: 'm2', courseId: 'c1' });

    setOnline(true);
    server.on('POST', '/enrollments/e1/modules/m1/complete', networkDown);
    server.on('POST', '/enrollments/e1/modules/m2/complete', okBody({}));

    const result = await flushQueue();

    expect(result).toEqual({ sent: 0, failed: 1 });
    expect(server.callsTo('POST', '/enrollments/e1/modules/m2/complete')).toHaveLength(0); // never jumped the queue
    expect(queueSnapshot().pending).toHaveLength(2);
    expect(queueSnapshot().pending[0]?.failed).toBe(false); // still worth retrying
  });

  it('stops retrying a change the server has rejected, and keeps it visible for the learner', async () => {
    const server = mockApi();
    setOnline(false);
    await runOrQueue('module.complete', 'Completed module 1', { enrollmentId: 'e1', moduleId: 'm1', courseId: 'c1' });

    setOnline(true);
    server.on('POST', '/enrollments/e1/modules/m1/complete', errorBody(404, 'NOT_FOUND', 'That enrolment no longer exists.'));

    expect(await flushQueue()).toEqual({ sent: 0, failed: 1 });
    const entry = queueSnapshot().pending[0];
    expect(entry?.failed).toBe(true);
    expect(entry?.lastError).toBe('That enrolment no longer exists.');

    // A later flush leaves it alone rather than hammering the server.
    expect(await flushQueue()).toEqual({ sent: 0, failed: 0 });
    expect(server.calls).toHaveLength(1);

    await discardMutation(entry?.id ?? '');
    expect(queueSnapshot().pending).toHaveLength(0);
  });

  it('reports no work rather than a sync when the queue is empty', async () => {
    mockApi();
    expect(await flushQueue()).toEqual({ sent: 0, failed: 0 });
    expect(queueSnapshot().state).toBe('ONLINE');
  });
});
