/**
 * @vitest-environment jsdom
 *
 * Leaving read-only re-derives the column count. The chat pane comes back and
 * narrows the grid, and a count chosen for the full-width view — an embedded
 * session's — would otherwise squeeze every card.
 *
 * jsdom does no layout, so the grid's width is stubbed through offsetWidth.
 */
import { useEffect } from 'react';
import { afterEach, describe, it, expect, vi } from 'vitest';
import { act, cleanup, render } from '@testing-library/react';

vi.mock('udi-toolkit/react', () => ({
  UDIVis: () => <div data-testid="udi-vis" />,
  usePalette: () => undefined,
  describeTransformations: () => [],
}));

import {
  UDIChatProvider,
  useDashboard,
  useDashboardStore,
  useGlobalStore,
} from '@/app/UDIChatContext';
import type { UDIGrammar } from 'udi-toolkit/react';
import { DashboardGrid } from './DashboardGrid';

const spec = {
  source: { name: 'donors', source: 'donors.csv' },
  representation: { mark: 'bar', mapping: [{ encoding: 'x', field: 'sex', type: 'nominal' }] },
} as unknown as UDIGrammar;

let stores: {
  dashboard: ReturnType<typeof useDashboardStore>;
  global: ReturnType<typeof useGlobalStore>;
};

function Harness() {
  const dashboard = useDashboardStore();
  const global = useGlobalStore();
  useEffect(() => {
    stores = { dashboard, global };
    dashboard.getState().addActiveVisualization(0, 0, spec, 'prompt', null);
  }, [dashboard, global]);
  const seeded = useDashboard((s) => s.activeVisualizations.size > 0);
  return seeded ? <DashboardGrid selections={{}} /> : null;
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('DashboardGrid — leaving read-only', () => {
  it('re-derives the column count for the narrower grid', async () => {
    // One column per 700px, rounded up: 800px fits 2.
    vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(800);
    render(
      <UDIChatProvider readOnly>
        <Harness />
      </UDIChatProvider>,
    );
    await vi.waitFor(() => expect(stores).toBeDefined());
    // The embedded session asked for 4.
    act(() => stores.dashboard.getState().setGridCols(4));
    expect(stores.dashboard.getState().gridCols).toBe(4);

    act(() => stores.global.getState().setReadOnly(false));

    expect(stores.dashboard.getState().gridCols).toBe(2);
  });
});
