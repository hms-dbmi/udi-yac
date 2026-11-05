# CFDB demo package (server-side, DuckDB)

Exploratory: serves a local dump of the Common Fund Data Ecosystem DB (C2M2
model; currently the ENCODE and 4DN submissions) to the chat through the
remote query path, so the CVH team can try natural-language charts over it.

The raw C2M2 tables are not chat-ready: values are ontology codes
(`format:3006`, `OBI:0000716`) whose names sit in lookup tables, keys are
composite, and files, samples and subjects connect only through link tables. [`build.sql`](build.sql)
curates them into four tables with direct foreign keys, the shape the chat's
cross-table filtering needs:

| Entity      | Rows    | One row per                                                        |
| ----------- | ------- | ------------------------------------------------------------------ |
| Files       | 892,818 | data file: format, assay, assembly, size, year, species, anatomy   |
| Collections | 42,797  | ENCODE experiment / 4DN experiment set: type, target, lab, anatomy |
| Biosamples  | 5,564   | assayed sample: anatomy, biosample type                            |
| Subjects    | 3,681   | organism or cell line: species                                     |

[`backend.json`](backend.json) is the package configuration: table and column
titles and descriptions (what the LLM reads), keys, and the example prompts.

## Run it

```bash
# 1. Curate the dump into packages/agent/cfdb.duckdb and register package `cfdb`
#    in duckdb-backends.json + UDI_QUERY_BACKENDS (packages/agent/.env).
#    The dump is opened read-only. Stop the agent first: DuckDB allows one writer.
uv run --project packages/agent --extra duckdb \
  python dev/cfdb/build_cfdb.py ~/Downloads/cfdb.duckdb

# 2. Point the chat at it.
node scripts/set-chat-data-source.mjs cfdb --remote

# 3. Start (or restart) the "Dev: chat + agent" task.
```

Switch back with `node scripts/set-chat-data-source.mjs hubmap`. The dump needs
DuckDB 2 (storage version 69), which the agent's `duckdb` extra requires.

## Known simplifications

- A biosample pooled from several subjects (6% of them; up to 47 subjects in
  ENCODE) keeps one representative `subject_id`. Filtering by a Subjects field
  follows that representative, so it can differ from filtering on the
  `species` column of Files, which uses ENCODE's own per-file organism.
- `species` and `anatomy` are copied onto Files, so the commonest questions
  ("files by species") need no join.
- Skipped: projects, the empty demographics (sex, age, ethnicity are blank in
  this dump) and most DCC-specific `*_extra_*` columns.

## Moving off the local file

`build.sql` is plain SQL. To host it elsewhere, run it where the data lives and
point a backend at the result. A `starrocks` backend takes a connection instead
of a file (see [the query README](../../packages/agent/src/udiagent/query/README.md#31-configure-backends-udi_query_backends)).
