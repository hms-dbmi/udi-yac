import type {
  UDIGrammar,
  RollUp,
  OrderBy,
  DirectionalOrder,
  AggregateFunction,
  FilterExpression,
  Join,
} from './GrammarTypes';

const OP_LABELS: Record<AggregateFunction['op'], string> = {
  count: 'count',
  sum: 'sum',
  mean: 'mean',
  min: 'min',
  max: 'max',
  median: 'median',
  frequency: 'frequency',
};

function describeRollup(rollup: RollUp['rollup']): string {
  const parts = Object.entries(rollup).map(([out, agg]) => {
    const op = OP_LABELS[agg.op] ?? agg.op;
    const of = agg.field ? ` of ${agg.field}` : '';
    return `${op}${of} → ${out}`;
  });
  return `Aggregate: ${parts.join(', ')}`;
}

function describeOrderby(orderby: OrderBy['orderby']): string {
  const one = (o: string | DirectionalOrder): string =>
    typeof o === 'string' ? o : `${o.field}${o.order ? ` (${o.order})` : ''}`;
  const list = Array.isArray(orderby) ? orderby.map(one) : [one(orderby)];
  return `Sort by ${list.join(', ')}`;
}

function describeFilter(filter: FilterExpression): string {
  if (typeof filter === 'string') return `Filter: ${filter}`;
  // FilterDataSelection (brush / cross-chart selection) carries a `name`;
  // the structured Expr AST never does.
  if ('name' in filter) {
    return filter.name
      ? `Filter by selection "${filter.name}"`
      : 'Filter by selection';
  }
  // ponytail: the structured Expr AST filter gets a generic label — rendering
  // arbitrary expressions to prose isn't worth it here. Add a small Expr→text
  // pass if real specs need the condition spelled out.
  return 'Filter rows';
}

function describeJoin(t: Join): string {
  const on = t.join.on;
  const tables = Array.isArray(t.in) ? t.in.join(' + ') : null;
  const onStr = typeof on === 'string' ? ` on ${on}` : '';
  return tables ? `Join ${tables}${onStr}` : `Join tables${onStr}`;
}

/**
 * Human-readable, one-line-per-step summary of a spec's transformation
 * pipeline (group / aggregate / bin / sort / filter / derive / join / kde),
 * for surfacing to users — e.g. an info tooltip explaining how a displayed
 * table or chart was derived. Each transform step is exactly one operator;
 * steps we don't recognise are skipped.
 */
export function describeTransformations(spec: UDIGrammar): string[] {
  const transformation = spec.transformation;
  if (!Array.isArray(transformation)) return [];
  const lines: string[] = [];
  for (const t of transformation) {
    if (t == null || typeof t !== 'object') continue;
    if ('groupby' in t && t.groupby != null) {
      const fields = Array.isArray(t.groupby)
        ? t.groupby.join(', ')
        : t.groupby;
      lines.push(`Group by ${fields}`);
    } else if ('rollup' in t && t.rollup != null) {
      lines.push(describeRollup(t.rollup));
    } else if ('binby' in t && t.binby?.field) {
      const bins = t.binby.bins ? ` into ${t.binby.bins} bins` : '';
      lines.push(`Bin ${t.binby.field}${bins}`);
    } else if ('orderby' in t && t.orderby != null) {
      lines.push(describeOrderby(t.orderby));
    } else if ('filter' in t && t.filter != null) {
      lines.push(describeFilter(t.filter));
    } else if ('derive' in t && t.derive != null) {
      lines.push(`Derive ${Object.keys(t.derive).join(', ')}`);
    } else if ('join' in t && t.join != null) {
      lines.push(describeJoin(t));
    } else if ('kde' in t && t.kde?.field) {
      lines.push(`Density estimate of ${t.kde.field}`);
    }
  }
  return lines;
}
