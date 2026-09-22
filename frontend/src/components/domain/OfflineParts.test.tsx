import { act, cleanup, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetQueueForTesting, runOrQueue } from '../../offline/queue';
import { mockApi, okBody, renderApp } from '../../test/utils';
import { OfflineNotice, SyncStatusChip } from './OfflineParts';

/**
 * The connection indicator is the only part of the offline machinery a learner
 * sees, so it has to be accurate: it must never say "online" while work is
 * still sitting on the device.
 */

let online = true;

beforeEach(() => {
  online = true;
  vi.spyOn(navigator, 'onLine', 'get').mockImplementation(() => online);
  resetQueueForTesting();
});
afterEach(() => {
  cleanup(); // unmount before the queue is reset, so React is not updated from under a live component
  resetQueueForTesting();
  vi.restoreAllMocks();
});

/** Lets the queue's promises finish inside React's act scope. */
const settled = () => act(async () => void (await new Promise((resolve) => setTimeout(resolve, 0))));

describe('SyncStatusChip', () => {
  it('reports the connection and how many changes are waiting', async () => {
    mockApi();
    online = false;
    await runOrQueue('module.complete', 'Completed "Radar basics"', { enrollmentId: 'e1', moduleId: 'm1', courseId: 'c1' });

    renderApp(<SyncStatusChip />);

    const chip = await screen.findByRole('button', { name: /connection: offline, 1 change waiting/i });
    expect(chip).toHaveTextContent('OFFLINE');
    expect(chip).toHaveTextContent('1');
  });

  it('lists what is waiting, so nothing is a mystery', async () => {
    mockApi();
    online = false;
    await runOrQueue('module.complete', 'Completed "Radar basics"', { enrollmentId: 'e1', moduleId: 'm1', courseId: 'c1' });
    renderApp(<SyncStatusChip />);

    await userEvent.click(await screen.findByRole('button', { name: /connection: offline/i }));

    const panel = await screen.findByRole('dialog', { name: /offline sync/i });
    expect(panel).toHaveTextContent('Completed "Radar basics"');
    expect(panel).toHaveTextContent(/waiting to sync/i);
  });

  it('says so plainly when everything has reached the server', async () => {
    mockApi();
    renderApp(<SyncStatusChip />);
    const chip = await screen.findByRole('button', { name: /connection: online/i });
    await userEvent.click(chip);
    expect(await screen.findByRole('dialog', { name: /offline sync/i })).toHaveTextContent(/everything on this device has reached the server/i);
  });

  it('confirms a completed sync after the queue drains', async () => {
    const server = mockApi();
    online = false;
    await runOrQueue('module.complete', 'Completed "Radar basics"', { enrollmentId: 'e1', moduleId: 'm1', courseId: 'c1' });

    online = true;
    server.on('POST', '/enrollments/e1/modules/m1/complete', okBody({}));
    renderApp(<SyncStatusChip />);
    await userEvent.click(await screen.findByRole('button', { name: /connection: offline/i }));
    await userEvent.click(screen.getByRole('button', { name: /sync now/i }));

    await settled();

    expect(screen.getByRole('button', { name: /connection: sync complete/i })).toBeInTheDocument();
    expect(screen.queryByText('Completed "Radar basics"')).not.toBeInTheDocument();
  });
});

describe('OfflineNotice', () => {
  it('appears only when the device is offline, and says what still works', async () => {
    mockApi();
    const { unmount } = renderApp(<OfflineNotice />);
    expect(screen.queryByText(/you are offline/i)).not.toBeInTheDocument();
    unmount();

    online = false;
    resetQueueForTesting(); // nothing is mounted here: the re-read happens on the next render
    renderApp(<OfflineNotice />);
    expect(await screen.findByText(/you are offline/i)).toBeInTheDocument();
    expect(screen.getByText(/sync when you reconnect/i)).toBeInTheDocument();
  });
});
