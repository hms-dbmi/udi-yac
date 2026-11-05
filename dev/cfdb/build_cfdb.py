#!/usr/bin/env python3
"""Build the curated CFDB package from a cfdb DuckDB dump and register it.

Usage (from the repo root):

    uv run --project packages/agent --extra duckdb \
      python dev/cfdb/build_cfdb.py ~/Downloads/cfdb.duckdb

Runs build.sql against the dump (attached read-only) into
packages/agent/cfdb.duckdb, merges backend.json into duckdb-backends.json as
package `cfdb`, and points UDI_QUERY_BACKENDS at it. Stop the agent first:
DuckDB allows only one read-write handle on a file.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import duckdb

_HERE = Path(__file__).resolve().parent
_AGENT_ROOT = _HERE.parents[1] / "packages" / "agent"
sys.path.insert(0, str(_AGENT_ROOT / "scripts"))
from seed_starrocks import set_env_var  # noqa: E402

PACKAGE = "cfdb"


def main() -> None:
    parser = argparse.ArgumentParser(description="Build the curated CFDB package.")
    parser.add_argument("dump", help="Path to the cfdb .duckdb dump (opened read-only)")
    parser.add_argument("--db-path", default=str(_AGENT_ROOT / f"{PACKAGE}.duckdb"))
    parser.add_argument("--config-out", default=str(_AGENT_ROOT / "duckdb-backends.json"),
                        help="UDI_QUERY_BACKENDS JSON to merge the package into")
    args = parser.parse_args()

    dump = Path(args.dump).expanduser().resolve()
    if not dump.is_file():
        raise SystemExit(f"not a file: {dump}")
    db_path = Path(args.db_path).resolve()
    config_out = Path(args.config_out).resolve()
    backend = json.loads((_HERE / "backend.json").read_text())

    print(f"building {dump} -> {db_path} (package `{PACKAGE}`)")
    with duckdb.connect(str(db_path)) as conn:
        # DDL can't take bound parameters; inline the escaped path.
        escaped = str(dump).replace("'", "''")
        conn.execute(f"ATTACH '{escaped}' AS src (READ_ONLY)")
        conn.execute((_HERE / "build.sql").read_text())
        for entity, table in backend["tables"].items():
            rows = conn.execute(f'SELECT count(*) FROM "{table}"').fetchone()[0]
            print(f"  {entity:<12} -> {table:<12} {rows} rows")

    config = json.loads(config_out.read_text()) if config_out.exists() else {}
    config[PACKAGE] = {**backend, "database": str(db_path)}
    config_out.write_text(json.dumps(config, indent=2) + "\n")
    print(f"\nwrote {config_out}")
    set_env_var(_AGENT_ROOT / ".env", "UDI_QUERY_BACKENDS", str(config_out))
    print(
        f"\nNext: node scripts/set-chat-data-source.mjs {PACKAGE} --remote, then restart "
        "the 'Dev: chat + agent' task."
    )


if __name__ == "__main__":
    main()
