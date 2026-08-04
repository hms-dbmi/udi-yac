import { describe, it, expect } from 'vitest';
import type { DataFieldDomain, DataPackage, DataPackageResource } from '@/types/dataPackage';
import { buildSchemaGraph, describeRelationships, formatFieldDomain } from './entityOverview';

type FK = NonNullable<DataPackageResource['schema']['foreignKeys']>[number];

function resource(
  name: string,
  opts: { rows?: number; foreignKeys?: FK[] } = {},
): DataPackageResource {
  return {
    name,
    path: `${name}.tsv`,
    'udi:row_count': opts.rows ?? 10,
    schema: { fields: [], foreignKeys: opts.foreignKeys ?? [] },
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
const hubmap = pkg([
  resource('donors', { rows: 499 }),
  resource('samples', {
    rows: 5044,
    foreignKeys: [fk('donor.hubmap_id', 'donors', 'hubmap_id', { from: 'many', to: 'one' })],
  }),
  resource('datasets', {
    rows: 9474,
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

describe('formatFieldDomain', () => {
  it('renders a numeric range', () => {
    expect(formatFieldDomain(interval(1, 5))).toBe('1 – 5');
  });

  it('collapses a single-value range', () => {
    expect(formatFieldDomain(interval(42, 42))).toBe('42');
  });

  it('degrades non-finite bounds from all-null columns', () => {
    // domainCompute.ts leaves these when every value in the column is null.
    expect(formatFieldDomain(interval(Infinity, -Infinity))).toBe('no values');
    expect(formatFieldDomain(interval(NaN, NaN))).toBe('no values');
  });

  it('uses compact notation above a million', () => {
    const s = formatFieldDomain(interval(1_200_000, 4_100_000_000));
    expect(s).toContain('–');
    // Locale-independent proof that compact notation engaged.
    expect(s.length).toBeLessThan('1,200,000 – 4,100,000,000'.length);
  });

  it('lists leading categories and counts the remainder', () => {
    expect(formatFieldDomain(point(['Lung', 'Kidney', 'Spleen']))).toBe('Lung, Kidney, Spleen');
    const many = point(Array.from({ length: 12 }, (_, i) => `v${i}`));
    expect(formatFieldDomain(many)).toBe('v0, v1, v2, v3, v4 +7 more');
    expect(formatFieldDomain(many, 2)).toBe('v0, v1 +10 more');
  });

  it('drops nulls and blanks that the domain worker lets through', () => {
    const d = point(['a', null, '', 'b'] as unknown as string[]);
    expect(formatFieldDomain(d)).toBe('a, b');
    expect(formatFieldDomain(point([]))).toBe('no values');
  });
});
