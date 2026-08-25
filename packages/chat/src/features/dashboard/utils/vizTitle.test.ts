import { describe, it, expect } from 'vitest';
import type { UDIGrammar } from 'udi-toolkit/react';
import { buildVizTitle, resolveVizTitle, vizTitleProvenance } from './vizTitle';

function spec(overrides: Record<string, unknown> = {}): UDIGrammar {
  return {
    source: { name: 'donors', source: 'donors.csv' },
    ...overrides,
  } as unknown as UDIGrammar;
}

/** count-by-dimension: the shape the agent emits for "donor count by <field>". */
function countBy(dimension: string, extraMappings: Record<string, unknown>[] = []): UDIGrammar {
  return spec({
    transformation: [{ groupby: dimension }, { rollup: { donor_count: { op: 'count' } } }],
    representation: {
      mark: 'bar',
      mapping: [
        { encoding: 'x', field: dimension, type: 'nominal' },
        { encoding: 'y', field: 'donor_count', type: 'quantitative' },
        ...extraMappings,
      ],
    },
  });
}

function scatter(extraMappings: Record<string, unknown>[] = []): UDIGrammar {
  return spec({
    representation: {
      mark: 'point',
      mapping: [
        { encoding: 'x', field: 'age_value', type: 'quantitative' },
        { encoding: 'y', field: 'weight_value', type: 'quantitative' },
        ...extraMappings,
      ],
    },
  });
}

describe('buildVizTitle — chart type', () => {
  const withMark = (mark: string, extra: Record<string, unknown> = {}) =>
    spec({
      ...extra,
      representation: {
        mark,
        mapping: [
          { encoding: 'x', field: 'age_value', type: 'quantitative' },
          { encoding: 'y', field: 'weight_value', type: 'quantitative' },
        ],
      },
    });

  it('names each mark', () => {
    expect(buildVizTitle(withMark('bar'))).toMatch(/^Bar chart of /);
    expect(buildVizTitle(withMark('point'))).toMatch(/^Scatter plot of /);
    expect(buildVizTitle(withMark('line'))).toMatch(/^Line chart of /);
    expect(buildVizTitle(withMark('area'))).toMatch(/^Area chart of /);
    expect(buildVizTitle(withMark('arc'))).toMatch(/^Pie chart of /);
    expect(buildVizTitle(withMark('rect'))).toMatch(/^Heatmap of /);
    expect(buildVizTitle(withMark('geometry'))).toMatch(/^Map of /);
  });

  it('falls back to "Chart" for an unrecognised mark', () => {
    expect(buildVizTitle(withMark('sunburst'))).toMatch(/^Chart of /);
  });

  it('calls a binned bar chart a histogram', () => {
    const s = withMark('bar', { transformation: [{ binby: { field: 'age_value' } }] });
    expect(buildVizTitle(s)).toMatch(/^Histogram of /);
  });

  it('calls a kde area chart a density plot', () => {
    const s = withMark('area', { transformation: [{ kde: { field: 'age_value' } }] });
    expect(buildVizTitle(s)).toMatch(/^Density plot of /);
  });

  it('calls a point chart with a categorical axis a dot plot', () => {
    const s = spec({
      representation: {
        mark: 'point',
        mapping: [
          { encoding: 'x', field: 'sex', type: 'nominal' },
          { encoding: 'y', field: 'age_value', type: 'quantitative' },
        ],
      },
    });
    expect(buildVizTitle(s)).toBe('Dot plot of Age and Sex');
  });

  it('describes a row layer, or no representation at all, as a table', () => {
    const rows = spec({
      representation: { mark: 'row', mapping: [{ encoding: 'text', field: 'hubmap_id' }] },
    });
    expect(buildVizTitle(rows)).toBe('Table of Donors');
    expect(buildVizTitle(spec())).toBe('Table of Donors');
  });
});

describe('buildVizTitle — subject', () => {
  it('reads an aggregation as measure "by" dimension', () => {
    expect(buildVizTitle(countBy('sex'))).toBe('Bar chart of Count of Donors by Sex');
  });

  it('follows a swapped dimension', () => {
    expect(buildVizTitle(countBy('race'))).toBe('Bar chart of Count of Donors by Race');
  });

  it('names a non-count aggregation after its input field', () => {
    const s = spec({
      transformation: [
        { groupby: 'sex' },
        { rollup: { avg_age: { op: 'mean', field: 'age_value' } } },
      ],
      representation: {
        mark: 'bar',
        mapping: [
          { encoding: 'x', field: 'sex', type: 'nominal' },
          { encoding: 'y', field: 'avg_age', type: 'quantitative' },
        ],
      },
    });
    expect(buildVizTitle(s)).toBe('Bar chart of Average Age by Sex');
  });

  it('joins two peer fields with "and"', () => {
    expect(buildVizTitle(scatter())).toBe('Scatter plot of Weight and Age');
  });

  it('names a single encoding on its own', () => {
    const s = spec({
      representation: {
        mark: 'bar',
        mapping: [{ encoding: 'x', field: 'age_value', type: 'quantitative' }],
      },
    });
    expect(buildVizTitle(s)).toBe('Bar chart of Age');
  });

  it('prefers an explicit mapping title over the field label', () => {
    const s = spec({
      representation: {
        mark: 'point',
        mapping: [
          { encoding: 'x', field: 'age_value', type: 'quantitative', title: 'Age (years)' },
          { encoding: 'y', field: 'weight_value', type: 'quantitative', title: 'Weight (kg)' },
        ],
      },
    });
    expect(buildVizTitle(s)).toBe('Scatter plot of Weight (kg) and Age (years)');
  });

  it('skips the wildcard field a default row layer uses', () => {
    const s = spec({ representation: { mark: 'bar', mapping: [{ encoding: 'x', field: '*' }] } });
    expect(buildVizTitle(s)).toBe('Table of Donors');
  });

  it('returns undefined when nothing is derivable', () => {
    expect(buildVizTitle({} as UDIGrammar)).toBeUndefined();
  });
});

describe('buildVizTitle — clauses', () => {
  it('reads a categorical colour as a grouping', () => {
    expect(
      buildVizTitle(countBy('sex', [{ encoding: 'color', field: 'race', type: 'nominal' }])),
    ).toBe('Bar chart of Count of Donors by Sex, categorized by Race');
  });

  it('reads a quantitative colour as a ramp', () => {
    expect(
      buildVizTitle(scatter([{ encoding: 'color', field: 'height_value', type: 'quantitative' }])),
    ).toBe('Scatter plot of Weight and Age, colored by Height');
  });

  it('falls back to the schema data type when the mapping omits one', () => {
    const s = countBy('sex', [{ encoding: 'color', field: 'race' }]);
    expect(buildVizTitle(s, { getFieldDataType: () => 'quantitative' })).toBe(
      'Bar chart of Count of Donors by Sex, colored by Race',
    );
  });

  it('reads the size channel as its own clause', () => {
    expect(
      buildVizTitle(scatter([{ encoding: 'size', field: 'height_value', type: 'quantitative' }])),
    ).toBe('Scatter plot of Weight and Age, sized by Height');
  });

  it('stacks both clauses in channel order', () => {
    const s = scatter([
      { encoding: 'color', field: 'sex', type: 'nominal' },
      { encoding: 'size', field: 'height_value', type: 'quantitative' },
    ]);
    expect(buildVizTitle(s)).toBe(
      'Scatter plot of Weight and Age, categorized by Sex, sized by Height',
    );
  });

  it('drops a clause whose field is already named in the subject', () => {
    expect(
      buildVizTitle(countBy('sex', [{ encoding: 'color', field: 'sex', type: 'nominal' }])),
    ).toBe('Bar chart of Count of Donors by Sex');
  });
});

describe('buildVizTitle — data package labels', () => {
  const labels = {
    getFieldLabel: (_entity: string, field: string) =>
      ({ body_mass_index_value: 'BMI', age_value: 'Age', sex: 'Sex' })[field] ?? field,
    getEntityLabel: (entity: string) => ({ donors: 'Donor' })[entity] ?? entity,
  };

  it('prefers a package label over humanizing the column name', () => {
    const s = spec({
      representation: {
        mark: 'point',
        mapping: [
          { encoding: 'x', field: 'age_value', type: 'quantitative' },
          { encoding: 'y', field: 'body_mass_index_value', type: 'quantitative' },
        ],
      },
    });
    expect(buildVizTitle(s)).toBe('Scatter plot of Body Mass Index and Age');
    expect(buildVizTitle(s, labels)).toBe('Scatter plot of BMI and Age');
  });

  it('uses the entity label for counts and tables', () => {
    expect(buildVizTitle(countBy('sex'), labels)).toBe('Bar chart of Count of Donor by Sex');
    expect(buildVizTitle(spec(), labels)).toBe('Table of Donor');
  });

  it('labels an aggregation input too', () => {
    const s = spec({
      transformation: [
        { groupby: 'sex' },
        { rollup: { avg_bmi: { op: 'mean', field: 'body_mass_index_value' } } },
      ],
      representation: {
        mark: 'bar',
        mapping: [
          { encoding: 'x', field: 'sex', type: 'nominal' },
          { encoding: 'y', field: 'avg_bmi', type: 'quantitative' },
        ],
      },
    });
    expect(buildVizTitle(s, labels)).toBe('Bar chart of Average BMI by Sex');
  });
});

describe('vizTitleProvenance', () => {
  const base = { userPrompt: 'how many donors by sex?', spec: countBy('sex') };

  it('shows the built title by default', () => {
    const p = vizTitleProvenance(base);
    expect(p.display).toBe('Bar chart of Count of Donors by Sex');
    expect(p.isRenamed).toBe(false);
  });

  it('tracks a field swap with no bookkeeping', () => {
    expect(resolveVizTitle({ ...base, spec: countBy('race') })).toBe(
      'Bar chart of Count of Donors by Race',
    );
  });

  it('lets a rename win over the built title', () => {
    const p = vizTitleProvenance({ ...base, userTitle: 'Cohort breakdown' });
    expect(p.display).toBe('Cohort breakdown');
    expect(p.isRenamed).toBe(true);
  });

  it('ignores a whitespace-only rename', () => {
    expect(resolveVizTitle({ ...base, userTitle: '   ' })).toBe(
      'Bar chart of Count of Donors by Sex',
    );
  });

  it("keeps an older session's assistant title as provenance, not as the display", () => {
    const p = vizTitleProvenance({ ...base, title: 'Donor Count by Sex' });
    expect(p.original).toBe('Donor Count by Sex');
    expect(p.display).toBe('Bar chart of Count of Donors by Sex');
  });

  it('falls back to the assistant title, then the prompt, when nothing is derivable', () => {
    const bare = { userPrompt: 'show me something', spec: {} as UDIGrammar };
    expect(resolveVizTitle({ ...bare, title: 'Donor Count by Sex' })).toBe('Donor Count by Sex');
    expect(resolveVizTitle(bare)).toBe('show me something');
  });
});
