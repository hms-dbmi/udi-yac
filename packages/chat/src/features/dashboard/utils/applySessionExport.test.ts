import { describe, it, expect } from 'vitest';
import { createConversationStore } from '@/features/chat';
import { createDashboardStore } from '../stores/dashboardStore';
import type { SessionExport } from './dashboardSerialization';
import { applySessionExport } from './applySessionExport';

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
} as unknown as SessionExport['visualizations'][number]['spec'];

function session(overrides: Partial<SessionExport> = {}): SessionExport {
  return {
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
        userTitle: 'Cohort',
        spec: countBySex,
      },
    ],
    layout: { items: [{ i: '0-0', x: 1, y: 2, w: 2, h: 5 }] },
    grid: { cols: 4, rowHeight: 80 },
    ...overrides,
  };
}

function stores() {
  return { conversation: createConversationStore(), dashboard: createDashboardStore() };
}

describe('applySessionExport', () => {
  it('restores the conversation, the cards and the grid config', () => {
    const s = stores();

    applySessionExport(session(), s, { donors: ['sex'] });

    expect(s.conversation.getState().messages).toEqual([
      { role: 'user', content: 'donors by sex' },
    ]);

    const dashboard = s.dashboard.getState();
    expect(dashboard.gridCols).toBe(4);
    expect(dashboard.gridRowHeight).toBe(80);

    const viz = dashboard.activeVisualizations.get('0-0');
    expect(viz).toBeTruthy();
    expect(viz!.uuid).toBe('viz-uuid');
    expect(viz!.userTitle).toBe('Cohort');
    // importDashboard re-injects interactivity, so the stored spec and the
    // rendered one are not the same object.
    expect(viz!.interactiveSpec).toBeTruthy();
    expect(dashboard.layout.items).toEqual([{ i: '0-0', x: 1, y: 2, w: 2, h: 5 }]);
  });

  it('applies the grid config before importing, so cards pack against the right column count', () => {
    const s = stores();
    // Two cards with no usable positions: the importer repacks them, and the
    // result depends on gridCols — which is only right if `grid` was applied
    // first. With cols=1 they stack; the ordering below would differ at cols=4.
    const two = session({
      grid: { cols: 1, rowHeight: 60 },
      visualizations: [
        { key: '0-0', uuid: 'a', index: 0, toolCallIndex: 0, userPrompt: 'a', spec: countBySex },
        { key: '1-0', uuid: 'b', index: 1, toolCallIndex: 0, userPrompt: 'b', spec: countBySex },
      ],
      layout: {
        items: [
          { i: '0-0', x: 0, y: 0, w: 1, h: 4 },
          { i: '1-0', x: 0, y: 0, w: 1, h: 4 },
        ],
      },
    });

    applySessionExport(two, s, null);

    const items = s.dashboard.getState().layout.items;
    expect(s.dashboard.getState().gridCols).toBe(1);
    expect(items).toHaveLength(2);
    expect(items.every((it) => it.x === 0)).toBe(true);
    expect(new Set(items.map((it) => it.y)).size).toBe(2);
  });

  it('tolerates an export with no grid block', () => {
    const s = stores();
    const before = s.dashboard.getState().gridRowHeight;

    applySessionExport(session({ grid: undefined }), s, null);

    expect(s.dashboard.getState().gridRowHeight).toBe(before);
    expect(s.dashboard.getState().activeVisualizations.size).toBe(1);
  });
});
