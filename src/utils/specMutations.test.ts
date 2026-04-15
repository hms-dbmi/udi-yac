import { describe, it, expect } from 'vitest';
import { setMappingFieldByEncoding } from './specMutations';
import type { UDIGrammar } from 'udi-toolkit/react';

function specWithMappings(mappings: Array<{ encoding: string; field: string; type: string }>) {
  return {
    source: { name: 'donors', source: 'donors.csv' },
    representation: { mark: 'point', mapping: mappings },
  } as unknown as UDIGrammar;
}

describe('setMappingFieldByEncoding', () => {
  it('updates only the targeted encoding when multiple encodings share a field', () => {
    // The bug: both X and Y bound to the same field were both being changed.
    const spec = specWithMappings([
      { encoding: 'x', field: 'age_value', type: 'quantitative' },
      { encoding: 'y', field: 'age_value', type: 'quantitative' },
    ]);
    const next = setMappingFieldByEncoding(spec, 'x', 'weight_value');
    const mappings = (
      next.representation as { mapping: Array<{ encoding: string; field: string }> }
    ).mapping;
    expect(mappings).toEqual([
      { encoding: 'x', field: 'weight_value', type: 'quantitative' },
      { encoding: 'y', field: 'age_value', type: 'quantitative' },
    ]);
  });

  it('does not touch other encodings when fields differ', () => {
    const spec = specWithMappings([
      { encoding: 'x', field: 'age_value', type: 'quantitative' },
      { encoding: 'y', field: 'height_value', type: 'quantitative' },
    ]);
    const next = setMappingFieldByEncoding(spec, 'x', 'weight_value');
    const mappings = (
      next.representation as { mapping: Array<{ encoding: string; field: string }> }
    ).mapping;
    expect(mappings[0].field).toBe('weight_value');
    expect(mappings[1].field).toBe('height_value');
  });

  it('leaves transformation pipelines untouched', () => {
    // The string-replace approach silently rewrote groupby/binby fields too.
    const spec = {
      source: { name: 'donors', source: 'donors.csv' },
      transformation: [{ groupby: ['age_value'] }, { rollup: { count: { op: 'count' } } }],
      representation: {
        mark: 'bar',
        mapping: [
          { encoding: 'x', field: 'age_value', type: 'quantitative' },
          { encoding: 'y', field: 'count', type: 'quantitative' },
        ],
      },
    } as unknown as UDIGrammar;
    const next = setMappingFieldByEncoding(spec, 'x', 'weight_value');
    expect((next as { transformation: Array<{ groupby?: string[] }> }).transformation[0]).toEqual({
      groupby: ['age_value'],
    });
    const mappings = (
      next.representation as { mapping: Array<{ encoding: string; field: string }> }
    ).mapping;
    expect(mappings[0].field).toBe('weight_value');
  });

  it('handles fields with regex-special characters (e.g., dots)', () => {
    // The string-replace used unescaped regex; `donor.hubmap_id` would match
    // arbitrary characters in place of the dot. Structural walk is immune.
    const spec = specWithMappings([
      { encoding: 'x', field: 'donor.hubmap_id', type: 'nominal' },
      { encoding: 'y', field: 'donor_hubmap_id', type: 'nominal' },
    ]);
    const next = setMappingFieldByEncoding(spec, 'x', 'sample.uuid');
    const mappings = (
      next.representation as { mapping: Array<{ encoding: string; field: string }> }
    ).mapping;
    expect(mappings[0].field).toBe('sample.uuid');
    expect(mappings[1].field).toBe('donor_hubmap_id');
  });

  it('updates matching encodings across multiple representation layers', () => {
    const spec = {
      source: { name: 'donors', source: 'donors.csv' },
      representation: [
        { mark: 'point', mapping: [{ encoding: 'x', field: 'age_value', type: 'quantitative' }] },
        { mark: 'line', mapping: [{ encoding: 'x', field: 'age_value', type: 'quantitative' }] },
      ],
    } as unknown as UDIGrammar;
    const next = setMappingFieldByEncoding(spec, 'x', 'weight_value');
    const layers = next.representation as Array<{
      mapping: Array<{ encoding: string; field: string }>;
    }>;
    expect(layers[0].mapping[0].field).toBe('weight_value');
    expect(layers[1].mapping[0].field).toBe('weight_value');
  });

  it('handles a single-object mapping (not an array)', () => {
    const spec = {
      source: { name: 'donors', source: 'donors.csv' },
      representation: {
        mark: 'arc',
        mapping: { encoding: 'theta', field: 'count', type: 'quantitative' },
      },
    } as unknown as UDIGrammar;
    const next = setMappingFieldByEncoding(spec, 'theta', 'weight_value');
    expect((next.representation as { mapping: { field: string } }).mapping.field).toBe(
      'weight_value',
    );
  });

  it('returns the original spec reference when encoding is not present', () => {
    const spec = specWithMappings([{ encoding: 'x', field: 'age_value', type: 'quantitative' }]);
    const next = setMappingFieldByEncoding(spec, 'color', 'sex');
    expect(next).toBe(spec);
  });

  it('returns the original spec reference when newField equals current field', () => {
    const spec = specWithMappings([{ encoding: 'x', field: 'age_value', type: 'quantitative' }]);
    const next = setMappingFieldByEncoding(spec, 'x', 'age_value');
    expect(next).toBe(spec);
  });

  it('returns the original spec reference when there is no representation', () => {
    const spec = { source: { name: 'donors', source: 'donors.csv' } } as unknown as UDIGrammar;
    const next = setMappingFieldByEncoding(spec, 'x', 'age_value');
    expect(next).toBe(spec);
  });

  it('does not mutate the input spec or its nested objects', () => {
    const spec = specWithMappings([
      { encoding: 'x', field: 'age_value', type: 'quantitative' },
      { encoding: 'y', field: 'height_value', type: 'quantitative' },
    ]);
    const before = JSON.parse(JSON.stringify(spec));
    const next = setMappingFieldByEncoding(spec, 'x', 'weight_value');
    expect(spec).toEqual(before);
    expect(next).not.toBe(spec);
  });
});
