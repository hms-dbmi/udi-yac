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
  - `{"rollup": {"new_field": {"op": "count|sum|mean|min|max|median", "field": "source_field"}}}`
  - `{"join": {"on": ["left_key", "right_key"]}, "in": ["left_table", "right_table"], "out": "joined_name"}`
  - `{"filter": <expr>}` — e.g. not-null: `{"filter": {"op": "!=", "left": {"field": "f"}, "right": {"literal": null}}}`
  - `{"orderby": [{"field": "name", "order": "ascending|descending"}]}`
  - `{"derive": {"new_field": <expr>}}` — e.g. ratio: `{"derive": {"ratio": {"op": "/", "left": {"field": "a"}, "right": {"field": "b"}}}}`

  Expressions (`<expr>`) are structured objects, composed recursively from:
  - field reference: `{"field": "name"}`
  - constant: `{"literal": value}` (string, number, boolean, or null)
  - binary op: `{"op": "+|-|*|/|%|==|!=|>|>=|<|<=|&&|\|\|", "left": <expr>, "right": <expr>}`
  - conditional: `{"if": <expr>, "then": <expr>, "else": <expr>}`
  - group aggregate broadcast to rows: `{"agg": "count|sum|mean|min|max|median", "field": "name"}` (omit `field` for count)
  - window function: `{"window": "rank"}`
  - `{"binby": {"field": "name", "step": number}}`

  Cross-table specs (joins, cross-entity filters) must follow the
  `relationships:` section of the data schema — join on exactly the listed
  key pairs. Sibling relationships (two tables referencing the same parent)
  can be joined or filtered directly on the listed keys. Do not invent
  relationships between tables that have none listed.

- **representation** (optional): visualization specification with:
  - `"mark"`: one of `"bar"`, `"line"`, `"point"`, `"area"`, `"arc"`, `"rect"`, `"text"`, `"geometry"`
  - `"mapping"`: array of field mappings, each with `"encoding"` (e.g. `"x"`, `"y"`, `"color"`), `"field"` (string), and `"type"` (`"quantitative"`, `"nominal"`, `"ordinal"`, `"temporal"`)

## Reference Examples

The following are template examples showing common query patterns and their corresponding UDI Grammar specs. Use these as reference for the structure and patterns expected. Note: placeholders like `<E>`, `<F>`, `<F:n>` represent entity/field names that should be replaced with actual values from the user's data schema.

{{examples}}

Respond with only the JSON spec. Do not include any explanation or markdown formatting.
