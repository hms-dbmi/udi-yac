import { describe, it, expect } from 'vitest';
import { humanizeFieldName, singularizeLabel } from './humanize';

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

describe('singularizeLabel', () => {
  it('drops a plural s from the last word', () => {
    expect(singularizeLabel('Donors')).toBe('Donor');
    expect(singularizeLabel('Datasets')).toBe('Dataset');
    expect(singularizeLabel('Tissue Samples')).toBe('Tissue Sample');
  });

  it('handles the -ies and -es endings', () => {
    expect(singularizeLabel('Studies')).toBe('Study');
    expect(singularizeLabel('Boxes')).toBe('Box');
    expect(singularizeLabel('Batches')).toBe('Batch');
  });

  it('leaves words that only look plural alone', () => {
    expect(singularizeLabel('Analysis')).toBe('Analysis');
    expect(singularizeLabel('Status')).toBe('Status');
    expect(singularizeLabel('Data')).toBe('Data');
  });

  it('knows a few irregulars', () => {
    expect(singularizeLabel('Analyses')).toBe('Analysis');
    expect(singularizeLabel('Indices')).toBe('Index');
  });

  it('preserves the original casing', () => {
    expect(singularizeLabel('DONORS')).toBe('DONOR');
    expect(singularizeLabel('donors')).toBe('donor');
  });
});
