import { describe, it, expect } from 'vitest';
import type { UDIGrammar } from 'udi-toolkit/react';
import { buildRelevantRowMapping } from './relevantTableMapping';

const scatter: UDIGrammar = {
  source: { name: 'donors', source: 'donors.csv' },
  representation: {
    mark: 'point',
    mapping: [
      { encoding: 'x', field: 'height_value', type: 'quantitative' },
      { encoding: 'y', field: 'weight_value', type: 'quantitative' },
    ],
  },
} as UDIGrammar;

describe('buildRelevantRowMapping', () => {
  it('puts key fields first, then chart-mapped fields with their types', () => {
    const mapping = buildRelevantRowMapping(scatter, ['uuid', 'hubmap_id']);
    expect(mapping?.map((m) => m.field)).toEqual([
      'uuid',
      'hubmap_id',
      'height_value',
      'weight_value',
    ]);
    expect(mapping?.find((m) => m.field === 'uuid')?.type).toBe('nominal');
    expect(mapping?.find((m) => m.field === 'height_value')?.type).toBe('quantitative');
    expect(mapping?.every((m) => m.encoding === 'text' && m.mark === 'text')).toBe(true);
  });

  it('omits key fields when the pipeline aggregates (rollup)', () => {
    const aggregated: UDIGrammar = {
      ...scatter,
      transformation: [{ groupby: 'sex' }, { rollup: { n: { op: 'count' } } }],
      representation: {
        mark: 'bar',
        mapping: [
          { encoding: 'x', field: 'sex', type: 'nominal' },
          { encoding: 'y', field: 'n', type: 'quantitative' },
        ],
      },
    } as UDIGrammar;
    const mapping = buildRelevantRowMapping(aggregated, ['uuid']);
    expect(mapping?.map((m) => m.field)).toEqual(['sex', 'n']);
  });

  it('dedupes a key that is also a mapped field, keeping the mapped type', () => {
    const mapping = buildRelevantRowMapping(scatter, ['uuid', 'height_value']);
    expect(mapping?.map((m) => m.field)).toEqual(['uuid', 'height_value', 'weight_value']);
    expect(mapping?.find((m) => m.field === 'height_value')?.type).toBe('quantitative');
  });

  it('returns null for star mappings / no represented fields', () => {
    const rowSpec = {
      source: { name: 'donors', source: 'donors.csv' },
      representation: {
        mark: 'row',
        mapping: [{ encoding: 'text', field: '*', mark: 'text', type: 'nominal' }],
      },
    } as unknown as UDIGrammar;
    expect(buildRelevantRowMapping(rowSpec, ['uuid'])).toBeNull();
    expect(
      buildRelevantRowMapping({ source: { name: 'donors', source: 'x' } } as UDIGrammar, ['uuid']),
    ).toBeNull();
  });
});
