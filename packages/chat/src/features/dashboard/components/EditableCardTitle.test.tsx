/**
 * @vitest-environment jsdom
 *
 * The rename affordance has two behaviours that are easy to regress: Escape
 * must not commit, and merely focusing the title (click in, click out) must not
 * pin the current text as a rename — that would silently freeze the title's
 * auto-update-on-tweak behaviour.
 */
import { useEffect, type ReactNode } from 'react';
import type { StoreApi } from 'zustand/vanilla';
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { UDIChatProvider, useDashboard, useDashboardStore } from '@/app/UDIChatContext';
import type { DashboardState } from '@/features/dashboard';
import type { UDIGrammar } from 'udi-toolkit/react';
import { EditableCardTitle } from './EditableCardTitle';

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

let dashboard: StoreApi<DashboardState>;
/** Every onEditingChange value the card would have seen, in order. */
let editingStates: boolean[] = [];

/** Seeds one card, then renders the editor bound to the live store entry. */
function Harness({ children }: { children?: ReactNode }) {
  const store = useDashboardStore();
  useEffect(() => {
    dashboard = store;
    store.getState().addActiveVisualization(0, 0, countBySex, 'prompt', null, 'Donor Count by Sex');
  }, [store]);
  const viz = useDashboard((s) => s.activeVisualizations.get('0-0'));
  if (!viz) return null;
  return (
    <>
      <EditableCardTitle vizKey="0-0" viz={viz} onEditingChange={(v) => editingStates.push(v)} />
      {children}
    </>
  );
}

function renderTitle() {
  return render(
    <UDIChatProvider>
      <Harness>
        <button type="button">elsewhere</button>
      </Harness>
    </UDIChatProvider>,
  );
}

const titleButton = () => screen.getByRole('button', { name: /Rename visualization/ });
const titleInput = () => screen.getByRole('textbox', { name: 'Visualization title' });
const saveButton = () => screen.getByRole('button', { name: 'Save title' });
const cancelButton = () => screen.getByRole('button', { name: 'Cancel rename' });

describe('EditableCardTitle', () => {
  beforeEach(() => {
    dashboard = undefined as unknown as StoreApi<DashboardState>;
    editingStates = [];
  });

  it('shows the agent title until the card is renamed', async () => {
    renderTitle();
    expect(await screen.findByText('Donor Count by Sex')).toBeTruthy();
  });

  it('commits a rename on Enter', async () => {
    const user = userEvent.setup();
    renderTitle();
    await user.click(await titleButton());
    await user.clear(titleInput());
    await user.type(titleInput(), 'Cohort breakdown{Enter}');

    expect(screen.getByText('Cohort breakdown')).toBeTruthy();
    expect(dashboard.getState().activeVisualizations.get('0-0')!.userTitle).toBe(
      'Cohort breakdown',
    );
    // The original is kept for provenance.
    expect(dashboard.getState().activeVisualizations.get('0-0')!.title).toBe('Donor Count by Sex');
  });

  it('commits a rename on blur', async () => {
    const user = userEvent.setup();
    renderTitle();
    await user.click(await titleButton());
    await user.clear(titleInput());
    await user.type(titleInput(), 'Renamed by blur');
    await user.click(screen.getByRole('button', { name: 'elsewhere' }));

    expect(dashboard.getState().activeVisualizations.get('0-0')!.userTitle).toBe('Renamed by blur');
  });

  it('commits via the accept button', async () => {
    const user = userEvent.setup();
    renderTitle();
    await user.click(await titleButton());
    await user.clear(titleInput());
    await user.type(titleInput(), 'Saved by button');
    await user.click(saveButton());

    expect(screen.getByText('Saved by button')).toBeTruthy();
    expect(dashboard.getState().activeVisualizations.get('0-0')!.userTitle).toBe('Saved by button');
  });

  it('discards the draft via the cancel button', async () => {
    const user = userEvent.setup();
    renderTitle();
    await user.click(await titleButton());
    await user.clear(titleInput());
    await user.type(titleInput(), 'Never saved');
    await user.click(cancelButton());

    expect(screen.getByText('Donor Count by Sex')).toBeTruthy();
    expect(dashboard.getState().activeVisualizations.get('0-0')!.userTitle).toBeUndefined();
  });

  it('reports edit state so the card can hide its other header buttons', async () => {
    const user = userEvent.setup();
    renderTitle();
    expect(editingStates.at(-1)).toBeUndefined();
    await user.click(await titleButton());
    expect(editingStates.at(-1)).toBe(true);
    await user.click(cancelButton());
    expect(editingStates.at(-1)).toBe(false);
  });

  it('discards the draft on Escape', async () => {
    const user = userEvent.setup();
    renderTitle();
    await user.click(await titleButton());
    await user.clear(titleInput());
    await user.type(titleInput(), 'Never saved{Escape}');

    expect(screen.getByText('Donor Count by Sex')).toBeTruthy();
    expect(dashboard.getState().activeVisualizations.get('0-0')!.userTitle).toBeUndefined();
  });

  it('does not pin the title when the field is opened and left unchanged', async () => {
    const user = userEvent.setup();
    renderTitle();
    await user.click(await titleButton());
    await user.click(screen.getByRole('button', { name: 'elsewhere' }));

    expect(dashboard.getState().activeVisualizations.get('0-0')!.userTitle).toBeUndefined();
  });

  it('clearing the field reverts to the original title', async () => {
    const user = userEvent.setup();
    renderTitle();
    await user.click(await titleButton());
    await user.clear(titleInput());
    await user.type(titleInput(), 'Cohort breakdown{Enter}');
    expect(dashboard.getState().activeVisualizations.get('0-0')!.userTitle).toBe(
      'Cohort breakdown',
    );

    await user.click(titleButton());
    await user.clear(titleInput());
    await user.keyboard('{Enter}');

    expect(screen.getByText('Donor Count by Sex')).toBeTruthy();
    expect(dashboard.getState().activeVisualizations.get('0-0')!.userTitle).toBeUndefined();
  });
});
