import { describe, it, expect } from 'vitest';
import type { DataFieldDomain, DataPackage, DataPackageResource } from '@/types/dataPackage';
import {
  buildJoinGroups,
  buildSchemaGraph,
  buildSchemaTree,
  categoricalValues,
  countCrossEdges,
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

describe('buildSchemaTree', () => {
  it('nests a star schema under its hub', () => {
    // The case that broke the old SVG: four siblings needed 452px of a 376px panel.
    const star = pkg([
      resource('Patient', { rows: 37 }),
      ...['Event', 'Medical Therapy', 'Radiation', 'Surgery'].map((n) =>
        resource(n, {
          foreignKeys: [fk('research_id', 'Patient', 'research_id', { from: 'many', to: 'one' })],
        }),
      ),
    ]);
    const roots = buildSchemaTree(star);
    expect(roots).toHaveLength(1);
    expect(roots[0].name).toBe('Patient');
    expect(roots[0].rowCount).toBe(37);
    // Siblings keep resource order.
    expect(roots[0].children.map((c) => c.name)).toEqual([
      'Event',
      'Medical Therapy',
      'Radiation',
      'Surgery',
    ]);
    expect(roots[0].children.every((c) => c.cardinality === 'many-to-one')).toBe(true);
    expect(roots[0].children.every((c) => c.otherEdges.length === 0)).toBe(true);
  });

  it('parents a multi-referencing entity to its deepest target and annotates the rest', () => {
    const roots = buildSchemaTree(hubmap);
    expect(roots.map((r) => r.name)).toEqual(['donors']);
    const samples = roots[0].children[0];
    expect(samples.name).toBe('samples');
    // datasets references BOTH donors (rank 0) and samples (rank 1); the deeper
    // one wins, so it nests one level further rather than beside samples.
    const datasets = samples.children[0];
    expect(datasets.name).toBe('datasets');
    expect(datasets.cardinality).toBe('many-to-many');
    expect(datasets.otherEdges.map((e) => e.to)).toEqual(['donors']);
    expect(roots[0].children).toHaveLength(1);
  });

  it('keeps a cyclic package a forest, with the back edge annotated', () => {
    const cyclic = pkg([
      resource('a', { foreignKeys: [fk('b_id', 'b', 'id')] }),
      resource('b', { foreignKeys: [fk('a_id', 'a', 'id')] }),
    ]);
    const roots = buildSchemaTree(cyclic);
    // Both entities appear exactly once — no parent cycle, no infinite nesting.
    const seen: string[] = [];
    const walk = (n: (typeof roots)[number]) => {
      seen.push(n.name);
      n.children.forEach(walk);
    };
    roots.forEach(walk);
    expect(seen.sort()).toEqual(['a', 'b']);
    expect(roots.length).toBeGreaterThanOrEqual(1);
  });

  it('returns every entity as a root when nothing joins', () => {
    const flat = pkg([resource('a'), resource('b')]);
    const roots = buildSchemaTree(flat);
    expect(roots.map((r) => r.name)).toEqual(['a', 'b']);
    expect(roots.every((r) => r.children.length === 0)).toBe(true);
    expect(buildSchemaTree(null)).toEqual([]);
  });
});

describe('countCrossEdges / buildJoinGroups', () => {
  const star = pkg([
    resource('Patient', { rows: 37 }),
    ...['Event', 'Surgery'].map((n) =>
      resource(n, { foreignKeys: [fk('research_id', 'Patient', 'research_id')] }),
    ),
  ]);

  it('reports a pure hierarchy as having nothing demoted', () => {
    expect(countCrossEdges(buildSchemaTree(star))).toBe(0);
  });

  it('counts the foreign keys a tree cannot express', () => {
    // HuBMAP: datasets references both samples and donors, so one is demoted —
    // which is what makes the panel fall back to the join list.
    expect(countCrossEdges(buildSchemaTree(hubmap))).toBe(1);
  });

  it('lists every entity in resource order, joins attached', () => {
    const groups = buildJoinGroups(hubmap);
    // Including donors, which declares no keys — it would otherwise appear only
    // as an arrow head, with its row count nowhere in the map.
    expect(groups.map((g) => g.entity)).toEqual(['donors', 'samples', 'datasets']);
    expect(groups[0]).toMatchObject({ entity: 'donors', rowCount: 499, edges: [] });
    expect(groups[1].edges.map((e) => e.to)).toEqual(['donors']);
    expect(groups[2].edges.map((e) => e.to)).toEqual(['donors', 'samples']);
  });

  it('demotes nothing for a junction table — every parent is listed equally', () => {
    const junction = pkg([
      resource('patient'),
      resource('drug'),
      resource('prescription', {
        foreignKeys: [fk('patient_id', 'patient', 'id'), fk('drug_id', 'drug', 'id')],
      }),
    ]);
    const groups = buildJoinGroups(junction);
    expect(groups.map((g) => g.entity)).toEqual(['patient', 'drug', 'prescription']);
    expect(groups[2].edges.map((e) => e.to)).toEqual(['patient', 'drug']);
    // The tree would have picked one of those two arbitrarily.
    expect(countCrossEdges(buildSchemaTree(junction))).toBe(1);
  });

  it('returns no groups when nothing joins', () => {
    expect(buildJoinGroups(pkg([resource('a'), resource('b')]))).toEqual([]);
    expect(buildJoinGroups(null)).toEqual([]);
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
