#!/usr/bin/env python3
"""Seed a local DuckDB database file from a directory of CSVs.

The zero-infrastructure alternative to StarRocks for exercising the
server-side (remote) query path: no container, no server process — just a
`.duckdb` file the agent opens read-only. Produces the SAME cleaned/typed
tables as `seed_starrocks.py` (shared CSV-reading + sentinel-nulling logic),
so both backends behave identically.

Usage (from the repo root):

    uv run --project packages/agent --extra duckdb \
      python packages/agent/scripts/seed_duckdb.py               # sample-data/pcx

    ... python packages/agent/scripts/seed_duckdb.py <csv-dir> --database mydb

Writes the DuckDB file and a `duckdb-backends.json` UDI_QUERY_BACKENDS config.
Idempotent: tables are recreated (CREATE OR REPLACE) each run. Stop the agent
before re-seeding — DuckDB allows only one read-write handle on a file.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

# Reuse the backend-agnostic CSV reading, sentinel-nulling, type inference,
# FK carry-through, and entity naming from the StarRocks seeder — the ONLY
# differences here are the connection (a local file), the plain CREATE TABLE,
# and a duckdb-typed backends config. Ensure the sibling module is importable
# whether run as a script or imported by tests.
sys.path.insert(0, str(Path(__file__).resolve().parent))
from seed_starrocks import (  # noqa: E402
    BATCH_SIZE,
    DEFAULT_NULL_SENTINELS,
    _column_type,
    load_package,
    read_csv,
    table_name_for,
)

_REPO_ROOT = Path(__file__).resolve().parents[3]
_DEFAULT_DATA_DIR = _REPO_ROOT / "sample-data" / "pcx"
_AGENT_ROOT = Path(__file__).resolve().parents[1]
_DEFAULT_CONFIG_OUT = _AGENT_ROOT / "duckdb-backends.json"


def create_and_load(conn, entry: dict, null_sentinels: frozenset[str]) -> int:
    header, rows, quantitative = read_csv(entry, null_sentinels)
    table = entry["table"]
    cols_sql = ", ".join(
        f'"{name}" {_column_type(name, quantitative, rows, i)}'
        for i, name in enumerate(header)
    )
    conn.execute(f'CREATE OR REPLACE TABLE "{table}" ({cols_sql})')
    placeholders = ", ".join(["?"] * len(header))
    col_list = ", ".join(f'"{c}"' for c in header)
    insert = f'INSERT INTO "{table}" ({col_list}) VALUES ({placeholders})'
    for start in range(0, len(rows), BATCH_SIZE):
        conn.executemany(insert, rows[start : start + BATCH_SIZE])
    return int(conn.execute(f'SELECT COUNT(*) FROM "{table}"').fetchone()[0])


def write_backends_config(
    out_path: Path, package: str, db_path: Path, entries: list[dict]
) -> None:
    config = {
        package: {
            "type": "duckdb",
            "database": str(db_path),
            "tables": {e["entity"]: e["table"] for e in entries},
        }
    }
    schemas = {
        e["entity"]: e["schema_extras"] for e in entries if e.get("schema_extras")
    }
    if schemas:
        config[package]["schemas"] = schemas
    existing = {}
    if out_path.exists():
        try:
            existing = json.loads(out_path.read_text())
        except json.JSONDecodeError:
            existing = {}
    existing.update(config)
    out_path.write_text(json.dumps(existing, indent=2) + "\n")


def seed(
    data_dir: Path,
    package: str,
    db_path: Path,
    config_out: Path | None = None,
    null_sentinels: frozenset[str] = DEFAULT_NULL_SENTINELS,
) -> list[dict]:
    """Create+load each table into `db_path`, then write the backends config."""
    import duckdb

    entries = load_package(data_dir)
    db_path.parent.mkdir(parents=True, exist_ok=True)
    conn = duckdb.connect(str(db_path))
    try:
        for entry in entries:
            loaded = create_and_load(conn, entry, null_sentinels)
            entry["loaded"] = loaded
            expected = entry["row_count"]
            status = "OK" if expected in (None, loaded) else f"EXPECTED {expected}!"
            print(f"  {entry['entity']:<20} -> {entry['table']:<25} {loaded} rows {status}")
    finally:
        conn.close()
    if config_out is not None:
        write_backends_config(config_out, package, db_path, entries)
        print(f"\nwrote {config_out}")
    return entries


def main() -> None:
    parser = argparse.ArgumentParser(description="Seed a DuckDB file from a CSV directory.")
    parser.add_argument("data_dir", nargs="?", default=str(_DEFAULT_DATA_DIR),
                        help=f"Directory of CSVs (+ optional datapackage.json). Default: {_DEFAULT_DATA_DIR}")
    parser.add_argument("--database", default=None,
                        help="Package name / DuckDB file stem (default: the directory name)")
    parser.add_argument("--db-path", default=None,
                        help="Path to the .duckdb file (default: packages/agent/<database>.duckdb)")
    parser.add_argument("--config-out", default=str(_DEFAULT_CONFIG_OUT),
                        help="Where to write the UDI_QUERY_BACKENDS JSON (merged if it exists)")
    parser.add_argument("--null-values", default="",
                        help="Extra comma-separated placeholder strings to ingest as NULL "
                             "in otherwise-numeric columns (extends the built-in set)")
    args = parser.parse_args()

    null_sentinels = frozenset(
        DEFAULT_NULL_SENTINELS
        | {v.strip().lower() for v in args.null_values.split(",") if v.strip()}
    )

    data_dir = Path(args.data_dir).resolve()
    if not data_dir.is_dir():
        raise SystemExit(f"not a directory: {data_dir}")
    package = args.database or table_name_for(data_dir.name)
    db_path = Path(args.db_path).resolve() if args.db_path else _AGENT_ROOT / f"{package}.duckdb"

    print(f"seeding {data_dir} -> DuckDB {db_path} (package `{package}`)")
    seed(data_dir, package, db_path, config_out=Path(args.config_out), null_sentinels=null_sentinels)
    print(
        "\nNext steps (no container needed):\n"
        f"  agent:  UDI_QUERY_BACKENDS={args.config_out} INSECURE_DEV_MODE=1 "
        "uv run --project packages/agent --extra server --extra duckdb "
        "fastapi dev packages/agent/src/udiagent/server/app.py --port 8007\n"
        f"  chat:   add VITE_UDI_REMOTE_PACKAGE={package} to packages/chat/.env.local"
    )


if __name__ == "__main__":
    main()
