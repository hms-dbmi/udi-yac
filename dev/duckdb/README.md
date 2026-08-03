# Local DuckDB for UDI development

The **zero-infrastructure** way to exercise the server-side (remote) query
path — no container, no database process. Data is seeded into a local
`.duckdb` file that the agent opens directly. Behaves identically to the
StarRocks backend (same query compiler, same CSV cleaning), so it's the
easiest option for developers who just want to try or work on remote mode.

The default dataset is `sample-data/penguins/` — a small, well-known example
that ships in the repo, so this quickstart runs with no extra setup. Any other
directory of related CSVs works too (see _Seeding other datasets_ below). For
how the query backend works, see
[`packages/agent/src/udiagent/query/README.md`](../../packages/agent/src/udiagent/query/README.md).

## Quickstart

**One-click (VS Code):** run **Data: Use penguins (remote/DuckDB)** — it seeds
penguins into a local DuckDB file and points the chat at it
(`VITE_UDI_REMOTE_PACKAGE=penguins`) — then **Dev: chat + agent (remote/DuckDB)**
to start the stack (the agent launches with `UDI_QUERY_BACKENDS` set; the plain
**Dev: agent** task does _not_, so remote packages 404 there). Restart the chat
dev server after the data task so it picks up the env change.

Manual equivalent:

```bash
# 1. Seed sample-data/penguins into packages/agent/penguins.duckdb
#    (+ duckdb-backends.json). Instant — no container. From the repo root:
uv run --project packages/agent --extra duckdb \
  python packages/agent/scripts/seed_duckdb.py

# 2. Start the agent pointed at the DuckDB config (WITHOUT UDI_QUERY_BACKENDS
#    the agent has no query backends and every remote package 404s):
UDI_QUERY_BACKENDS=packages/agent/duckdb-backends.json INSECURE_DEV_MODE=1 \
  uv run --project packages/agent --extra server --extra duckdb \
  fastapi dev packages/agent/src/udiagent/server/app.py --port 8007

# 3. Point the chat at it, then start it:
node scripts/set-chat-data-source.mjs penguins --remote   # VITE_UDI_REMOTE_PACKAGE=penguins
pnpm dev:chat
```

The **Data: Regenerate + seed pcx (DuckDB)** task does the same for the team's
`pcx` dataset; for your own CSVs, run the seed command with a directory arg.

To switch the chat **back** to the bundled HuBMAP CSV dumps (browser mode, no
server backend), run the **Data: Use HuBMAP (CSV, browser mode)** task (or
`node scripts/set-chat-data-source.mjs hubmap`).

## How it compares to StarRocks

|                       | DuckDB                                | StarRocks                           |
| --------------------- | ------------------------------------- | ----------------------------------- |
| Setup                 | none — a local file                   | Docker container (`dev/starrocks/`) |
| Seed                  | `seed_duckdb.py` → `<pkg>.duckdb`     | `seed_starrocks.py` → running DB    |
| Config                | `duckdb-backends.json`                | `starrocks-backends.json`           |
| Data cleaning / types | identical (shared seed logic)         | identical                           |
| Best for              | trying/working on remote mode locally | closest to a production OLAP target |

Both seeders share the same CSV reading, sentinel-nulling (e.g.
`"Not Available"` → NULL only in otherwise-numeric columns), type inference,
and foreign-key carry-through, so a package seeded either way produces the
same schema, domains, and query results.

## Seeding other datasets

```bash
uv run --project packages/agent --extra duckdb \
  python packages/agent/scripts/seed_duckdb.py <csv-dir> --database <name>
```

If `<csv-dir>` has a `datapackage.json` (generate one with
`python3 scripts/gen_datapackage.py <csv-dir>`), its entity names, field types,
and `primaryKey`/`foreignKeys` drive the tables and cross-entity filtering.

## Notes

- **Stop the agent before re-seeding.** DuckDB allows only one read-write
  handle on a file; the running server holds it open.
- The seeded `<package>.duckdb` (e.g. `penguins.duckdb`) and
  `duckdb-backends.json` (under `packages/agent/`) are gitignored — regenerate
  them with the seed script.
- The DuckDB driver is an optional extra (`--extra duckdb`); it's also
  included in the `test` extra, so it's already present after
  `uv sync --all-extras`.
