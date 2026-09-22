import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { DataTable, EmptyState, TabPanel, Tabs } from '.';

function TabsDemo() {
  const [tab, setTab] = useState<'first' | 'second'>('first');
  return (
    <>
      <Tabs
        label="Sections"
        value={tab}
        onChange={setTab}
        items={[
          { id: 'first', label: 'First' },
          { id: 'second', label: 'Second' },
        ]}
      />
      <TabPanel key={tab} id={tab} active>
        <p>Content of {tab}</p>
      </TabPanel>
    </>
  );
}

describe('tabs', () => {
  it('point the selected tab at a labelled tab panel that exists', async () => {
    const typing = userEvent.setup();
    render(<TabsDemo />);

    const first = screen.getByRole('tab', { name: 'First' });
    const firstPanel = screen.getByRole('tabpanel', { name: 'First' });
    expect(first).toHaveAttribute('aria-selected', 'true');
    expect(first).toHaveAttribute('aria-controls', firstPanel.id);

    await typing.click(screen.getByRole('tab', { name: 'Second' }));
    const secondPanel = screen.getByRole('tabpanel', { name: 'Second' });
    expect(screen.getByRole('tab', { name: 'Second' })).toHaveAttribute('aria-controls', secondPanel.id);
    expect(screen.getByText('Content of second')).toBeInTheDocument();
  });
});

describe('data table', () => {
  it('is a named region that the keyboard can focus and scroll', () => {
    render(
      <DataTable caption="Users">
        <tbody>
          <tr>
            <td>Ada</td>
          </tr>
        </tbody>
      </DataTable>,
    );
    const region = screen.getByRole('region', { name: 'Users' });
    expect(region).toHaveAttribute('tabindex', '0');
    expect(region).toContainElement(screen.getByRole('table', { name: 'Users' }));
  });
});

describe('empty state', () => {
  it('titles itself with a level-two heading, so it never skips a level under the page title', () => {
    render(<EmptyState title="No users match" />);
    expect(screen.getByRole('heading', { level: 2, name: 'No users match' })).toBeInTheDocument();
  });
});
