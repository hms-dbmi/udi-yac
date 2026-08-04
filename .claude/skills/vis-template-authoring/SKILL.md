---
name: vis-template-authoring
description: Author, revise, and act on human review feedback for the YAC agent's visualization templates. Use when adding a new chart template, when asked to address template review feedback, or when working in packages/agent/scripts/template_viz_generation.py. Covers the Python-as-source-of-truth pipeline and the Template Studio review loop.
---

# Visualization template authoring & review loop

The agent generates charts by filling in **templates**: partial UDI grammar specs
with placeholders that get bound to real entities and fields at request time.
Python is the source of truth; everything else is generated. A local React app
(**Template Studio**) renders each template against sample data so a human can
approve it or leave feedback.

```
scripts/template_viz_generation.py     ← author templates HERE (hand-written)
  └→ src/udiagent/data/skills/template_visualizations.json   (generated)
       └→ src/udiagent/generated_vis_tools.py                (generated, DO NOT EDIT)
            └→ vis_generate.py binds placeholders at runtime

apps/template-studio  ← renders templates, writes review decisions to
  └→ src/udiagent/data/skills/template_reviews.json          (sidecar, human-owned)
```

## Authoring a new template

1. **Add one `add_row(...)` call** in `packages/agent/scripts/template_viz_generation.py`,
   inside the section for that chart family (the file is organized by chart type —
   bars, scatter, tables, histograms, KDE, heatmaps…). Build the spec with the
   `udi_grammar_py` `Chart()` builder, not a raw dict.

   ```python
   df = add_row(
       df,
       query_templates=[
           "How many <E> are there, grouped by <F:n>?",
       ],
       spec=(
           Chart()
           .source("<E>", "<E.url>")
           .groupby("<F>")
           .rollup({"<E> count": Op.count()})
           .mark("bar")
           .x(field="<F>", type="nominal")
           .y(field="<E> count", type="quantitative")
       ),
       chart_type=ChartType.BARCHART,
       task_types=[TaskType.COMPUTE_DERIVED_VALUE],
       description="Counts entities grouped by a nominal field.",
       design_considerations="Vertical bars because category count is small.",
       tasks="Compare counts across categories.",
       shape="line_item",              # or "data_cube"
       review_hint="Check the x labels don't collide at 12 categories.",
   )
   ```

2. **Choose `shape` deliberately.** It becomes the first tag and drives selection:
   `line_item` templates are offered for tidy tables, `data_cube` ones for
   pre-aggregated cubes. A request never sees both sets.

   **`preview_bindings`** (optional) names the entity and fields the studio should
   preview with. Only needed when a template's meaning depends on particular
   _values_ rather than just column types — the survival template pairs two named
   event types, and the studio's type-directed search would otherwise pick three
   plausible columns and draw an empty curve. When declared, a data package that
   cannot satisfy it is reported as unsupported with the reason, which is more
   useful than a preview that renders but means nothing. It is preview-only: the
   model still chooses its own bindings at runtime.

   **`<V*>` binds a literal data value**, for templates that must compare against
   one — an event type, a status string. It becomes a `value1`/`value2` tool
   parameter, and the model fills it from the request's column domains, so the
   template stays dataset-agnostic. Use `Expr.lit("<V1>")` where the value goes.

   Two things follow. Values are **not** validated as columns (no field-existence,
   type or cardinality check) — only that something non-empty was supplied. And
   they are JSON-escaped on substitution, because they are spliced into the spec's
   raw JSON string and a value like `Grade "III"` would otherwise corrupt it.

   Describe such a template by the **shape** it needs ("an event log with a subject
   id, an event-type column and a numeric time column"), not by the dataset that
   motivated it — the values are no longer baked in. Keep concrete example values
   in `preview_bindings` only.

3. **Regenerate:**

   ```bash
   cd packages/agent && uv run python scripts/regenerate_vis_tools.py
   ```

   This rewrites `template_visualizations.json` and `generated_vis_tools.py`.
   Never hand-edit either. Check `git diff` — if unrelated records reformat, your
   pandas version differs from whatever last generated the file; keep the
   reformat out of your commit if you can, since it buries the real change.

4. **Review it:**

   ```bash
   pnpm dev:template-studio          # http://localhost:5175
   ```

   Your template appears with status **New**. Pick a data package that matches
   its `shape` — `hubmap` (three joinable tables) or `penguins` (single table, so
   no join templates) for `line_item`, `hubmap_cube` for `data_cube` — and confirm
   it renders as intended.

### Placeholders

| Placeholder                 | Resolves to                                                      |
| --------------------------- | ---------------------------------------------------------------- |
| `<E>`, `<E1>`, `<E2>`       | entity (table) name                                              |
| `<E.url>`                   | that entity's data URL                                           |
| `<F>`, `<F1>`…`<F3>`        | field name on `<E>`                                              |
| `<E1.F>`, `<E2.F2>`         | field on a specific entity in a join                             |
| `<D>`, `<D1>`, `<D2>`       | cube **dimension** column                                        |
| `<M>`                       | cube **measure** column (from the schema, not bound)             |
| `<MARGINAL:D1,D2>`          | cube marginal filter: listed dims non-null, all others null      |
| `<E1.r.E2.id.from>` / `.to` | join keys, from the schema's relationships                       |
| `<V>`, `<V1>`…`<V3>`        | a literal data **value** the model supplies (not a column)       |
| `:n` / `:q` / `:o` suffix   | constrains the bound field's type (nominal/quantitative/ordinal) |

**Annotating a chart.** Three pieces the survival curves rely on, all recent
additions:

- `Expr.concat([...])` builds a label string — a text mark draws only one field, so
  `"Seattle 63%"` has to be assembled into a column first. Round numbers
  beforehand; there is no formatting, so `1/3` would render every digit.
- `.stroke_dash([6, 4])` on a layer marks it as annotation rather than data.
- `.place(align=..., dx=..., dy=...)` anchors a text mark. Text is centred on its
  point by default, which lays half a label across whatever it annotates.
  `align="right"` is usually what you want for a label at the right-hand edge: it
  runs inward, where `align="left"` would run off the plot for a long value.
- `.outline(color="white", width=3, opacity=0.7)` haloes a text mark so it stays
  readable where it crosses a line. The renderer draws such a layer twice, because
  SVG paints stroke over fill and one pass would eat into the glyphs.
- `.title("<F4>", align="right")` sets a heading; left-aligned unless told
  otherwise. Worth it when series are labelled inline and the legend is dropped —
  the grouping _variable_ still needs naming, which the legend title used to carry.
  Align it with whatever it names.

Two positioning facts worth knowing. An explicit `domain` on an encoding stops the
renderer computing a padded one, so a one-sided `{"min": 0}` leaves the axis ending
exactly at the largest value in the data — which is how an annotation can reach the
plot edge. And anything a text mark draws is outside the scale, so a label cannot
widen the axis to fit itself.

A reference line needs **two** points, and typically only one row holds the value
being marked. Because such a layer maps y to a constant (a per-group `agg`), any
second row will do — the survival templates borrow the `rank() == 1` row purely
for its x. Null out every other row so vega-lite drops it. The same trick draws a
_segment the data does not contain_: the survival curves' opening flat 100% run and
the drop into the first event are two borrowed rows each, x and y both conditional
on `rank()`.

**Where an aggregate is taken decides its scope.** `Expr.agg` respects whatever
grouping is in effect, so the same expression means "per stratum" after a
`groupby` and "across the cohort" before one (a `rollup` leaves the table
ungrouped). Annotations that must line up across strata — every curve's dashed
lead-out reaching the same right edge — need the global form, computed before the
stratum grouping and carried down as a column.

**Multi-value columns need `unnest`.** Some columns hold a `;`-delimited set
(`"Leptomeningeal;Spine"`), so one row belongs to several categories. Grouping such
a column directly makes every _combination_ its own category — on PCX that is 78
categories for 22 real locations, which also exceeds the 50-cardinality cap.
`.unnest("<F4:n>", separator=";")` expands it to one row per value first:

```python
Chart().source("<E>", "<E.url>").unnest("<F4:n>", separator=";").groupby("<F4>")
```

Put it **first**, before anything that counts rows — expanding after a rollup
multiplies already-collapsed rows. The resulting cohorts overlap by design and
their sizes sum to more than the subject count, so the groups can't be compared as
if they partitioned the data. `unnest` is the only transformation that increases
the row count, and it is **browser-mode only**: the SQL backend rejects it rather
than silently returning a different row count than the Arquero reference.

Add a type suffix wherever the encoding needs one — it's what stops the model
binding a 400-cardinality ID column to an x-axis. Resolution lives in
`vis_generate._resolve_placeholder`; unresolvable placeholders silently become
`""`, which is why a template referencing a cube placeholder against a tidy
table produces a blank-field spec rather than an error.

Placeholders are found by scanning the spec's raw JSON _string_, matched by
`vis_generate.PLACEHOLDER` — deliberately narrow, `<UPPERCASE_LED_TOKEN>`. Use that
constant for any new scan rather than writing `<[^>]+>`: the loose form matches from
the `<` of a `"op": "<="` comparison to the next `>` anywhere in the document
(usually a later `">="`), and resolving that match deletes every key in between.
`tests/test_placeholder_pattern.py` pins it. The same sharp edge makes a
malformed placeholder — `"<F4"` with the bracket dropped — survive resolution
untouched and surface much later as unparseable JSON.

> **Always type-constrain a field whose type matters.** `validate_bindings` infers
> a required type from only two places: a `:q`/`:n`/`:o` suffix on the placeholder,
> or the `type` declared on an encoding whose `field` is _exactly_ that
> placeholder. These do **not** constrain anything:
>
> - a rollup's `field` — `Op.min("<F1>")`
> - a composite string — `"minimum <F1>"`
> - `binby(field=...)`, `orderby(...)`, `filter(...)`
> - a mapping's `column` (as opposed to its `field`)
> - a `<F:q>` in the `query_templates` prose — documentation only, never enforced
>
> Each of those produced real broken charts: `min` of a nominal column plotted on a
> quantitative axis (blank), a histogram binning a categorical field, and a
> "smallest value" table ranking `sample_category` alphabetically. Write the
> suffix in the spec — `Op.min("<F1:q>")`, `binby(field="<F:q>")`,
> `orderby("<F:q>")` — and it becomes real.
>
> `tests/test_template_type_constraints.py` enforces this: it fails if a type
> promised in the prose isn't enforced by the spec, if a numeric aggregation can
> bind a non-numeric column, or if `binby` is unconstrained. Run
> `uv run pytest tests/test_template_type_constraints.py` after editing templates.
> `<M>` is exempt — it resolves to the cube's declared measure, not to a binding.
>
> **Watch what a type suffix is holding up.** Removing the one mapping that
> declared a placeholder's type silently un-constrains it, even if the template
> still looks correct. That is easy to do when switching a text mapping to
> `field="*"`; the test above is what catches it.

## Acting on review feedback

Read the sidecar — it is the reviewer's output:

```bash
cat packages/agent/src/udiagent/data/skills/template_reviews.json
```

```json
{
  "0f6975eec9a9": {
    "status": "needs_changes",
    "feedback": "Bars unreadable past ~15 categories; constrain the field type.",
    "reviewed_at": "2026-07-31T17:12:18.864Z",
    "tool_name": "vis_000_barchart_count_vert_grouped"
  }
}
```

Statuses and what each asks of you:

| status          | meaning                                           | action                                                |
| --------------- | ------------------------------------------------- | ----------------------------------------------------- |
| `new`           | not yet reviewed                                  | none                                                  |
| `approved`      | good as-is                                        | none                                                  |
| `needs_changes` | fixable problem, see `feedback`                   | revise the `add_row(...)` call                        |
| `rejected`      | wrong / not worth keeping                         | usually delete the template                           |
| `archived`      | **correct, but no longer wanted as agent output** | delete the `add_row(...)` call, or leave it if unsure |

`archived` is deliberately not `rejected`: nothing is broken, the chart is simply
not one we want the agent to produce any more. Treat it as a queue of removal
candidates to confirm with the reviewer, not as a bug list.

Workflow:

1. For every entry with `status` of `needs_changes` or `rejected`, find the
   template. The key is `sha256(spec_template)[:12]` — match it via the studio's
   **Review key** field, or the recorded `tool_name`. Do **not** trust
   `tool_name` alone as identity: it embeds the template's positional index, so
   it shifts when templates are inserted or reordered.
2. Revise the `add_row(...)` call in `template_viz_generation.py` per the
   feedback. `rejected` may mean deleting the template outright.
3. Regenerate (step 3 above).
4. **Expect the review to orphan.** Editing the spec changes its hash, so the old
   entry no longer matches any template and the studio lists it under _orphaned
   review entries_ with its original feedback intact. That is correct: the thing
   that was reviewed no longer exists. Confirm the revision addressed the
   feedback, then delete the orphan from the studio.
5. Re-review the revised template (it comes back as **New**).

Never write `template_reviews.json` by hand from this side — the studio owns it.
Reading it is the intended direction.

## Gotchas

- **Build the toolkit first.** `udi-toolkit` exports resolve to `dist/`, so run
  `pnpm build:toolkit` before the studio's dev/typecheck.
- **Previews are exported, not computed in the browser.** The studio reads
  `apps/template-studio/public/template_previews.json`, produced by
  `packages/agent/scripts/export_template_previews.py` (runs on `dev` and
  `build`, needs `uv`). If you edit templates while it's running, the studio
  shows a _stale previews_ banner — re-run
  `pnpm --filter udi-template-studio sync-previews`.
- **Grammar conformance is advisory, not enforced.** `regenerate_vis_tools.py`
  only warns; pass `--strict` to `template_viz_generation.py` to make failures
  fatal. The studio flags non-conforming templates with a ⚠ on the card. Two
  shipped table templates (`vis_037`, `vis_046`) currently fail validation.
- **The agent's bundled `UDIGrammarSchema.json` has drifted** behind the
  canonical one generated from `packages/grammar/GrammarTypes.ts`. The exporter
  validates against the toolkit's copy for that reason. If you rely on a newer
  grammar feature, check which schema you're validating against.
- **Blank charts usually mean missing CSS, not a broken template.** `<udi-vis>`
  uses `shadowRoot: false`, so Vue's scoped component styles are never injected;
  the studio restates the critical ones unscoped in `src/index.css`. Without
  `udi-vis .vega-chart-container { height: 100% }` every chart renders 0×0 with
  no console error, and without the `.cell-container` rules a table's in-cell
  bar/point/line marks collapse to zero height. Check that before suspecting the
  template.
- **A chart that draws axes but no marks is usually a binding-type problem**, not
  a rendering one: an aggregate over a nominal column yields a non-numeric value
  that a quantitative axis can't place. See the type-constraint note above.
- **An in-cell bar needs its number too.** A `bar`/`rect` shows relative magnitude
  but not the value, so a column with a bar and no `text` mark leaves the number
  unreadable. Give the bar and a text mark the same `column="..."` so they share
  one table column:

  ```python
  .x(column="count", field="count", mark="bar", type="quantitative")
  .text(column="count", field="count", mark="text", type="nominal")
  ```

  `tests/test_template_table_readability.py` enforces this. Exempt by shape, not by
  name: a `field="*"` text mark (covers every column), a min..max span (`x` + `x2`),
  and `%` columns that sit beside their raw counts.

- **In-cell marks paint in mapping order.** They are absolutely positioned
  siblings inside the cell, so a later mapping covers an earlier one. Put the
  `bar`/`rect` mapping **before** the `text` mapping or the bar hides the number —
  the DOM will contain the value while the screen shows only a bar. The same test
  file checks this ordering. Column order in the rendered table follows the order
  the columns are first mentioned, so keep the label mapping first.
- **Charts are virtualized.** Only cards near the viewport mount a chart, so a
  card scrolled far off-screen shows a placeholder rather than a chart. Scroll to
  a template before judging it.
- **Cube templates need cube data.** `sample-data/hubmap_cube/` is generated by
  `scripts/gen-cube-sample-data.mjs` from the HuBMAP donors table; regenerate it
  if you need different dimensions.
