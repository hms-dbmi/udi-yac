import { describe, it, expect } from 'vitest';
import type { UDIGrammar } from 'udi-toolkit/react';
import { humanizeFieldName } from '@/utils/humanize';
import {
  applyFieldLabels,
  buildVizTitle,
  renderTextTemplate,
  resolveVizSummary,
  resolveVizTitle,
  vizTitleProvenance,
} from './vizTitle';

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

describe('buildVizTitle — distinct counts', () => {
  /** "How many patients per <field>", off an event-grain table. */
  const distinctBy = (field: string, key = 'research_id') =>
    ({
      source: { name: 'events', source: 'events.csv' },
      transformation: [
        { groupby: field },
        { rollup: { 'patient count': { op: 'distinct', field: key } } },
      ],
      representation: {
        mark: 'bar',
        mapping: [
          { encoding: 'x', field: 'patient count', type: 'quantitative' },
          { encoding: 'y', field, type: 'nominal' },
        ],
      },
    }) as unknown as UDIGrammar;

  const labels = {
    getEntityLabel: (entity: string) =>
      ({ events: 'Events', patients: 'Patients' })[entity] ?? entity,
    // research_id is a foreign key to the patient table.
    getIdentifiedEntity: (_entity: string, field: string) =>
      field === 'research_id' ? 'patients' : null,
  };

  it('names the entity the counted key identifies, not the key', () => {
    expect(buildVizTitle(distinctBy('diagnosis'), labels)).toBe(
      'Bar chart of Patients by Diagnosis',
    );
  });

  it('falls back to naming the column when the key identifies nothing', () => {
    expect(buildVizTitle(distinctBy('diagnosis', 'protocol'), labels)).toBe(
      'Bar chart of Distinct Protocol by Diagnosis',
    );
  });

  it('without package metadata, still says what it counted', () => {
    expect(buildVizTitle(distinctBy('diagnosis'))).toBe(
      'Bar chart of Distinct Research Id by Diagnosis',
    );
  });

  it('carries the label onto the encoding for the axis', () => {
    const labelled = applyFieldLabels(distinctBy('diagnosis'), labels) as unknown as {
      representation: { mapping: Array<{ field: string; title?: string }> };
    };
    const measure = labelled.representation.mapping.find((m) => m.field === 'patient count');
    expect(measure?.title).toBe('Patients');
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

describe('applyFieldLabels', () => {
  // Mirrors the store's getFieldLabel: a package `title` when there is one,
  // the humanized column name otherwise.
  const labels = {
    getFieldLabel: (_entity: string, field: string) =>
      ({ body_mass_index_value: 'BMI' })[field] ?? humanizeFieldName(field),
  };

  /** The toolkit copies a mapping's `title` onto the Vega encoding, which is
   *  what Vega uses for the axis label, the legend and the tooltip key. */
  const titles = (s: UDIGrammar) => {
    const layer = (Array.isArray(s.representation) ? s.representation[0] : s.representation) as {
      mapping: Array<{ field?: string; title?: string }>;
    };
    return Object.fromEntries(layer.mapping.map((m) => [m.field, m.title]));
  };

  it('names every encoding the way the card title names it', () => {
    const labelled = applyFieldLabels(scatter());
    expect(titles(labelled)).toEqual({ age_value: 'Age', weight_value: 'Weight' });
  });

  it('uses the package label when there is one', () => {
    const s = spec({
      representation: {
        mark: 'point',
        mapping: [
          { encoding: 'x', field: 'age_value', type: 'quantitative' },
          { encoding: 'y', field: 'body_mass_index_value', type: 'quantitative' },
        ],
      },
    });
    expect(titles(applyFieldLabels(s, labels))).toEqual({
      age_value: 'Age',
      body_mass_index_value: 'BMI',
    });
  });

  it('names an aggregated axis after its aggregation', () => {
    expect(titles(applyFieldLabels(countBy('sex')))).toEqual({
      sex: 'Sex',
      donor_count: 'Count of Donors',
    });
  });

  it('leaves an explicit title from the spec author alone', () => {
    const s = spec({
      representation: {
        mark: 'point',
        mapping: [
          { encoding: 'x', field: 'age_value', type: 'quantitative', title: 'Age (years)' },
          { encoding: 'y', field: 'weight_value', type: 'quantitative' },
        ],
      },
    });
    expect(titles(applyFieldLabels(s))).toEqual({
      age_value: 'Age (years)',
      weight_value: 'Weight',
    });
  });

  it('does not mutate the spec it was given', () => {
    const original = scatter();
    const before = JSON.stringify(original);
    applyFieldLabels(original, labels);
    expect(JSON.stringify(original)).toBe(before);
  });

  it('returns the same object when there is nothing to label', () => {
    // A row layer's `*` wildcard covers every column, so no single name fits.
    const rows = spec({
      representation: { mark: 'row', mapping: [{ encoding: 'text', field: '*' }] },
    });
    expect(applyFieldLabels(rows)).toBe(rows);
    const bare = spec();
    expect(applyFieldLabels(bare)).toBe(bare);
  });

  it('labels every layer of a multi-layer spec', () => {
    const s = spec({
      representation: [
        { mark: 'bar', mapping: [{ encoding: 'x', field: 'age_value', type: 'quantitative' }] },
        { mark: 'line', mapping: { encoding: 'y', field: 'weight_value', type: 'quantitative' } },
      ],
    });
    const layers = applyFieldLabels(s).representation as Array<{
      mapping: { title?: string } | Array<{ title?: string }>;
    }>;
    expect((layers[0].mapping as Array<{ title?: string }>)[0].title).toBe('Age');
    expect((layers[1].mapping as { title?: string }).title).toBe('Weight');
  });
});

describe('renderTextTemplate', () => {
  /** Aggregated bar chart: y plots `donor_count`, a count rollup over <E>. */
  const agg = spec({
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

  it('resolves encodings against the spec it is given', () => {
    expect(renderTextTemplate('Scatterplot of {enc:x} and {enc:y}', scatter())).toBe(
      'Scatterplot of Age and Weight',
    );
  });

  it('follows a field swap, which is the whole point of the tokens', () => {
    const tmpl = 'Bar chart of the number of {entity} by {enc:x}';
    expect(renderTextTemplate(tmpl, countBy('sex'))).toBe(
      'Bar chart of the number of Donors by Sex',
    );
    expect(renderTextTemplate(tmpl, countBy('race'))).toBe(
      'Bar chart of the number of Donors by Race',
    );
  });

  it('names an aggregated encoding for a title and its input column for prose', () => {
    // A title says what is plotted...
    expect(renderTextTemplate('Bar chart of {enc:y} by {enc:x}', agg)).toBe(
      'Bar chart of Average Age by Sex',
    );
    // ...while a summary spells the operation out and wants the bare column.
    expect(renderTextTemplate('Displays the mean {field:y} in each {enc:x} category', agg)).toBe(
      'Displays the mean Age in each Sex category',
    );
  });

  it('singularizes an entity for prose that counts one row at a time', () => {
    // Entity labels name a table, so they read as plurals.
    expect(
      renderTextTemplate(
        'Displays a point for each {entity:one}, positioned by {enc:x}',
        scatter(),
      ),
    ).toBe('Displays a point for each Donor, positioned by Age');
    // The plural token is untouched.
    expect(renderTextTemplate('Table of {entity}', scatter())).toBe('Table of Donors');
  });

  it('singularizes a package-supplied entity label too', () => {
    const labels = { getEntityLabel: () => 'Tissue Samples' };
    expect(renderTextTemplate('each {entity:one}', scatter(), labels)).toBe('each Tissue Sample');
  });

  it('resolves each source of a join separately', () => {
    const joined = {
      source: [
        { name: 'donors', source: 'donors.csv' },
        { name: 'samples', source: 'samples.csv' },
      ],
      representation: {
        mark: 'bar',
        mapping: [{ encoding: 'x', field: 'organ', type: 'nominal' }],
      },
    } as unknown as UDIGrammar;
    expect(renderTextTemplate('Table of {entity1} and {entity2}', joined)).toBe(
      'Table of Donors and Samples',
    );
  });

  it('applies package labels', () => {
    const labels = {
      getFieldLabel: (_e: string, f: string) =>
        ({ age_value: 'Age at death' })[f] ?? humanizeFieldName(f),
      getEntityLabel: () => 'Donor',
    };
    expect(
      renderTextTemplate(
        'Bar chart of the number of {entity} by {enc:x}',
        countBy('age_value'),
        labels,
      ),
    ).toBe('Bar chart of the number of Donor by Age at death');
  });

  it('gives up rather than showing a half-filled sentence', () => {
    // No `color` encoding on this spec, so the token cannot be resolved.
    expect(renderTextTemplate('Scatterplot of {enc:x} by {enc:color}', scatter())).toBeUndefined();
    expect(renderTextTemplate('', scatter())).toBeUndefined();
  });

  it('leaves unrecognised tokens alone', () => {
    expect(renderTextTemplate('Chart of {enc:x} {mystery}', scatter())).toBe(
      'Chart of Age {mystery}',
    );
  });
});

describe('template-driven titles and summaries', () => {
  const base = { userPrompt: 'donors by sex', spec: countBy('sex') };

  it('prefers the template wording over the generic builder', () => {
    const p = vizTitleProvenance({
      ...base,
      titleTemplate: 'Bar chart of the number of {entity} by {enc:x}',
    });
    expect(p.display).toBe('Bar chart of the number of Donors by Sex');
    // Without a template, the builder still covers it.
    expect(vizTitleProvenance(base).display).toBe('Bar chart of Count of Donors by Sex');
  });

  it('falls back to the builder when a template no longer resolves', () => {
    const p = vizTitleProvenance({ ...base, titleTemplate: 'Chart of {enc:color}' });
    expect(p.display).toBe('Bar chart of Count of Donors by Sex');
  });

  it('still lets a rename win', () => {
    const p = vizTitleProvenance({
      ...base,
      titleTemplate: 'Bar chart of the number of {entity} by {enc:x}',
      userTitle: 'Cohort breakdown',
    });
    expect(p.display).toBe('Cohort breakdown');
  });

  it('resolves the summary, and has none without a template', () => {
    expect(
      resolveVizSummary({
        ...base,
        summaryTemplate: 'Displays the number of {entity} in each {enc:x} category.',
      }),
    ).toBe('Displays the number of Donors in each Sex category.');
    expect(resolveVizSummary(base)).toBeUndefined();
  });
});

describe('applyFieldLabels — categorical value labels', () => {
  const valueLabels = { "Children's Hospital of Philadelphia": 'CHOP' };
  const mappingFor = (s: UDIGrammar, encoding: string) => {
    const layer = (Array.isArray(s.representation) ? s.representation[0] : s.representation) as {
      mapping: Array<{ encoding?: string; labels?: Record<string, string> }>;
    };
    return layer.mapping.find((m) => m.encoding === encoding);
  };

  it('attaches the map to categorical encodings only', () => {
    const s = countBy('group_name');
    const labelled = applyFieldLabels(s, { valueLabels });
    // x is nominal — its ticks are the values being relabelled.
    expect(mappingFor(labelled, 'x')?.labels).toEqual(valueLabels);
    // y is the quantitative count axis — no discrete ticks to rename.
    expect(mappingFor(labelled, 'y')?.labels).toBeUndefined();
  });

  it('is a no-op when the package declares no value labels', () => {
    const s = countBy('group_name');
    expect(mappingFor(applyFieldLabels(s, {}), 'x')?.labels).toBeUndefined();
    expect(mappingFor(applyFieldLabels(s, { valueLabels: {} }), 'x')?.labels).toBeUndefined();
  });

  it('leaves an explicit map from the spec author alone', () => {
    const s = spec({
      representation: {
        mark: 'bar',
        mapping: [{ encoding: 'x', field: 'group_name', type: 'nominal', labels: { a: 'b' } }],
      },
    });
    expect(mappingFor(applyFieldLabels(s, { valueLabels }), 'x')?.labels).toEqual({ a: 'b' });
  });
});
