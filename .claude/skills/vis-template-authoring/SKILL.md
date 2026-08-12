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
- `.interpolate("step-after")` draws a line as a staircase. Use it whenever the
  quantity holds between observations and jumps at each one — a survival curve, a
  running total. The default straight segment draws a change nobody measured, and
  lets a reader take a value off the axis between two observations.
- `.avoid_overlap(8)` nudges a layer's marks apart when they would land on the same
  position — two curves ending at the same percentage, otherwise two labels in one
  place. The separation is in **data units** (the plot's pixel size isn't known
  when the spec is written); `True` uses 5% of the axis. Only the layer moves: the
  reference line it annotates still points at the true value.
- `.title("<F4>", align="right")` sets a heading; left-aligned unless told
  otherwise. Worth it when series are labelled inline and the legend is dropped —
  the grouping _variable_ still needs naming, which the legend title used to carry.
  Align it with whatever it names.
- `stack=True` on a quantitative encoding, for a layer that must line up with a
  sibling that stacks implicitly. See the arc-labelling trap below.

**Labelling a pie or donut is three separate requirements**, and each one alone
produces a chart that renders. Getting two of the three gives you a _convincingly
wrong_ chart, which is worse than a broken one.

1. `stack=True` on the label layer's `theta`. An `arc` mark stacks theta on its
   own, so each slice spans the angles its predecessors did not; a `text` mark does
   not, so without this every label sits at the angle its raw value maps to.
2. **The same `color` encoding on the label layer.** Stack order is decided _per
   layer_ from that layer's own encodings. The ring orders its slices by the colour
   category; a text layer with no colour orders by its own text — which came out
   _reversed_, so every label landed on somebody else's slice. All the numbers were
   right, all of them were over a wedge, and nothing looked wrong. Sharing the
   colour encoding is the idiom vega-lite documents, and it ties each number to its
   slice by hue as a bonus.
3. **Do not `omitLegend` on that colour.** The two layers share one colour scale,
   so vega-lite merges them into a single legend by itself; suppressing this one
   suppresses the shared legend, taking the category names off the chart.

`test/arc-label-stack.mjs` pins all three by measuring rendered angles against
slice bounds — including that the wrong version still puts every label _on_ a
slice, which is why eyeballing a screenshot does not catch it.

**Row objects handed to the renderer must be fresh.** Vega tags each datum it
ingests, so a changeset that removes all rows and re-inserts the _same object
identities_ cancels out in its dataflow: the encoders never re-run and marks keep
their old positions while `view.data()` reports the new values. `getDataObject`
memoizes, so a repeat query returns the same objects — `UDIVis` copies them before
handing them over. Never mutate rows that came from the store either; that data is
shared with every other consumer of the same query.

**A spec change that isn't just data forces a re-embed.** The renderer swaps rows
into a running Vega view with a changeset, which is fast and right for a brush. It
cannot change anything else: scale domains, encodings, mark config and the layer list
are compiled in. `VegaLite` compares the spec minus its rows and recompiles when that
differs — worth knowing if you add a spec property, because a property the comparison
can't see would render stale (the symptom is a chart that corrects itself when the
card is toggled to table view and back).

Two positioning facts worth knowing. An explicit `domain` on an encoding stops the
renderer computing a padded one, so a one-sided `{"min": 0}` leaves the axis ending
exactly at the largest value in the data — which is how an annotation can reach the
plot edge. And anything a text mark draws is outside the scale, so a label cannot
widen the axis to fit itself.

**Joining in a stratifier from another table.** The attribute a chart splits by often
lives somewhere else — a treatment protocol, an enrolling site. Two things about that
join are easy to get wrong:

- **There is usually no declared relationship to follow.** The table holding the
  stratifier is typically a _sibling_ of the one being measured — both hang off a
  patient table — so `<E1.r.E2.id.*>` resolves to nothing. What they do share is a
  subject identifier, so take one from each side (`<E1.F1>`, `<E2.F1>`) and join on
  those. `validate_bindings` only demands a declared relationship when the template
  actually references one.
- **The join multiplies rows.** One event row becomes one per related record. That
  is safe only if everything downstream reduces by min/max over a (subject, value)
  group, as the survival pipeline does — both idempotent under duplication. A
  template that _counts_ rows after such a join silently over-counts.

> **An event-level column is not a subject attribute.** This is the subtlest class
> of bug this pipeline invites, and it produces charts that look right. Grouping by
> `[subject, event_level_column]` makes each (subject, value) pair its own row, so a
> per-subject span computed inside that group covers only _those_ events: a pair with
> a start and no end reads as censored, and a pair with an end and no start is dropped
> by the null filter. A subject whose value changed between the two events is counted
> as neither and its event disappears — on the pcx event log that silently lost 24 of
> 34 deaths, and the stratified survival curves ended _above_ the pooled curve, which
> no weighted average can do.
>
> The symptom to recognise: **every stratum sitting on the same side of the pooled
> value**. The fix is to decide what the column means for a subject and say so — the
> value at one chosen event (a baseline covariate, which partitions the cohort) or any
> value ever recorded (membership, which overlaps). Both are defensible, they answer
> different questions, so ship them as separate templates rather than picking one
> silently. And beware of testing such a template with a column that happens to be
> constant per subject: `organization_name` is, which is exactly why this survived
> review.

**Stratifying by presence in another table.** Sometimes the stratifier is not a
column anywhere: "did this patient receive radiation" is answered by the _existence_
of a row. That needs three things, and each one is load-bearing:

- **`kind: "left"` on the join.** An inner join cannot express absence — it drops
  exactly the rows that would have answered "no". Both executors support `left`
  (`join_left` in Arquero, `LEFT JOIN` in SQL); anything else raises
  `UnsupportedQueryError` rather than degrading quietly.
- **Reduce the other table to one row per subject first**, with a `count` as the
  marker. That is what makes the answer boolean rather than once-per-record, and it
  stops the join multiplying event rows. The marker's _value_ is never read — only
  whether the left join left it null.
- **Turn the null into a label**, `<E2>` / `No <E2>`, so a legend names the table
  instead of saying yes/no. Placeholders resolve on the whole spec string, so an
  entity name works inside a `derive` literal or a `title`.

Crossing two tables this way gives a 2×2 (`<E2> only` / `<E3> only` / `<E2> + <E3>` /
`Neither`) and needs an `E3` binding — the entity-key handling in `vis_generate`,
`generate_tools` and `export_template_previews` is numbered open-endedly for exactly
this, so a third table needs no new plumbing.

Unlike a related _field_, presence **partitions** the cohort: every subject is in one
group, so the counts add back to the unstratified curve (on pcx: 49 + 16 = 65
subjects, 22 + 12 = 34 deaths, curves at 55% and 25% bracketing the pooled 48%). It
is still immortal-time biased — a subject has to survive long enough to be treated —
so the "yes" group is flattered by construction, and the template says so.

> **A `groupby`'s own `out` is a no-op in the SQL compiler.** It records the grouping
> and carries it to whatever the next `rollup` names as its input; only the rollup's
> `in`/`out` create named tables. So reduce a side table as
> `groupby(field, in_name="<E2>")` then `rollup({...}, in_name="<E2>",
out_name="<E2>__by_subject")`. Naming the groupby's output instead runs fine in the
> browser and dies with `unknown entity` in SQL — a divergence no schema check catches.

**Aggregating a nominal column.** `min`/`max` over a string are safe and behave
identically in both executors — they return the string, skip nulls, and order by
codepoint. `mean`/`median`/`sum` over a string are a hard parity break (Arquero
yields null, DuckDB raises a binder error), and the grammar has no
`mode`/`any`/`first`. So `max` is the way to carry a per-subject text value through a
rollup.

Route it through a derived conditional column rather than aggregating the placeholder
directly — that is the only way to say _which_ row's value you mean, and it keeps
`tests/test_template_type_constraints.py`'s numeric-aggregation guard green. Know that
it also puts the aggregation out of that guard's sight, so pin it positively
elsewhere (see `test_survival_stratification.py`). Give the derived column a name of
its own: a `derive` that reuses an existing column's name replaces it in Arquero but
appends a duplicate in SQL, so an aggregate over the shadowed name reads the original
(`packages/grammar/test/derive-shadowing.mjs`).

> **`rank() == 1` is not "one row" unless the order has no ties.** A rank is
> _shared_ by tied rows, so with dozens of subjects at day 0, `orderby("time")`
> gives every one of them rank 1 — and no row at all gets rank 2. An annotation
> hung on rank 1 then multiplies into a stack of identical copies (which reads as
> an opaque, too-bold label, since each one paints over the last), while anything
> expecting rank 2 silently draws nothing. Order by a unique tiebreak as well —
> `orderby(["survival days", "<F1>"])` — and rank becomes a row number.
> `test/orderby-rank.mjs` in the toolkit pins both halves of this.

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

Put it before whatever is being **counted** — not necessarily first. Expanding
after a rollup that has already aggregated the rows you're expanding does multiply
them, which is the failure the rule guards against; but expanding a rollup's _own
output_, before anything has been counted, is fine and is sometimes the only
correct place.

That choice is not cosmetic — **it changes what the chart means**. Unnest an
event-level column before a per-subject rollup and membership is read from every
event the subject has; unnest the rollup's output and membership is read from
whichever single event the rollup selected. The two stratified survival templates
differ by exactly that and give materially different numbers, which is why they are
separate templates.

The resulting cohorts overlap by design and their sizes sum to more than the subject
count, so the groups can't be compared as if they partitioned the data. `unnest` is
the only transformation that increases the row count, and it is **browser-mode
only**: the SQL backend rejects it rather than silently returning a different row
count than the Arquero reference.

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

**Encoded placeholders become user-facing controls.** In chat, a placeholder that
is drawn on some channel is offered as a dropdown on the rendered chart, and
picking a value re-instantiates the template server-side
(`POST /v1/yac/vis_instantiate`) rather than rewriting the finished spec — which
is the only thing that stays correct when a binding is referenced from
transformations too. Two consequences for authoring:

- The type suffix decides that dropdown's contents, so it is now visible to a
  reader and not only to the validator.
- Structural placeholders — a subject id, a time column — are _not_ offered,
  because they aren't drawn. That is by design: a template's re-bindable surface
  is whatever a reader can see the effect of changing.

`template_tweakable_params` in `vis_generate.py` is the rule, and the sweep in
`tests/test_schema_agnostic_generation.py` runs it over every template, so a new
one that accidentally exposes an entity or a `<V*>` value fails there.

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
