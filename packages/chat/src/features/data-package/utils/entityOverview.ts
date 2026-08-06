/**
 * Pure derivations backing the Data Overview panel: entity relationships, the
 * schema graph and the tree the panel renders it as, and readable field domains.
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

export interface SchemaTreeNode {
  name: string;
  rowCount: number;
  /** Cardinality of the edge to this node's parent, read outward. */
  cardinality?: string;
  /**
   * Edges nesting cannot express. Non-empty means this package is a graph, not
   * a hierarchy — see {@link countCrossEdges}, which is what makes the panel
   * render {@link buildJoinGroups} instead of the tree.
   */
  otherEdges: SchemaEdge[];
  children: SchemaTreeNode[];
}

export interface JoinGroup {
  entity: string;
  rowCount: number;
  /** This entity's outgoing foreign keys, in declaration order. Often empty. */
  edges: SchemaEdge[];
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

/**
 * Reshapes the schema graph into a forest for the overview panel.
 *
 * The panel is a ~376px column, so a box-and-line diagram laid out in ranked rows
 * grows past it as soon as one rank is wide — pcx's four children of `Patient`
 * needed 452px. Nesting turns breadth into rows instead, making the rendered
 * width independent of how many entities the package has.
 *
 * Only used when the package really is a hierarchy: each node is parented to the
 * referenced entity with the greatest rank strictly below its own, and any edge
 * left over lands in `otherEdges` — one of those is enough for the panel to show
 * the join list instead. That `<` is what keeps this a forest: parent ranks
 * strictly decrease, so a cyclic package — which `buildSchemaGraph` already
 * terminates on by treating a back edge as rank 0 — drops the back edge into
 * `otherEdges` instead of forming a parent cycle.
 *
 * ponytail: composite keys stay unsupported, matching `describeRelationships`.
 */
export function buildSchemaTree(dataPackage: DataPackage | null): SchemaTreeNode[] {
  const graph = buildSchemaGraph(dataPackage);
  if (graph.nodes.length === 0) return [];

  const rankOf = new Map(graph.nodes.map((n) => [n.name, n.rank]));
  const outgoing = new Map<string, SchemaEdge[]>();
  for (const edge of graph.edges) {
    const list = outgoing.get(edge.from);
    if (list) list.push(edge);
    else outgoing.set(edge.from, [edge]);
  }

  // Resource order, so siblings list the way the package declares them.
  const byName = new Map<string, SchemaTreeNode>(
    graph.nodes.map((n) => [
      n.name,
      { name: n.name, rowCount: n.rowCount, otherEdges: [], children: [] },
    ]),
  );

  const roots: SchemaTreeNode[] = [];
  for (const node of graph.nodes) {
    const self = byName.get(node.name);
    if (!self) continue;

    let parentEdge: SchemaEdge | undefined;
    for (const edge of outgoing.get(node.name) ?? []) {
      const targetRank = rankOf.get(edge.to);
      if (targetRank === undefined || targetRank >= node.rank) continue;
      const bestRank = parentEdge ? rankOf.get(parentEdge.to) : undefined;
      if (bestRank === undefined || targetRank > bestRank) parentEdge = edge;
    }

    for (const edge of outgoing.get(node.name) ?? []) {
      if (edge !== parentEdge) self.otherEdges.push(edge);
    }

    const parent = parentEdge ? byName.get(parentEdge.to) : undefined;
    if (parentEdge && parent) {
      if (parentEdge.cardinality) self.cardinality = parentEdge.cardinality;
      parent.children.push(self);
    } else {
      roots.push(self);
    }
  }

  return roots;
}

/**
 * How many foreign keys the tree had to demote to `otherEdges` — i.e. how far
 * the package is from being a clean hierarchy. Zero means every relationship is
 * expressible as nesting; anything else means the tree is telling a partial
 * story and the panel should show the join list instead.
 */
export function countCrossEdges(nodes: SchemaTreeNode[]): number {
  let total = 0;
  for (const node of nodes) {
    total += node.otherEdges.length + countCrossEdges(node.children);
  }
  return total;
}

/**
 * One entry per entity, each carrying the foreign keys it declares. This is the
 * view for packages that are graphs rather than hierarchies: unlike the tree it
 * demotes nothing, so a junction table's four parents all read equally instead
 * of one becoming an arbitrary parent and the rest becoming footnotes.
 *
 * Every entity gets an entry even when it declares no keys — a pure reference
 * target like HuBMAP's `donors` would otherwise appear only as an arrow head,
 * with no row count anywhere in the map. Resource order, so the list runs
 * parallel to the accordion beneath it.
 *
 * Returns nothing when the package declares no relationships at all: with no
 * edges to add, this would just be a second copy of that accordion.
 */
export function buildJoinGroups(dataPackage: DataPackage | null): JoinGroup[] {
  const graph = buildSchemaGraph(dataPackage);
  if (graph.edges.length === 0) return [];

  const grouped = new Map<string, SchemaEdge[]>();
  for (const edge of graph.edges) {
    const list = grouped.get(edge.from);
    if (list) list.push(edge);
    else grouped.set(edge.from, [edge]);
  }

  return graph.nodes.map((node) => ({
    entity: node.name,
    rowCount: node.rowCount,
    edges: grouped.get(node.name) ?? [],
  }));
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
 * Numeric range for an interval domain: `"1.2K – 4.1G"`.
 *
 * All-null columns reach us as `{ min: Infinity, max: -Infinity }` from the
 * toolkit's domain worker, so non-finite bounds must degrade, not render.
 */
export function formatIntervalDomain(domain: DataFieldDomain): string {
  const { min, max } = domain.domain as IntervalDomain;
  if (!Number.isFinite(min) || !Number.isFinite(max)) return 'no values';
  if (min === max) return formatNumber(min);
  return `${formatNumber(min)} – ${formatNumber(max)}`;
}

/**
 * The distinct values of a categorical (point) domain, cleaned for display.
 *
 * The toolkit's domain worker builds these with `Array.from(new Set(values))`
 * and casts to `string[]` without filtering, so nulls and blanks come through
 * and the count is uncapped — an id-like column can carry one value per row.
 */
export function categoricalValues(domain: DataFieldDomain): string[] {
  const { values } = domain.domain as CategoricalDomain;
  return (values ?? []).filter((v) => v != null && v !== '').map(String);
}

/**
 * Fields that actually act as keys in this entity's relationships: its declared
 * primary key, the columns of its own foreign keys, and the columns other
 * entities point at.
 *
 * Deliberately narrower than `dataPackageStore.getKeyFields`, which also counts
 * any field flagged `udi:unique`. That flag means "no repeated values", which a
 * timestamp column satisfies by accident — marking it a key field is misleading.
 * The store's broader notion still drives the row table's column projection,
 * where an incidentally-unique column is a useful identifier.
 */
export function relationshipKeyFields(
  dataPackage: DataPackage | null,
  entity: string,
): Set<string> {
  const resource = dataPackage?.resources.find((r) => r.name === entity);
  const keys = new Set<string>(resource?.schema?.primaryKey ?? []);
  for (const rel of describeRelationships(dataPackage, entity)) {
    if (rel.fromField) keys.add(rel.fromField);
  }
  return keys;
}
