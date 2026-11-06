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
import { useEffect, useState, type ReactNode } from 'react';
import { afterEach, describe, it, expect, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// The mounted chart's props, so a test can report a render error as the toolkit would.
const vis = vi.hoisted(() => ({
  props: {} as { onRenderError?: (error: { message: string } | null) => void },
}));

vi.mock('udi-toolkit/react', () => ({
  UDIVis: (props: typeof vis.props) => {
    vis.props = props;
    return <div data-testid="udi-vis" />;
  },
  usePalette: () => undefined,
  useClearAllSelections: () => () => {},
  describeTransformations: () => ['Group by sex'],
}));

import {
  UDIChatProvider,
  useConversationStore,
  useDashboard,
  useDashboardStore,
  useDataPackageStore,
  useGlobalStore,
} from '@/app/UDIChatContext';
import type { UDIGrammar } from 'udi-toolkit/react';
import type { DataSelection, DataSelections } from '../stores/dataFiltersStore';
import { DashboardCard } from './DashboardCard';
import { ChatPanel } from '@/features/chat';

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
function Harness({ children, spec = countBySex }: { children?: ReactNode; spec?: UDIGrammar }) {
  const store = useDashboardStore();
  const dataPackageStore = useDataPackageStore();
  useEffect(() => {
    dataPackageStore.setState({
      sourceFields: { donors: ['sex', 'race'] },
      categoricalSourceFields: { donors: ['sex', 'race'] },
    });
    store.getState().addActiveVisualization(0, 0, spec, 'prompt', null);
  }, [store, dataPackageStore, spec]);
  const viz = useDashboard((s) => s.activeVisualizations.get('0-0'));
  if (!viz) return null;
  return (
    <>
      <DashboardCard vizKey="0-0" viz={viz} selections={{}} />
      {children}
    </>
  );
}

function renderCard(spec?: UDIGrammar) {
  return render(
    <UDIChatProvider>
      <Harness spec={spec} />
    </UDIChatProvider>,
  );
}

/** Publishes the global store so a test can leave read-only after mount. */
let globalStore: ReturnType<typeof useGlobalStore>;
function CaptureGlobalStore() {
  const store = useGlobalStore();
  useEffect(() => {
    globalStore = store;
  }, [store]);
  return null;
}

function renderReadOnlyCard(readOnly: 'locked' | true = true) {
  return render(
    <UDIChatProvider readOnly={readOnly}>
      <CaptureGlobalStore />
      <Harness />
    </UDIChatProvider>,
  );
}

describe('DashboardCard — table toggle', () => {
  it('offers a table view of a chart', async () => {
    renderCard();
    expect(await screen.findByRole('button', { name: 'Show table' })).toBeTruthy();
  });

  it('offers none on a spec that is already a table', async () => {
    const valueCounts = {
      ...countBySex,
      representation: {
        mark: 'row',
        mapping: [{ encoding: 'text', field: 'sex', mark: 'text', type: 'nominal' }],
      },
    } as unknown as UDIGrammar;
    renderCard(valueCounts);
    expect(await screen.findByRole('button', { name: 'Drag card' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Show table' })).toBeNull();
  });
});

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

describe('DashboardCard — read-only mode', () => {
  it('drops every editing control and leaves the view controls alone', async () => {
    renderReadOnlyCard();

    // The title is still shown, just no longer a rename affordance.
    expect(await screen.findByText('Bar chart of Count of Donors by Sex')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Rename visualization/ })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Drag card' })).toBeNull();

    const labels = screen.getAllByRole('button').map((b) => b.textContent);
    // Close and the tweak gear render no text, so assert on the count of what
    // is left: the chart/table toggle, the category sort toggle and the info
    // tooltip trigger.
    expect(labels).toHaveLength(3);
    expect(screen.getByRole('button', { name: 'Sort by total' })).toBeTruthy();
  });

  it('brings the editing controls back when read-only is left', async () => {
    renderReadOnlyCard();
    await screen.findByText('Bar chart of Count of Donors by Sex');

    await act(async () => {
      globalStore.getState().setReadOnly(false);
    });

    expect(screen.getByRole('button', { name: 'Drag card' })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Rename visualization/ })).toBeTruthy();
  });

  it('ignores setReadOnly(false) when locked', async () => {
    renderReadOnlyCard('locked');
    await screen.findByText('Bar chart of Count of Donors by Sex');

    await act(async () => {
      globalStore.getState().setReadOnly(false);
    });

    expect(globalStore.getState().readOnly).toBe(true);
    expect(screen.queryByRole('button', { name: 'Drag card' })).toBeNull();
  });
});

/** A card whose own brush a test can drive through the column filter it shows,
 *  the way a chip's Clear does. */
let setOwnBrush: (sel: DataSelection['selection']) => void;
function BrushHarness() {
  const store = useDashboardStore();
  const [brush, setBrush] = useState<DataSelection['selection']>({ donor_count: [1, 2] });
  useEffect(() => {
    setOwnBrush = setBrush;
    store.getState().addActiveVisualization(0, 0, countBySex, 'prompt', null);
  }, [store]);
  const viz = useDashboard((s) => s.activeVisualizations.get('0-0'));
  if (!viz) return null;
  const selections: DataSelections =
    brush == null
      ? {}
      : {
          'col:donors.donor_count': {
            dataSourceKey: 'donors',
            type: 'interval' as const,
            selection: brush,
          },
        };
  return <DashboardCard vizKey="0-0" viz={viz} selections={selections} />;
}

describe('DashboardCard — dropping a cleared brush', () => {
  // The toolkit clears the drawn brush in place; remounting the chart for it
  // flashed the card blank, then unfiltered, on every clear.
  it('keeps the chart mounted when its own brush is emptied or removed', async () => {
    render(
      <UDIChatProvider>
        <BrushHarness />
      </UDIChatProvider>,
    );
    const drawn = await screen.findByTestId('udi-vis');

    act(() => setOwnBrush({ donor_count: [] }));
    expect(screen.getByTestId('udi-vis')).toBe(drawn);

    act(() => setOwnBrush(null));
    expect(screen.getByTestId('udi-vis')).toBe(drawn);
  });
});

describe('DashboardCard — a chart that fails to draw', () => {
  const error = 'Invalid variable reference: "Surgery": Table expressions do not support closures.';

  /** The real chat panel beside the card, so the repair goes out the way a typed turn does. */
  function WithChat() {
    const conversationStore = useConversationStore();
    const dataPackageStore = useDataPackageStore();
    useEffect(() => {
      dataPackageStore.setState({ loadingPhase: 'ready' });
      // Message 0, the card's own index: the transcript's first chart.
      conversationStore.getState().addMessage({
        role: 'assistant',
        content: '',
        tool_calls: [{ function: { name: 'RenderVisualization', arguments: {} } }],
      });
    }, [conversationStore, dataPackageStore]);
    return (
      <ChatPanel
        config={{ apiBaseUrl: '/api/yac' }}
        needsApiKey={false}
        hasApiKey={false}
        userKeyQuotaExceeded={false}
        pendingQuotaRetry={false}
        onSetApiKey={() => {}}
        onClearApiKey={() => {}}
        onQuotaRebuff={() => {}}
        onNormalResponse={() => {}}
        onConsumePendingRetry={() => {}}
      />
    );
  }

  afterEach(() => vi.unstubAllGlobals());

  it('swaps the raw error for a plain failure and sends one repair turn', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('[]', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    render(
      <UDIChatProvider>
        <Harness>
          <WithChat />
        </Harness>
      </UDIChatProvider>,
    );
    await screen.findByTestId('udi-vis');
    act(() => vis.props.onRenderError?.({ message: error }));

    expect(screen.getByText("This chart couldn't be drawn from the data.")).toBeTruthy();
    expect(screen.queryByText(error)).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Try to fix' }));
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    const turn = body.messages.at(-1);
    expect(turn.role).toBe('user');
    expect(turn.content).toBe(
      'The chart "Bar chart of Count of Donors by Sex" (chart_1) couldn\'t be drawn from the ' +
        `data. Please fix it.\n\nError: ${error}`,
    );
    expect(
      (screen.getByRole('button', { name: 'Fix requested' }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it('shows the raw error in debug mode, and clears once a later run draws', async () => {
    render(
      <UDIChatProvider>
        <CaptureGlobalStore />
        <Harness />
      </UDIChatProvider>,
    );
    await screen.findByTestId('udi-vis');
    act(() => globalStore.getState().toggleDebugMode());
    act(() => vis.props.onRenderError?.({ message: error }));
    expect(screen.getByText(error)).toBeTruthy();

    act(() => vis.props.onRenderError?.(null));
    expect(screen.queryByText("This chart couldn't be drawn from the data.")).toBeNull();
  });
});
