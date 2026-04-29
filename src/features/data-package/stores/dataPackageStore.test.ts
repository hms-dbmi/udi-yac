import { describe, it, expect } from 'vitest';
import { createDataPackageStore } from './dataPackageStore';
import type { DataPackage, DataFieldDomain } from '@/types/dataPackage';

function makePackage(): DataPackage {
  return {
    'udi:path': 'https://example.test/data',
    resources: [
      {
        name: 'donors',
        path: 'donors.csv',
        'udi:row_count': 10,
        schema: {
          fields: [
            { name: 'age_value', 'udi:data_type': 'quantitative', description: 'Age' },
            { name: 'organ', 'udi:data_type': 'nominal', description: 'Organ' },
          ],
        },
        encoding: '',
        format: '',
        mediatype: '',
        scheme: '',
        type: '',
      },
      {
        name: 'samples',
        path: 'samples.csv',
        'udi:row_count': 20,
        schema: {
          fields: [
            { name: 'donor_id', 'udi:data_type': 'nominal' },
            { name: 'sample_size', 'udi:data_type': 'quantitative' },
          ],
          foreignKeys: [
            {
              fields: ['donor_id'],
              reference: { resource: 'donors', fields: ['id'] },
            },
          ],
        },
        encoding: '',
        format: '',
        mediatype: '',
        scheme: '',
        type: '',
      },
    ],
  };
}

const domains: DataFieldDomain[] = [
  {
    entity: 'donors',
    field: 'age_value',
    type: 'interval',
    fieldDescription: 'Age',
    domain: { min: 0, max: 100 },
  },
  {
    entity: 'donors',
    field: 'organ',
    type: 'point',
    fieldDescription: 'Organ',
    domain: { values: ['heart', 'lung', 'liver'] },
  },
];

describe('dataPackageStore — setDataPackage with precomputedDomains', () => {
  it('populates state without hitting the network when precomputed domains are provided', async () => {
    const store = createDataPackageStore();
    await store.getState().setDataPackage(makePackage(), domains);
    const state = store.getState();
    expect(state.loadingPhase).toBe('ready');
    expect(state.entityNames).toEqual(['donors', 'samples']);
    expect(state.sourceFields).toEqual({
      donors: ['age_value', 'organ'],
      samples: ['donor_id', 'sample_size'],
    });
    expect(state.quantitativeSourceFields).toEqual({
      donors: ['age_value'],
      samples: ['sample_size'],
    });
    expect(state.categoricalSourceFields).toEqual({
      donors: ['organ'],
      samples: ['donor_id'],
    });
    expect(state.sourceResolver).toEqual({
      donors: 'https://example.test/data/donors.csv',
      samples: 'https://example.test/data/samples.csv',
    });
  });

  it('filters out resources with zero row count', async () => {
    const store = createDataPackageStore();
    const pkg: DataPackage = {
      'udi:path': 'data',
      resources: [
        {
          name: 'a',
          path: 'a.csv',
          'udi:row_count': 0,
          schema: { fields: [{ name: 'x' }] },
          encoding: '',
          format: '',
          mediatype: '',
          scheme: '',
          type: '',
        },
        {
          name: 'b',
          path: 'b.csv',
          'udi:row_count': 5,
          schema: { fields: [{ name: 'y' }] },
          encoding: '',
          format: '',
          mediatype: '',
          scheme: '',
          type: '',
        },
      ],
    };
    await store.getState().setDataPackage(pkg, []);
    expect(store.getState().entityNames).toEqual(['b']);
  });
});

describe('dataPackageStore — domain lookups and validators', () => {
  it('getDomainForField returns the matching domain or undefined', async () => {
    const store = createDataPackageStore();
    await store.getState().setDataPackage(makePackage(), domains);
    expect(store.getState().getDomainForField('donors', 'age_value')?.type).toBe('interval');
    expect(store.getState().getDomainForField('donors', 'missing')).toBeUndefined();
  });

  it('isValidIntervalFilter returns "unknown" when no package is loaded', () => {
    const store = createDataPackageStore();
    expect(store.getState().isValidIntervalFilter('donors', 'age_value')).toEqual({
      isValid: 'unknown',
    });
  });

  it('isValidIntervalFilter returns "yes" when a domain exists for the field', async () => {
    const store = createDataPackageStore();
    await store.getState().setDataPackage(makePackage(), domains);
    expect(store.getState().isValidIntervalFilter('donors', 'age_value')).toEqual({
      isValid: 'yes',
    });
  });

  it('isValidIntervalFilter returns "no" when the field has no domain', async () => {
    const store = createDataPackageStore();
    await store.getState().setDataPackage(makePackage(), domains);
    expect(store.getState().isValidIntervalFilter('donors', 'missing')).toEqual({ isValid: 'no' });
  });

  it('isValidPointFilter validates every value against the categorical domain', async () => {
    const store = createDataPackageStore();
    await store.getState().setDataPackage(makePackage(), domains);
    expect(store.getState().isValidPointFilter('donors', 'organ', ['heart', 'lung'])).toEqual({
      isValid: 'yes',
    });
    expect(store.getState().isValidPointFilter('donors', 'organ', ['heart', 'spleen'])).toEqual({
      isValid: 'no',
    });
  });

  it('isValidPointFilter returns "unknown" before a package is loaded', () => {
    const store = createDataPackageStore();
    expect(store.getState().isValidPointFilter('donors', 'organ', ['heart'])).toEqual({
      isValid: 'unknown',
    });
  });
});

describe('dataPackageStore — getEntityRelationship', () => {
  it('resolves forward FK (origin → target) using the last-field pair', async () => {
    const store = createDataPackageStore();
    await store.getState().setDataPackage(makePackage(), []);
    expect(store.getState().getEntityRelationship('samples', 'donors')).toEqual({
      originKey: 'donor_id',
      targetKey: 'id',
    });
  });

  it('resolves reverse FK by flipping origin/target keys', async () => {
    const store = createDataPackageStore();
    await store.getState().setDataPackage(makePackage(), []);
    // donors has no FK; reverse match from samples → donors yields the flipped mapping.
    expect(store.getState().getEntityRelationship('donors', 'samples')).toEqual({
      originKey: 'id',
      targetKey: 'donor_id',
    });
  });

  it('returns null when no relationship exists', async () => {
    const store = createDataPackageStore();
    await store.getState().setDataPackage(makePackage(), []);
    expect(store.getState().getEntityRelationship('donors', 'ghosts')).toBeNull();
  });
});

describe('dataPackageStore — setFilteredData', () => {
  it('inserts data per entity and produces a fresh Map reference', async () => {
    const store = createDataPackageStore();
    await store.getState().setDataPackage(makePackage(), []);
    const before = store.getState().filteredData;
    store
      .getState()
      .setFilteredData('donors', { displayRows: [{ age: 10 }], allRows: [{ age: 10 }] });
    const after = store.getState().filteredData;
    expect(after).not.toBe(before);
    expect(after.get('donors')?.displayRows).toEqual([{ age: 10 }]);
  });
});

describe('dataPackageStore — serialization strings', () => {
  it('dataPackageString strips udi:overlapping_fields from schema fields', async () => {
    const store = createDataPackageStore();
    const pkg: DataPackage = {
      'udi:path': 'data',
      resources: [
        {
          name: 'donors',
          path: 'donors.csv',
          'udi:row_count': 5,
          schema: {
            fields: [
              {
                name: 'age_value',
                'udi:data_type': 'quantitative',
                'udi:overlapping_fields': ['other.age_value'],
              },
            ],
          },
          encoding: '',
          format: '',
          mediatype: '',
          scheme: '',
          type: '',
        },
      ],
    };
    await store.getState().setDataPackage(pkg, []);
    expect(store.getState().dataPackageString).not.toContain('udi:overlapping_fields');
  });

  it('dataDomainsString drops large categorical domains (>= 80 values)', async () => {
    const store = createDataPackageStore();
    const largeValues = Array.from({ length: 100 }, (_, i) => `v${i}`);
    const largeDomains: DataFieldDomain[] = [
      {
        entity: 'donors',
        field: 'donor_id',
        type: 'point',
        fieldDescription: '',
        domain: { values: largeValues },
      },
      {
        entity: 'donors',
        field: 'age_value',
        type: 'interval',
        fieldDescription: '',
        domain: { min: 0, max: 100 },
      },
    ];
    await store.getState().setDataPackage(makePackage(), largeDomains);
    const serialized = store.getState().dataDomainsString;
    expect(serialized).toContain('age_value');
    expect(serialized).not.toContain('donor_id');
  });
});
