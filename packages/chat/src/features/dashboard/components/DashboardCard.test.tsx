/**
 * @vitest-environment jsdom
 *
 * Covers the header's edit mode: renaming collapses the card header down to the
 * title field and its accept/cancel buttons. The row is too narrow to hold both
 * sets, and leaving the grip mounted would let a stray drag start mid-edit.
 *
 * UDIVis is mocked: it boots a Vue custom element on mount, which the chat
 * package deliberately does not exercise in jsdom (it is tested in udi-toolkit).
 */
import { useEffect, type ReactNode } from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('udi-toolkit/react', () => ({
  UDIVis: () => <div data-testid="udi-vis" />,
  usePalette: () => undefined,
  describeTransformations: () => ['Group by sex'],
}));

import {
  UDIChatProvider,
  useDashboard,
  useDashboardStore,
  useDataPackageStore,
} from '@/app/UDIChatContext';
import type { UDIGrammar } from 'udi-toolkit/react';
import { DashboardCard } from './DashboardCard';

const countBySex = {
  source: { name: 'donors', source: 'donors.csv' },
  transformation: [{ groupby: 'sex' }, { rollup: { donor_count: { op: 'count' } } }],
  representation: {
    mark: 'bar',
    mapping: [
      { encoding: 'x', field: 'sex', type: 'nominal' },
      { encoding: 'y', field: 'donor_count', type: 'quantitative' },
    ],
  },
} as unknown as UDIGrammar;

/** Seeds one card plus the field lists that make its gear button actionable. */
function Harness({ children }: { children?: ReactNode }) {
  const store = useDashboardStore();
  const dataPackageStore = useDataPackageStore();
  useEffect(() => {
    dataPackageStore.setState({
      sourceFields: { donors: ['sex', 'race'] },
      categoricalSourceFields: { donors: ['sex', 'race'] },
    });
    store.getState().addActiveVisualization(0, 0, countBySex, 'prompt', null);
  }, [store, dataPackageStore]);
  const viz = useDashboard((s) => s.activeVisualizations.get('0-0'));
  if (!viz) return null;
  return (
    <>
      <DashboardCard vizKey="0-0" viz={viz} selections={{}} />
      {children}
    </>
  );
}

function renderCard() {
  return render(
    <UDIChatProvider>
      <Harness />
    </UDIChatProvider>,
  );
}

describe('DashboardCard — header while renaming', () => {
  it('swaps the whole button row for the title field and its accept/cancel pair', async () => {
    const user = userEvent.setup();
    renderCard();

    const title = await screen.findByRole('button', { name: /Rename visualization/ });
    expect(screen.getByRole('button', { name: 'Drag card' })).toBeTruthy();
    const restingButtons = screen.getAllByRole('button').length;
    // grip + title + gear + table + info + close, at least.
    expect(restingButtons).toBeGreaterThan(4);

    await user.click(title);

    expect(screen.queryByRole('button', { name: 'Drag card' })).toBeNull();
    expect(screen.getAllByRole('button').map((b) => b.getAttribute('aria-label'))).toEqual([
      'Save title',
      'Cancel rename',
    ]);

    await user.click(screen.getByRole('button', { name: 'Cancel rename' }));

    expect(screen.getByRole('button', { name: 'Drag card' })).toBeTruthy();
    expect(screen.getAllByRole('button')).toHaveLength(restingButtons);
  });

  it('restores the header after a committed rename', async () => {
    const user = userEvent.setup();
    renderCard();

    await user.click(await screen.findByRole('button', { name: /Rename visualization/ }));
    await user.clear(screen.getByRole('textbox', { name: 'Visualization title' }));
    await user.type(screen.getByRole('textbox', { name: 'Visualization title' }), 'Cohort');
    await user.click(screen.getByRole('button', { name: 'Save title' }));

    expect(screen.getByRole('button', { name: 'Drag card' })).toBeTruthy();
    expect(screen.getByText('Cohort')).toBeTruthy();
  });
});
