import { describe, it, expect } from 'vitest';
import type { UDIGrammar } from 'udi-toolkit';
import { chartCoversFilter, chartSelectFields, composeChartSelection } from './chartSelection';

const spec = (select: object) =>
  ({
    source: { name: 'donors' },
    representation: { mark: 'point', select },
  }) as unknown as UDIGrammar;

describe('chartSelectFields', () => {
  it('reads a brush and a click back from the select injectInteractivity wrote', () => {
    expect(
      chartSelectFields(
        spec({
          name: 'u',
          source: 'donors',
          how: { type: 'interval', on: 'xy', field: ['age', 'bmi'] },
        }),
      ),
    ).toEqual({ entity: 'donors', type: 'interval', fields: ['age', 'bmi'] });
    expect(
      chartSelectFields(
        spec({ name: 'u', source: 'donors', how: { type: 'point' }, fields: ['sex'] }),
      ),
    ).toEqual({ entity: 'donors', type: 'point', fields: ['sex'] });
  });

  it('is null for a chart with nothing to select on', () => {
    expect(
      chartSelectFields(spec({ name: 'u', source: 'donors', how: { type: 'point' }, fields: [] })),
    ).toBeNull();
    expect(chartSelectFields({ source: { name: 'donors' } } as unknown as UDIGrammar)).toBeNull();
  });
});

describe('composeChartSelection', () => {
  const brush = { entity: 'donors', type: 'interval' as const, fields: ['age', 'bmi'] };

  it('takes the column filters of its kind on its fields, whoever set them', () => {
    const composed = composeChartSelection(brush, {
      'col:donors.age': { dataSourceKey: 'donors', type: 'interval', selection: { age: [20, 40] } },
      // A point filter has no way to show on a brush.
      'col:donors.bmi': { dataSourceKey: 'donors', type: 'point', selection: { bmi: ['30'] } },
      // Another table's column of the same name is not this chart's.
      'col:samples.age': { dataSourceKey: 'samples', type: 'interval', selection: { age: [1, 2] } },
    });
    expect(composed).toEqual({
      dataSourceKey: 'donors',
      type: 'interval',
      selection: { age: [20, 40] },
    });
  });

  it('is empty, not null, when nothing filters its fields — so a cleared brush is dropped', () => {
    expect(composeChartSelection(brush, {}).selection).toEqual({});
  });

  it('knows which filters a chart shows', () => {
    expect(chartCoversFilter(brush, 'col:donors.bmi')).toBe(true);
    expect(chartCoversFilter(brush, 'col:samples.age')).toBe(false);
    expect(chartCoversFilter(null, 'col:donors.age')).toBe(false);
  });
});
