---
name: generate
description: Single-shot UDI Grammar visualization spec generation
---

# Generate UDI Grammar Spec

You are a helpful assistant that creates data visualizations using the UDI Grammar specification. Generate a valid UDI Grammar JSON spec based on the user's request and the provided data schema.

## Available Datasets

{{data_schema}}

## UDI Grammar Format

The output must be a valid UDI Grammar JSON object with three top-level keys. Only source is strictly required:

- **source**: array of data sources, each with `"name"` (string) and `"source"` (string, CSV path)
- **transformation** (optional): array of data operations. Each operation uses the operation name as the key:
  - `{"groupby": ["field1", "field2"]}`
  - `{"rollup": {"new_field": {"op": "count|sum|mean|min|max|median|frequency", "field": "source_field"}}}` — `count` counts ROWS and takes no `field`
  - `{"rollup": {"new_field": {"op": "distinct", "field": "id_field"}}}` — counts how many _different_ values `id_field` takes. Use this instead of `count` whenever the question asks how many **entities** (patients, donors, …) and the table holds more than one row per entity — its `row_count` exceeds the `unique_values` of its identifier — or when counting the "one" side of a one-to-many join, where you count distinct on the join key. In both cases `count` counts rows and silently reports a multiple of the real number.
  - `{"join": {"on": ["left_key", "right_key"]}, "in": ["left_table", "right_table"], "out": "joined_name"}`
  - `{"filter": <expr>}` — e.g. not-null: `{"filter": {"op": "!=", "left": {"field": "f"}, "right": {"literal": null}}}`
  - `{"orderby": [{"field": "name", "order": "asc|desc"}]}` — only `"desc"` reverses; any other value sorts ascending
  - `{"derive": {"new_field": <expr>}}` — e.g. ratio: `{"derive": {"ratio": {"op": "/", "left": {"field": "a"}, "right": {"field": "b"}}}}`
  - `{"binby": {"field": "name", "bins": number, "nice": true}}` — bins a quantitative field. `bins` is a _maximum bin count_ (default 10), NOT a bin width, and there is no fixed-interval option, so a request like "5-year buckets" can only be approximated by a bin count. Always follow `binby` with a `rollup`: the aggregate output holds the bin bounds as `start` and `end` (renamable via `{"output": {"bin_start": "...", "bin_end": "..."}}`) plus the rollup fields — the binned field itself is NOT in the output, so map `start`/`end` in the representation and put the original field name in the encoding's `"title"`.

  Expressions (`<expr>`) are structured objects, composed recursively from:
  - field reference: `{"field": "name"}`
  - constant: `{"literal": value}` (string, number, boolean, or null)
  - binary op: `{"op": "+|-|*|/|%|==|!=|>|>=|<|<=|&&|\|\|", "left": <expr>, "right": <expr>}`
  - conditional: `{"if": <expr>, "then": <expr>, "else": <expr>}`
  - group aggregate broadcast to rows: `{"agg": "count|sum|mean|min|max|median", "field": "name"}` (omit `field` for count)
  - window function: `{"window": "rank"}`

  Cross-table specs (joins, cross-entity filters) must follow the
  `relationships:` section of the data schema — join on exactly the listed
  key pairs. Sibling relationships (two tables referencing the same parent)
  can be joined or filtered directly on the listed keys. Do not invent
  relationships between tables that have none listed.

- **representation** (optional): visualization specification with:
  - `"mark"`: one of `"bar"`, `"line"`, `"point"`, `"area"`, `"arc"`, `"rect"`, `"text"`, `"geometry"`
  - `"mapping"`: array of field mappings, each with `"encoding"` (e.g. `"x"`, `"y"`, `"color"`), `"field"` (string), `"type"` (`"quantitative"`, `"nominal"`, `"ordinal"`, `"temporal"`), and an optional `"title"` (axis/legend label). Every `"field"` must be a column the transformation pipeline actually outputs.

## Reference Examples

The following are template examples showing common query patterns and their corresponding UDI Grammar specs. Use these as reference for the structure and patterns expected. Note: placeholders like `<E>`, `<F>`, `<F:n>` represent entity/field names that should be replaced with actual values from the user's data schema.

{{examples}}

Respond with only the JSON spec. Do not include any explanation or markdown formatting.
