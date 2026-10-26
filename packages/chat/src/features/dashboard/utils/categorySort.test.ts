import { describe, it, expect } from 'vitest';
import type { UDIGrammar } from 'udi-toolkit/react';
import { sortCategoriesByTotal } from './categorySort';

function bar(mapping: Record<string, unknown>[], mark = 'bar'): UDIGrammar {
  return {
    source: { name: 'donors', source: 'donors.csv' },
    representation: { mark, mapping },
  } as unknown as UDIGrammar;
}

const mappingsOf = (spec: UDIGrammar | null) =>
  (spec?.representation as unknown as { mapping: Record<string, unknown>[] }).mapping;

describe('sortCategoriesByTotal', () => {
  it('sorts a vertical bar chart by its y totals', () => {
    const sorted = sortCategoriesByTotal(
      bar([
        { encoding: 'x', field: 'sex', type: 'nominal' },
        { encoding: 'y', field: 'count', type: 'quantitative' },
      ]),
    );
    expect(mappingsOf(sorted)[0]).toMatchObject({ field: 'sex', sort: '-y' });
    expect(mappingsOf(sorted)[1]).not.toHaveProperty('sort');
  });

  it('sorts a horizontal bar chart by its x totals', () => {
    const sorted = sortCategoriesByTotal(
      bar([
        { encoding: 'x', field: 'count', type: 'quantitative' },
        { encoding: 'y', field: 'sex', type: 'ordinal' },
      ]),
    );
    expect(mappingsOf(sorted)[1]).toMatchObject({ field: 'sex', sort: '-x' });
  });

  it('leaves the color of a stacked bar chart alphabetical', () => {
    const sorted = sortCategoriesByTotal(
      bar([
        { encoding: 'x', field: 'sex', type: 'nominal' },
        { encoding: 'y', field: 'count', type: 'quantitative' },
        { encoding: 'color', field: 'race', type: 'nominal' },
      ]),
    );
    expect(mappingsOf(sorted)[2]).not.toHaveProperty('sort');
  });

  it('does not mutate the input spec', () => {
    const spec = bar([
      { encoding: 'x', field: 'sex', type: 'nominal' },
      { encoding: 'y', field: 'count', type: 'quantitative' },
    ]);
    sortCategoriesByTotal(spec);
    expect(mappingsOf(spec)[0]).not.toHaveProperty('sort');
  });

  it('returns null when there is nothing to sort', () => {
    // Not a bar chart.
    expect(
      sortCategoriesByTotal(
        bar(
          [
            { encoding: 'x', field: 'sex', type: 'nominal' },
            { encoding: 'y', field: 'age', type: 'quantitative' },
          ],
          'point',
        ),
      ),
    ).toBeNull();
    // A histogram: both axes quantitative.
    expect(
      sortCategoriesByTotal(
        bar([
          { encoding: 'x', field: 'age', type: 'quantitative' },
          { encoding: 'y', field: 'count', type: 'quantitative' },
        ]),
      ),
    ).toBeNull();
  });
});
