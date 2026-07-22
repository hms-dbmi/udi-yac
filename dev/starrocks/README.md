# Local StarRocks for UDI development

Single-node StarRocks (FE+BE in one container) to exercise the server-side
query backend (`udiagent.query.StarRocksConnector`) end-to-end. For how that
backend works and its full configuration/integration reference, see
[`packages/agent/src/udiagent/query/README.md`](../../packages/agent/src/udiagent/query/README.md).

The seed data itself is **not** checked into the repo. The default dataset is
`sample-data/pcx/` (de-identified pediatric CNS-tumor tables) — ask a
teammate for the CSVs — but any directory of related CSVs works.

## Quickstart

```bash
# 1. Start StarRocks (first run pulls a multi-GB image; boot takes ~30-60s —
#    the healthcheck turns healthy when a BE is alive)
docker compose -f dev/starrocks/docker-compose.yml up -d

# 2. Seed it (waits for readiness automatically). From packages/agent:
uv sync --extra starrocks
uv run python scripts/seed_starrocks.py            # seeds sample-data/pcx -> database `pcx`

# 3. Point the agent + chat at it
UDI_QUERY_BACKENDS=$(pwd)/starrocks-backends.json INSECURE_DEV_MODE=1 \
  uv run fastapi dev src/udiagent/server/app.py --port 8007
# and in packages/chat/.env.local:
#   VITE_UDI_REMOTE_PACKAGE=pcx
pnpm dev:chat
```

The chat now loads schema/domains from `GET /v1/yac/metadata` (no CSVs enter
the browser) and every query — including brush cross-filtering, committed on
mouse-up — runs on StarRocks via `POST /v1/yac/query`.

**VS Code shortcut:** the **Data: Regenerate + seed pcx** task (Run Task…)
chains steps 1–2 — starts the container, regenerates
`sample-data/pcx/datapackage.json`, and seeds the database — so re-running
after editing the pcx CSVs is one click. Individual `Data: *` tasks run each
step alone.

## Seeding other datasets

`seed_starrocks.py <csv-dir> --database <name>` seeds any directory of CSVs.
If the directory has a `datapackage.json` (generate one with the stdlib-only
`python3 scripts/gen_datapackage.py <csv-dir>` from the repo root), its
entity names and field types drive the table schemas, and its
`primaryKey`/`foreignKeys` are carried into the backends config — the
database itself stores no FK constraints, and the chat's cross-entity
filtering depends on them (served back via `/v1/yac/metadata`). Without a
datapackage, column types are sniffed (all-numeric columns → BIGINT/DOUBLE,
else VARCHAR) and no entity relationships are available. Placeholder strings
("Not Available", "Not Reported", "Unknown", …) in otherwise-numeric columns
are ingested as NULL so those columns stay numeric — extend the set with
`--null-values "Pending,TBD"`; in categorical columns they remain real
values.
Re-running is idempotent (tables are dropped and recreated, so schema changes take effect). Each run merges
its package into `packages/agent/starrocks-backends.json` (gitignored).

Loading uses batched INSERTs — fine for sample-sized data (up to ~100k
rows). For bigger seeds, switch to StarRocks Stream Load.

## Live parity test

With the container up, replay the Arquero-vs-SQL parity goldens against real
StarRocks (seeds `penguins`/`donors`/`samples` into a `udi_parity` database
automatically):

```bash
cd packages/agent
UDI_STARROCKS_TEST=1 uv run pytest tests/test_query_parity.py -v
```

## Housekeeping

```bash
docker compose -f dev/starrocks/docker-compose.yml down        # stop (data kept)
docker compose -f dev/starrocks/docker-compose.yml down -v     # stop + wipe data
mysql -h127.0.0.1 -P9030 -uroot                                # poke around
```

FE web UI: http://localhost:8030 (user `root`, empty password).
