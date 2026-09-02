# YAC Dataset Format Examples

YAC expects data to be in the form of multiple related tables. The information about the tables and their relationships must be recorded in a frictionless data package file.

Frictionless Data Package: https://datapackage.org/

Frictionless data packages support multiple different types of data resources. However, the only kind that YAC currently supports are Tables

Frictionless Table Schema: https://datapackage.org/standard/table-schema/

YAC expects a few additional fields. They are all prepended with `udi:` for the universal discovery interface project.

At the top level:

| Field      | Description                                                                                                                                         |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `udi:name` | The name of the full data resource. Can be the same as `name`.                                                                                      |
| `udi:path` | The path of the data resources. It is assumed that all data resources are relative to this path. This can be a relative path, or a full remote URL. |

For each table resource:

| Field              | Description                              |
| ------------------ | ---------------------------------------- |
| `udi:row_count`    | The number of rows in the table.         |
| `udi:column_count` | The number of data columns in the table. |

For each data field:

| Field                    | Description                                                                                                 |
| ------------------------ | ----------------------------------------------------------------------------------------------------------- |
| `udi:cardinality`        | The number of unique values in the column.                                                                  |
| `udi:unique`             | `true` if the value is unique for each row, `false` otherwise.                                              |
| `udi:data_type`          | One of `quantitative`, `ordinal`, or `nominal`.                                                             |
| `udi:overlapping_fields` | List of fields that are non-null on at least one row together. If all fields overlap, this should be `all`. |

## Entity relationships (foreignKeys) — modeling guidance

Cross-entity filtering (brushing one chart filters the others) and LLM join
generation resolve relationships from each resource's standard frictionless
`schema.foreignKeys`. Two relationship shapes are supported:

1. **Direct FK** — a table references another (`samples.donor_id →
donors.id`).
2. **Shared-parent siblings (star schema)** — two tables each FK the same
   parent (`Event → Patient ← Surgery`). Their FK columns share the parent's
   key domain, so filters and joins bridge them automatically — no FK
   between the siblings themselves is needed.

**Current limitation — no multi-hop paths.** Relationships are NOT resolved
through chains that require traversing an intermediate table's _rows_, e.g.
two tables linked only through a shared **child** (`donors ← files →
studies`), or chains with different keys per hop (`A.x → B.x`, `B.y → C.y`).
When authoring a data package, model it as a **star schema** where possible:
give every child table an FK directly to the parent(s) it should filter
against, even if that denormalizes a key column. If a table should
cross-filter with another and neither shape above applies, add the linking
key column to one of them.

`scripts/gen_datapackage.py` infers FKs from shared key columns when
generating a `datapackage.json` for a CSV directory; for remote (StarRocks)
packages the seed script carries these FKs into the server config — the
database itself has no FK metadata, so a package without `foreignKeys` gets
no cross-entity filtering at all.

## Single source of truth

This `sample-data/` directory (repo root) is the **one** canonical copy of the
dev/test data. It is synced into each frontend's static dir on dev/build by
`scripts/copy-sample-data.mjs` (chat → `packages/chat/public/data`, grammar-app
→ `apps/grammar-app/public/data`); the toolkit's Storybook mounts it via
`staticDirs`. Those `public/data` copies are gitignored — **edit files here, not
there.**

## Contents

| Path                                    | Description                                                                                                                                                                                                                                                                                                |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `./hubmap/`                             | Full HuBMAP data package (`datapackage.json` + donors/samples/datasets `.tsv`), fetched fresh from `https://portal.hubmapconsortium.org/metadata/v0/udi/`. The **only** copy of HuBMAP in the repo: chat's default package, the toolkit stories' source, and the donors/samples behind the parity goldens. |
| `./hubmap_examples/thumbnails/`         | Pre-rendered chart thumbnails for the grammar-app examples page. The TSVs that once sat beside them were an unmaintained snapshot and are gone — the page's specs read the live portal, or `./hubmap/` offline.                                                                                            |
| `./penguins.csv`                        | Classic Palmer Penguins test dataset (loose CSV used by toolkit stories, parity goldens, and agent tests).                                                                                                                                                                                                 |
| `./penguins/`                           | The same Penguins data as a self-contained package (`penguins.csv` + `datapackage.json`) — the committed default for the server-side query quickstart (`seed_duckdb.py` / `seed_starrocks.py`) and browser mode via `set-chat-data-source.mjs penguins`.                                                   |
| `./example_*.csv`, `./match_test_*.csv` | Small fixtures for tutorial/example specs.                                                                                                                                                                                                                                                                 |

To refresh HuBMAP: re-run the four `curl`s against the portal `/udi/` endpoint
into `./hubmap/`, then set the manifest's `udi:path` back to `"./data/hubmap/"`
(consumers resolve it page-relative, i.e. against the served `/data` mount, not
against the manifest's own location).

Afterwards, regenerate the parity goldens — they read `hubmap/donors.tsv` and
`hubmap/samples.tsv`, so a refresh changes their expected rows:

    pnpm build:toolkit && node packages/grammar/scripts/gen-parity-goldens.mjs
    cd packages/agent && uv run pytest tests/test_query_parity.py

The portal's schema does drift: `assay_type` was dropped in favour of
`dataset_type` / `soft_assaytype`, so check that anything naming a HuBMAP field
(stories, specs, `packages/agent/data/data_domains/hubmap_data_schema.json`)
still resolves.
