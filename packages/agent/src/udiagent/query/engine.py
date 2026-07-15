"""QueryEngine: executes compiled grammar queries against a connector and
returns the client-facing result shape.

Mirrors the toolkit's getDataObject contract (DataSourcesStore.ts):
- display pass: named filters applied (the brushed/filtered result)
- extent pass: named filters skipped (unfiltered rows for stable scale
  domains), only when the pipeline contains a named filter and the caller
  didn't opt out
- displayDataOnly defaults to True when the pipeline ends in a rollup
- row-level (non-aggregated) results are capped, with a truncation flag
"""

from __future__ import annotations

import logging
from typing import Any

from .compiler import PipelineCompiler, ends_in_rollup
from .errors import UnsupportedQueryError
from .kde import gaussian_kde

logger = logging.getLogger(__name__)


DEFAULT_ROW_CAP = 5000


class QueryEngine:
    def __init__(
        self,
        connector,
        table_map: dict[str, str],
        row_cap: int = DEFAULT_ROW_CAP,
    ):
        """
        connector: DuckDBConnector / StarRocksConnector (execute + dialect).
        table_map: entity name -> physical table/view name.
        row_cap: max rows returned for row-level (non-aggregated) results.
        """
        self.connector = connector
        self.table_map = table_map
        self.row_cap = row_cap
        self._columns_cache: dict[str, set] = {}

    # ── public API ───────────────────────────────────────────────────────────

    def run_batch(
        self, queries: list[dict], selections: dict[str, Any] | None = None
    ) -> dict[str, dict]:
        """Run a batched /v1/yac/query request. Each query dict carries
        {vizId, source, transformation?, displayDataOnly?}. Errors are
        per-viz: one failing spec doesn't sink the batch."""
        results: dict[str, dict] = {}
        for query in queries:
            viz_id = query.get("vizId")
            if not viz_id:
                continue
            try:
                results[viz_id] = self.run_query(
                    source=query["source"],
                    transformation=query.get("transformation"),
                    selections=selections,
                    display_data_only=query.get("displayDataOnly"),
                )
            except UnsupportedQueryError as error:
                results[viz_id] = {"error": str(error)}
            except Exception as error:  # noqa: BLE001 - one bad spec (e.g. a
                # SQL error from an unexpected column) must not sink the batch.
                logger.exception("query failed for viz %s", viz_id)
                results[viz_id] = {"error": f"{type(error).__name__}: {error}"}
        return results

    def run_query(
        self,
        source: list[dict] | dict,
        transformation: list[dict] | None = None,
        selections: dict[str, Any] | None = None,
        display_data_only: bool | None = None,
    ) -> dict:
        sources = source if isinstance(source, list) else [source]
        compiler = PipelineCompiler(
            table_map=self.table_map,
            dialect=self.connector.dialect,
            selections=selections,
            probe=self.connector.execute,
            columns_of=self._columns_of,
        )

        # Same default as getDataObject: a trailing rollup yields a small
        # aggregate whose unfiltered twin is rarely consumed.
        if display_data_only is None:
            display_data_only = ends_in_rollup(transformation)

        display = compiler.compile(sources, transformation, skip_named_filters=False)
        display_rows, truncated = self._execute(display)

        result: dict = {
            "displayData": display_rows,
            # Local parity (getDataObject): true when the pipeline CONTAINS a
            # named filter, even if it was skipped / had no active selection.
            "isSubset": display.contains_named_filter,
            "aggregated": display.aggregated or display.kde_post is not None,
        }
        if truncated:
            result["truncated"] = {"cap": self.row_cap, "sampled": False}

        if display.contains_named_filter and not display_data_only:
            extent = compiler.compile(sources, transformation, skip_named_filters=True)
            extent_rows, _ = self._execute(extent)
            result["extent"] = extent_rows
        return result

    # ── internals ────────────────────────────────────────────────────────────

    def _columns_of(self, entity: str) -> set:
        """Cached physical column names for an entity (DESCRIBE)."""
        if entity not in self._columns_cache:
            from .introspect import _describe

            table = self.table_map[entity]
            self._columns_cache[entity] = {
                name for name, _ in _describe(self.connector, table)
            }
        return self._columns_cache[entity]

    def _execute(self, compiled) -> tuple[list[dict], bool]:
        # Aggregated/kde results are small by construction; only cap raw rows.
        cap = None if (compiled.aggregated or compiled.kde_post) else self.row_cap + 1
        if cap is not None:
            # Re-emit with LIMIT; compile() built the SQL without one.
            sql = f"{compiled.sql} LIMIT {cap}"
        else:
            sql = compiled.sql
        rows = self.connector.execute(sql, compiled.params)
        truncated = cap is not None and len(rows) > self.row_cap
        if truncated:
            rows = rows[: self.row_cap]
        if compiled.kde_post:
            rows = self._apply_kde(rows, compiled.kde_post)
        return rows, truncated

    @staticmethod
    def _apply_kde(rows: list[dict], post) -> list[dict]:
        """Per-partition Gaussian KDE over the fetched rows — the Python
        analogue of the toolkit's fast-kde pass."""
        groups: dict[tuple, list[float]] = {}
        for row in rows:
            key = tuple(row.get(g) for g in post.groupby)
            value = row.get(post.field)
            if isinstance(value, (int, float)):
                groups.setdefault(key, []).append(float(value))
        out: list[dict] = []
        for key, values in groups.items():
            for sample, density in gaussian_kde(
                values, bandwidth=post.bandwidth, samples=post.samples
            ):
                item = dict(zip(post.groupby, key))
                item[post.output_sample] = sample
                item[post.output_density] = density
                out.append(item)
        return out
