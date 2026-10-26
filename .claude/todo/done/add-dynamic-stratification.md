# Add dynamic stratification with grouped and binned strata

## Description

Stratified templates today draw one series per distinct value of the stratifier
field — a survival curve per donor sex. That only works when the field's domain is
already the set of comparisons a reader wants. This feature adds **dynamic
stratification**: the strata become a user- and agent-controllable _grouping_ over
the field rather than its raw domain. A nominal field can be cut into named groups
("White" vs. everyone else), and a quantitative field can be cut at thresholds
("age ≥ 65" vs. "age < 65", or any number of bins). Each grouped chart carries an
adjustment widget so a reader can re-cut the strata without a new request.

Ship it on the survival templates first, but build the placeholder resolution and
the widget as general machinery, so any template with a series/color split can opt
in later without rework.

## Requirements

### Grammar-side template machinery (`packages/agent`)

- [ ] A new placeholder — e.g. `<STRATA:F1>` — resolves to a **derived stratum
      column** rather than a bare column name, following the `<MARGINAL:...>`
      precedent: `_resolve_placeholder` returns a JSON object that
      `instantiate_template` injects unquoted into the spec.
- [ ] With no grouping supplied, `<STRATA:F1>` resolves to the plain field, so
      every existing stratified chart renders byte-identically to today. One line
      per value stays the default and the no-grouping path adds no `derive`.
- [ ] With a grouping supplied, it resolves to a nested `Expr.cond` tree over
      `Expr.binop`, producing one label per group. Nominal membership chains `==`
      with `||`; quantitative buckets chain `<` comparisons against cut points.
      No new grammar operators — `cond`/`binop`/`lit` already exist in
      `udi_grammar_py.helpers` and in `GrammarTypes.ts`.
- [ ] Group labels are stable, human-readable strings and are what the legend,
      the inline series labels and any `title` show: nominal groups use their
      user-given name; quantitative buckets are auto-labelled from their bounds
      (`< 50`, `50–65`, `≥ 65`).
- [ ] Nominal grouping supports **named groups plus an automatic `Other`** bucket
      holding every unassigned domain value. `Other` is omitted from the spec when
      no value falls into it.
- [ ] Null / missing stratifier values keep whatever behaviour the ungrouped
      templates have today; the change must not silently move them into `Other`
      without that being a deliberate, documented decision.
- [ ] The grouping is a **tool parameter the model can fill**, so the agent can
      propose groups straight from the request ("compare white donors to everyone
      else", "split at age 65"). It is optional — omitting it gives the default
      grouping above.
- [ ] Validation rejects a malformed grouping with reader-grade prose the same way
      `validate_bindings` does: unknown values for a nominal field, non-numeric or
      unordered cut points, an empty group, a group count over the cap.
- [ ] Cap the number of groups (10) and say so in the error, in the tool
      description, and in the widget.

### Transport and provenance

- [ ] A grouping is structured data, but `YACVisInstantiateRequest.toolArgs` is
      `dict[str, str]` and `meta.tool_args` is carried through chat the same way.
      Decide and implement one of: JSON-encode the grouping into a string arg, or
      widen the arg type end to end. Whichever is chosen, a saved-and-restored
      conversation must re-instantiate the grouped chart exactly.
- [ ] `template_tweakable_params` emits a descriptor for the stratifier that tells
      a client it is groupable — the field, its type, the current grouping, and
      (for nominal) the value domain to assign from.
- [ ] `POST /v1/yac/vis_instantiate` accepts a changed grouping and returns the
      re-resolved spec, exactly as it does for a changed field binding. No spec
      rewriting on the client.

### Adjustment widget (`packages/chat`)

- [ ] `VizTweakComponent` gains a stratifier control alongside the existing
      field dropdowns, driven by the new descriptor. Both the heuristic
      (spec-rewrite) and binding (re-instantiate) paths stay as they are; grouping
      is offered only on the template path.
- [ ] **Nominal:** the user creates named groups and assigns domain values to
      them; unassigned values show as a live-updating `Other`. Renaming a group
      renames the series.
- [ ] **Quantitative:** the widget draws the stratifier field's **distribution as
      a histogram with draggable divider handles**; each divider is a cut point,
      N dividers give N+1 buckets. Handles are addable/removable, and each cut
      point is also editable as a number for exact clinically meaningful
      thresholds. Decide where the histogram's counts come from (toolkit
      `queryData` with a `binby` against the bound entity, vs. entity domains,
      which carry only min/max) and note that server-side ("remote") packages must
      work too.
- [ ] The widget stays usable up to the 10-group cap — dividers past ~5 must not
      collide or become undraggable; a numeric list view is an acceptable fallback
      at high N.
- [ ] Changing a grouping re-requests via `useTemplateRebind`; failures surface
      the server's error prose rather than leaving a stale chart.

### Templates, review, tests

- [ ] The survival stratified templates (all three stratifier readings, plus the
      cube variant if it can carry a grouping) use the new placeholder.
- [ ] Regenerate `template_visualizations.json` + `generated_vis_tools.py` via
      `scripts/regenerate_vis_tools.py`; neither is hand-edited.
- [ ] Template Studio previews the grouped forms — `export_template_previews.py`
      resolves them with the production `validate_bindings`/`instantiate_template`,
      so a grouping needs `preview_bindings` support or an equivalent.
- [ ] Python tests cover placeholder resolution (nominal, quantitative, `Other`,
      cap, invalid input), the default/no-grouping identity, and the
      `vis_instantiate` round trip.
- [ ] Chat tests cover the widget's group editing and the rebind request shape.
- [ ] **Executor parity:** confirm the nested `cond` tree the resolver emits
      compiles in the SQL backend as well as Arquero, and add a
      `test_query_parity.py` case if it isn't already covered. A grouping that
      renders in the browser and raises in SQL is the failure mode to catch here.
- [ ] `.claude/skills/vis-template-authoring/SKILL.md` documents the new
      placeholder and the grouping contract.

## Notes

Relevant files:

- `packages/agent/scripts/template_viz_generation.py` — survival templates and the
  three stratifier readings (`AT_START`, `EVER`, presence-in-another-table).
- `packages/agent/src/udiagent/vis_generate.py` — `_resolve_placeholder`,
  `instantiate_template`, `validate_bindings`, `template_tweakable_params`,
  `_placeholder_encodings`.
- `packages/agent/src/udiagent/server/app.py` + `models.py` —
  `YACVisInstantiateRequest/Response`, `YACVisParam`.
- `packages/chat/src/features/dashboard/` — `components/VizTweakComponent.tsx`,
  `components/VizTweakComponent.types.ts`, `utils/tweakability.ts`,
  `hooks/useTemplateRebind.ts`, `api/visTemplate.ts`.
- `packages/grammar-py/src/udi_grammar_py/helpers.py` — `Expr.cond`, `Expr.binop`.

Design context:

- The `<MARGINAL:D1,D2>` placeholder is the closest existing precedent for a
  placeholder that expands into structure rather than a name: it builds a
  structured `Expr` object, `json.dumps`es it, and `instantiate_template` strips
  the surrounding quotes so it injects as JSON. A raw Arquero expression string
  would be rejected by the SQL compiler — the same constraint applies here.
- Re-instantiation, not spec rewriting, is the established path for changing a
  binding on a rendered chart (`useTemplateRebind` → `/v1/yac/vis_instantiate`);
  a grouping reaches `derive` expressions and the spec `title`, which is exactly
  the case the rewrite path is documented as unable to follow.
- SKILL.md's warning about event-level columns vs. subject attributes still
  applies: grouping happens _after_ a stratifier value has been reduced to one
  per subject, not before. The tell for getting it wrong is every stratum sitting
  on the same side of the pooled curve.
- Reviews in Template Studio are keyed by `sha256(spec_template)[:12]`, so
  changing a survival template's spec resets its review status to New — expect to
  re-review all touched templates.
