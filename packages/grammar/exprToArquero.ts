import type { Expr } from './GrammarTypes';

/**
 * Compiles the backend-neutral expression AST (Expr in GrammarTypes.ts) to an
 * Arquero table-expression string — the same dialect the legacy raw-string
 * derive/filter forms use, so the compiled output flows through the existing
 * executor unchanged.
 *
 * Specs arrive as untrusted JSON (LLM- or user-authored), so this validates at
 * the boundary: unknown discriminants, operators, aggregate names, and window
 * names all throw rather than pass through into an executable expression.
 */

const BINARY_OPERATORS = new Set([
  '+',
  '-',
  '*',
  '/',
  '%',
  '==',
  '!=',
  '>',
  '>=',
  '<',
  '<=',
  '&&',
  '||',
]);

const AGGREGATE_NAMES = new Set([
  'count',
  'sum',
  'mean',
  'min',
  'max',
  'median',
]);

const WINDOW_NAMES = new Set(['rank']);

/**
 * Type guard: is this value a structured expression (vs a legacy raw string,
 * a FilterDataSelection, or a RollingDeriveExpression)? Discriminant keys are
 * disjoint by design: field | literal | op | if | agg | window.
 */
export function isExpr(value: unknown): value is Expr {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    'field' in v ||
    'literal' in v ||
    ('op' in v && 'left' in v && 'right' in v) ||
    'if' in v ||
    'agg' in v ||
    'window' in v
  );
}

function fieldRef(name: string): string {
  if (typeof name !== 'string' || name.length === 0) {
    throw new Error('Expr: field name must be a non-empty string');
  }
  // Escape for a single-quoted Arquero accessor: d['...']
  const escaped = name.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  return `d['${escaped}']`;
}

/**
 * Compile an Expr node to an Arquero expression string. Throws on any node
 * that is not part of the whitelisted AST.
 */
export function exprToArquero(expr: Expr): string {
  if (typeof expr !== 'object' || expr === null) {
    throw new Error(`Expr: expected an expression object, got ${typeof expr}`);
  }

  // NOTE dispatch order: AggregateExpr optionally carries a `field` prop
  // ({agg: 'max', field: 'g'}), so the bare FieldExpr branch must come LAST.
  if ('literal' in expr) {
    const { literal } = expr;
    if (
      literal !== null &&
      typeof literal !== 'string' &&
      typeof literal !== 'number' &&
      typeof literal !== 'boolean'
    ) {
      throw new Error('Expr: literal must be string, number, boolean, or null');
    }
    // JSON encoding is valid in Arquero's JS-expression dialect for all four.
    return JSON.stringify(literal);
  }

  if ('op' in expr) {
    if (!BINARY_OPERATORS.has(expr.op)) {
      throw new Error(`Expr: unsupported operator '${String(expr.op)}'`);
    }
    return `(${exprToArquero(expr.left)} ${expr.op} ${exprToArquero(expr.right)})`;
  }

  if ('if' in expr) {
    return `(${exprToArquero(expr.if)} ? ${exprToArquero(expr.then)} : ${exprToArquero(expr.else)})`;
  }

  if ('agg' in expr) {
    if (!AGGREGATE_NAMES.has(expr.agg)) {
      throw new Error(`Expr: unsupported aggregate '${String(expr.agg)}'`);
    }
    if (expr.agg === 'count') {
      return 'count()';
    }
    if (expr.field === undefined) {
      throw new Error(`Expr: aggregate '${expr.agg}' requires a field`);
    }
    return `${expr.agg}(${fieldRef(expr.field)})`;
  }

  if ('window' in expr) {
    if (!WINDOW_NAMES.has(expr.window)) {
      throw new Error(
        `Expr: unsupported window function '${String(expr.window)}'`,
      );
    }
    return 'rank()';
  }

  if ('field' in expr) {
    return fieldRef(expr.field);
  }

  throw new Error(`Expr: unrecognized expression node ${JSON.stringify(expr)}`);
}
