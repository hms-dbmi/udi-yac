# Server-side query layer (`udiagent.query`)

Compiles UDI grammar **transformation pipelines** to SQL and executes them
against a configured database (StarRocks, DuckDB), so data can live on the
server instead of being loaded into the browser. This is the backend half of
UDI's "server-side data" mode.

This document explains **how it works** (for collaborators) and **how to
integrate it** (for downstream consumers embedding the chat or the agent
library).

---

## 1. The big picture: two compilers, one grammar

A UDI visualization spec has three parts — `source`, `transformation`,
`representation`. The `transformation` array is a linear pipeline of tagged
ops (`groupby`, `rollup`, `binby`, `join`, `derive`, `filter`, `orderby`,
`kde`). That pipeline is executed by one of **two interchangeable compilers**
that share the same grammar and must produce the same results:

|             | Compiler A (client)                                                   | Compiler B (server)                                                 |
| ----------- | --------------------------------------------------------------------- | ------------------------------------------------------------------- |
| Location    | `packages/grammar/DataSourcesStore.ts` (`PerformDataTransformations`) | `packages/agent/src/udiagent/query/` (this module)                  |
| Engine      | Arquero over in-browser tables                                        | SQL over a database connector                                       |
| Mode        | **interactive** — live per-brush-tick filtering                       | **remote** (non-interactive) — round-trip per committed interaction |
| Expressions | `Expr` AST → Arquero (`exprToArquero.ts`)                             | `Expr` AST → SQL (`query/expr.py`)                                  |

**Compiler A is the reference semantics.** Compiler B must match it. Parity
is enforced by golden tests: `packages/grammar/scripts/gen-parity-goldens.mjs`
runs representative specs through the _real_ Arquero executor headless and
writes `packages/agent/tests/goldens/parity.json`;
`packages/agent/tests/test_query_parity.py` replays them through this SQL
engine (on DuckDB, and on live StarRocks when `UDI_STARROCKS_TEST=1`) and
asserts identical rows. **Change transformation semantics → regenerate the
goldens.**

The client chooses its compiler per data package: a package backed by a
server declares itself remote, and the toolkit routes `queryData` through a
`QueryBackend` that POSTs to this server (`packages/grammar/queryBackend.ts`)
instead of running Arquero.

---

## 2. Module layout

```
query/
  expr.py         Expr AST → SQL (mirrors exprToArquero.ts, same dispatch caveats)
  compiler.py     DataTransformation[] → one CTE-chain SQL statement (PipelineCompiler)
  connectors.py   DuckDBConnector / StarRocksConnector + per-dialect quoting/median
  engine.py       QueryEngine — runs a spec, returns the client-facing result shape
  kde.py          Gaussian KDE post-processing (no SQL equivalent)
  introspect.py   Backend → dataSchema/dataDomains + MetadataCache (TTL)
  errors.py       UnsupportedQueryError
```

### 2.1 `PipelineCompiler` (`compiler.py`)

Walks the `transformation` array and emits **one SQL statement built as a CTE
chain** — each op becomes a CTE that reads the previous one. It tracks a small
amount of state to mirror Arquero exactly:

- `groupby` is **deferred** — consumed by the next `rollup` (`GROUP BY`) or by
  a `derive` containing aggregates (`PARTITION BY` window).
- `orderby` is tracked as state; window functions (`rank`, `rolling`) and the
  final `SELECT` use it.
- `rollup` ops map to SQL aggregates; `frequency` = count normalized by the
  grand total; `median` is dialect-specific.
- `binby` computes bin edges from the **unfiltered** pipeline prefix (a probe
  query with named filters skipped) so brushing doesn't shift histogram bins —
  bin math is a verbatim port of Arquero's `op.bins`.
- `derive`/`filter` carry the structured `Expr` AST (never raw Arquero
  strings — those are rejected). Compiled by `expr.py`, which validates at the
  boundary: unknown ops/aggregates/windows raise; literals are bind
  parameters, never interpolated.
- **Named filters** (`{filter: {name, source, entityRelationship?, match?}}`)
  resolve against the request's `selections`. Same-entity → a predicate;
  cross-entity → a semi-join on `entityRelationship` (`targetKey IN (SELECT
originKey FROM source WHERE pred)`); `match: 'all'` → `GROUP BY originKey
HAVING count(matching) = count(total)`. An empty point value-list means **no
  constraint** on that field (matches Arquero), not "match nothing".
- `kde` must be the last op; the engine post-processes its rows in Python.

### 2.2 `QueryEngine` (`engine.py`)

`QueryEngine(connector, table_map, row_cap=5000, entity_schemas=None)`.

- `table_map`: entity name → physical table/view name (entity names may
  contain spaces; table names are SQL-safe).
- `entity_schemas`: per-entity `primaryKey`/`foreignKeys` that **can't be
  introspected from the database** — merged into the schema by `introspect()`
  (see §4); the chat's cross-entity filtering depends on them.

`run_query(source, transformation?, selections?, display_data_only?, offset?)`
returns the client-facing result:

```jsonc
{
  "displayData": [ ...rows... ],      // the filtered/brushed result
  "isSubset": true,                    // pipeline CONTAINS a named filter (Arquero parity)
  "aggregated": true,                  // rollup/kde output (a "cube"), vs row-level
  "extent": [ ...rows... ],            // OPTIONAL: unfiltered rows for stable axis domains
  "truncated": { "cap": 5000, "sampled": false }  // OPTIONAL: row-level result was capped
}
```

- **display vs extent** mirrors the toolkit's `displayData`/`allData`: the
  extent pass (named filters skipped) is only run when the pipeline has a
  named filter and the caller didn't opt out. `display_data_only` defaults to
  `true` when the pipeline ends in a rollup (the aggregate's unfiltered twin
  is rarely consumed).
- **Row cap**: aggregated results are small by construction and never capped;
  row-level results are limited to `row_cap` and flagged `truncated`.
  `offset` pages past the cap ("load more") — deterministic only when the
  spec orders by a unique key.

`run_batch(queries, selections)` runs many specs in one call and returns
`{ vizId: result }`. **Per-viz error isolation**: a spec that fails (e.g. an
unsupported construct) yields `{ "error": "..." }` for that `vizId` only; the
rest of the batch still returns.

### 2.3 Connectors (`connectors.py`)

Each connector exposes `execute(sql, params) -> list[dict]` plus a `dialect`
(identifier quoting, bind placeholder, `median`). Both DB drivers are
**optional extras** (lazy-imported).

- `DuckDBConnector(database=":memory:", views={entity: csv_path})` — in-process
  DuckDB; `views` registers CSV/Parquet files as views. Doubles as the parity
  test backend. Extra: `duckdb`.
- `StarRocksConnector(host, port=9030, user="root", password="", database=None)`
  — MySQL wire protocol via `pymysql`; backtick quoting, `%s` placeholder,
  `PERCENTILE_APPROX` median. The connection is long-lived and self-heals
  (ping-with-reconnect + one retry, lock-serialized for the FastAPI
  threadpool). Extra: `starrocks`.

### 2.4 Introspection (`introspect.py`)

`introspect(engine, package_name)` produces `{dataSchema, dataDomains}` in
**exactly the shape the browser used to compute from CSVs** — so the
orchestrator and chat need no changes. Per table: `DESCRIBE` + one stats pass
(`COUNT(*)`, per-column cardinality, numeric min/max) + one `DISTINCT` query
per low-cardinality categorical (≤ 80 distinct, matching the chat's
`removeLongDomains`). Cardinality is exact below 100k rows, approximate
(`APPROX_COUNT_DISTINCT`) above. `MetadataCache` wraps it with a TTL.

Foreign keys and primary keys are **merged in from `entity_schemas`**, because
the database stores no FK constraints — this is what makes cross-entity
filtering work in remote mode.

---

## 3. Integration: standing up a query backend

### 3.1 Configure backends (`UDI_QUERY_BACKENDS`)

Set the env var to a JSON file mapping **package name → backend spec**. The
reference server loads it at startup (`server/app.py` `_load_query_engines`).
The key `default` (or a package with no explicit match) serves requests whose
`package` doesn't match a configured one.

```jsonc
{
  "pcx": {
    "type": "starrocks", // or "duckdb"
    "connection": {
      // starrocks: pymysql kwargs
      "host": "127.0.0.1",
      "port": 9030,
      "user": "root",
      "password": "",
      "database": "pcx",
    },
    "tables": {
      // entity name → physical table
      "Patient": "patient",
      "Event": "event",
      "Surgery": "surgery",
    },
    "rowCap": 5000, // optional (default 5000)
    "schemas": {
      // optional but REQUIRED for cross-entity filtering
      "Event": {
        "foreignKeys": [
          {
            "fields": ["research_id"],
            "reference": { "resource": "Patient", "fields": ["research_id"] },
          },
        ],
      },
      "Patient": { "primaryKey": ["research_id"] },
    },
  },
}
```

DuckDB has two forms:

- **Seeded file (recommended)** — `{ "type": "duckdb", "database":
"/abs/pcx.duckdb", "tables": { "Event": "event" }, "schemas": { ... } }`.
  Tables are pre-loaded with the same cleaning as StarRocks (sentinel-nulling,
  typing), so results match. Produced by `seed_duckdb.py`.
- **In-memory CSV views** — `{ "type": "duckdb", "database": ":memory:",
"views": { "event": "/abs/event.csv" }, "tables": { "Event": "event" } }`.
  Reads CSVs live via `read_csv_auto` — no seeding, but **no sentinel
  cleaning**, so mixed numeric/placeholder columns (e.g. `"Not Available"` in
  a date column) type as text and won't brush. Handy for quick tests.

Then run the server with the extras and the env var:

```bash
UDI_QUERY_BACKENDS=/path/to/backends.json INSECURE_DEV_MODE=1 \
  uv run --project packages/agent --extra server --extra starrocks \
  fastapi dev packages/agent/src/udiagent/server/app.py --port 8007
```

Related env var: `UDI_METADATA_TTL_SECONDS` (default `3600`) — introspection
cache TTL.

**Generating the config for a CSV dataset.** Two seeders write this config for
you, carrying `foreignKeys`/`primaryKey` from the directory's
`datapackage.json` into `schemas` and applying identical CSV cleaning:

- `packages/agent/scripts/seed_duckdb.py` → a local `.duckdb` file +
  `duckdb-backends.json`. **No container** — the easiest option. See
  `dev/duckdb/README.md`.
- `packages/agent/scripts/seed_starrocks.py` → a running StarRocks database +
  `starrocks-backends.json`. See `dev/starrocks/README.md`.

### 3.2 HTTP contract (for a non-toolkit consumer)

Two JWT-guarded endpoints (dev: `INSECURE_DEV_MODE=1`, `Authorization: Bearer
dev`).

**`GET /v1/yac/metadata?package=<name>&refresh=<0|1>`** — introspected schema
for a package:

```jsonc
{ "package": "pcx", "interactive": false,
  "dataSchema":  { "name": "...", "resources": [ ... ] },   // frictionless + udi: fields
  "dataDomains": [ { "entity": "...", "field": "...", "type": "point|interval",
                     "domain": { "values": [...] } | { "min": n, "max": n } } ] }
```

**`POST /v1/yac/query`** — stateless batched query (every visible viz + the
current selection state, in one request):

```jsonc
// request
{ "package": "pcx",
  "selections": {                              // name → ActiveDataSelection
    "brush1": { "dataSourceKey": "Event", "type": "interval",
                "selection": { "event_date": [1000, 2000] } } },
  "queries": [
    { "vizId": "q1",
      "source": [ { "name": "Event", "source": "event" } ],
      "transformation": [ /* named filter refs brush1, groupby, rollup, ... */ ],
      "displayDataOnly": false,                // optional
      "offset": 0 } ] }                        // optional (load-more paging)

// response
{ "results": {
    "q1": { "displayData": [...], "isSubset": true, "aggregated": true,
            "extent": [...], "truncated": null }
    // or, for a failed spec:  "q1": { "error": "unsupported transformation ..." }
} }
```

The toolkit's remote backend (`packages/grammar/queryBackend.ts`,
`createRemoteBackend`) speaks exactly this — it batches all `queryData` calls
in one tick into a single request and fans results back out by `vizId`.

### 3.3 Wiring the chat (`udi-yac`)

Set **`VITE_UDI_REMOTE_PACKAGE=<name>`** (standalone: env; embedded:
`remotePackage` in `UDIChatConfig`). On load the chat calls
`GET /v1/yac/metadata`, installs the remote `QueryBackend`, and every query —
including brush cross-filtering (committed on mouse-up, with a loading
indicator) — runs on the server via `POST /v1/yac/query`. No CSVs enter the
browser. Takes precedence over `dataPackage`/`dataPackagePath`. `apiBaseUrl`
points at this server.

### 3.4 Using the engine directly (library)

```python
from udiagent.query import DuckDBConnector, QueryEngine
engine = QueryEngine(
    DuckDBConnector(views={"donors": "donors.csv"}),
    table_map={"donors": "donors"},
)
engine.run_query(
    source={"name": "donors", "source": "donors"},
    transformation=[{"groupby": "sex"}, {"rollup": {"n": {"op": "count"}}}],
)
```

---

## 4. Adding a new backend dialect

1. Add a `Dialect` subclass in `connectors.py` (override `quote_char`,
   `placeholder`, `median`).
2. Add a `Connector` class exposing `execute(sql, params) -> list[dict]` and a
   `dialect` attribute; lazy-import the driver; normalize values with
   `_normalize_value`.
3. Register it in `server/app.py` `_engine_from_config` under a new `type`.
4. Add the driver as an optional extra in `pyproject.toml`.
5. Run the parity suite against a live instance (gate it like
   `UDI_STARROCKS_TEST`) — this is the acceptance test for a new dialect.

---

## 5. Known semantic ceilings (documented in code as `ponytail:`)

- **kde** is a Gaussian sum (Silverman bandwidth), visually equivalent to the
  toolkit's `fast-kde` but not bit-identical — excluded from strict parity.
- **median** on StarRocks is `PERCENTILE_APPROX` (approximate).
- **rolling windows / `offset` paging** are only deterministic when ordered by
  a unique key (SQL tie order is unspecified).
- **joins** with same-named keys use `USING`; differently-named non-key column
  collisions error in SQL rather than auto-suffixing like Arquero (`_1`/`_2`).
- **No multi-hop entity paths** — cross-entity filtering resolves direct FKs
  and shared-parent siblings only (see `sample-data/readme.md`).
- **Row-level projection** — remote row tables still `SELECT *`; the
  "relevant fields" table view is a client-side projection.
