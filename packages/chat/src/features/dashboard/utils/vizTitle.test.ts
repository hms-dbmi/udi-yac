import { describe, it, expect } from 'vitest';
import type { UDIGrammar } from 'udi-toolkit/react';
import {
  deriveTitleFromSpec,
  humanizeFieldName,
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

describe('humanizeFieldName', () => {
  it("drops the measurement columns' _value suffix", () => {
    expect(humanizeFieldName('weight_value')).toBe('Weight');
    expect(humanizeFieldName('body_mass_index_value')).toBe('Body Mass Index');
  });

  it('title-cases the remaining underscore-separated words', () => {
    expect(humanizeFieldName('assay_type')).toBe('Assay Type');
    expect(humanizeFieldName('sex')).toBe('Sex');
  });

  it('leaves tokens that already carry uppercase alone', () => {
    expect(humanizeFieldName('hubmapID')).toBe('hubmapID');
    expect(humanizeFieldName('mRNA_count')).toBe('mRNA Count');
  });

  it('never returns an empty label', () => {
    expect(humanizeFieldName('value')).toBe('Value');
    // Stripping the suffix would empty this one, so the raw name is humanized instead.
    expect(humanizeFieldName('_value')).toBe('Value');
    // Nothing but separators: there is no prose to make, so it passes through.
    expect(humanizeFieldName('_')).toBe('_');
  });
});

describe('deriveTitleFromSpec', () => {
  it('names a count aggregation after its source and dimension', () => {
    expect(deriveTitleFromSpec(countBy('sex'))).toBe('Count of Donors by Sex');
  });

  it('follows the swapped dimension', () => {
    expect(deriveTitleFromSpec(countBy('race'))).toBe('Count of Donors by Race');
  });

  it('lists a second dimension from another encoding', () => {
    expect(
      deriveTitleFromSpec(countBy('sex', [{ encoding: 'color', field: 'race', type: 'nominal' }])),
    ).toBe('Count of Donors by Sex and Race');
  });

  it('does not repeat a field bound to two encodings', () => {
    expect(
      deriveTitleFromSpec(countBy('sex', [{ encoding: 'color', field: 'sex', type: 'nominal' }])),
    ).toBe('Count of Donors by Sex');
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
    expect(deriveTitleFromSpec(s)).toBe('Average Age by Sex');
  });

  it('reads a scatter as "y vs x"', () => {
    const s = spec({
      representation: {
        mark: 'point',
        mapping: [
          { encoding: 'x', field: 'age_value', type: 'quantitative' },
          { encoding: 'y', field: 'weight_value', type: 'quantitative' },
        ],
      },
    });
    expect(deriveTitleFromSpec(s)).toBe('Weight vs Age');
  });

  it('humanizes both axes of the scatter the user reported', () => {
    const s = spec({
      representation: {
        mark: 'point',
        mapping: [
          { encoding: 'x', field: 'body_mass_index_value', type: 'quantitative' },
          { encoding: 'y', field: 'weight_value', type: 'quantitative' },
        ],
      },
    });
    expect(deriveTitleFromSpec(s)).toBe('Weight vs Body Mass Index');
  });

  it('prefers an explicit mapping title over the raw field name', () => {
    const s = spec({
      representation: {
        mark: 'point',
        mapping: [
          { encoding: 'x', field: 'age_value', type: 'quantitative', title: 'Age (years)' },
          { encoding: 'y', field: 'weight_value', type: 'quantitative', title: 'Weight (kg)' },
        ],
      },
    });
    expect(deriveTitleFromSpec(s)).toBe('Weight (kg) vs Age (years)');
  });

  it('falls back to the single encoding when there is only one', () => {
    const s = spec({
      representation: {
        mark: 'bar',
        mapping: [{ encoding: 'x', field: 'age_value', type: 'quantitative' }],
      },
    });
    expect(deriveTitleFromSpec(s)).toBe('Age');
  });

  it('describes a row layer as the entity rows', () => {
    const s = spec({
      representation: { mark: 'row', mapping: [{ encoding: 'text', field: 'hubmap_id' }] },
    });
    expect(deriveTitleFromSpec(s)).toBe('Donors rows');
  });

  it('treats a missing representation as a table (the parser default)', () => {
    expect(deriveTitleFromSpec(spec())).toBe('Donors rows');
  });

  it('skips the wildcard field a default row layer uses', () => {
    const s = spec({ representation: { mark: 'bar', mapping: [{ encoding: 'x', field: '*' }] } });
    expect(deriveTitleFromSpec(s)).toBe('Donors rows');
  });

  it('returns undefined when nothing is derivable', () => {
    expect(deriveTitleFromSpec({} as UDIGrammar)).toBeUndefined();
  });
});

describe('vizTitleProvenance', () => {
  const base = {
    userPrompt: 'how many donors by sex?',
    title: 'Donor Count by Sex',
    baseAutoTitle: 'Count of Donors by Sex',
  };

  it('shows the original title while the spec still matches it', () => {
    const p = vizTitleProvenance({ ...base, spec: countBy('sex') });
    expect(p.display).toBe('Donor Count by Sex');
    expect(p.isDrifted).toBe(false);
    expect(p.isRenamed).toBe(false);
  });

  it('switches to the derived title once the spec drifts', () => {
    const p = vizTitleProvenance({ ...base, spec: countBy('race') });
    expect(p.display).toBe('Count of Donors by Race');
    expect(p.isDrifted).toBe(true);
    expect(p.original).toBe('Donor Count by Sex');
  });

  it('restores the original title when the tweak is swapped back', () => {
    expect(resolveVizTitle({ ...base, spec: countBy('race') })).toBe('Count of Donors by Race');
    expect(resolveVizTitle({ ...base, spec: countBy('sex') })).toBe('Donor Count by Sex');
  });

  it('lets a rename win over both the original and the derived title', () => {
    const p = vizTitleProvenance({ ...base, spec: countBy('race'), userTitle: 'Cohort breakdown' });
    expect(p.display).toBe('Cohort breakdown');
    expect(p.isRenamed).toBe(true);
    // Provenance survives the rename.
    expect(p.original).toBe('Donor Count by Sex');
    expect(p.auto).toBe('Count of Donors by Race');
  });

  it('ignores a whitespace-only rename', () => {
    expect(resolveVizTitle({ ...base, spec: countBy('sex'), userTitle: '   ' })).toBe(
      'Donor Count by Sex',
    );
  });

  it('never auto-updates a card with no baseline (pre-rename-feature import)', () => {
    const p = vizTitleProvenance({
      userPrompt: 'how many donors by sex?',
      title: 'Donor Count by Sex',
      spec: countBy('race'),
    });
    expect(p.display).toBe('Donor Count by Sex');
    expect(p.isDrifted).toBe(false);
  });

  it('uses the derived title when the agent supplied none', () => {
    const p = vizTitleProvenance({ userPrompt: 'donors by sex', spec: countBy('sex') });
    expect(p.display).toBe('Count of Donors by Sex');
  });

  it('falls back to the user prompt when nothing else is available', () => {
    const p = vizTitleProvenance({ userPrompt: 'show me something', spec: {} as UDIGrammar });
    expect(p.display).toBe('show me something');
  });
});
