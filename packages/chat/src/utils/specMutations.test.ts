import { describe, it, expect } from 'vitest';
import {
  setMappingFieldByEncoding,
  collectLockedFields,
  collectGroupbyFields,
  collectRollupOutputs,
  swapDimensionField,
  swapMeasureField,
} from './specMutations';
import type { UDIGrammar } from 'udi-toolkit/react';

function specWithTransformation(transformation: unknown[]): UDIGrammar {
  return {
    source: { name: 'donors', source: 'donors.csv' },
    transformation,
    representation: { mark: 'bar', mapping: [] },
  } as unknown as UDIGrammar;
}

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

describe('collectLockedFields', () => {
  it('returns an empty set when transformation is undefined', () => {
    const spec = {
      source: { name: 'donors', source: 'donors.csv' },
      representation: { mark: 'point', mapping: [] },
    } as unknown as UDIGrammar;
    expect([...collectLockedFields(spec)]).toEqual([]);
  });

  it('returns an empty set for an empty transformation array', () => {
    expect([...collectLockedFields(specWithTransformation([]))]).toEqual([]);
  });

  it('does NOT lock groupby (swappable via swapDimensionField)', () => {
    const single = collectLockedFields(specWithTransformation([{ groupby: 'organ' }]));
    expect([...single]).toEqual([]);
    const array = collectLockedFields(specWithTransformation([{ groupby: ['organ', 'sex'] }]));
    expect([...array]).toEqual([]);
  });

  it('does NOT lock rollup.field (swappable via swapMeasureField)', () => {
    const locked = collectLockedFields(
      specWithTransformation([{ rollup: { total: { op: 'sum', field: 'weight_value' } } }]),
    );
    expect([...locked]).toEqual([]);
  });

  it('locks binby.field', () => {
    const locked = collectLockedFields(
      specWithTransformation([{ binby: { field: 'age_value', bins: 10 } }]),
    );
    expect([...locked]).toEqual(['age_value']);
  });

  it('locks kde.field', () => {
    const locked = collectLockedFields(specWithTransformation([{ kde: { field: 'age_value' } }]));
    expect([...locked]).toEqual(['age_value']);
  });

  it('locks a string join.on', () => {
    const locked = collectLockedFields(specWithTransformation([{ join: { on: 'donor_id' } }]));
    expect([...locked]).toEqual(['donor_id']);
  });

  it('locks both fields of a paired join.on', () => {
    const locked = collectLockedFields(
      specWithTransformation([{ join: { on: ['donor_id', 'id'] } }]),
    );
    expect([...locked].sort()).toEqual(['donor_id', 'id']);
  });

  it('locks every field of a composite-key join.on', () => {
    const locked = collectLockedFields(
      specWithTransformation([
        {
          join: {
            on: [
              ['a', 'b'],
              ['c', 'd'],
            ],
          },
        },
      ]),
    );
    expect([...locked].sort()).toEqual(['a', 'b', 'c', 'd']);
  });

  it('ignores filter, orderby, and derive (schema-preserving or free-form)', () => {
    const locked = collectLockedFields(
      specWithTransformation([
        { filter: 'd.age_value > 50' },
        { orderby: 'height_value' },
        { derive: { bmi: 'd.weight_value / (d.height_value * d.height_value)' } },
      ]),
    );
    expect([...locked]).toEqual([]);
  });

  it('a group+rollup pipeline locks nothing (both are swappable)', () => {
    const locked = collectLockedFields(
      specWithTransformation([
        { groupby: 'organ' },
        { rollup: { total: { op: 'sum', field: 'weight_value' } } },
      ]),
    );
    expect([...locked]).toEqual([]);
  });
});

describe('collectGroupbyFields', () => {
  it('collects a single-string groupby', () => {
    expect([...collectGroupbyFields(specWithTransformation([{ groupby: 'organ' }]))]).toEqual([
      'organ',
    ]);
  });

  it('collects every entry of an array groupby across steps', () => {
    const fields = collectGroupbyFields(
      specWithTransformation([{ groupby: ['organ', 'sex'] }, { groupby: 'donor' }]),
    );
    expect([...fields].sort()).toEqual(['donor', 'organ', 'sex']);
  });

  it('returns empty when there is no groupby', () => {
    expect([...collectGroupbyFields(specWithTransformation([{ kde: { field: 'x' } }]))]).toEqual(
      [],
    );
  });
});

describe('collectRollupOutputs', () => {
  it('maps output columns to their aggregation, including a missing field for count', () => {
    const outputs = collectRollupOutputs(
      specWithTransformation([
        { rollup: { sex_count: { op: 'count' }, avg_age: { op: 'mean', field: 'age' } } },
      ]),
    );
    expect(outputs).toEqual({
      sex_count: { op: 'count', field: undefined },
      avg_age: { op: 'mean', field: 'age' },
    });
  });
});

describe('swapDimensionField', () => {
  const countBySex = () =>
    ({
      source: { name: 'donors', source: 'donors.csv' },
      transformation: [
        { groupby: 'sex' },
        { rollup: { sex_count: { op: 'count' } } },
        { orderby: { field: 'sex_count', order: 'desc' } },
      ],
      representation: {
        mark: 'bar',
        mapping: [
          { encoding: 'x', field: 'sex', type: 'nominal' },
          { encoding: 'y', field: 'sex_count', type: 'quantitative' },
        ],
      },
    }) as unknown as UDIGrammar;

  it('rewrites groupby, dependent rollup output column, and both mappings', () => {
    const next = swapDimensionField(countBySex(), 'sex', 'race');
    const t = (next as unknown as { transformation: Array<Record<string, unknown>> })
      .transformation;
    expect(t[0]).toEqual({ groupby: 'race' });
    expect(t[1]).toEqual({ rollup: { race_count: { op: 'count' } } });
    // orderby ref followed the renamed output column
    expect(t[2]).toEqual({ orderby: { field: 'race_count', order: 'desc' } });
    const mapping = (next.representation as { mapping: Array<{ field: string }> }).mapping;
    expect(mapping[0].field).toBe('race');
    expect(mapping[1].field).toBe('race_count');
  });

  it('renames only the matching entry of an array groupby', () => {
    const spec = {
      source: { name: 'donors', source: 'donors.csv' },
      transformation: [{ groupby: ['organ', 'sex'] }, { rollup: { count: { op: 'count' } } }],
      representation: { mark: 'bar', mapping: [{ encoding: 'x', field: 'sex', type: 'nominal' }] },
    } as unknown as UDIGrammar;
    const next = swapDimensionField(spec, 'sex', 'race');
    const t = (next as unknown as { transformation: Array<Record<string, unknown>> })
      .transformation;
    expect(t[0]).toEqual({ groupby: ['organ', 'race'] });
    // 'count' has no old-field token, so its output column is left alone
    expect(t[1]).toEqual({ rollup: { count: { op: 'count' } } });
  });

  it('leaves a count output column alone when it does not embed the old field', () => {
    const spec = {
      source: { name: 'donors', source: 'donors.csv' },
      transformation: [{ groupby: 'sex' }, { rollup: { count: { op: 'count' } } }],
      representation: {
        mark: 'bar',
        mapping: [
          { encoding: 'x', field: 'sex', type: 'nominal' },
          { encoding: 'y', field: 'count', type: 'quantitative' },
        ],
      },
    } as unknown as UDIGrammar;
    const next = swapDimensionField(spec, 'sex', 'race');
    const mapping = (next.representation as { mapping: Array<{ field: string }> }).mapping;
    expect(mapping[0].field).toBe('race');
    expect(mapping[1].field).toBe('count');
  });

  it('returns the same reference on a no-op (unchanged or absent field)', () => {
    const spec = countBySex();
    expect(swapDimensionField(spec, 'sex', 'sex')).toBe(spec);
    expect(swapDimensionField(spec, 'not_here', 'race')).toBe(spec);
  });

  it('does not mutate the input spec', () => {
    const spec = countBySex();
    const before = JSON.parse(JSON.stringify(spec));
    swapDimensionField(spec, 'sex', 'race');
    expect(spec).toEqual(before);
  });
});

describe('swapMeasureField', () => {
  const avgAgeBySex = () =>
    ({
      source: { name: 'donors', source: 'donors.csv' },
      transformation: [{ groupby: 'sex' }, { rollup: { avg_age: { op: 'mean', field: 'age' } } }],
      representation: {
        mark: 'bar',
        mapping: [
          { encoding: 'x', field: 'sex', type: 'nominal' },
          { encoding: 'y', field: 'avg_age', type: 'quantitative' },
        ],
      },
    }) as unknown as UDIGrammar;

  it('rewrites the rollup input field, output column, and encoding ref; leaves groupby alone', () => {
    const next = swapMeasureField(avgAgeBySex(), 'avg_age', 'weight');
    const t = (next as unknown as { transformation: Array<Record<string, unknown>> })
      .transformation;
    expect(t[0]).toEqual({ groupby: 'sex' });
    expect(t[1]).toEqual({ rollup: { avg_weight: { op: 'mean', field: 'weight' } } });
    const mapping = (next.representation as { mapping: Array<{ field: string }> }).mapping;
    expect(mapping[0].field).toBe('sex');
    expect(mapping[1].field).toBe('avg_weight');
  });

  it('rewrites the input field but keeps the output column when it does not embed the field', () => {
    const spec = {
      source: { name: 'donors', source: 'donors.csv' },
      transformation: [{ groupby: 'sex' }, { rollup: { mean: { op: 'mean', field: 'age' } } }],
      representation: {
        mark: 'bar',
        mapping: [{ encoding: 'y', field: 'mean', type: 'quantitative' }],
      },
    } as unknown as UDIGrammar;
    const next = swapMeasureField(spec, 'mean', 'weight');
    const t = (next as unknown as { transformation: Array<Record<string, unknown>> })
      .transformation;
    expect(t[1]).toEqual({ rollup: { mean: { op: 'mean', field: 'weight' } } });
    const mapping = (next.representation as { mapping: Array<{ field: string }> }).mapping;
    expect(mapping[0].field).toBe('mean');
  });

  it('returns the same reference for a count output (no input field to swap)', () => {
    const spec = {
      source: { name: 'donors', source: 'donors.csv' },
      transformation: [{ groupby: 'sex' }, { rollup: { sex_count: { op: 'count' } } }],
      representation: {
        mark: 'bar',
        mapping: [{ encoding: 'y', field: 'sex_count', type: 'quantitative' }],
      },
    } as unknown as UDIGrammar;
    expect(swapMeasureField(spec, 'sex_count', 'weight')).toBe(spec);
  });

  it('returns the same reference when the field is unchanged', () => {
    const spec = avgAgeBySex();
    expect(swapMeasureField(spec, 'avg_age', 'age')).toBe(spec);
  });
});
