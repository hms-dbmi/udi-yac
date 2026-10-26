/**
 * @vitest-environment jsdom
 *
 * Changing read-only re-derives the column count. Leaving it brings the chat
 * pane back and narrows the grid, and a count chosen for the full-width view —
 * an embedded session's — would otherwise squeeze every card; going back
 * widens it again. A host can turn this off.
 *
 * jsdom does no layout, so the grid's width is stubbed through offsetWidth.
 */
import { useEffect } from 'react';
import { afterEach, describe, it, expect, vi } from 'vitest';
import { act, cleanup, fireEvent, render } from '@testing-library/react';

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

describe('DashboardGrid — changing read-only', () => {
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

  it('re-derives it for the wider grid on the way back', async () => {
    const width = vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(800);
    render(
      <UDIChatProvider>
        <Harness />
      </UDIChatProvider>,
    );
    await vi.waitFor(() => expect(stores).toBeDefined());
    act(() => stores.dashboard.getState().setGridCols(2));

    width.mockReturnValue(1500);
    act(() => stores.global.setState({ readOnly: true }));

    expect(stores.dashboard.getState().gridCols).toBe(3);
  });

  it('keeps the column count both ways when the host turns refitting off', async () => {
    const width = vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(800);
    render(
      <UDIChatProvider readOnly refitOnReadOnlyChange={false}>
        <Harness />
      </UDIChatProvider>,
    );
    await vi.waitFor(() => expect(stores).toBeDefined());
    act(() => stores.dashboard.getState().setGridCols(4));

    act(() => stores.global.getState().setReadOnly(false));
    expect(stores.dashboard.getState().gridCols).toBe(4);

    width.mockReturnValue(1500);
    act(() => stores.global.setState({ readOnly: true }));
    expect(stores.dashboard.getState().gridCols).toBe(4);
  });
});

// A card's live size mid-resize is drawn only when its GridItem re-renders, so
// that must happen on every pointer move, not only when the snapped row count
// changes. react-grid-layout 2.3.0 memoized GridItem on its grid props and broke
// this: the card froze, then jumped each time the pointer crossed half a row
// (react-grid-layout/react-grid-layout#2303).
describe('DashboardGrid — resizing', () => {
  it('grows the card with the pointer between grid steps', async () => {
    vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(800);
    const { container } = render(
      <UDIChatProvider>
        <Harness />
      </UDIChatProvider>,
    );
    const item = await vi.waitFor(() => {
      const el = container.querySelector<HTMLElement>('.react-grid-item');
      expect(el).not.toBeNull();
      return el!;
    });
    const handle = item.querySelector('.react-resizable-handle-s')!;
    const startHeight = parseFloat(item.style.height);

    // 3 × 10px stays under half a row step (60px row + 8px margin), so the
    // snapped height never changes and only the live preview should move.
    act(() => {
      fireEvent.mouseDown(handle, { button: 0, clientX: 0, clientY: 0 });
    });
    for (const clientY of [10, 20, 30]) {
      act(() => {
        fireEvent.mouseMove(document, { clientX: 0, clientY });
      });
    }

    expect(parseFloat(item.style.height)).toBe(startHeight + 30);
    act(() => {
      fireEvent.mouseUp(document, { clientX: 0, clientY: 30 });
    });
  });
});
