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
- **review status** (`new` / `approved` / `rejected` / `needs_changes`), filterable,
  plus free-text feedback;
- a **details** expander with the template's metadata as the model sees it, the
  resolved spec being rendered, and the raw unresolved template;
- a **data-package picker** — templates are tagged for either tidy tables
  (`line_item`) or pre-aggregated cubes (`data_cube`), and a template that can't
  apply to the selected package says so explicitly rather than rendering blank.

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
`validate_bindings` accepts wins. It runs automatically on `dev` and `build` (via
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

| Package       | Shape               | Exercises                    |
| ------------- | ------------------- | ---------------------------- |
| `hubmap`      | tidy tables         | the 52 `line_item` templates |
| `hubmap_cube` | pre-aggregated cube | the 11 `data_cube` templates |

`hubmap_cube` is derived from `sample-data/hubmap/donors.tsv` by
`scripts/gen-cube-sample-data.mjs`. It emits every marginal of size 0–2 over five
dimensions, which is exactly what the shipped `<MARGINAL...>` templates select.

See `.claude/skills/vis-template-authoring/SKILL.md` for the authoring and
feedback loop.
