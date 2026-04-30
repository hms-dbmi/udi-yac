import { describe, it, expect } from 'vitest';
import { evaluateStructuredText, hasStructuredReferences } from './structuredTextParser';
import type { DataPackageState } from '@/features/data-package';
import type { DataFieldDomain } from '@/types/dataPackage';

/**
 * Build a minimal DataPackageState stub that satisfies the fields used by
 * structuredTextParser. We deliberately leave the rest of the store's methods
 * as `null as any` — the parser is expected not to touch them.
 */
function makeStoreStub(overrides: Partial<DataPackageState> = {}): DataPackageState {
  const domains: DataFieldDomain[] = [
    {
      entity: 'donors',
      field: 'age_value',
      type: 'interval',
      fieldDescription: '',
      domain: { min: 1, max: 87 },
    } as DataFieldDomain,
    {
      entity: 'donors',
      field: 'sex',
      type: 'point',
      fieldDescription: '',
      domain: { values: ['Male', 'Female', 'Unknown'] },
    } as DataFieldDomain,
  ];
  const base: Partial<DataPackageState> = {
    entityNames: ['donors', 'samples'],
    sourceFields: { donors: ['age_value', 'sex'], samples: ['uuid'] },
    dataPackage: {
      resources: [
        { name: 'donors', path: 'donors.csv', 'udi:row_count': 432, schema: { fields: [] } },
        { name: 'samples', path: 'samples.csv', 'udi:row_count': 4489, schema: { fields: [] } },
      ],
    } as unknown as DataPackageState['dataPackage'],
    dataFieldDomains: domains,
    getDomainForField: (entity, field) =>
      domains.find((d) => d.entity === entity && d.field === field),
  };
  return { ...base, ...overrides } as DataPackageState;
}

describe('hasStructuredReferences', () => {
  it('detects a reference', () => {
    expect(hasStructuredReferences('There are {entity_count()} entities.')).toBe(true);
  });

  it('returns false for plain text', () => {
    expect(hasStructuredReferences('Hello world.')).toBe(false);
  });

  it('is not stateful across invocations (regex lastIndex reset)', () => {
    const text = 'There are {entity_count()} entities.';
    expect(hasStructuredReferences(text)).toBe(true);
    expect(hasStructuredReferences(text)).toBe(true);
  });
});

describe('evaluateStructuredText', () => {
  it('returns a single text segment for input with no references', () => {
    const segments = evaluateStructuredText('Just text.', makeStoreStub());
    expect(segments).toEqual([{ type: 'text', content: 'Just text.' }]);
  });

  it('resolves entity_count', () => {
    const segments = evaluateStructuredText('Count: {entity_count()}.', makeStoreStub());
    expect(segments).toEqual([
      { type: 'text', content: 'Count: ' },
      { type: 'value', content: '2' },
      { type: 'text', content: '.' },
    ]);
  });

  it('resolves field_count with a string arg', () => {
    const segments = evaluateStructuredText('{field_count("donors")}', makeStoreStub());
    expect(segments).toEqual([{ type: 'value', content: '2' }]);
  });

  it('resolves field_type using getDomainForField', () => {
    const segments = evaluateStructuredText('{field_type("donors", "age_value")}', makeStoreStub());
    expect(segments).toEqual([{ type: 'value', content: 'interval' }]);
  });

  it('renders an en-dash range for interval sample_values', () => {
    const segments = evaluateStructuredText(
      '{sample_values("donors", "age_value")}',
      makeStoreStub(),
    );
    expect(segments).toEqual([{ type: 'value', content: '1 \u2013 87' }]);
  });

  it('limits categorical sample_values to the first 5 values', () => {
    const domains: DataFieldDomain[] = [
      {
        entity: 'donors',
        field: 'race',
        type: 'point',
        fieldDescription: '',
        domain: { values: ['A', 'B', 'C', 'D', 'E', 'F', 'G'] },
      } as DataFieldDomain,
    ];
    const store = makeStoreStub({
      dataFieldDomains: domains,
      getDomainForField: (e, f) => domains.find((d) => d.entity === e && d.field === f),
    });
    const segments = evaluateStructuredText('{sample_values("donors", "race")}', store);
    expect(segments).toEqual([{ type: 'value', content: 'A, B, C, D, E' }]);
  });

  it('resolves row_count from the data package resources', () => {
    const segments = evaluateStructuredText('{row_count("samples")}', makeStoreStub());
    expect(segments).toEqual([{ type: 'value', content: '4489' }]);
  });

  it('returns ? for unknown entities/fields', () => {
    const segments = evaluateStructuredText('{field_count("mystery")}', makeStoreStub());
    expect(segments).toEqual([{ type: 'value', content: '?' }]);
  });

  it('leaves unknown function names as literal text', () => {
    const segments = evaluateStructuredText('{bogus_fn("x")} tail', makeStoreStub());
    expect(segments).toEqual([
      { type: 'text', content: '{bogus_fn("x")}' },
      { type: 'text', content: ' tail' },
    ]);
  });

  it('handles multiple references interleaved with text', () => {
    const segments = evaluateStructuredText(
      '{entity_count()} entities, {row_count("donors")} donors.',
      makeStoreStub(),
    );
    expect(segments).toEqual([
      { type: 'value', content: '2' },
      { type: 'text', content: ' entities, ' },
      { type: 'value', content: '432' },
      { type: 'text', content: ' donors.' },
    ]);
  });

  it('emits a field_list segment for field_names rather than a joined string', () => {
    const segments = evaluateStructuredText(
      'The fields are {field_names("donors")}.',
      makeStoreStub(),
    );
    expect(segments).toEqual([
      { type: 'text', content: 'The fields are ' },
      { type: 'field_list', entity: 'donors', fields: ['age_value', 'sex'] },
      { type: 'text', content: '.' },
    ]);
  });

  it('emits an empty field_list when the entity is unknown', () => {
    const segments = evaluateStructuredText('{field_names("mystery")}', makeStoreStub());
    expect(segments).toEqual([{ type: 'field_list', entity: 'mystery', fields: [] }]);
  });

  it('tolerates single-quoted and unquoted string args', () => {
    const single = evaluateStructuredText("{field_count('donors')}", makeStoreStub());
    expect(single).toEqual([{ type: 'value', content: '2' }]);
    const unquoted = evaluateStructuredText('{field_count(donors)}', makeStoreStub());
    expect(unquoted).toEqual([{ type: 'value', content: '2' }]);
  });
});
