/**
 * @vitest-environment jsdom
 *
 * The transcript entry keeps showing the title the assistant produced, so a
 * card renamed on the dashboard would otherwise look like a different chart.
 * These cover the rename indicator that bridges the two, and its dismiss
 * control — the second way (besides clearing the field) to drop a custom name.
 *
 * UDIVis is mocked: it boots a Vue custom element on mount, which the chat
 * package deliberately does not exercise in jsdom (it is tested in udi-toolkit).
 */
import { useEffect } from 'react';
import type { StoreApi } from 'zustand/vanilla';
import { describe, it, expect, beforeEach } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { UDIChatProvider, useDashboard, useDashboardStore } from '@/app/UDIChatContext';
import type { DashboardState } from '@/features/dashboard';
import type { UDIGrammar } from 'udi-toolkit/react';
import { VisualizationCard } from './VisualizationCard';

const countBy = (dimension: string) =>
  ({
    source: { name: 'donors', source: 'donors.csv' },
    transformation: [{ groupby: dimension }, { rollup: { donor_count: { op: 'count' } } }],
    representation: {
      mark: 'bar',
      mapping: [
        { encoding: 'x', field: dimension, type: 'nominal' },
        { encoding: 'y', field: 'donor_count', type: 'quantitative' },
      ],
    },
  }) as unknown as UDIGrammar;

const countBySex = countBy('sex');
const countByRace = countBy('race');

let dashboard: StoreApi<DashboardState>;

function Harness() {
  const store = useDashboardStore();
  useEffect(() => {
    dashboard = store;
    store.getState().addActiveVisualization(0, 0, countBySex, 'prompt', null, 'Donor Count by Sex');
  }, [store]);
  const active = useDashboard((s) => s.activeVisualizations.get('0-0'));
  if (!active) return null;
  return (
    <VisualizationCard
      spec={countBySex}
      isActive
      title="Donor Count by Sex"
      messageIndex={0}
      toolCallIndex={0}
    />
  );
}

function renderCard() {
  return render(
    <UDIChatProvider>
      <Harness />
    </UDIChatProvider>,
  );
}

/* Store writes go through `act` so React has flushed before the assertions
   read the DOM — these stand in for edits made elsewhere in the app. */
const rename = (title: string) =>
  act(async () => {
    dashboard.getState().setVisualizationTitle('0-0', title);
  });
/** Stand in for a field swap made from the card's tweak panel. */
const tweak = (spec: UDIGrammar) =>
  act(async () => {
    dashboard.getState().updateActiveVisualizationSpec('0-0', spec, null);
  });
const storedSpec = () => dashboard.getState().activeVisualizations.get('0-0')!.spec;

describe('VisualizationCard — rename indicator', () => {
  beforeEach(() => {
    dashboard = undefined as unknown as StoreApi<DashboardState>;
  });

  it('shows only the assistant title until the card is renamed', async () => {
    renderCard();
    expect(await screen.findByText('Donor Count by Sex')).toBeTruthy();
    expect(screen.queryByText(/Renamed to/)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Remove custom name' })).toBeNull();
  });

  it('names the rename alongside the original once one is set', async () => {
    renderCard();
    await screen.findByText('Donor Count by Sex');
    await rename('Cohort breakdown');

    expect(await screen.findByText(/Renamed to/)).toBeTruthy();
    expect(screen.getByText('Cohort breakdown')).toBeTruthy();
    // The assistant's own title stays put — the transcript is a record.
    expect(screen.getByText('Donor Count by Sex')).toBeTruthy();
  });

  it('dismisses the custom name from the transcript', async () => {
    const user = userEvent.setup();
    renderCard();
    await screen.findByText('Donor Count by Sex');
    await rename('Cohort breakdown');
    await screen.findByText(/Renamed to/);

    await user.click(screen.getByRole('button', { name: 'Remove custom name' }));

    expect(screen.queryByText(/Renamed to/)).toBeNull();
    expect(dashboard.getState().activeVisualizations.get('0-0')!.userTitle).toBeUndefined();
  });

  it('does not offer the indicator for a message with no dashboard card', async () => {
    render(
      <UDIChatProvider>
        <VisualizationCard spec={countBySex} isActive title="Orphan" />
      </UDIChatProvider>,
    );
    expect(await screen.findByText('Orphan')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Remove custom name' })).toBeNull();
  });
});

describe('VisualizationCard — tweaked-fields notice', () => {
  beforeEach(() => {
    dashboard = undefined as unknown as StoreApi<DashboardState>;
  });

  it('says nothing while the card still plots what the assistant asked for', async () => {
    renderCard();
    await screen.findByText('Donor Count by Sex');
    expect(screen.queryByText(/Fields changed/)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Reset visualization' })).toBeNull();
  });

  it('names the auto-generated title once a field swap drifts it', async () => {
    renderCard();
    await screen.findByText('Donor Count by Sex');
    await tweak(countByRace);

    expect(await screen.findByText(/Fields changed/)).toBeTruthy();
    expect(screen.getByText('Count of Donors by Race')).toBeTruthy();
    // A swap is not a rename — that row stays out of the way.
    expect(screen.queryByText(/Renamed to/)).toBeNull();
  });

  it('reports a rename and a field swap as separate, separately-undoable changes', async () => {
    renderCard();
    await screen.findByText('Donor Count by Sex');
    await rename('Cohort breakdown');
    await tweak(countByRace);

    expect(await screen.findByText(/Renamed to/)).toBeTruthy();
    expect(screen.getByText(/Fields changed/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Remove custom name' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Reset visualization' })).toBeTruthy();
  });

  it('lists the field change ahead of the rename', async () => {
    renderCard();
    await screen.findByText('Donor Count by Sex');
    await rename('Cohort breakdown');
    await tweak(countByRace);
    await screen.findByText(/Fields changed/);

    const notices = screen.getAllByText(/Fields changed|Renamed to/);
    expect(notices.map((n) => n.textContent)).toEqual([
      'Fields changed',
      'Renamed to Cohort breakdown',
    ]);
  });

  it('drops the generated title from the notice when a custom name is set', async () => {
    renderCard();
    await screen.findByText('Donor Count by Sex');
    await tweak(countByRace);
    // Drifted and unnamed: the generated title is worth showing.
    expect(await screen.findByText('Count of Donors by Race')).toBeTruthy();

    await rename('Cohort breakdown');
    // Named: the custom name already says what the chart is called.
    expect(screen.queryByText('Count of Donors by Race')).toBeNull();
    expect(screen.getByText(/Fields changed/).textContent).toBe('Fields changed');
  });

  it('confirms before resetting, and cancelling changes nothing', async () => {
    const user = userEvent.setup();
    renderCard();
    await screen.findByText('Donor Count by Sex');
    await tweak(countByRace);
    await screen.findByText(/Fields changed/);

    await user.click(screen.getByRole('button', { name: 'Reset visualization' }));
    expect(await screen.findByText('Reset this visualization?')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(storedSpec()).toEqual(countByRace);
    expect(screen.getByText(/Fields changed/)).toBeTruthy();
  });

  it("restores the assistant's original fields once confirmed", async () => {
    const user = userEvent.setup();
    renderCard();
    await screen.findByText('Donor Count by Sex');
    await tweak(countByRace);
    await screen.findByText(/Fields changed/);

    await user.click(screen.getByRole('button', { name: 'Reset visualization' }));
    await user.click(await screen.findByRole('button', { name: 'Reset' }));

    expect(storedSpec()).toEqual(countBySex);
    expect(screen.queryByText(/Fields changed/)).toBeNull();
    // Back on the baseline, so the assistant's own title governs again.
    expect(screen.getByText('Donor Count by Sex')).toBeTruthy();
  });

  it('leaves a custom name alone when the fields are reset', async () => {
    const user = userEvent.setup();
    renderCard();
    await screen.findByText('Donor Count by Sex');
    await rename('Cohort breakdown');
    await tweak(countByRace);
    await screen.findByText(/Fields changed/);

    await user.click(screen.getByRole('button', { name: 'Reset visualization' }));
    await user.click(await screen.findByRole('button', { name: 'Reset' }));

    expect(storedSpec()).toEqual(countBySex);
    expect(dashboard.getState().activeVisualizations.get('0-0')!.userTitle).toBe(
      'Cohort breakdown',
    );
    expect(screen.getByText(/Renamed to/)).toBeTruthy();
  });
});
