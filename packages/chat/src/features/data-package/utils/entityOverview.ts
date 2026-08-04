/**
 * Pure derivations backing the Data Overview panel: entity relationships,
 * a ranked schema graph for the diagram, and human-readable field domains.
 *
 * Everything here reads the already-loaded `DataPackage` / `DataFieldDomain[]`
 * — no fetching, no queries — so it works identically for CSV-backed packages
 * and server-side (remote) ones.
 */

import type {
  CategoricalDomain,
  DataFieldDomain,
  DataPackage,
  DataPackageResource,
  IntervalDomain,
} from '@/types/dataPackage';

export interface RelationshipLine {
  /** `out`: this entity references `target`. `in`: `target` references it. */
  direction: 'out' | 'in';
  target: string;
  /** Column on the entity being described. */
  fromField: string;
  /** Column on `target`. */
  toField: string;
  /** e.g. `many-to-one`, read from the entity's own perspective. */
  cardinality?: string;
}

export interface SchemaNode {
  name: string;
  /** Distance from a root (an entity with no outgoing foreign keys). */
  rank: number;
  /** Index of this node within its rank. */
  col: number;
  rowCount: number;
}

export interface SchemaEdge {
  from: string;
  to: string;
  cardinality?: string;
}

export interface SchemaGraph {
  nodes: SchemaNode[];
  edges: SchemaEdge[];
  /** Number of ranks (rows) the diagram needs. */
  rankCount: number;
  /** Widest rank, in nodes. */
  maxCols: number;
}

type ForeignKey = NonNullable<DataPackageResource['schema']['foreignKeys']>[number];

/**
 * Only the last column of each side is used, matching
 * `dataPackageStore.getEntityRelationship`.
 * ponytail: composite keys are unsupported there too — widen both together.
 */
function lastField(fields: string[] | undefined): string {
  return fields?.[fields.length - 1] ?? '';
}

function formatCardinality(fk: ForeignKey, flip: boolean): string | undefined {
  const c = fk['udi:cardinality'];
  if (!c) return undefined;
  return flip ? `${c.to}-to-${c.from}` : `${c.from}-to-${c.to}`;
}

/**
 * Foreign keys touching `entity`, in both directions. Outgoing keys come from
 * the entity's own schema; incoming ones are found by scanning every other
 * resource for a reference back to it.
 */
export function describeRelationships(
  dataPackage: DataPackage | null,
  entity: string,
): RelationshipLine[] {
  if (!dataPackage?.resources) return [];
  const lines: RelationshipLine[] = [];

  for (const resource of dataPackage.resources) {
    for (const fk of resource.schema?.foreignKeys ?? []) {
      if (resource.name === entity) {
        lines.push({
          direction: 'out',
          target: fk.reference.resource,
          fromField: lastField(fk.fields),
          toField: lastField(fk.reference.fields),
          cardinality: formatCardinality(fk, false),
        });
      } else if (fk.reference.resource === entity) {
        lines.push({
          direction: 'in',
          target: resource.name,
          fromField: lastField(fk.reference.fields),
          toField: lastField(fk.fields),
          cardinality: formatCardinality(fk, true),
        });
      }
    }
  }

  return lines;
}

/**
 * Lays the package out as ranked rows: entities with no outgoing foreign keys
 * are roots, and every other entity sits one rank below the deepest thing it
 * references. Yields `donors → samples → datasets` for the HuBMAP package and a
 * `Patient` hub above its four child tables for the star-shaped pcx package.
 *
 * ponytail: rank-by-row placement with straight edges — no crossing
 * minimisation. Reach for a layout library only if packages get much denser.
 */
export function buildSchemaGraph(dataPackage: DataPackage | null): SchemaGraph {
  const empty: SchemaGraph = { nodes: [], edges: [], rankCount: 0, maxCols: 0 };
  if (!dataPackage?.resources?.length) return empty;

  const resources = dataPackage.resources;
  const byName = new Map(resources.map((r) => [r.name, r]));

  const targetsOf = (name: string): string[] => {
    const fks = byName.get(name)?.schema?.foreignKeys ?? [];
    return fks.map((fk) => fk.reference.resource).filter((t) => t !== name && byName.has(t));
  };

  // Memoised DFS. `inProgress` makes a cyclic foreign-key graph terminate:
  // a back edge is treated as rank 0 rather than recursing forever.
  const ranks = new Map<string, number>();
  const inProgress = new Set<string>();
  const rankOf = (name: string): number => {
    const cached = ranks.get(name);
    if (cached !== undefined) return cached;
    if (inProgress.has(name)) return 0;
    inProgress.add(name);
    let rank = 0;
    for (const target of targetsOf(name)) {
      rank = Math.max(rank, rankOf(target) + 1);
    }
    inProgress.delete(name);
    ranks.set(name, rank);
    return rank;
  };

  const usedCols = new Map<number, number>();
  const nodes: SchemaNode[] = resources.map((resource) => {
    const rank = rankOf(resource.name);
    const col = usedCols.get(rank) ?? 0;
    usedCols.set(rank, col + 1);
    return { name: resource.name, rank, col, rowCount: resource['udi:row_count'] ?? 0 };
  });

  const edges: SchemaEdge[] = [];
  const seen = new Set<string>();
  for (const resource of resources) {
    for (const fk of resource.schema?.foreignKeys ?? []) {
      const to = fk.reference.resource;
      if (to === resource.name || !byName.has(to)) continue;
      const key = `${resource.name}|${to}`;
      if (seen.has(key)) continue;
      seen.add(key);
      edges.push({ from: resource.name, to, cardinality: formatCardinality(fk, false) });
    }
  }

  return {
    nodes,
    edges,
    rankCount: Math.max(...nodes.map((n) => n.rank)) + 1,
    maxCols: Math.max(...usedCols.values()),
  };
}

function formatNumber(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1e6) {
    return new Intl.NumberFormat(undefined, {
      notation: 'compact',
      maximumFractionDigits: 1,
    }).format(n);
  }
  return new Intl.NumberFormat(undefined, { maximumSignificantDigits: 4 }).format(n);
}

/**
 * One-line summary of a field's domain: `"1.2K – 4.1G"` for a numeric range,
 * `"Lung, Kidney, Spleen +9 more"` for a categorical vocabulary.
 *
 * All-null columns reach us as `{ min: Infinity, max: -Infinity }` from the
 * toolkit's domain worker, so non-finite bounds must degrade, not render.
 */
export function formatFieldDomain(domain: DataFieldDomain, maxCategories = 5): string {
  if (domain.type === 'interval') {
    const { min, max } = domain.domain as IntervalDomain;
    if (!Number.isFinite(min) || !Number.isFinite(max)) return 'no values';
    if (min === max) return formatNumber(min);
    return `${formatNumber(min)} – ${formatNumber(max)}`;
  }

  const { values } = domain.domain as CategoricalDomain;
  const present = (values ?? []).filter((v) => v != null && v !== '');
  if (present.length === 0) return 'no values';
  const head = present.slice(0, maxCategories).map(String);
  const rest = present.length - head.length;
  return rest > 0 ? `${head.join(', ')} +${rest} more` : head.join(', ');
}
