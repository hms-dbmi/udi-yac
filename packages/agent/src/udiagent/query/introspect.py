"""Backend metadata introspection: produce the dataSchema / dataDomains the
orchestrator and chat client consume, from the backend itself instead of
browser-side CSV scans.

Output shapes match the existing client-computed contract exactly
(packages/chat dataPackageStore -> dataSchema string; toolkit domain worker ->
dataDomains list), so the orchestrator and completion request path are
unchanged — remote-mode clients just fetch this from GET /v1/yac/metadata.

Cost model: per table — DESCRIBE, COUNT(*), one single-pass stats query,
plus one DISTINCT query per low-cardinality categorical column. Small tables
(<= APPROX_THRESHOLD_ROWS) use exact COUNT(DISTINCT); large ones use
APPROX_COUNT_DISTINCT (DuckDB and StarRocks both have it) with an exact
follow-up only for near-unique columns, so huge tables stay cheap.
"""

from __future__ import annotations

import time
from typing import Any

# Categorical domains larger than this are omitted — mirrors the chat's
# removeLongDomains (dataPackageStore.ts) cap of 80.
DEFAULT_DISTINCT_CAP = 80

# Below this row count, exact COUNT(DISTINCT) is cheap and the approximate
# sketch's small-set error (10%+ observed on a few hundred rows) isn't worth
# it. Above it, use APPROX_COUNT_DISTINCT (~2% error at scale).
APPROX_THRESHOLD_ROWS = 100_000

_NUMERIC_TYPES = (
    "TINYINT", "SMALLINT", "INT", "INTEGER", "BIGINT", "HUGEINT",
    "UTINYINT", "USMALLINT", "UINTEGER", "UBIGINT",
    "FLOAT", "DOUBLE", "REAL", "DECIMAL", "NUMERIC",
)


def _is_numeric(sql_type: str) -> bool:
    upper = sql_type.upper()
    return any(upper.startswith(t) for t in _NUMERIC_TYPES)


def _frictionless_type(sql_type: str) -> str:
    upper = sql_type.upper()
    if _is_numeric(upper):
        return "integer" if any(
            upper.startswith(t)
            for t in ("TINYINT", "SMALLINT", "INT", "BIGINT", "HUGEINT", "U")
        ) else "number"
    if upper.startswith("BOOL"):
        return "boolean"
    if upper.startswith(("DATE", "TIME")):
        return "datetime"
    return "string"


def _describe(connector, table: str) -> list[tuple[str, str]]:
    """[(column_name, sql_type)] — DESCRIBE works on DuckDB and
    StarRocks/MySQL; the result's first two columns are name and type in
    both (column_name/column_type vs Field/Type)."""
    quoted = connector.dialect.quote(table)
    rows = connector.execute(f"DESCRIBE {quoted}")
    out = []
    for row in rows:
        values = list(row.values())
        out.append((str(values[0]), str(values[1])))
    return out


def _approx_count_distinct(dialect, col: str) -> str:
    # Both DuckDB and StarRocks expose APPROX_COUNT_DISTINCT.
    return f"APPROX_COUNT_DISTINCT({col})"


def introspect_table(
    connector, table: str, entity: str, distinct_cap: int = DEFAULT_DISTINCT_CAP
) -> tuple[dict, list[dict]]:
    """Returns (resource_descriptor, field_domains) for one table."""
    q = connector.dialect.quote
    columns = _describe(connector, table)

    row_count = int(
        connector.execute(f"SELECT COUNT(*) AS n FROM {q(table)}")[0]["n"]
    )
    approx = row_count > APPROX_THRESHOLD_ROWS

    # Single stats pass: per-column cardinality (+ min/max for numerics).
    selects = []
    for i, (name, sql_type) in enumerate(columns):
        distinct = (
            _approx_count_distinct(connector.dialect, q(name))
            if approx
            else f"COUNT(DISTINCT {q(name)})"
        )
        selects.append(f"{distinct} AS _c{i}")
        if _is_numeric(sql_type):
            selects.append(f"MIN({q(name)}) AS _mn{i}")
            selects.append(f"MAX({q(name)}) AS _mx{i}")
    stats = connector.execute(f"SELECT {', '.join(selects)} FROM {q(table)}")[0]

    fields: list[dict] = []
    domains: list[dict] = []
    for i, (name, sql_type) in enumerate(columns):
        cardinality = int(stats[f"_c{i}"] or 0)
        # The approximate sketch can undercount, which would misreport unique
        # keys. For near-unique columns, spend one exact query.
        if approx and row_count > 0 and cardinality >= 0.9 * row_count:
            exact = connector.execute(
                f"SELECT COUNT(DISTINCT {q(name)}) AS c FROM {q(table)}"
            )
            cardinality = int(exact[0]["c"])
        numeric = _is_numeric(sql_type)
        data_type = "quantitative" if numeric else "nominal"
        fields.append(
            {
                "name": name,
                "type": _frictionless_type(sql_type),
                "description": "",
                "udi:cardinality": cardinality,
                "udi:unique": row_count > 0 and cardinality >= row_count,
                "udi:data_type": data_type,
            }
        )
        if numeric:
            mn, mx = stats.get(f"_mn{i}"), stats.get(f"_mx{i}")
            if mn is not None and mx is not None:
                domains.append(
                    {
                        "entity": entity,
                        "field": name,
                        "type": "interval",
                        "fieldDescription": "",
                        "domain": {"min": mn, "max": mx},
                    }
                )
        elif 0 < cardinality <= distinct_cap:
            rows = connector.execute(
                f"SELECT DISTINCT {q(name)} AS v FROM {q(table)} "
                f"WHERE {q(name)} IS NOT NULL ORDER BY v LIMIT {distinct_cap + 1}"
            )
            values = [r["v"] for r in rows]
            if len(values) <= distinct_cap:
                domains.append(
                    {
                        "entity": entity,
                        "field": name,
                        "type": "point",
                        "fieldDescription": "",
                        "domain": {"values": values},
                    }
                )

    resource = {
        "name": entity,
        "path": table,
        "schema": {"fields": fields},
        "udi:row_count": row_count,
        "udi:column_count": len(fields),
    }
    return resource, domains


def introspect(
    engine, package_name: str, distinct_cap: int = DEFAULT_DISTINCT_CAP
) -> dict:
    """Introspect every entity in the engine's table_map.

    Returns {"dataSchema": <package descriptor dict>, "dataDomains": [...]}.
    """
    resources = []
    all_domains: list[dict] = []
    for entity, table in engine.table_map.items():
        resource, domains = introspect_table(
            engine.connector, table, entity, distinct_cap
        )
        resources.append(resource)
        all_domains.extend(domains)
    return {
        "dataSchema": {
            "name": package_name,
            "udi:name": package_name,
            "udi:path": "",
            "resources": resources,
        },
        "dataDomains": all_domains,
    }


class MetadataCache:
    """TTL-cached introspection for one engine/package pair.

    get() serves the cached result until `ttl_seconds` elapse; refresh()
    forces re-introspection (e.g. after a data load).
    """

    def __init__(
        self,
        engine,
        package_name: str,
        ttl_seconds: float = 3600.0,
        distinct_cap: int = DEFAULT_DISTINCT_CAP,
    ):
        self.engine = engine
        self.package_name = package_name
        self.ttl_seconds = ttl_seconds
        self.distinct_cap = distinct_cap
        self._value: dict | None = None
        self._fetched_at = 0.0

    def get(self) -> dict:
        if self._value is None or (time.monotonic() - self._fetched_at) > self.ttl_seconds:
            return self.refresh()
        return self._value

    def refresh(self) -> dict:
        self._value = introspect(self.engine, self.package_name, self.distinct_cap)
        self._fetched_at = time.monotonic()
        return self._value
