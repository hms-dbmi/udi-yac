import { describe, it, expect } from 'vitest';
import type { DataFieldDomain, DataPackage, DataPackageResource } from '@/types/dataPackage';
import {
  buildSchemaGraph,
  categoricalValues,
  describeRelationships,
  formatIntervalDomain,
  relationshipKeyFields,
} from './entityOverview';

type FK = NonNullable<DataPackageResource['schema']['foreignKeys']>[number];

function resource(
  name: string,
  opts: { rows?: number; foreignKeys?: FK[]; primaryKey?: string[] } = {},
): DataPackageResource {
  return {
    name,
    path: `${name}.tsv`,
    'udi:row_count': opts.rows ?? 10,
    schema: {
      fields: [],
      foreignKeys: opts.foreignKeys ?? [],
      ...(opts.primaryKey ? { primaryKey: opts.primaryKey } : {}),
    },
  };
}

function fk(
  field: string,
  resourceName: string,
  refField: string,
  cardinality?: FK['udi:cardinality'],
): FK {
  return {
    fields: [field],
    reference: { resource: resourceName, fields: [refField] },
    ...(cardinality ? { 'udi:cardinality': cardinality } : {}),
  };
}

function pkg(resources: DataPackageResource[]): DataPackage {
  return { 'udi:path': './data/test/', resources };
}

// donors ← samples ← datasets, plus a sibling many-to-many datasets ↔ samples.
// Every resource declares `primaryKey: ["hubmap_id"]`, as the real package does.
const hubmap = pkg([
  resource('donors', { rows: 499, primaryKey: ['hubmap_id'] }),
  resource('samples', {
    rows: 5044,
    primaryKey: ['hubmap_id'],
    foreignKeys: [fk('donor.hubmap_id', 'donors', 'hubmap_id', { from: 'many', to: 'one' })],
  }),
  resource('datasets', {
    rows: 9474,
    primaryKey: ['hubmap_id'],
    foreignKeys: [
      fk('donor.hubmap_id', 'donors', 'hubmap_id', { from: 'many', to: 'one' }),
      fk('donor.hubmap_id', 'samples', 'donor.hubmap_id', { from: 'many', to: 'many' }),
    ],
  }),
]);

describe('describeRelationships', () => {
  it('reports outgoing foreign keys with declared cardinality', () => {
    expect(describeRelationships(hubmap, 'samples')).toEqual([
      {
        direction: 'out',
        target: 'donors',
        fromField: 'donor.hubmap_id',
        toField: 'hubmap_id',
        cardinality: 'many-to-one',
      },
      {
        direction: 'in',
        target: 'datasets',
        fromField: 'donor.hubmap_id',
        toField: 'donor.hubmap_id',
        cardinality: 'many-to-many',
      },
    ]);
  });

  it('flips cardinality on incoming keys so it reads from the entity outward', () => {
    const lines = describeRelationships(hubmap, 'donors');
    expect(lines).toHaveLength(2);
    expect(lines.every((l) => l.direction === 'in')).toBe(true);
    // samples declares many-to-one *towards* donors, so from donors it is one-to-many.
    expect(lines[0]).toMatchObject({ target: 'samples', cardinality: 'one-to-many' });
    expect(lines[1]).toMatchObject({ target: 'datasets', cardinality: 'one-to-many' });
  });

  it('omits cardinality when the package does not declare it', () => {
    const p = pkg([resource('a', { foreignKeys: [fk('a_id', 'b', 'id')] }), resource('b')]);
    expect(describeRelationships(p, 'a')[0].cardinality).toBeUndefined();
  });

  it('returns nothing for an unknown entity, a key-less package, or no package', () => {
    expect(describeRelationships(hubmap, 'nope')).toEqual([]);
    expect(describeRelationships(pkg([resource('penguins')]), 'penguins')).toEqual([]);
    expect(describeRelationships(null, 'donors')).toEqual([]);
  });
});

describe('buildSchemaGraph', () => {
  it('ranks entities by foreign-key depth and dedupes edges', () => {
    const g = buildSchemaGraph(hubmap);
    const rank = Object.fromEntries(g.nodes.map((n) => [n.name, n.rank]));
    expect(rank).toEqual({ donors: 0, samples: 1, datasets: 2 });
    expect(g.rankCount).toBe(3);
    expect(g.maxCols).toBe(1);
    expect(g.edges).toEqual([
      { from: 'samples', to: 'donors', cardinality: 'many-to-one' },
      { from: 'datasets', to: 'donors', cardinality: 'many-to-one' },
      { from: 'datasets', to: 'samples', cardinality: 'many-to-many' },
    ]);
    expect(g.nodes.find((n) => n.name === 'datasets')?.rowCount).toBe(9474);
  });

  it('spreads a star schema across one rank', () => {
    const star = pkg([
      resource('Patient', { rows: 37 }),
      ...['Event', 'Medical Therapy', 'Radiation', 'Surgery'].map((n) =>
        resource(n, { foreignKeys: [fk('research_id', 'Patient', 'research_id')] }),
      ),
    ]);
    const g = buildSchemaGraph(star);
    expect(g.rankCount).toBe(2);
    expect(g.maxCols).toBe(4);
    expect(g.nodes.filter((n) => n.rank === 1).map((n) => n.col)).toEqual([0, 1, 2, 3]);
  });

  it('terminates on a cyclic foreign-key graph', () => {
    const cyclic = pkg([
      resource('a', { foreignKeys: [fk('b_id', 'b', 'id')] }),
      resource('b', { foreignKeys: [fk('a_id', 'a', 'id')] }),
    ]);
    const g = buildSchemaGraph(cyclic);
    expect(g.nodes).toHaveLength(2);
    expect(g.edges).toHaveLength(2);
    expect(g.nodes.every((n) => Number.isFinite(n.rank))).toBe(true);
  });

  it('ignores self references and keys pointing outside the package', () => {
    const p = pkg([
      resource('a', { foreignKeys: [fk('a_id', 'a', 'id'), fk('ghost_id', 'ghost', 'id')] }),
    ]);
    const g = buildSchemaGraph(p);
    expect(g.edges).toEqual([]);
    expect(g.rankCount).toBe(1);
  });

  it('handles an empty or missing package', () => {
    expect(buildSchemaGraph(null)).toEqual({ nodes: [], edges: [], rankCount: 0, maxCols: 0 });
    expect(buildSchemaGraph(pkg([])).nodes).toEqual([]);
  });
});

function interval(min: number, max: number): DataFieldDomain {
  return { entity: 'e', field: 'f', type: 'interval', domain: { min, max }, fieldDescription: '' };
}

function point(values: string[]): DataFieldDomain {
  return { entity: 'e', field: 'f', type: 'point', domain: { values }, fieldDescription: '' };
}

describe('formatIntervalDomain', () => {
  it('renders a numeric range', () => {
    expect(formatIntervalDomain(interval(1, 5))).toBe('1 – 5');
  });

  it('collapses a single-value range', () => {
    expect(formatIntervalDomain(interval(42, 42))).toBe('42');
  });

  it('degrades non-finite bounds from all-null columns', () => {
    // domainCompute.ts leaves these when every value in the column is null.
    expect(formatIntervalDomain(interval(Infinity, -Infinity))).toBe('no values');
    expect(formatIntervalDomain(interval(NaN, NaN))).toBe('no values');
  });

  it('uses compact notation above a million', () => {
    const s = formatIntervalDomain(interval(1_200_000, 4_100_000_000));
    expect(s).toContain('–');
    // Locale-independent proof that compact notation engaged.
    expect(s.length).toBeLessThan('1,200,000 – 4,100,000,000'.length);
  });
});

describe('categoricalValues', () => {
  it('returns every distinct value, uncapped', () => {
    expect(categoricalValues(point(['Lung', 'Kidney', 'Spleen']))).toEqual([
      'Lung',
      'Kidney',
      'Spleen',
    ]);
    // The UI decides what to show; this must not truncate, or the "N values"
    // count on the inline disclosure would lie.
    expect(categoricalValues(point(Array.from({ length: 500 }, (_, i) => `v${i}`)))).toHaveLength(
      500,
    );
  });

  it('drops nulls and blanks that the domain worker lets through', () => {
    const d = point(['a', null, '', 'b'] as unknown as string[]);
    expect(categoricalValues(d)).toEqual(['a', 'b']);
    expect(categoricalValues(point([]))).toEqual([]);
  });
});

describe('relationshipKeyFields', () => {
  it('marks the primary key and both sides of a foreign key', () => {
    // samples: own PK plus the column it points at donors with.
    expect(relationshipKeyFields(hubmap, 'samples')).toEqual(
      new Set(['hubmap_id', 'donor.hubmap_id']),
    );
    // donors: its PK, which is also what samples and datasets reference.
    expect(relationshipKeyFields(hubmap, 'donors')).toEqual(new Set(['hubmap_id']));
  });

  it('excludes fields that are merely unique, which is the point', () => {
    // A timestamp has one distinct value per row, so the manifest flags it
    // `udi:unique` and dataPackageStore.getKeyFields counts it as a key. It is
    // not one — nothing references it — so it must not be badged as such.
    const p = pkg([
      {
        name: 'events',
        path: 'events.csv',
        'udi:row_count': 10,
        schema: {
          primaryKey: ['event_id'],
          foreignKeys: [fk('patient_id', 'Patient', 'research_id')],
          fields: [
            { name: 'event_id', 'udi:unique': true },
            { name: 'patient_id' },
            { name: 'recorded_at', 'udi:unique': true },
          ],
        },
      } as unknown as DataPackageResource,
      resource('Patient'),
    ]);
    const keys = relationshipKeyFields(p, 'events');
    expect(keys).toEqual(new Set(['event_id', 'patient_id']));
    expect(keys.has('recorded_at')).toBe(false);
  });

  it('returns nothing for a package with no keys at all', () => {
    expect(relationshipKeyFields(pkg([resource('penguins')]), 'penguins')).toEqual(new Set());
    expect(relationshipKeyFields(null, 'donors')).toEqual(new Set());
  });
});
