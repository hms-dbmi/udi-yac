/**
 * @vitest-environment jsdom
 *
 * Covers the two shell-level halves of the dashboard embed: read-only
 * collapsing the chat to a rail (and the rail putting it back), and
 * `initialSession` seeding the dashboard once the data package is ready. The
 * per-card half is covered in DashboardCard.test.tsx, the applier itself in
 * applySessionExport.test.ts.
 *
 * The toolkit is mocked wholesale — `UDIVis` boots a Vue custom element and
 * `loadDataPackage` reaches for CSVs, neither of which this package exercises
 * in jsdom.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
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
    expect(screen.queryByRole('button', { name: 'Start chatting' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Explore Data' })).toBeNull();
  });

  it('collapses the chat to a rail in read-only mode', () => {
    render(<UDIChat {...config} readOnly />);
    expect(screen.queryByRole('heading', { name: 'Chat' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Start chatting' })).toBeTruthy();
  });

  it('UDIDashboard is UDIChat already in read-only', () => {
    render(<UDIDashboard {...config} />);
    expect(screen.queryByRole('heading', { name: 'Chat' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Start chatting' })).toBeTruthy();
  });

  it('brings the chat back when the rail button is clicked', async () => {
    const user = userEvent.setup();
    render(<UDIChat {...config} readOnly />);

    await user.click(screen.getByRole('button', { name: 'Start chatting' }));

    expect(screen.getByRole('heading', { name: 'Chat' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Start chatting' })).toBeNull();
  });

  it('brings the chat back from the floating Explore Data button', async () => {
    const user = userEvent.setup();
    render(<UDIChat {...config} readOnly />);

    await user.click(screen.getByRole('button', { name: 'Explore Data' }));

    expect(screen.getByRole('heading', { name: 'Chat' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Explore Data' })).toBeNull();
  });

  it('offers no way out when locked', () => {
    render(<UDIChat {...config} readOnly="locked" />);
    expect(screen.queryByRole('heading', { name: 'Chat' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Start chatting' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Explore Data' })).toBeNull();
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

  it('hides an empty Filters section while read-only, and brings it back on exit', async () => {
    const user = userEvent.setup();
    render(<UDIDashboard {...seedConfig} initialSession={seededSession} />);
    expect(await screen.findByText('Seeded cohort')).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Filters' })).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Explore Data' }));

    expect(screen.getByRole('heading', { name: 'Filters' })).toBeTruthy();
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
