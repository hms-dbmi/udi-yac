# UDI Template Studio

**Dev-only internal tool.** Not published, not deployed — it is deliberately
absent from `.github/workflows/pages.yml`.

Reviews the YAC agent's visualization templates. Each of the agent's templates is
rendered **live against sample data**, with its raw spec and metadata available on
demand, so a human can approve, reject, or leave feedback on it.

```bash
pnpm build:toolkit          # required once: udi-toolkit exports resolve to dist/
pnpm dev:template-studio    # http://localhost:5175
```

## What it shows

One card per template, with:

- the **live visualization**, rendered by `UDIVis` from the resolved spec;
- **review status** (`new` / `approved` / `rejected` / `needs_changes` / `archived`),
  filterable, plus free-text feedback. **Archived** is distinct from rejected: the
  template is correct, it just shouldn't be offered as agent output any more — a
  candidate for removal from the builder rather than a bug to fix. Archived cards
  stay reviewable but are dimmed so they don't compete with undecided ones;
- a **details** expander with the template's metadata as the model sees it, the
  resolved spec being rendered, and the raw unresolved template;
- a **data-package picker** — templates are tagged for either tidy tables
  (`line_item`) or pre-aggregated cubes (`data_cube`), and a template that can't
  apply to the selected package says so explicitly rather than rendering blank.

## Rendering: two things that are easy to get wrong

**The toolkit's scoped CSS must be restated unscoped.** `<udi-vis>` is a Vue
custom element defined with `shadowRoot: false`, so Vue never injects its
components' _scoped_ styles into the document. The CE internals depend on them
for layout. Without `udi-vis .vega-chart-container { width: 100%; height: 100% }`
in `src/index.css`, that div stays `display: inline-block; height: 0`, Vega's
`width`/`height: 'container'` sizing reads 0, and **every chart renders as a 0×0
SVG** — a completely blank card with no error anywhere. `packages/chat` carries
the same rules for the same reason. Importing `udi-toolkit/style.css` is not a
substitute: those selectors are scoped to a build-generated `[data-v-*]` hash.

**Charts are virtualized.** Mounting 60+ Vega views at once is far too much work,
so each card only mounts its chart while it is near the viewport
(`src/lib/useInViewport.ts`) and drops it once well clear. Three details matter:

- Mounting is deferred ~180ms after a card comes into range, so cards flicked
  past during a fast scroll are never mounted. Unmounting is immediate.
- The preview area keeps a fixed height either way, and cards use
  `content-visibility: auto` with `contain-intrinsic-size`, so nothing shifts
  under the reviewer's scroll.
- Only the chart is lazy. Metadata and the review controls are always rendered,
  so an off-screen card can still be read and acted on.

Measured on the 52 `hubmap` templates: 9 charts mounted instead of 52, and median
scroll frame time 170ms → ~13ms. Mounting a single chart still costs one long
frame; that's inherent to compiling and embedding a Vega view.

The placeholder says "chart loads when scrolled into view" — deliberately worded
so it can never be confused with the _review-relevant_ empty states below
("not applicable to this data package", "can't bind to this data package").

## How previews are produced

Template placeholders (`<E>`, `<F:n>`, `<M>`, `<MARGINAL:D1,D2>`,
`<E1.r.E2.id.from>`) are resolved by Python only — `udiagent.vis_generate`. Rather
than reimplement that in TypeScript and drift from it, this app reads a JSON
exported by the real resolver:

```
packages/agent/scripts/export_template_previews.py
  → apps/template-studio/public/template_previews.json   (gitignored)
```

The exporter picks bindings by type-directed search: candidate fields are filtered
to the type each placeholder requires, then the first combination the production
`validate_bindings` accepts wins. Three refinements make the previews worth
looking at:

- **Uninformative columns are demoted.** The schema alone can't tell a useful
  field from a useless one — a column can be nominal with cardinality 2 and still
  be 97% empty, rendering as one giant "null" bar. The exporter samples the CSVs
  and pushes columns that are mostly null, near-constant, or single-valued to last
  resort.
- **Choices are varied, not repeated.** Candidates are rotated by template index
  (and by binding slot), so the previews spread across the package's tables and
  columns instead of every template landing on whatever sorts first. It's a
  rotation, not randomness, so the export stays reproducible.
- **Join collisions are avoided.** Arquero's join renames columns present in both
  tables (`hubmap_id` → `hubmap_id_1`/`_2`), so a spec referencing the bare name
  after the join fails to render. The exporter refuses those bindings and picks a
  non-colliding pair instead. Some templates join and then group by the join key,
  which is unrenderable against any schema whose two tables share that column —
  those are reported as unsupported with the reason.

It runs automatically on `dev` and `build` (via
`scripts/sync-template-previews.mjs`, which needs `uv`), or on demand:

```bash
pnpm --filter udi-template-studio sync-previews
```

If `template_visualizations.json` changes while the studio is open, it shows a
**stale previews** banner — the rendered spec no longer matches what would ship.

## Where review state lives

```
packages/agent/src/udiagent/data/skills/template_reviews.json
```

A **sidecar**: generated template files stay untouched by review actions (they are
regenerated wholesale and marked `DO NOT EDIT`). A static SPA can't write to disk,
so `vite-plugin-review-store.ts` adds a dev-server API (`GET/PUT/DELETE
/api/reviews`) that persists it. `apply: 'serve'` keeps it out of production
builds — a built copy of this app is read-only and says so.

Entries are keyed by `sha256(spec_template)[:12]`, **not** by the generated tool
name: `_derive_tool_name` embeds the template's positional index and is derived
from its mutable description, so it renames whenever templates are inserted,
reordered, or re-described. Hashing the spec keeps a review attached to the exact
spec that was reviewed, and deliberately orphans when that spec changes. Orphans
are listed in the UI with their feedback rather than dropped, since that feedback
is usually what prompted the edit.

A template with no entry defaults to `new`.

## Sample data

Repo-root `sample-data/` is synced into `public/data` on dev/build (gitignored)
— edit `sample-data/`, never the copy. Two packages are relevant:

| Package       | Shape                     | Exercises                                    |
| ------------- | ------------------------- | -------------------------------------------- |
| `hubmap`      | tidy tables, 3 + joins    | the 52 `line_item` templates                 |
| `hubmap_cube` | pre-aggregated cube       | the 11 `data_cube` templates                 |
| `penguins`    | tidy table, single, no FK | `line_item` templates that don't need a join |

Any `sample-data/*/datapackage.json` is picked up automatically, so adding a
package needs no code change. Single-table packages can't satisfy join templates;
those are reported as unsupported rather than silently omitted.

`hubmap_cube` is derived from `sample-data/hubmap/donors.tsv` by
`scripts/gen-cube-sample-data.mjs`. It emits every marginal of size 0–2 over five
dimensions, which is exactly what the shipped `<MARGINAL...>` templates select.

See `.claude/skills/vis-template-authoring/SKILL.md` for the authoring and
feedback loop.
