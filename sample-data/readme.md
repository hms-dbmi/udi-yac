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

## Single source of truth

This `sample-data/` directory (repo root) is the **one** canonical copy of the
dev/test data. It is synced into each frontend's static dir on dev/build by
`scripts/copy-sample-data.mjs` (chat → `packages/chat/public/data`, grammar-app
→ `apps/grammar-app/public/data`); the toolkit's Storybook mounts it via
`staticDirs`. Those `public/data` copies are gitignored — **edit files here, not
there.**

## Contents

| Path                                              | Description                                                                                                                                                   |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `./hubmap/datapackage.json`                       | Full HuBMAP data package (donors, samples, datasets), fetched fresh from `https://portal.hubmapconsortium.org/metadata/v0/udi/`. Chat's default data package. |
| `./hubmap_examples/`                              | Curated HuBMAP subset (TSVs + chart thumbnails) used by the grammar-app examples page.                                                                        |
| `./penguins.csv`                                  | Classic Palmer Penguins test dataset.                                                                                                                         |
| `./donors.csv`, `./samples.csv`, `./datasets.csv` | Loose single-table HuBMAP CSVs used by toolkit stories and grammar-app.                                                                                       |
| `./example_*.csv`, `./match_test_*.csv`           | Small fixtures for tutorial/example specs.                                                                                                                    |

To refresh HuBMAP: re-run the four `curl`s against the portal `/udi/` endpoint
into `./hubmap/`, then set the manifest's `udi:path` back to `"./"`.
