# Local StarRocks for UDI development

Single-node StarRocks (FE+BE in one container) to exercise the server-side
query backend (`udiagent.query.StarRocksConnector`) end-to-end. For how that
backend works and its full configuration/integration reference, see
[`packages/agent/src/udiagent/query/README.md`](../../packages/agent/src/udiagent/query/README.md).

The default dataset is `sample-data/penguins/` — a small, well-known example
that ships in the repo, so this quickstart runs with no extra data setup. Any
other directory of related CSVs works too (see _Seeding other datasets_).

## Quickstart

```bash
# 1. Start StarRocks (first run pulls a multi-GB image; boot takes ~30-60s —
#    the healthcheck turns healthy when a BE is alive)
docker compose -f dev/starrocks/docker-compose.yml up -d

# 2. Seed it (waits for readiness automatically). From packages/agent:
uv run --extra starrocks python scripts/seed_starrocks.py   # seeds sample-data/penguins -> database `penguins`

# 3. Point the chat at it. Seeding already wrote UDI_QUERY_BACKENDS into
#    packages/agent/.env, so the agent needs no env prefix.
node scripts/set-chat-data-source.mjs penguins --remote   # VITE_UDI_REMOTE_PACKAGE=penguins

# 4. Start the stack (or the "Dev: chat + agent" VS Code task).
pnpm dev:agent
pnpm dev:chat
```

The chat now loads schema/domains from `GET /v1/yac/metadata` (no CSVs enter
the browser) and every query — including brush cross-filtering, committed on
mouse-up — runs on StarRocks via `POST /v1/yac/query`.

**VS Code shortcut:** the **Data: Regenerate + seed pcx** task (Run Task…)
chains steps 1–2 for the team's `pcx` dataset — starts the container,
regenerates `sample-data/pcx/datapackage.json`, and seeds the database — so
re-running after editing the pcx CSVs is one click. Individual `Data: *` tasks
run each step alone. For penguins or your own CSVs, use the seed command above.
To switch the chat **back** to the bundled HuBMAP CSV dumps (browser mode, no
server backend), run **Data: Use HuBMAP (CSV, browser mode)**.

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

## JWT authentication (per-user database access)

The compose file pins **3.5**, which is the first StarRocks release with JWT
authentication. That is what lets the agent forward each caller's own token to
the database instead of sharing one service credential — see
[_Per-user database authentication_](../../packages/agent/src/udiagent/query/README.md#31a-per-user-database-authentication-jwt-passthrough).

`setup_jwt_auth.py` stands in for an identity provider: it generates a throwaway
RSA key, publishes it as a JWKS inside the container, and creates two users —
`alice`, granted the tables, and `bob`, authenticated but granted nothing — so
per-user authorization is observable rather than merely configured.

```bash
# Seed the database the JWT users are granted on
cd packages/agent && uv run --extra starrocks python scripts/seed_starrocks.py \
    ../../sample-data/penguins --database udi_jwt_spike

# Provision the JWKS and the two users
cd ../.. && uv run --project packages/agent python dev/starrocks/setup_jwt_auth.py

# Live test: alice reads, bob is refused BY STARROCKS
cd packages/agent
UDI_STARROCKS_JWT_TEST=1 uv run pytest tests/test_query_parity.py -k jwt -v

# Mint a token by hand (e.g. to curl the agent)
uv run python ../../dev/starrocks/setup_jwt_auth.py --token alice
```

The key and JWKS land in `dev/starrocks/.jwt/`, which is gitignored. Wiping the
container volume also drops the users and the JWKS, so re-run the script after
a `down -v`.

## Housekeeping

```bash
docker compose -f dev/starrocks/docker-compose.yml down        # stop (data kept)
docker compose -f dev/starrocks/docker-compose.yml down -v     # stop + wipe data
mysql -h127.0.0.1 -P9030 -uroot                                # poke around
```

FE web UI: http://localhost:8030 (user `root`, empty password).

Upgrading the pinned image across a major version (e.g. the 3.3 → 3.5 bump that
JWT auth required) is not an in-place operation on a dev volume: run `down -v`
and re-seed rather than trusting the old volume to migrate.
