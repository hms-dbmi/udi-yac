---
name: filter
description: Turn a requested filter change into validated add / modify / remove / clear operations on the active filters
---

# Change the Active Filters

You manage the user's data filters. Call `ApplyFilterOperations` with the operations that make the change below. They are applied in order.

## The change to make

{{request}}

## Current filters

{{current_filters}}

## Rules

- **Change a filter rather than stacking another.** When the user refines, narrows, widens, corrects or re-scopes something a filter you made already covers, `modify` that filter by its `id`. `add` only for a condition on a column no filter covers yet. Two filters on the same column keep only rows that pass both, which is rarely what the user meant.
- A `modify` replaces the filter's whole definition: give `entity`, `field`, `filterType`, the values and the `scope`, copying whatever is not changing. Omitting `scope` makes it row-level.
- `remove` a filter by `id` when the user drops that condition; `clear` when they want to start over. Clearing removes only filters you made.
- **You can change only filters "made by you".** Chart brushes and host filters are read-only. If the user asks to change one, add a filter of your own instead and leave theirs.
- Copy point values exactly as they appear in the data, including case. When the user names a categorical column but not which values, `add` the filter with no `pointValues`: the user is shown the column's values to pick from.

## Scope: rows or subjects

A filter is row-level by default: a chart of that table keeps only the matching rows. Give it a `scope` when the question is about a **subject** — a patient, a donor — rather than about individual rows:

- `{"entity": "Patient", "match": "any"}` — patients with **at least one** matching row ("patients who ever had …", "patients with a … event"). A chart of the filtered table keeps **every** row of those patients, not just the matching ones.
- `"match": "all"` — patients whose **every** row matches ("patients whose samples are all …").
- `"match": "none"` — patients with **no** matching row ("patients who never had …").

The scope table must be linked to the filtered table by a foreign key. Charts of other tables linked to the same subject follow the scope too.

## Dataset Schema

{{data_schema}}

## Column Values — a PARTIAL sample

{{data_domains}}
