/**
 * Filter widgets that aren't shown messages go where they happened in the
 * transcript, rather than piling up after the last message: a brush filter
 * before the message that followed it, a filter from a hidden message (the
 * transcript is hidden on leaving read-only) at its message's position.
 */
import { describe, it, expect } from 'vitest';
import type { BrushFilter } from '@/features/dashboard';
import type { Message } from '@/types/messages';
import { filterInterjections } from '../utils/filterInterjections';

const text = (content: string): Message => ({ role: 'user', content });
const filterCall = (field: string): Message =>
  ({
    role: 'assistant',
    content: '',
    tool_calls: [
      {
        function: {
          name: 'FilterData',
          arguments: {
            title: field,
            entity: 'donors',
            field,
            filter: { filterType: 'point', pointValues: [] },
          },
        },
      },
    ],
  }) as unknown as Message;
const brush = (id: string): BrushFilter =>
  ({
    id,
    uuid: id.split('::')[0],
    vizKey: '0-0',
    selection: { dataSourceKey: 'donors', type: 'point', selection: {} },
  }) as unknown as BrushFilter;

describe('filterInterjections', () => {
  it('orders brushes by anchor and hidden filters by their message, merged', () => {
    const messages = [text('a'), filterCall('sex'), text('b'), text('c'), text('d')];
    const out = filterInterjections(
      messages,
      3,
      [brush('late'), brush('early'), brush('unanchored'), brush('trimmed')],
      { late: 4, early: 1, trimmed: 99 },
    );
    expect(out.map(({ key, at }) => [key, at])).toEqual([
      // Before message 1: made after the first message.
      ['brush-early', 1],
      // The hidden message 1's filter, right after it.
      ['hidden-filter-1-0', 1.5],
      // Before message 4.
      ['brush-late', 4],
      // No anchor, or one past a trimmed transcript: after the last message.
      ['brush-unanchored', 5],
      ['brush-trimmed', 5],
    ]);
  });

  it('shows no hidden-message filters while nothing is hidden', () => {
    const out = filterInterjections([text('a'), filterCall('sex')], 0, [], {});
    expect(out).toEqual([]);
  });
});
