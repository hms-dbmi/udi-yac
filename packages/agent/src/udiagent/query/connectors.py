"""Backend connectors. Each bundles a DB-API-ish `execute` returning rows as
dicts, plus the dialect details the compiler needs (identifier quoting, bind
placeholder, median).

DuckDB doubles as the parity-test backend; StarRocks is the production OLAP
target (MySQL wire protocol via pymysql). Both dependencies are optional
extras — imports are lazy.
"""

from __future__ import annotations

import math
import re
from typing import Any


class Dialect:
    quote_char = '"'
    placeholder = "?"

    def quote(self, identifier: str) -> str:
        if not identifier:
            raise ValueError("empty identifier")
        q = self.quote_char
        return f"{q}{identifier.replace(q, q + q)}{q}"

    def median(self, column_sql: str) -> str:
        return f"MEDIAN({column_sql})"


class DuckDBDialect(Dialect):
    pass


class StarRocksDialect(Dialect):
    quote_char = "`"
    placeholder = "%s"

    def median(self, column_sql: str) -> str:
        # ponytail: PERCENTILE_APPROX is approximate; exact medians on
        # StarRocks need a two-pass approach if precision ever matters.
        return f"PERCENTILE_APPROX({column_sql}, 0.5)"


def _normalize_value(value: Any) -> Any:
    """Make DB values JSON-friendly and parity-comparable."""
    if isinstance(value, float) and math.isnan(value):
        return None
    # duckdb DECIMAL -> Decimal; date/datetime -> isoformat strings
    type_name = type(value).__name__
    if type_name == "Decimal":
        return float(value)
    if type_name in ("date", "datetime", "time", "Timestamp"):
        return value.isoformat()
    return value


_IDENT_RE = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")


class DuckDBConnector:
    """In-process DuckDB. `views` maps entity/table names to CSV/Parquet file
    paths registered as views — handy for tests and file-backed packages."""

    dialect = DuckDBDialect()

    def __init__(self, database: str = ":memory:", views: dict[str, str] | None = None):
        import duckdb  # lazy: optional extra

        self._conn = duckdb.connect(database)
        for name, path in (views or {}).items():
            if not _IDENT_RE.match(name):
                raise ValueError(f"invalid view name: {name!r}")
            # DDL can't take bound parameters; inline the escaped path.
            escaped = str(path).replace("'", "''")
            self._conn.execute(
                f'CREATE OR REPLACE VIEW "{name}" AS '
                f"SELECT * FROM read_csv_auto('{escaped}')"
            )

    def execute(self, sql: str, params: list | None = None) -> list[dict]:
        cursor = self._conn.execute(sql, params or [])
        columns = [d[0] for d in cursor.description]
        return [
            {c: _normalize_value(v) for c, v in zip(columns, row)}
            for row in cursor.fetchall()
        ]


class StarRocksConnector:
    """StarRocks over the MySQL wire protocol (pymysql, `[starrocks]` extra)."""

    dialect = StarRocksDialect()

    def __init__(
        self,
        host: str,
        port: int = 9030,
        user: str = "root",
        password: str = "",
        database: str | None = None,
        **kwargs: Any,
    ):
        import pymysql  # lazy: optional extra
        import pymysql.cursors

        self._conn = pymysql.connect(
            host=host,
            port=port,
            user=user,
            password=password,
            database=database,
            cursorclass=pymysql.cursors.DictCursor,
            autocommit=True,
            **kwargs,
        )

    def execute(self, sql: str, params: list | None = None) -> list[dict]:
        with self._conn.cursor() as cursor:
            cursor.execute(sql, params or [])
            rows = cursor.fetchall()
        return [{c: _normalize_value(v) for c, v in row.items()} for row in rows]
