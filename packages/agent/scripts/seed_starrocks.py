#!/usr/bin/env python3
"""Seed a local StarRocks instance from a directory of CSVs.

Companion to dev/starrocks/docker-compose.yml. Reads the directory's
datapackage.json for entity names and field typing (generate one for any CSV
folder with the stdlib-only scripts/gen_datapackage.py; plain CSVs without a
datapackage also work — everything loads as VARCHAR except sniffed numerics),
creates one table per resource, loads rows, and writes the agent's
UDI_QUERY_BACKENDS config.

Usage (from packages/agent):

    uv run --extra starrocks python scripts/seed_starrocks.py            # sample-data/pcx
    uv run --extra starrocks python scripts/seed_starrocks.py <csv-dir> --database mydb

Idempotent: CREATE IF NOT EXISTS + TRUNCATE before load.

ponytail: batched INSERTs — fine to ~100k rows; switch to Stream Load
(HTTP PUT to FE :8030) if seeds outgrow that.
"""

from __future__ import annotations

import argparse
import csv
import json
import re
import sys
import time
from pathlib import Path

_REPO_ROOT = Path(__file__).resolve().parents[3]
_DEFAULT_DATA_DIR = _REPO_ROOT / "sample-data" / "pcx"
_DEFAULT_CONFIG_OUT = Path(__file__).resolve().parents[1] / "starrocks-backends.json"

BATCH_SIZE = 1000


def table_name_for(entity: str) -> str:
    """SQL-safe table name for an entity ("Medical Therapy" -> "medical_therapy")."""
    name = re.sub(r"[^A-Za-z0-9_]+", "_", entity.strip().lower()).strip("_")
    if not name or not name[0].isalpha():
        name = f"t_{name}"
    return name


def connect(host: str, port: int, user: str, password: str, database: str | None = None):
    import pymysql

    return pymysql.connect(
        host=host, port=port, user=user, password=password, database=database,
        autocommit=True,
    )


def wait_for_ready(host: str, port: int, user: str, password: str, timeout: float = 180.0):
    """Poll until the FE answers and at least one BE reports Alive."""
    deadline = time.monotonic() + timeout
    last_error: Exception | None = None
    while time.monotonic() < deadline:
        try:
            conn = connect(host, port, user, password)
            with conn.cursor() as cur:
                cur.execute("SHOW BACKENDS")
                columns = [d[0] for d in cur.description]
                alive_idx = columns.index("Alive")
                if any(str(row[alive_idx]).lower() == "true" for row in cur.fetchall()):
                    return conn
            conn.close()
        except Exception as error:  # noqa: BLE001 - retry on any startup error
            last_error = error
        time.sleep(3)
        print("waiting for StarRocks ...", flush=True)
    raise SystemExit(f"StarRocks not ready after {timeout:.0f}s: {last_error}")


def load_package(data_dir: Path) -> list[dict]:
    """[{entity, table, csv_path, quantitative_fields, row_count}] for the
    directory — from datapackage.json when present, else one entry per CSV."""
    package_path = data_dir / "datapackage.json"
    entries: list[dict] = []
    if package_path.exists():
        package = json.loads(package_path.read_text())
        for resource in package.get("resources", []):
            fields = resource.get("schema", {}).get("fields", [])
            entries.append(
                {
                    "entity": resource["name"],
                    "table": table_name_for(resource["name"]),
                    "csv_path": data_dir / resource["path"],
                    "quantitative": {
                        f["name"]
                        for f in fields
                        if f.get("udi:data_type") == "quantitative"
                    },
                    "row_count": resource.get("udi:row_count"),
                }
            )
    else:
        for csv_path in sorted(data_dir.glob("*.csv")):
            entries.append(
                {
                    "entity": csv_path.stem,
                    "table": table_name_for(csv_path.stem),
                    "csv_path": csv_path,
                    "quantitative": None,  # sniff from data below
                    "row_count": None,
                }
            )
    if not entries:
        raise SystemExit(f"no CSVs or datapackage.json found in {data_dir}")
    return entries


def _is_number(value: str) -> bool:
    value = value.strip()
    if not value:
        return False
    try:
        float(value)
    except ValueError:
        return False
    return value.lower() not in ("nan", "inf", "-inf", "+inf", "infinity")


def read_csv(entry: dict) -> tuple[list[str], list[list[str | None]], set[str]]:
    """(header, rows-with-None-for-empty, quantitative field names)."""
    with open(entry["csv_path"], newline="", encoding="utf-8") as f:
        reader = csv.reader(f)
        header = next(reader)
        raw_rows = [row for row in reader if row]

    quantitative = entry["quantitative"]
    if quantitative is None:
        # No datapackage: a column is numeric when every non-empty value is.
        quantitative = set()
        for i, name in enumerate(header):
            values = [r[i] for r in raw_rows if i < len(r) and r[i].strip()]
            if values and all(_is_number(v) for v in values):
                quantitative.add(name)

    rows: list[list[str | None]] = [
        [(cell if cell.strip() != "" else None) for cell in row] for row in raw_rows
    ]
    return header, rows, quantitative


def _column_type(name: str, quantitative: set[str], rows: list, index: int) -> str:
    if name not in quantitative:
        return "VARCHAR(65533)"
    values = [r[index] for r in rows if r[index] is not None]
    if values and all(re.fullmatch(r"-?\d+", str(v)) for v in values):
        return "BIGINT"
    return "DOUBLE"


def create_and_load(conn, database: str, entry: dict) -> int:
    header, rows, quantitative = read_csv(entry)
    table = entry["table"]
    cols_sql = ", ".join(
        f"`{name}` {_column_type(name, quantitative, rows, i)}"
        for i, name in enumerate(header)
    )
    first = header[0]
    with conn.cursor() as cur:
        cur.execute(
            f"CREATE TABLE IF NOT EXISTS `{database}`.`{table}` ({cols_sql}) "
            f"DUPLICATE KEY(`{first}`) DISTRIBUTED BY HASH(`{first}`) BUCKETS 1 "
            f'PROPERTIES ("replication_num" = "1")'
        )
        cur.execute(f"TRUNCATE TABLE `{database}`.`{table}`")
        placeholders = ", ".join(["%s"] * len(header))
        col_list = ", ".join(f"`{c}`" for c in header)
        insert = f"INSERT INTO `{database}`.`{table}` ({col_list}) VALUES ({placeholders})"
        for start in range(0, len(rows), BATCH_SIZE):
            cur.executemany(insert, rows[start : start + BATCH_SIZE])
        cur.execute(f"SELECT COUNT(*) FROM `{database}`.`{table}`")
        return int(cur.fetchone()[0])


def write_backends_config(
    out_path: Path, database: str, entries: list[dict],
    host: str, port: int, user: str, password: str,
) -> None:
    config = {
        database: {
            "type": "starrocks",
            "connection": {
                "host": host,
                "port": port,
                "user": user,
                "password": password,
                "database": database,
            },
            "tables": {e["entity"]: e["table"] for e in entries},
        }
    }
    existing = {}
    if out_path.exists():
        try:
            existing = json.loads(out_path.read_text())
        except json.JSONDecodeError:
            existing = {}
    existing.update(config)
    out_path.write_text(json.dumps(existing, indent=2) + "\n")


def seed(
    data_dir: Path, database: str,
    host: str = "127.0.0.1", port: int = 9030,
    user: str = "root", password: str = "",
    config_out: Path | None = None,
    only: set[str] | None = None,
) -> list[dict]:
    """Full seed: wait, create db, create+load each table, write config.
    `only` restricts to the named entities. Returns the package entries
    (with loaded counts in 'loaded')."""
    entries = load_package(data_dir)
    if only is not None:
        entries = [e for e in entries if e["entity"] in only]
        missing = only - {e["entity"] for e in entries}
        if missing:
            raise SystemExit(f"entities not found in {data_dir}: {sorted(missing)}")
    conn = wait_for_ready(host, port, user, password)
    try:
        with conn.cursor() as cur:
            cur.execute(f"CREATE DATABASE IF NOT EXISTS `{database}`")
        for entry in entries:
            loaded = create_and_load(conn, database, entry)
            entry["loaded"] = loaded
            expected = entry["row_count"]
            status = "OK" if expected in (None, loaded) else f"EXPECTED {expected}!"
            print(f"  {entry['entity']:<20} -> {database}.{entry['table']:<25} {loaded} rows {status}")
    finally:
        conn.close()
    if config_out is not None:
        write_backends_config(config_out, database, entries, host, port, user, password)
        print(f"\nwrote {config_out}")
    return entries


def main() -> None:
    parser = argparse.ArgumentParser(description="Seed StarRocks from a CSV directory.")
    parser.add_argument("data_dir", nargs="?", default=str(_DEFAULT_DATA_DIR),
                        help=f"Directory of CSVs (+ optional datapackage.json). Default: {_DEFAULT_DATA_DIR}")
    parser.add_argument("--database", default=None,
                        help="Target database name (default: the directory name)")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=9030)
    parser.add_argument("--user", default="root")
    parser.add_argument("--password", default="")
    parser.add_argument("--config-out", default=str(_DEFAULT_CONFIG_OUT),
                        help="Where to write the UDI_QUERY_BACKENDS JSON (merged if it exists)")
    args = parser.parse_args()

    data_dir = Path(args.data_dir).resolve()
    if not data_dir.is_dir():
        raise SystemExit(f"not a directory: {data_dir}")
    database = args.database or table_name_for(data_dir.name)

    print(f"seeding {data_dir} -> StarRocks {args.host}:{args.port} database `{database}`")
    seed(
        data_dir, database,
        host=args.host, port=args.port, user=args.user, password=args.password,
        config_out=Path(args.config_out),
    )
    print(
        "\nNext steps:\n"
        f"  agent:  UDI_QUERY_BACKENDS={args.config_out} INSECURE_DEV_MODE=1 "
        "uv run fastapi dev src/udiagent/server/app.py --port 8007\n"
        f"  chat:   add VITE_UDI_REMOTE_PACKAGE={database} to packages/chat/.env.local"
    )


if __name__ == "__main__":
    main()
