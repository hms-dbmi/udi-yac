import { describe, expect, it } from 'vitest';
import { parseSessionExport } from './dashboardSerialization';

const sampleViz = (key: string) => ({
  key,
  uuid: `udi_${key}`,
  index: 0,
  toolCallIndex: 0,
  userPrompt: `prompt ${key}`,
  title: `title ${key}`,
  spec: { source: { name: 's' }, representation: { mark: 'point' } },
});

const minimalConversation = { messages: [] };

describe('parseSessionExport', () => {
  it('parses a valid v2 (item-shaped) export', () => {
    const payload = {
      version: 1,
      exportedAt: '2026-05-28T00:00:00.000Z',
      conversation: minimalConversation,
      visualizations: [sampleViz('0-0'), sampleViz('0-1')],
      layout: {
        items: [
          { i: '0-0', x: 0, y: 0, w: 1, h: 9, minH: 6 },
          { i: '0-1', x: 1, y: 0, w: 1, h: 9 },
        ],
      },
    };
    const result = parseSessionExport(payload);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.layout.items).toHaveLength(2);
    expect(result.value.layout.items[0]).toMatchObject({ i: '0-0', x: 0, y: 0, w: 1, h: 9 });
    expect(result.value.layout.items[1]).toMatchObject({ i: '0-1', x: 1, y: 0, w: 1, h: 9 });
  });

  it('migrates a v1 (column-shaped) export into row-major items', () => {
    const payload = {
      version: 1,
      exportedAt: '2026-05-28T00:00:00.000Z',
      conversation: minimalConversation,
      visualizations: [sampleViz('0-0'), sampleViz('1-0'), sampleViz('2-0')],
      layout: {
        columns: [
          { id: 'col_1', cardKeys: ['0-0', '2-0'], cardSizes: {} },
          { id: 'col_2', cardKeys: ['1-0'], cardSizes: {} },
        ],
        columnSizes: {},
      },
    };
    const result = parseSessionExport(payload);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const itemsById = Object.fromEntries(result.value.layout.items.map((it) => [it.i, it]));
    expect(itemsById).toHaveProperty('0-0');
    expect(itemsById).toHaveProperty('1-0');
    expect(itemsById).toHaveProperty('2-0');
    // Migration packs into 1 column (cols=1) row-major, preserving the original
    // column-major reading order from the v1 layout: col_1=[0-0, 2-0], col_2=[1-0]
    // → flat order = [0-0, 2-0, 1-0]
    const sorted = [...result.value.layout.items].sort((a, b) =>
      a.y === b.y ? a.x - b.x : a.y - b.y,
    );
    expect(sorted.map((it) => it.i)).toEqual(['0-0', '2-0', '1-0']);
    expect(sorted.every((it) => it.w >= 1 && it.h >= 1)).toBe(true);
  });

  it('rejects an export without a version field', () => {
    const result = parseSessionExport({ conversation: minimalConversation, layout: { items: [] } });
    expect(result.ok).toBe(false);
  });

  it('rejects an unsupported version', () => {
    const result = parseSessionExport({ version: 999, conversation: minimalConversation });
    expect(result.ok).toBe(false);
  });

  it('rejects a layout without items[] or columns[]', () => {
    const result = parseSessionExport({
      version: 1,
      conversation: minimalConversation,
      visualizations: [],
      layout: { foo: 'bar' },
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/layout/);
  });
});
