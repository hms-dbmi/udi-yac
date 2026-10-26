/**
 * @vitest-environment jsdom
 *
 * Covers the two shell-level halves of the dashboard embed: read-only hiding
 * the chat and the dashboard's top bar (and Explore Data putting them back), and
 * `initialSession` seeding the dashboard once the data package is ready. The
 * per-card half is covered in DashboardCard.test.tsx, the applier itself in
 * applySessionExport.test.ts.
 *
 * The toolkit is mocked wholesale — `UDIVis` boots a Vue custom element and
 * `loadDataPackage` reaches for CSVs, neither of which this package exercises
 * in jsdom.
 */
import { afterEach, describe, it, expect, vi } from 'vitest';
import { act, render, screen, within } from '@testing-library/react';
import type { DataPackage } from '@/types/dataPackage';
import userEvent from '@testing-library/user-event';

vi.mock('udi-toolkit/react', () => ({
  UDIVis: () => <div data-testid="udi-vis" />,
  UDIToolkitProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  usePalette: () => undefined,
  useClearAllSelections: () => () => Promise.resolve(),
  useQueryData: () => ({ data: null, isLoading: false, error: null }),
  describeTransformations: () => [],
  clearAllSelections: () => Promise.resolve(),
  loadDataPackage: () => Promise.resolve({ sources: [], fieldDomains: [] }),
  setQueryBackend: () => {},
  setTimeFormats: () => Promise.resolve(),
  createRemoteBackend: () => ({}),
}));

import { UDIChat, UDIDashboard } from './UDIChat';

const config = {
  apiBaseUrl: 'http://localhost:8007',
  dataPackagePath: '/data/datapackage.json',
};

describe('UDIChat — read-only shell', () => {
  it('renders the chat pane normally', () => {
    render(<UDIChat {...config} />);
    expect(screen.getByRole('heading', { name: 'Chat' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Explore Data' })).toBeNull();
  });

  it('hides the chat and the top bar in read-only mode', () => {
    render(<UDIChat {...config} readOnly />);
    expect(screen.queryByRole('heading', { name: 'Chat' })).toBeNull();
    expect(screen.queryByRole('button', { name: /Download Data/ })).toBeNull();
    expect(screen.getByRole('button', { name: 'Explore Data' })).toBeTruthy();
  });

  it('UDIDashboard is UDIChat already in read-only', () => {
    render(<UDIDashboard {...config} />);
    expect(screen.queryByRole('heading', { name: 'Chat' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Explore Data' })).toBeTruthy();
  });

  it('brings the chat back from the floating Explore Data button', async () => {
    const user = userEvent.setup();
    render(<UDIChat {...config} readOnly />);

    await user.click(screen.getByRole('button', { name: 'Explore Data' }));

    expect(screen.getByRole('heading', { name: 'Chat' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Explore Data' })).toBeNull();
    expect(screen.getByRole('button', { name: /Download Data/ })).toBeTruthy();
  });

  it('offers no way out when locked', () => {
    render(<UDIChat {...config} readOnly="locked" />);
    expect(screen.queryByRole('heading', { name: 'Chat' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Explore Data' })).toBeNull();
  });
});

describe('UDIChat — host switching read-only', () => {
  afterEach(() => vi.restoreAllMocks());

  it('follows the readOnly prop both ways', () => {
    const { rerender } = render(<UDIChat {...config} readOnly />);

    rerender(<UDIChat {...config} readOnly={false} />);
    expect(screen.getByRole('heading', { name: 'Chat' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Explore Data' })).toBeNull();

    rerender(<UDIChat {...config} readOnly />);
    expect(screen.queryByRole('heading', { name: 'Chat' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Explore Data' })).toBeTruthy();
  });

  it('tells the host when the user leaves through Explore Data', async () => {
    const user = userEvent.setup();
    const onReadOnlyChange = vi.fn();
    render(<UDIChat {...config} readOnly onReadOnlyChange={onReadOnlyChange} />);

    await user.click(screen.getByRole('button', { name: 'Explore Data' }));

    expect(onReadOnlyChange).toHaveBeenCalledExactlyOnceWith(false);
  });

  it('lets the host out of a lock the user cannot leave', () => {
    const { rerender } = render(<UDIChat {...config} readOnly="locked" />);
    rerender(<UDIChat {...config} readOnly={false} />);
    expect(screen.getByRole('heading', { name: 'Chat' })).toBeTruthy();
  });

  it('keeps a draft through a round trip to read-only', async () => {
    const user = userEvent.setup();
    const { rerender } = render(<UDIChat {...config} />);
    await user.type(screen.getByPlaceholderText('Ask a question...'), 'half a question');

    rerender(<UDIChat {...config} readOnly />);
    rerender(<UDIChat {...config} readOnly={false} />);

    expect(screen.getByPlaceholderText('Ask a question...')).toHaveProperty(
      'value',
      'half a question',
    );
  });

  it('hides the seeded transcript on the first exit only', async () => {
    // Never answers: the sent message stays in the transcript, pending.
    vi.spyOn(globalThis, 'fetch').mockReturnValue(new Promise(() => {}));
    const user = userEvent.setup();
    const { rerender } = render(
      <UDIChat {...seedConfig} readOnly initialSession={seededSession} />,
    );
    expect(await screen.findByText('Seeded cohort')).toBeTruthy();

    rerender(<UDIChat {...seedConfig} readOnly={false} initialSession={seededSession} />);
    expect(screen.queryByText('donors by sex')).toBeNull();
    await user.type(screen.getByPlaceholderText('Ask a question...'), 'my own question{Enter}');
    expect(screen.getByText('my own question')).toBeTruthy();

    rerender(<UDIChat {...seedConfig} readOnly initialSession={seededSession} />);
    rerender(<UDIChat {...seedConfig} readOnly={false} initialSession={seededSession} />);

    expect(screen.getByText('my own question')).toBeTruthy();
    expect(screen.queryByText('donors by sex')).toBeNull();
  });
});

/** A one-resource package. Paired with `dataFieldDomains`, `setDataPackage`
 *  reaches `loadingPhase: 'ready'` without fetching a single CSV — which is
 *  what the seeding effect waits for. */
const dataPackage = {
  'udi:path': 'https://host.example/data/',
  resources: [
    {
      name: 'donors',
      path: 'donors.csv',
      'udi:row_count': 10,
      schema: {
        fields: [
          { name: 'sex', 'udi:data_type': 'nominal' },
          { name: 'donor_count', 'udi:data_type': 'quantitative' },
        ],
      },
    },
  ],
} as unknown as DataPackage;

const seededSession = {
  version: 1,
  exportedAt: '2026-01-01T00:00:00.000Z',
  conversation: { messages: [{ role: 'user', content: 'donors by sex' }] },
  visualizations: [
    {
      key: '0-0',
      uuid: 'viz-uuid',
      index: 0,
      toolCallIndex: 0,
      userPrompt: 'donors by sex',
      userTitle: 'Seeded cohort',
      spec: {
        source: { name: 'donors', source: 'donors.csv' },
        transformation: [{ groupby: 'sex' }, { rollup: { donor_count: { op: 'count' } } }],
        representation: {
          mark: 'bar',
          mapping: [
            { encoding: 'x', field: 'sex', type: 'nominal' },
            { encoding: 'y', field: 'donor_count', type: 'quantitative' },
          ],
        },
      },
    },
  ],
  layout: { items: [{ i: '0-0', x: 0, y: 0, w: 1, h: 7 }] },
  grid: { cols: 3, rowHeight: 60 },
};

const seedConfig = {
  apiBaseUrl: 'http://localhost:8007',
  dataPackage,
  dataFieldDomains: [],
};

describe('UDIChat — initialSession', () => {
  it('seeds the dashboard once the data package is ready', async () => {
    render(<UDIDashboard {...seedConfig} initialSession={seededSession} />);

    expect(await screen.findByText('Seeded cohort')).toBeTruthy();
    // Read-only, so the seeded card is shown without its editing chrome.
    expect(screen.queryByRole('button', { name: 'Drag card' })).toBeNull();
  });

  it('seeds a chat-enabled session too — the two props are independent', async () => {
    render(<UDIChat {...seedConfig} initialSession={seededSession} />);

    expect(await screen.findByText('Seeded cohort')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Drag card' })).toBeTruthy();
    // Chatting from the start, the seeded transcript is the user's own.
    expect(screen.getByText('donors by sex')).toBeTruthy();
  });

  it('opens a fresh chat from read-only, hiding the seeded transcript but not its charts', async () => {
    const user = userEvent.setup();
    render(<UDIChat {...seedConfig} readOnly initialSession={seededSession} />);
    expect(await screen.findByText('Seeded cohort')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'Explore Data' }));

    expect(screen.getByRole('heading', { name: 'Chat' })).toBeTruthy();
    expect(screen.queryByText('donors by sex')).toBeNull();
    expect(screen.getByText('Seeded cohort')).toBeTruthy();
    // Its message is hidden, so there is nothing for the card to jump to.
    expect(screen.queryByRole('button', { name: 'Show message in chat' })).toBeNull();
  });

  // Leaving read-only hides the seeded transcript, but not its filters: they
  // still apply, so their chat widgets stay — at the top, where their messages
  // were — with entity and field still editable, as a chat filter's are.
  it('keeps a seeded filter editable in the chat after Explore Data', async () => {
    const user = userEvent.setup();
    const withFilter = {
      ...seededSession,
      conversation: {
        messages: [
          ...seededSession.conversation.messages,
          {
            role: 'assistant',
            content: '',
            tool_calls: [
              {
                function: {
                  name: 'FilterData',
                  arguments: {
                    title: 'Donor Sex',
                    entity: 'donors',
                    field: 'sex',
                    filter: {
                      filterType: 'point',
                      pointValues: ['Female'],
                      intervalRange: { min: 0, max: 0 },
                    },
                  },
                },
              },
            ],
          },
        ],
      },
    };
    render(<UDIChat {...seedConfig} readOnly initialSession={withFilter} />);
    expect(await screen.findByText('Seeded cohort')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'Explore Data' }));

    expect(screen.queryByText('donors by sex')).toBeNull();
    expect(screen.getByRole('button', { name: /Filter: / })).toBeTruthy();
    const [entity, field] = screen.getAllByRole('combobox');
    expect(entity).not.toHaveAttribute('data-disabled');
    expect(field).not.toHaveAttribute('data-disabled');
  });

  it('hides an empty Filters section while read-only, and brings it back on exit', async () => {
    const user = userEvent.setup();
    render(<UDIDashboard {...seedConfig} initialSession={seededSession} />);
    expect(await screen.findByText('Seeded cohort')).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Filters' })).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Explore Data' }));

    expect(screen.getByRole('heading', { name: 'Filters' })).toBeTruthy();
  });

  it('shows a spinner, not the welcome splash, while the seed waits on the package', async () => {
    // The package fetch never settles, so the seed never lands.
    vi.stubGlobal('fetch', () => new Promise(() => {}));
    const splash = { ...config, splashMessages: ['Hello from the splash'] };

    const { unmount } = render(<UDIDashboard {...splash} initialSession={seededSession} />);
    expect(await screen.findByRole('status')).toBeTruthy();
    expect(screen.queryByText('Hello from the splash')).toBeNull();
    unmount();

    // Without a session the empty dashboard is genuinely empty: splash as usual.
    render(<UDIDashboard {...splash} />);
    expect(screen.getByText('Hello from the splash')).toBeTruthy();
    vi.unstubAllGlobals();
  });

  it('throws a descriptive error for a malformed session rather than showing an empty dashboard', () => {
    // The ErrorBoundary renders the message, so this asserts on the DOM rather
    // than on a throw escaping render.
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(<UDIDashboard {...seedConfig} initialSession={{ version: 99 }} />);
    // The boundary echoes the message in more than one place (summary +
    // details), so assert that it surfaced at all rather than exactly once.
    expect(screen.getAllByText(/initialSession/).length).toBeGreaterThan(0);
    consoleError.mockRestore();
  });
});

describe('UDIChat — issue reporting', () => {
  const openSessionMenu = () => userEvent.click(screen.getByRole('button', { name: /Session/ }));

  it('is in the Session menu when the host switches it on', async () => {
    render(<UDIChat {...config} issueReporting />);
    await openSessionMenu();
    expect(await screen.findByRole('menuitem', { name: /Report an issue/ })).toBeTruthy();
  });

  it('is not there by default', async () => {
    render(<UDIChat {...config} />);
    await openSessionMenu();
    expect(await screen.findByRole('menuitem', { name: /Export session/ })).toBeTruthy();
    expect(screen.queryByRole('menuitem', { name: /Report an issue/ })).toBeNull();
  });

  it('opens the report dialog from the menu', async () => {
    render(<UDIChat {...config} issueReporting />);
    await openSessionMenu();
    await userEvent.click(await screen.findByRole('menuitem', { name: /Report an issue/ }));
    expect(await screen.findByRole('dialog')).toHaveTextContent('Report an issue');
  });
});

describe('UDIChat — folded top bar', () => {
  it('folds the controls into one menu that still reaches every action', async () => {
    // jsdom's row is 0 px wide, so any measured width overflows it.
    const rect = vi
      .spyOn(Element.prototype, 'getBoundingClientRect')
      .mockReturnValue(new DOMRect(0, 0, 100, 20));
    const user = userEvent.setup();
    render(<UDIChat {...config} issueReporting />);
    expect(screen.queryByRole('button', { name: /Session/ })).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Dashboard options' }));
    expect(screen.getByText('Columns')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Export session/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Download Raw Data/ })).toBeTruthy();

    // The report dialog lives outside the popover, so closing it is no loss.
    await user.click(screen.getByRole('button', { name: /Report an issue/ }));
    expect(await screen.findByRole('dialog', { name: 'Report an issue' })).toBeTruthy();
    rect.mockRestore();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  /** A 100 px chip beside controls 300 px wide, or 30 px folded, in a row
   *  `rowWidth` wide. Returns a way to report a resize, since jsdom has none. */
  function layout(rowWidth: number) {
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(rowWidth);
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: Element,
    ) {
      const width = this.matches('[aria-label$="Open data overview."]')
        ? 100
        : this.querySelector('[aria-label="Dashboard options"]')
          ? 30
          : this.querySelector('[aria-label="Display settings"]')
            ? 300
            : 0;
      return new DOMRect(0, 0, width, 20);
    });
    const watched: [ResizeObserverCallback, Element][] = [];
    vi.stubGlobal(
      'ResizeObserver',
      class {
        callback: ResizeObserverCallback;
        constructor(callback: ResizeObserverCallback) {
          this.callback = callback;
        }
        observe(target: Element) {
          watched.push([this.callback, target]);
        }
        unobserve() {}
        disconnect() {}
      },
    );
    return (target: Element) =>
      act(() =>
        watched.filter(([, t]) => t === target).forEach(([cb]) => cb([], {} as ResizeObserver)),
      );
  }

  it.each([
    [500, { folded: false, compact: false }],
    [200, { folded: true, compact: false }],
    [100, { folded: true, compact: true }],
  ])('in a %i px row, shrinks only as far as it must', async (rowWidth, expected) => {
    const resize = layout(rowWidth);
    render(<UDIChat {...seedConfig} />);
    const chip = await screen.findByRole('button', { name: /^donors:/ });
    // The chip arrived after the header first measured itself.
    resize(chip.parentElement!.parentElement!);

    expect({
      folded: screen.queryByRole('button', { name: 'Dashboard options' }) !== null,
      // A compact chip holds its label itself; a full one gives it a line of its own.
      compact: within(chip).getByText('donors') === chip,
    }).toEqual(expected);
  });
});

describe('UDIChat — apiBaseUrl', () => {
  it('drops a trailing slash, so endpoints are not requested as //v1/...', async () => {
    const fetchMock = vi.fn(() => Promise.resolve(new Response('[]')));
    vi.stubGlobal('fetch', fetchMock);
    render(<UDIChat {...seedConfig} apiBaseUrl="https://agent.example/" />);
    await vi.waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith('https://agent.example/v1/yac/examples'),
    );
    vi.unstubAllGlobals();
  });
});

describe('UDIChat — host filters', () => {
  const sexFilter = {
    id: 'cohort',
    dataSourceKey: 'donors',
    type: 'point' as const,
    selection: { sex: ['Female'] },
  };

  it('shows a `filters` entry as a chip and reports it through onFiltersChange', async () => {
    const onFiltersChange = vi.fn();
    render(
      <UDIDashboard
        {...seedConfig}
        initialSession={seededSession}
        filters={[sexFilter]}
        onFiltersChange={onFiltersChange}
      />,
    );

    expect(await screen.findByRole('button', { name: /Sex\s*Female/ })).toBeTruthy();
    expect(onFiltersChange).toHaveBeenLastCalledWith([{ ...sexFilter, origin: 'host' }]);
  });

  it('rejects a malformed `filters` entry', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(<UDIChat {...seedConfig} filters={[{ id: 'x' } as never]} />);
    expect(screen.getAllByText(/filters\[0\]/).length).toBeGreaterThan(0);
    spy.mockRestore();
  });
});

describe('UDIChat — host fontScale', () => {
  const rootScale = (container: HTMLElement) =>
    container.querySelector<HTMLElement>('.udi-yac')!.style.getPropertyValue('--udi-font-scale');

  it("overrides the viewer's saved text size, follows changes, and hides the slider", async () => {
    localStorage.setItem('udi-yac:font-scale', '2');
    const user = userEvent.setup();
    const { container, rerender } = render(<UDIChat {...config} fontScale={1.5} />);
    expect(rootScale(container)).toBe('1.5');

    rerender(<UDIChat {...config} fontScale={1.25} />);
    expect(rootScale(container)).toBe('1.25');

    await user.click(screen.getByRole('button', { name: 'Display settings' }));
    expect(screen.getByText('Columns')).toBeTruthy();
    expect(screen.queryByText('Text size')).toBeNull();

    // Dropping the prop hands text size back to the viewer.
    rerender(<UDIChat {...config} />);
    expect(rootScale(container)).toBe('2');
    expect(screen.getByText('Text size')).toBeTruthy();
    localStorage.removeItem('udi-yac:font-scale');
  });
});
