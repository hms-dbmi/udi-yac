"""DataTransformation[] -> SQL compiler (CTE chain).

Reference semantics are the toolkit's Arquero executor
(packages/grammar/DataSourcesStore.ts PerformDataTransformations); parity is
enforced by tests/goldens/parity.json. Pinned behaviors this must match:

- groupby is DEFERRED state: consumed by the next rollup (GROUP BY) or by
  derives containing aggregates (PARTITION BY windows).
- orderby is tracked as state: windows (rank, rolling) use it in ORDER BY;
  the final SELECT applies the last orderby.
- rank() == SQL RANK() over the current order (ties share, gaps).
- rolling == ROWS BETWEEN <a> PRECEDING AND <b> FOLLOWING over the current
  order (positional frame; default window [-inf, 0] = UNBOUNDED
  PRECEDING .. CURRENT ROW). CAVEAT: positional frames are tie-order
  dependent — Arquero breaks ties by stable row order, SQL guarantees
  nothing — so results only match Arquero exactly when the orderby key is
  unique.
- frequency rollup == count normalized by the grand total.
- distinct rollup == COUNT(DISTINCT field): NULL is absent, not a value. The
  Arquero side subtracts op.distinct's null bucket to match. Rollup-only: the
  {agg: ...} broadcast form deliberately omits it, because
  COUNT(DISTINCT x) OVER () is unsupported on StarRocks.
- binby computes bin edges from the UNFILTERED pipeline prefix (named filters
  skipped) via a probe query, then groups by the bin columns.
- Named filters (FilterDataSelection) resolve against the request's selection
  state; cross-entity via semi-join on entityRelationship, match:'all' via
  GROUP BY .. HAVING count(matching) == count(total).
- kde must be the last transform; the engine post-processes rows in Python.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import Any, Callable

from .errors import UnsupportedQueryError
from .expr import ExprContext, compile_expr, expr_uses_aggregate, is_expr


def arquero_bins(
    min_v: float, max_v: float, maxbins: int = 15, nice: bool = True
) -> tuple[float, float, float]:
    """Verbatim port of arquero's op.bins (src/util/bins.js)."""
    base = 10.0
    logb = math.log(base)

    level = math.ceil(math.log(maxbins) / logb)
    span = (max_v - min_v) or abs(min_v) or 1.0
    # JS Math.round is round-half-up; Python round() is banker's rounding.
    step = base ** (math.floor(math.log(span) / logb + 0.5) - level)
    while math.ceil(span / step) > maxbins:
        step *= base
    for div in (5.0, 2.0):
        v = step / div
        if v >= 0.0 and span / v <= maxbins:
            step = v

    if nice:
        v = math.log(step)
        precision = 0 if v >= 0 else int(-v / logb) + 1
        eps = base ** (-precision - 1)
        v = math.floor(min_v / step + eps) * step
        min_v = v - step if min_v < v else v
        max_v = math.ceil(max_v / step) * step

    return (min_v, min_v + step if max_v == min_v else max_v, step)


@dataclass
class KdePost:
    """Instructions for the engine's Python kde pass."""

    field: str
    bandwidth: float | None
    samples: int
    output_sample: str
    output_density: str
    groupby: list[str]


@dataclass
class CompiledQuery:
    sql: str
    params: list
    #: pipeline ended in a rollup — result is aggregated (cube) data
    aggregated: bool
    #: at least one named filter with an active selection was applied
    applied_named_filter: bool
    #: pipeline contains a named filter transform (whether or not active)
    contains_named_filter: bool
    #: non-None when the pipeline ends in kde: engine must post-process
    kde_post: KdePost | None = None


@dataclass
class _State:
    ctes: list[tuple[str, str]] = field(default_factory=list)
    params: list = field(default_factory=list)
    #: logical table name -> SQL relation reference (quoted table or CTE name)
    env: dict[str, str] = field(default_factory=dict)
    #: SQL relation reference -> its ordered output columns. Only a join needs
    #: this (to alias colliding names), but it has to be threaded through every
    #: step to be correct at the point a join reads a mid-pipeline CTE.
    columns: dict[str, list[str]] = field(default_factory=dict)
    current: str = ""
    current_name: str | None = None
    pending_groupby: list[str] | None = None
    order_by: list[tuple[str, str]] | None = None  # [(field, 'ASC'|'DESC')]
    counter: int = 0
    aggregated: bool = False
    applied_named_filter: bool = False
    contains_named_filter: bool = False
    kde_post: KdePost | None = None


class PipelineCompiler:
    def __init__(
        self,
        table_map: dict[str, str],
        dialect,
        selections: dict[str, Any] | None = None,
        probe: Callable[[str, list], list[dict]] | None = None,
        columns_of: Callable[[str], list] | None = None,
    ):
        """
        table_map: entity name -> physical table/view name.
        dialect: quoting/placeholder/median provider (see connectors).
        selections: name -> ActiveDataSelection ({dataSourceKey, selection, type}).
        probe: executes SQL NOW and returns rows (used for binby extents).
        columns_of: entity name -> physical columns, in table order (a
            join names its output columns from these, so order matters).
            Enables the local
            engine's guard: named filters whose selection fields don't exist
            in the target table are SKIPPED (a brush on one dataset applied to
            another), matching GetMappedArqueroFilter in DataSourcesStore.ts.
        """
        self.table_map = table_map
        self.dialect = dialect
        self.selections = selections or {}
        self.probe = probe
        self.columns_of = columns_of

    # ── public entry ─────────────────────────────────────────────────────────

    def compile(
        self,
        sources: list[dict],
        transformations: list[dict] | None,
        skip_named_filters: bool = False,
        row_limit: int | None = None,
    ) -> CompiledQuery:
        st = self._run(sources, transformations, skip_named_filters)
        sql = self._assemble(st, f"SELECT * FROM {st.current}", row_limit)
        return CompiledQuery(
            sql=sql,
            params=st.params,
            aggregated=st.aggregated,
            applied_named_filter=st.applied_named_filter,
            contains_named_filter=st.contains_named_filter,
            kde_post=st.kde_post,
        )

    # ── pipeline walk ────────────────────────────────────────────────────────

    def _run(
        self,
        sources: list[dict],
        transformations: list[dict] | None,
        skip_named_filters: bool,
        stop_before: int | None = None,
    ) -> _State:
        st = _State()
        for src in sources:
            ref = self._table_ref(src["name"])
            st.env[src["name"]] = ref
            known = self._ordered_columns(src["name"])
            if known is not None:
                st.columns[ref] = known
        first = sources[0]["name"]
        st.current = st.env[first]
        st.current_name = first

        transforms = list(transformations or [])
        if stop_before is not None:
            transforms = transforms[:stop_before]

        for index, transform in enumerate(transforms):
            out_name = transform.get("out")
            if "filter" in transform:
                self._compile_filter(st, transform, skip_named_filters, out_name)
            elif "groupby" in transform:
                gb = transform["groupby"]
                st.pending_groupby = [gb] if isinstance(gb, str) else list(gb)
            elif "rollup" in transform:
                self._compile_rollup(st, transform, out_name)
            elif "orderby" in transform:
                self._compile_orderby(st, transform)
            elif "derive" in transform:
                self._compile_derive(st, transform, out_name)
            elif "join" in transform:
                self._compile_join(st, transform, out_name)
            elif "binby" in transform:
                self._compile_binby(
                    st, transform, sources, transformations, index, out_name
                )
            elif "kde" in transform:
                if index != len(transforms) - 1:
                    raise UnsupportedQueryError(
                        # ponytail: kde-then-more-transforms would need the kde
                        # output fed back into SQL; no template does this.
                        "kde must be the last transformation"
                    )
                spec = transform["kde"]
                output = spec.get("output") or {}
                st.kde_post = KdePost(
                    field=spec["field"],
                    bandwidth=spec.get("bandwidth"),
                    samples=spec.get("samples", 100),
                    output_sample=output.get("sample", "sample"),
                    output_density=output.get("density", "density"),
                    groupby=list(st.pending_groupby or []),
                )
            else:
                raise UnsupportedQueryError(
                    f"unsupported transformation: {sorted(transform.keys())}"
                )
        return st

    def _assemble(self, st: _State, final_select: str, row_limit: int | None = None) -> str:
        if st.order_by:
            final_select += " ORDER BY " + ", ".join(
                f"{self._q(f)} {d}" for f, d in st.order_by
            )
        if row_limit is not None:
            final_select += f" LIMIT {int(row_limit)}"
        if st.ctes:
            cte_sql = ", ".join(f"{name} AS ({sql})" for name, sql in st.ctes)
            return f"WITH {cte_sql} {final_select}"
        return final_select

    # ── helpers ──────────────────────────────────────────────────────────────

    def _q(self, ident: str) -> str:
        return self.dialect.quote(ident)

    def _ordered_columns(self, entity: str) -> list[str] | None:
        """An entity's physical columns, in order, or None when unknown."""
        if self.columns_of is None:
            return None
        try:
            known = self.columns_of(entity)
        except Exception:  # noqa: BLE001 - introspection is best-effort here
            return None
        return list(known) if known else None

    def _table_ref(self, entity: str) -> str:
        table = self.table_map.get(entity)
        if table is None:
            raise UnsupportedQueryError(f"unknown entity '{entity}'")
        return self._q(table)

    def _push(
        self,
        st: _State,
        sql: str,
        logical_name: str | None,
        columns: list[str] | None = None,
    ) -> None:
        st.counter += 1
        name = f"t{st.counter}"
        st.ctes.append((name, sql))
        if columns is not None:
            st.columns[name] = columns
        st.current = name
        if logical_name:
            st.env[logical_name] = name
            st.current_name = logical_name
        elif st.current_name:
            st.env[st.current_name] = name

    def _in_ref(self, st: _State, in_name: Any) -> str:
        if in_name is None:
            if not st.current:
                raise UnsupportedQueryError("pipeline has no current table")
            return st.current
        if isinstance(in_name, str):
            return st.env.get(in_name) or self._table_ref(in_name)
        raise UnsupportedQueryError(f"invalid 'in': {in_name!r}")

    def _expr_ctx(
        self, agg_window: str | None = None, rank_window: str | None = None
    ) -> ExprContext:
        return ExprContext(
            quote=self._q,
            placeholder=self.dialect.placeholder,
            agg_window=agg_window,
            rank_window=rank_window,
            median_fn=self.dialect.median,
        )

    def _partition_clause(self, st: _State) -> str:
        if not st.pending_groupby:
            return ""
        return "PARTITION BY " + ", ".join(self._q(g) for g in st.pending_groupby)

    def _order_clause(self, st: _State) -> str:
        if not st.order_by:
            return ""
        return "ORDER BY " + ", ".join(f"{self._q(f)} {d}" for f, d in st.order_by)

    def _window_clauses(self, st: _State, frame: str | None = None) -> tuple[str, str]:
        """(agg_window, rank_window) for a derive.

        Bare aggregates broadcast the whole-partition total (Arquero
        semantics), so ORDER BY only enters the agg clause when a rolling
        frame explicitly requires it — otherwise SQL would silently switch
        to a cumulative RANGE frame.
        """
        partition = self._partition_clause(st)
        order = self._order_clause(st)
        rank_window = " ".join(p for p in (partition, order) if p)
        if frame:
            if not order:
                raise UnsupportedQueryError("rolling derive requires an orderby first")
            agg_window = " ".join(p for p in (partition, order, frame) if p)
        else:
            agg_window = partition
        return agg_window, rank_window

    # ── selections ───────────────────────────────────────────────────────────

    def _selection_predicate(self, selection: dict, params: list) -> str | None:
        """RangeSelection {f: [lo, hi]} / PointSelection {f: [v, ...]} ->
        SQL predicate over the SOURCE entity's columns."""
        payload = selection.get("selection")
        if not payload:
            return None
        clauses = []
        ph = self.dialect.placeholder
        for fname, value in payload.items():
            col = self._q(fname)
            if (
                selection.get("type") == "interval"
                and isinstance(value, (list, tuple))
                and len(value) == 2
                and all(isinstance(v, (int, float)) for v in value)
            ):
                params.extend([value[0], value[1]])
                clauses.append(f"({col} >= {ph} AND {col} <= {ph})")
            elif isinstance(value, (list, tuple)):
                if not value:
                    # Local parity (PointSelectionToArqueroFilter): an empty
                    # value list means NO constraint on this field — a fully
                    # deselected multiselect, not "match nothing".
                    continue
                params.extend(value)
                clauses.append(f"{col} IN ({', '.join([ph] * len(value))})")
            else:
                raise UnsupportedQueryError(
                    f"malformed selection payload for '{fname}'"
                )
        return " AND ".join(clauses) if clauses else None

    def _entity_columns(self, entity: str | None) -> set | None:
        """Physical column set for an entity, or None when unknowable
        (no columns_of hook, or the name isn't a physical entity)."""
        if self.columns_of is None or entity is None or entity not in self.table_map:
            return None
        # columns_of is ordered (a join names its output from it); set
        # semantics are what this membership guard wants.
        return set(self.columns_of(entity))

    def _named_filter_sql(self, st: _State, filt: dict, in_entity: str | None) -> str | None:
        """FilterDataSelection -> WHERE clause (or None to skip)."""
        selection = self.selections.get(filt.get("name"))
        if selection is None:
            return None
        pred_params: list = []
        pred = self._selection_predicate(selection, pred_params)
        if pred is None:
            return None
        selection_fields = set((selection.get("selection") or {}).keys())

        relationship = filt.get("entityRelationship")
        if not relationship:
            # Local-parity guard (GetMappedArqueroFilter): skip same-entity
            # filters whose selection references columns the target table
            # doesn't have — e.g. a brush on an aggregated output column.
            columns = self._entity_columns(in_entity)
            if columns is not None and not selection_fields <= columns:
                return None
            st.params.extend(pred_params)
            return pred

        origin = self._q(relationship["originKey"])
        target = self._q(relationship["targetKey"])
        source_entity = filt.get("source")
        source_columns = self._entity_columns(source_entity)
        if source_columns is not None:
            missing = selection_fields - source_columns
            if missing:
                # Local parity: Arquero fails compiling the source-table
                # predicate; fail this viz with a clear message instead of a
                # cryptic SQL error.
                raise UnsupportedQueryError(
                    f"selection field(s) {sorted(missing)} not found in "
                    f"source entity '{source_entity}'"
                )
        source_ref = st.env.get(filt.get("source")) or self._table_ref(filt["source"])
        st.params.extend(pred_params)
        if filt.get("match") == "all":
            # Keep target entities whose ENTIRE related set passes the filter.
            return (
                f"{target} IN (SELECT {origin} FROM {source_ref} "
                f"GROUP BY {origin} "
                f"HAVING COUNT(*) = COUNT(CASE WHEN {pred} THEN 1 END))"
            )
        return f"{target} IN (SELECT {origin} FROM {source_ref} WHERE {pred})"

    # ── per-op compilation ───────────────────────────────────────────────────

    def _compile_filter(
        self, st: _State, transform: dict, skip_named: bool, out_name: str | None
    ) -> None:
        filt = transform["filter"]
        in_ref = self._in_ref(st, transform.get("in"))

        if isinstance(filt, str):
            raise UnsupportedQueryError(
                "legacy raw filter strings are not supported server-side; "
                "use the structured expression AST"
            )
        if is_expr(filt):
            if list(filt.keys()) == ["field"]:
                # Bare field filter = truthiness. ponytail: non-null &
                # non-empty-string covers the template usage (categorical
                # fields); numeric 0 stays truthy unlike Arquero — add
                # type-aware truthy via schema if that ever matters.
                col = self._q(filt["field"])
                pred = f"({col} IS NOT NULL AND CAST({col} AS VARCHAR) <> '')"
            else:
                ctx = self._expr_ctx()
                pred = compile_expr(filt, ctx)
                st.params.extend(ctx.params)
            self._push(
                st,
                f"SELECT * FROM {in_ref} WHERE {pred}",
                out_name,
                st.columns.get(in_ref),
            )
            return

        # Named filter (FilterDataSelection)
        st.contains_named_filter = True
        if skip_named:
            return
        # ponytail: the guard uses the entity's PHYSICAL columns. Filters
        # don't change columns, and producers inject named filters at the
        # head of the pipeline; a named filter after a derive/rollup that
        # renames columns would be guarded against stale columns.
        in_entity = transform.get("in") or st.current_name
        pred = self._named_filter_sql(st, filt, in_entity if isinstance(in_entity, str) else None)
        if pred is None:
            return
        st.applied_named_filter = True
        self._push(
            st,
            f"SELECT * FROM {in_ref} WHERE {pred}",
            out_name,
            st.columns.get(in_ref),
        )

    def _compile_rollup(self, st: _State, transform: dict, out_name: str | None) -> None:
        in_ref = self._in_ref(st, transform.get("in"))
        groups = st.pending_groupby or []
        cols = [self._q(g) for g in groups]
        aggs = []
        for out_field, agg in transform["rollup"].items():
            op = agg.get("op")
            out_col = self._q(out_field)
            if op == "count":
                aggs.append(f"COUNT(*) AS {out_col}")
            elif op == "frequency":
                # Arquero: count, then normalize by the grand total.
                aggs.append(f"COUNT(*) * 1.0 / SUM(COUNT(*)) OVER () AS {out_col}")
            elif op in ("sum", "min", "max"):
                aggs.append(f"{op.upper()}({self._q(agg['field'])}) AS {out_col}")
            elif op == "mean":
                aggs.append(f"AVG({self._q(agg['field'])}) AS {out_col}")
            elif op == "median":
                aggs.append(
                    f"{self.dialect.median(self._q(agg['field']))} AS {out_col}"
                )
            elif op == "distinct":
                field = agg.get("field")
                if not field:
                    raise UnsupportedQueryError(
                        "distinct rollup requires a 'field' to count values of"
                    )
                aggs.append(f"COUNT(DISTINCT {self._q(field)}) AS {out_col}")
            else:
                raise UnsupportedQueryError(f"unsupported rollup op '{op}'")
        select_list = ", ".join(cols + aggs)
        sql = f"SELECT {select_list} FROM {in_ref}"
        if cols:
            sql += " GROUP BY " + ", ".join(cols)
        self._push(st, sql, out_name, list(groups) + list(transform["rollup"]))
        st.pending_groupby = None
        st.order_by = None
        st.aggregated = True

    def _compile_orderby(self, st: _State, transform: dict) -> None:
        spec = transform["orderby"]
        items = spec if isinstance(spec, list) else [spec]
        order: list[tuple[str, str]] = []
        for item in items:
            if isinstance(item, str):
                order.append((item, "ASC"))
            else:
                direction = "DESC" if item.get("order") == "desc" else "ASC"
                field = item["field"]
                # grammar-py's .orderby([...]) emits {field: [a, b], order}; a
                # bare {field: str} is the common case. Expand either shape.
                if isinstance(field, list):
                    order.extend((f, direction) for f in field)
                else:
                    order.append((field, direction))
        st.order_by = order
        if transform.get("in") is not None:
            st.current = self._in_ref(st, transform["in"])

    def _compile_derive(self, st: _State, transform: dict, out_name: str | None) -> None:
        in_ref = self._in_ref(st, transform.get("in"))
        cols = []
        for out_field, expr in transform["derive"].items():
            out_col = self._q(out_field)
            if isinstance(expr, str):
                raise UnsupportedQueryError(
                    "legacy raw derive strings are not supported server-side; "
                    "use the structured expression AST"
                )
            if isinstance(expr, dict) and "rolling" in expr:
                inner = expr["rolling"].get("expression")
                frame = self._rolling_frame(expr["rolling"].get("window"))
                agg_window, rank_window = self._window_clauses(st, frame)
                ctx = self._expr_ctx(agg_window=agg_window, rank_window=rank_window)
                cols.append(f"{compile_expr(inner, ctx)} AS {out_col}")
                st.params.extend(ctx.params)
            elif is_expr(expr):
                if expr_uses_aggregate(expr):
                    agg_window, rank_window = self._window_clauses(st)
                    ctx = self._expr_ctx(
                        agg_window=agg_window, rank_window=rank_window
                    )
                else:
                    ctx = self._expr_ctx()
                cols.append(f"{compile_expr(expr, ctx)} AS {out_col}")
                st.params.extend(ctx.params)
            else:
                raise UnsupportedQueryError(f"invalid derive expression: {expr!r}")
        known = st.columns.get(in_ref)
        derived = (
            known + [name for name in transform["derive"] if name not in known]
            if known is not None
            else None
        )
        self._push(
            st, f"SELECT *, {', '.join(cols)} FROM {in_ref}", out_name, derived
        )

    @staticmethod
    def _rolling_frame(window: list | None) -> str:
        if window is None:
            # Arquero rolling default: expanding window [-inf, 0].
            return "ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW"

        def bound(v: Any, *, is_lower: bool) -> str:
            if v is None or (isinstance(v, float) and math.isinf(v)):
                return "UNBOUNDED PRECEDING" if is_lower else "UNBOUNDED FOLLOWING"
            v = int(v)
            if v < 0:
                return f"{-v} PRECEDING"
            if v == 0:
                return "CURRENT ROW"
            return f"{v} FOLLOWING"

        return (
            f"ROWS BETWEEN {bound(window[0], is_lower=True)} "
            f"AND {bound(window[1], is_lower=False)}"
        )

    def _join_columns(
        self,
        left_cols: list[str],
        right_cols: list[str],
        pairs: list[tuple[str, str]],
    ) -> tuple[str, list[str]]:
        """(select list, output column names) for a join, named as Arquero does.

        Left columns keep their order, then the right's; a key matched to a
        column of the same name is emitted once from the left, and any other
        name present on both sides becomes `x_1` (left) and `x_2` (right).
        """
        merged_keys = {a for a, b in pairs if a == b}
        left_set, right_set = set(left_cols), set(right_cols)

        select: list[str] = []
        names: list[str] = []
        for col in left_cols:
            alias = f"{col}_1" if col in right_set and col not in merged_keys else col
            select.append(f"l.{self._q(col)} AS {self._q(alias)}")
            names.append(alias)
        for col in right_cols:
            if col in merged_keys:
                continue  # merged into the left copy, exactly as Arquero does
            alias = f"{col}_2" if col in left_set else col
            select.append(f"r.{self._q(col)} AS {self._q(alias)}")
            names.append(alias)
        return ", ".join(select), names

    def _compile_join(self, st: _State, transform: dict, out_name: str | None) -> None:
        in_names = transform.get("in")
        if not isinstance(in_names, list) or len(in_names) != 2:
            raise UnsupportedQueryError("join requires in: [left, right]")
        left = self._in_ref(st, in_names[0])
        right = self._in_ref(st, in_names[1])
        on = transform["join"]["on"]
        if isinstance(on, str):
            pairs = [(on, on)]
        elif all(isinstance(x, str) for x in on):
            # [left, right]; a single entry means the same name on both sides.
            pairs = [(on[0], on[-1])]
        else:
            pairs = list(zip(on[0], on[1]))

        cond = " AND ".join(f"l.{self._q(a)} = r.{self._q(b)}" for a, b in pairs)
        left_cols, right_cols = st.columns.get(left), st.columns.get(right)

        if left_cols is None or right_cols is None:
            # No introspection to name the columns with. USING at least merges
            # same-name keys on DuckDB; on StarRocks even that leaves both
            # copies, so a shared column downstream is ambiguous either way.
            if all(a == b for a, b in pairs):
                using = ", ".join(self._q(a) for a, _ in pairs)
                sql = f"SELECT * FROM {left} l JOIN {right} r USING ({using})"
            else:
                sql = f"SELECT * FROM {left} l JOIN {right} r ON {cond}"
            self._push(st, sql, out_name)
            return

        # `SELECT *` over a join is unusable: a column on both sides appears
        # twice, and every later reference to it fails — "Column
        # 'organization_name' is ambiguous" on StarRocks, and USING does not
        # save even the join key there (StarRocks returns both copies). So
        # name every column explicitly, using Arquero's rules so both
        # executors produce the same table: a key matched to its own name
        # appears once, and anything else on both sides is suffixed _1 / _2.
        select_list, out_columns = self._join_columns(left_cols, right_cols, pairs)
        sql = f"SELECT {select_list} FROM {left} l JOIN {right} r ON {cond}"
        self._push(st, sql, out_name, out_columns)
        st.pending_groupby = None
        st.order_by = None

    def _compile_binby(
        self,
        st: _State,
        transform: dict,
        sources: list[dict],
        transformations: list[dict] | None,
        index: int,
        out_name: str | None,
    ) -> None:
        spec = transform["binby"]
        fname = spec["field"]
        bins = spec.get("bins", 10)
        nice = spec.get("nice", True)
        output = spec.get("output") or {}
        start = output.get("bin_start", "start")
        end = output.get("bin_end", "end")

        if self.probe is None:
            raise UnsupportedQueryError("binby requires a probe executor")

        # Bin edges come from the UNFILTERED prefix (named filters skipped) so
        # brushing doesn't shift histogram bins — same as the Arquero executor.
        prefix = self._run(sources, transformations, True, stop_before=index)
        prefix.order_by = None  # ORDER BY is invalid under the aggregate probe
        col = self._q(fname)
        probe_sql = self._assemble(
            prefix, f"SELECT MIN({col}) AS mn, MAX({col}) AS mx FROM {prefix.current}"
        )
        rows = self.probe(probe_sql, prefix.params)
        mn = rows[0]["mn"] if rows else None
        mx = rows[0]["mx"] if rows else None
        if mn is None or mx is None:
            raise UnsupportedQueryError(f"binby field '{fname}' has no data")
        bin_min, _bin_max, bin_step = arquero_bins(float(mn), float(mx), bins, nice)

        in_ref = self._in_ref(st, transform.get("in"))
        # Arquero op.bin: step * floor((x - min) / step) + min  (offset 0 / 1)
        expr0 = f"({bin_step!r} * FLOOR(({col} - {bin_min!r}) / {bin_step!r}) + {bin_min!r})"
        expr1 = (
            f"({bin_step!r} * (FLOOR(({col} - {bin_min!r}) / {bin_step!r}) + 1) "
            f"+ {bin_min!r})"
        )
        known = st.columns.get(in_ref)
        binned = (
            known + [c for c in (start, end) if c not in known]
            if known is not None
            else None
        )
        self._push(
            st,
            f"SELECT *, {expr0} AS {self._q(start)}, {expr1} AS {self._q(end)} "
            f"FROM {in_ref}",
            out_name,
            binned,
        )
        st.pending_groupby = [start, end]


def ends_in_rollup(transformations: list[dict] | None) -> bool:
    return bool(transformations) and "rollup" in transformations[-1]
