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

   Your template appears with status **New**. Pick the data package that matches
   its `shape` (`hubmap` for `line_item`, `hubmap_cube` for `data_cube`) and
   confirm it renders as intended.

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
| `:n` / `:q` / `:o` suffix   | constrains the bound field's type (nominal/quantitative/ordinal) |

Add a type suffix wherever the encoding needs one — it's what stops the model
binding a 400-cardinality ID column to an x-axis. Resolution lives in
`vis_generate._resolve_placeholder`; unresolvable placeholders silently become
`""`, which is why a template referencing a cube placeholder against a tidy
table produces a blank-field spec rather than an error.

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
  no console error. Check that before suspecting the template.
- **Charts are virtualized.** Only cards near the viewport mount a chart, so a
  card scrolled far off-screen shows a placeholder rather than a chart. Scroll to
  a template before judging it.
- **Cube templates need cube data.** `sample-data/hubmap_cube/` is generated by
  `scripts/gen-cube-sample-data.mjs` from the HuBMAP donors table; regenerate it
  if you need different dimensions.
