"""Backend metadata introspection: produce the dataSchema / dataDomains the
orchestrator and chat client consume, from the backend itself instead of
browser-side CSV scans.

Output shapes match the existing client-computed contract exactly
(packages/chat dataPackageStore -> dataSchema string; toolkit domain worker ->
dataDomains list), so the orchestrator and completion request path are
unchanged — remote-mode clients just fetch this from GET /v1/yac/metadata.

Cost model: per table — DESCRIBE, COUNT(*), one single-pass stats query, and
one GROUPING SETS query for the values of every low-cardinality categorical
column at once. Small tables (<= APPROX_THRESHOLD_ROWS) use exact
COUNT(DISTINCT); large ones use APPROX_COUNT_DISTINCT (DuckDB and StarRocks
both have it) with an exact follow-up only for near-unique columns, so huge
tables stay cheap. The query count matters more than what each reads: on
secured StarRocks views every query pays ~60 ms of planning and policy checks,
so a value query per column made a 12-table package take ~12 s.
"""

from __future__ import annotations

import contextvars
import logging
import time
from concurrent.futures import ThreadPoolExecutor
from typing import Any

from .connectors import _POOL_SIZE

logger = logging.getLogger(__name__)

# Categorical domains larger than this are omitted from an introspected
# package. At least vis_generate.MAX_DRAWN_CATEGORIES: a chart can draw that
# many categories, and the chat's filter for one lists the domain's values —
# with no domain it can offer only the values already selected. Independent of
# the chat's own cap: `capLongDomains` (dataPackageStore.ts) trims what a
# package *sends* to the agent, while this decides what a server-side package
# ever collects. Fields over the cap still appear in the schema with no domain,
# which the chat reads as "unverifiable", not "invalid".
DEFAULT_DISTINCT_CAP = 500

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


def _distinct_values(connector, table: str, names: list[str]) -> dict[str, list]:
    """Every distinct non-null value of each column, sorted, from one query.

    GROUPING SETS groups by each column on its own in a single scan, and
    GROUPING(col) is 0 on exactly the rows grouped by that column — which tells
    a column's own NULL apart from the NULLs the other sets fill in. Values keep
    their native types, which a UNION of the columns would not.
    """
    if not names:
        return {}
    q = connector.dialect.quote
    cols = [q(name) for name in names]
    select = ", ".join(
        [f"{c} AS _v{i}" for i, c in enumerate(cols)]
        + [f"GROUPING({c}) AS _g{i}" for i, c in enumerate(cols)]
    )
    sets = ", ".join(f"({c})" for c in cols)
    rows = connector.execute(
        f"SELECT {select} FROM {q(table)} GROUP BY GROUPING SETS ({sets})"
    )
    values: dict[str, list] = {name: [] for name in names}
    for row in rows:
        for i, name in enumerate(names):
            if row[f"_g{i}"] == 0:
                if row[f"_v{i}"] is not None:
                    values[name].append(row[f"_v{i}"])
                break
    for found in values.values():
        found.sort()  # what ORDER BY gave: dates come back as ISO strings
    return values


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

    cardinalities = []
    for i, (name, _sql_type) in enumerate(columns):
        cardinality = int(stats[f"_c{i}"] or 0)
        # The approximate sketch can undercount, which would misreport unique
        # keys. For near-unique columns, spend one exact query.
        if approx and row_count > 0 and cardinality >= 0.9 * row_count:
            exact = connector.execute(
                f"SELECT COUNT(DISTINCT {q(name)}) AS c FROM {q(table)}"
            )
            cardinality = int(exact[0]["c"])
        cardinalities.append(cardinality)

    # The values of every categorical small enough to list, in one query.
    listed = _distinct_values(
        connector,
        table,
        [
            name
            for (name, sql_type), cardinality in zip(columns, cardinalities)
            if not _is_numeric(sql_type) and 0 < cardinality <= distinct_cap
        ],
    )

    fields: list[dict] = []
    domains: list[dict] = []
    for i, ((name, sql_type), cardinality) in enumerate(zip(columns, cardinalities)):
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
        elif name in listed and len(listed[name]) <= distinct_cap:
            # An approximate cardinality can undercount: a column with more
            # values than the cap still gets no domain.
            domains.append(
                {
                    "entity": entity,
                    "field": name,
                    "type": "point",
                    "fieldDescription": "",
                    "domain": {"values": listed[name]},
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


# Configured-schema keys that live on the resource rather than in its schema.
_RESOURCE_LEVEL_EXTRAS = (
    "udi:cube",
    "udi:dimensions",
    "udi:measures",
    "udi:measure_aggregations",
    "udi:linked_dimensions",
)

# Descriptor keys introspection owns; configured package extras can't replace them.
_RESERVED_PACKAGE_KEYS = ("name", "udi:name", "udi:path", "resources")


def introspect(
    engine, package_name: str, distinct_cap: int = DEFAULT_DISTINCT_CAP
) -> dict:
    """Introspect every entity in the engine's table_map.

    Returns {"dataSchema": <package descriptor dict>, "dataDomains": [...]}.
    """
    resources = []
    all_domains: list[dict] = []
    entity_schemas = getattr(engine, "entity_schemas", None) or {}
    # Tables in parallel: each query's cost on a secured view is mostly fixed
    # planning time, not work. A copy of this thread's context per table, so the
    # request's database token (use_db_token) reaches the worker threads.
    entities = list(engine.table_map.items())
    with ThreadPoolExecutor(max_workers=max(1, min(_POOL_SIZE, len(entities)))) as pool:
        futures = [
            pool.submit(
                contextvars.copy_context().run,
                introspect_table,
                engine.connector,
                table,
                entity,
                distinct_cap,
            )
            for entity, table in entities
        ]
        tables = [future.result() for future in futures]
    for (entity, _table), (resource, domains) in zip(entities, tables):
        # Relationship metadata (primaryKey/foreignKeys) isn't introspectable
        # from the database — merge it from the engine's configured schemas so
        # the chat's cross-entity filtering can resolve entity relationships.
        # Nor are descriptions or date formats: `description` is the table's,
        # and `fields` overlays per-column descriptions and `udi:time_format`
        # by name rather than replacing the introspected fields. Nor is
        # `udi:hide_count`, a display choice that sits on the resource.
        extras = dict(entity_schemas.get(entity) or {})
        if description := extras.pop("description", None):
            resource["description"] = description
        if extras.pop("udi:hide_count", False):
            resource["udi:hide_count"] = True
        overlay = {f["name"]: f for f in extras.pop("fields", [])}
        for field in resource["schema"]["fields"]:
            extra = overlay.get(field["name"], {})
            field["description"] = extra.get("description") or ""
            if time_format := extra.get("udi:time_format"):
                field["udi:time_format"] = time_format
        for domain in domains:
            extra = overlay.get(domain["field"], {})
            domain["fieldDescription"] = extra.get("description") or ""
        # Cube roles are resource-level keys in a datapackage descriptor,
        # not schema-level ones — the chat reads them off the resource.
        # Everything else (primaryKey/foreignKeys) belongs in the schema.
        for key in _RESOURCE_LEVEL_EXTRAS:
            if key in extras:
                resource[key] = extras.pop(key)
        resource["schema"].update(extras)
        resources.append(resource)
        all_domains.extend(domains)
    data_schema = {
        "name": package_name,
        "udi:name": package_name,
        "udi:path": "",
        "resources": resources,
    }
    # Package-level metadata a database can't hold (`udi:prefer`), from the
    # engine's configuration, as the per-entity extras above are.
    for key, value in (getattr(engine, "package_extras", None) or {}).items():
        if key in _RESERVED_PACKAGE_KEYS:
            logger.warning("package extra %r ignored: introspection sets it", key)
            continue
        data_schema[key] = value
    return {"dataSchema": data_schema, "dataDomains": all_domains}


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
