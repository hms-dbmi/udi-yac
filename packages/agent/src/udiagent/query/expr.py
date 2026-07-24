"""Expr AST -> SQL compiler.

Mirrors the toolkit's exprToArquero.ts, including its dispatch-order caveat:
AggregateExpr optionally carries a `field` prop ({"agg": "max", "field": "g"}),
so the bare field-reference case must be tested LAST.

Specs arrive as untrusted JSON, so this validates at the boundary: unknown
discriminants, operators, aggregate names, and window names all raise instead
of passing through into executable SQL. Literals are emitted as bind
parameters, never interpolated.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Callable

from .errors import UnsupportedQueryError

# UDI op -> SQL operator. `==`/`!=` against a null literal are special-cased
# to IS [NOT] NULL below (SQL `= NULL` is never true).
_BINARY_OPERATORS = {
    "+": "+",
    "-": "-",
    "*": "*",
    "/": "/",
    "%": "%",
    "==": "=",
    "!=": "<>",
    ">": ">",
    ">=": ">=",
    "<": "<",
    "<=": "<=",
    "&&": "AND",
    "||": "OR",
}

_AGGREGATES = {
    "count": "COUNT",
    "sum": "SUM",
    "mean": "AVG",
    "min": "MIN",
    "max": "MAX",
    "median": None,  # dialect-specific, see Dialect.median
}


def is_expr(value: Any) -> bool:
    """Python port of the toolkit's isExpr type guard."""
    if not isinstance(value, dict):
        return False
    return (
        "field" in value
        or "literal" in value
        or ("op" in value and "left" in value and "right" in value)
        or "if" in value
        or "agg" in value
        or "window" in value
    )


@dataclass
class ExprContext:
    """Compilation context for one expression.

    quote: identifier quoting function from the active dialect.
    params: bind-parameter accumulator (appended in emission order).
    placeholder: the dialect's bind placeholder ('?' or '%s').
    agg_window: contents of `OVER (...)` for AggregateExpr nodes, or None
        when aggregates are not allowed here (plain filters). NOTE: Arquero's
        bare count()/max() broadcast the WHOLE partition total regardless of
        table order, so this clause must NOT contain ORDER BY unless a
        rolling frame explicitly asks for one (ORDER BY in an OVER clause
        flips SQL aggregates to a cumulative RANGE frame).
    rank_window: contents of `OVER (...)` for WindowExpr (rank) nodes —
        needs PARTITION BY + ORDER BY.
    median_fn: dialect's median(expr_sql) -> sql.
    """

    quote: Callable[[str], str]
    params: list = field(default_factory=list)
    placeholder: str = "?"
    agg_window: str | None = None
    rank_window: str | None = None
    median_fn: Callable[[str], str] | None = None


def compile_expr(node: Any, ctx: ExprContext) -> str:
    if not isinstance(node, dict):
        raise UnsupportedQueryError(
            f"expected a structured expression object, got {type(node).__name__}"
            + (" (legacy raw expression strings are not supported server-side)"
               if isinstance(node, str) else "")
        )

    # NOTE dispatch order: AggregateExpr optionally carries a `field` prop,
    # so the bare field-reference branch must come LAST.
    if "literal" in node:
        literal = node["literal"]
        if literal is None:
            return "NULL"
        if not isinstance(literal, (str, int, float, bool)):
            raise UnsupportedQueryError("literal must be string, number, boolean, or null")
        ctx.params.append(literal)
        return ctx.placeholder

    if "op" in node:
        op = node.get("op")
        sql_op = _BINARY_OPERATORS.get(op)
        if sql_op is None:
            raise UnsupportedQueryError(f"unsupported operator '{op}'")
        left, right = node.get("left"), node.get("right")
        # `x != null` / `x == null` -> IS [NOT] NULL
        for a, b in ((left, right), (right, left)):
            if isinstance(b, dict) and b.get("literal", "sentinel") is None and op in ("==", "!="):
                inner = compile_expr(a, ctx)
                return f"({inner} IS {'NOT ' if op == '!=' else ''}NULL)"
        return f"({compile_expr(left, ctx)} {sql_op} {compile_expr(right, ctx)})"

    if "if" in node:
        cond = compile_expr(node["if"], ctx)
        then = compile_expr(node["then"], ctx)
        other = compile_expr(node["else"], ctx)
        return f"(CASE WHEN {cond} THEN {then} ELSE {other} END)"

    if "agg" in node:
        name = node["agg"]
        if name not in _AGGREGATES:
            raise UnsupportedQueryError(f"unsupported aggregate '{name}'")
        if ctx.agg_window is None:
            raise UnsupportedQueryError(
                f"aggregate '{name}' is not allowed in this position"
            )
        if name == "count":
            inner = "COUNT(*)"
        else:
            if "field" not in node:
                raise UnsupportedQueryError(f"aggregate '{name}' requires a field")
            col = ctx.quote(node["field"])
            if name == "median":
                if ctx.median_fn is None:
                    raise UnsupportedQueryError("median is not supported in window position")
                inner = ctx.median_fn(col)
            else:
                inner = f"{_AGGREGATES[name]}({col})"
        return f"{inner} OVER ({ctx.agg_window})"

    if "window" in node:
        name = node["window"]
        if name != "rank":
            raise UnsupportedQueryError(f"unsupported window function '{name}'")
        if ctx.rank_window is None or "ORDER BY" not in ctx.rank_window:
            raise UnsupportedQueryError(
                "rank() requires an orderby earlier in the pipeline"
            )
        return f"RANK() OVER ({ctx.rank_window})"

    if "field" in node:
        name = node["field"]
        if not isinstance(name, str) or not name:
            raise UnsupportedQueryError("field name must be a non-empty string")
        return ctx.quote(name)

    raise UnsupportedQueryError(f"unrecognized expression node: {node!r}")


def expr_uses_aggregate(node: Any) -> bool:
    """True if the expression contains any AggregateExpr / WindowExpr node —
    i.e. it needs an OVER clause when compiled in a derive."""
    if not isinstance(node, dict):
        return False
    if "agg" in node or "window" in node:
        return True
    return any(
        expr_uses_aggregate(v)
        for k, v in node.items()
        if k in ("left", "right", "if", "then", "else")
    )
