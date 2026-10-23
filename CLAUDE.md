# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Overview

Monorepo for the **Universal Discovery Interface (UDI)** — an AI-powered system for querying and visualizing biomedical datasets via natural language. `packages/` holds publishable libraries; `apps/` holds private applications. Formerly four separate repos, merged via `git subtree` with full history (browse a package's pre-merge history via the second parent of its `Add 'packages/<name>/'` merge commit). The old `udi-grammar` repo (imported as `packages/grammar/`) was later split in-tree into `packages/grammar` (udi-toolkit, formerly nested at `src/components/`) and `apps/grammar-app` — use `git log --follow` on files in either to trace history across those renames. The demo app was later folded into the site (`apps/site`, `/udi-yac/grammar/`) and deleted; its specs live on in `apps/site/src/grammar/`.

| Directory               | Published as            | Stack                                | Role                                                            |
| ----------------------- | ----------------------- | ------------------------------------ | --------------------------------------------------------------- |
| `packages/grammar/`     | `udi-toolkit` (npm)     | TypeScript, Vue 3, Vite              | Grammar types + UDIVis + Storybook                              |
| `apps/template-studio/` | — (private, dev-only)   | TypeScript, React 19, Tailwind, Vite | Review UI (`udi-template-studio`) for the agent's viz templates |
| `apps/site/`            | — (private)             | Astro Starlight                      | Landing page, docs, grammar pages + editor (`udi-yac-site`)     |
| `packages/chat/`        | `udi-yac` (npm)         | TypeScript, React 19, Tailwind, Vite | Chat UI — library + standalone SPA                              |
| `packages/agent/`       | `udiagent` (PyPI)       | Python, OpenAI, FastAPI (optional)   | LLM orchestrator + reference FastAPI server                     |
| `packages/grammar-py/`  | `udi-grammar-py` (PyPI) | Python, hatchling                    | Python library for building UDI grammar specs                   |

Two workspaces share the repo root:

- **pnpm workspace** (`pnpm-workspace.yaml`): `packages/chat`, `packages/grammar` (udi-toolkit), `apps/template-studio`, `apps/site`. Chat, the site and template-studio depend on `udi-toolkit: workspace:*` — toolkit exports point at `dist/`, so **build the toolkit before building/typechecking its consumers**. For live-reloading toolkit work, use Storybook (`pnpm dev:storybook`). Root `.npmrc` sets `shamefully-hoist=true` (originally for Quasar, whose demo app is gone; untested without it). Dependency `overrides` (former yarn `resolutions`) live in `pnpm-workspace.yaml`; the vite pin is deliberately scoped to `udi-toolkit>vite` so chat's vitest keeps its own internal vite.
- **uv workspace** (`pyproject.toml`): `packages/agent` + `packages/grammar-py`, single root `uv.lock`. `udiagent[codegen]` resolves `udi-grammar-py` from the workspace during development. Note: `uv build` in a member dir writes to the workspace **root** `dist/` unless you pass `--out-dir`.

## Build & Dev Commands

Onboarding: `pnpm setup` (or `node scripts/setup.mjs`) — creates local env files from templates (`packages/chat/.env.local`, `packages/agent/.env`; never clobbers), `pnpm install`, builds the toolkit, and `uv sync --all-extras`. Start dev via the `.vscode/tasks.json` **Dev: chat + agent** task (default build task) or `pnpm dev:chat` / `dev:agent` / `dev:site` / `dev:storybook`.

Root scripts (pnpm ≥ 11):

```bash
pnpm install            # whole JS workspace; runs husky
pnpm build:toolkit      # udi-toolkit build:all (Vue + CE + React targets)
pnpm build:chat         # toolkit, then chat standalone SPA
pnpm build:chat:lib     # toolkit, then udi-yac library build
pnpm build:site         # toolkit, udi-yac library, then the site (what Pages publishes)
pnpm build:storybook    # toolkit storybook static build
pnpm test               # toolkit build, then all JS tests
pnpm lint / pnpm format # recursive
```

Per-package (use `--filter`, no cd needed): `pnpm --filter udi-yac typecheck|test|lint|format:check|build|build:lib`, `pnpm --filter udi-toolkit build:all|storybook|build-schema`, `pnpm --filter udi-yac-site dev|build|test`.

Python:

```bash
cd packages/agent && uv sync --extra server --extra langfuse --extra test --extra bedrock && uv run pytest
cd packages/grammar-py && uv sync && uv run pytest
uv run --project packages/agent --extra server fastapi dev packages/agent/src/udiagent/server/app.py --port 8007 --reload-dir packages/agent/src --reload-dir packages/grammar-py/src   # dev server (--reload-dir: don't watch the whole monorepo)
```

Toolkit smoke tests (after `pnpm build:toolkit`): `node test/smoke-{vue,ce,react,exports}.mjs` in `packages/grammar`.

Local query backends (server-side data dev/testing): **DuckDB** (`dev/duckdb/README.md`) is the no-container path — `seed_duckdb.py` loads any CSV dir into a local `.duckdb` file + `duckdb-backends.json`; **StarRocks** (`dev/starrocks/README.md`) is the container path — docker compose up, then `seed_starrocks.py`. Both seed scripts default to the committed `sample-data/penguins` package (a single-table, in-repo example) so remote mode runs on a one-table example; pass a CSV dir (e.g. `sample-data/pcx`) to seed anything else. Both share CSV cleaning/typing/FK carry-through so results match. `.vscode/tasks.json` **Data:** tasks automate each (`Data: Regenerate + seed pcx` for StarRocks, `Data: Regenerate + seed pcx (DuckDB)` for DuckDB) — both chain `gen_datapackage.py` → seed. `UDI_STARROCKS_TEST=1 uv run pytest tests/test_query_parity.py` runs parity goldens on live StarRocks; the default `uv run pytest` already runs them on DuckDB. To point the chat back at the bundled HuBMAP CSV dumps (browser/interactive mode, no server-side backend), run the **Data: Use HuBMAP (CSV, browser mode)** task — it's `scripts/set-chat-data-source.mjs <package>`, which sets `VITE_UDI_DATA_PACKAGE` and disables `VITE_UDI_REMOTE_PACKAGE` in `packages/chat/.env.local`.

## CI / Releases (.github/workflows/)

Path-filtered per package: `ci-chat.yml`, `ci-toolkit.yml` (also builds Storybook), `ci-python.yml`, `ci-site.yml`. GitHub Pages deploy (`pages.yml`) publishes `apps/site/dist` as is: landing page + docs at `/udi-yac/`, grammar pages at `/udi-yac/grammar/` (editor at `/udi-yac/grammar/editor/`), and the app page at `/udi-yac/app/` (Astro Starlight; the app page embeds the `udi-yac` library build, not the standalone SPA; `ci-site.yml` builds it on PRs). The chat serves pcx, committed at `sample-data/pcx/` (de-identified, approved for public release). Its `datapackage.json` is generated by `scripts/gen_datapackage.py` (which embeds `example_prompts.json` as `udi:example_prompts`); `ci-python.yml` regenerates it and fails on any diff, so rerun the generator after editing a CSV or `data_dictionary.csv`. Releases are tagged per package — `udi-yac-vX.Y.Z`, `udi-toolkit-vX.Y.Z`, `udiagent-vX.Y.Z`, `udi-grammar-py-vX.Y.Z` (`release-*.yml`). The `Main Branch Protection` ruleset requires a PR for every change to `main`, so **no release workflow bumps versions or pushes to `main`** — bump the version in a PR, merge it, then trigger the publish:

| Package          | Publish trigger                                                        |
| ---------------- | ---------------------------------------------------------------------- |
| `udi-toolkit`    | push tag `udi-toolkit-vX.Y.Z`                                          |
| `udi-yac`        | push tag `udi-yac-vX.Y.Z`                                              |
| `udiagent`       | publish a GitHub Release tagged `udiagent-vX.Y.Z`                      |
| `udi-grammar-py` | `workflow_dispatch` (publishes whatever version `pyproject.toml` says) |

A `udiagent` version bump must also rerun `uv run --project packages/agent --extra server python packages/agent/scripts/gen_openapi.py`: the committed `packages/agent/openapi.json` (source of the site's HTTP API reference, drift-checked in `ci-python.yml`) carries the version. Both npm workflows verify the tag matches the in-tree `package.json` version and fail if it doesn't. Their **filenames are load-bearing** — npm trusted publishing (OIDC) is bound to the repo _and_ workflow filename, so renaming them breaks publishing. **No release ordering**: `udi-yac` lists udi-toolkit only as a `devDependency` and its library build bundles the toolkit into `dist/`, so the published tarball never references udi-toolkit and the two packages publish independently. The agent deploys as a container: `build-and-push-agent-ecr.yml` pushes an image per agent change on `main` (tagged with the commit SHA) to ECR, which runs on ECS; the ECS service and IAM definitions are not in this repo.

## Architecture

### UDI Grammar Spec

JSON spec with three top-level keys: **`source`** (CSV data sources), **`transformation`** (groupby, rollup, binby, join, derive, filter, orderby, kde), **`representation`** (bar/point/line/area/arc/text/rect/geometry layers or row-based tables). Canonical TypeScript definition: `packages/grammar/GrammarTypes.ts`; `UDIGrammarSchema.json` (checked in at `packages/grammar/`) is generated from it via `pnpm --filter udi-toolkit build-schema`.

### Visualization templates & review (`apps/template-studio`)

The agent generates charts from **templates**: partial grammar specs with placeholders (`<E>`, `<F:n>`, `<M>`, `<MARGINAL:D1,D2>`, `<E1.r.E2.id.from>`) bound to real fields at request time. Python is the source of truth — author in `packages/agent/scripts/template_viz_generation.py`, then `uv run python scripts/regenerate_vis_tools.py` (emits `data/skills/template_visualizations.json` → `generated_vis_tools.py`, both `DO NOT EDIT`). Placeholder resolution lives only in `udiagent.vis_generate._resolve_placeholder`. Tool names are derived from description keywords unless a template sets `name_hint`, which the survival variants do — their descriptions share a vocabulary, so derived names collide.

A rendered chart carries its provenance: `meta.tool_used` + `meta.tool_args` on the `RenderVisualization` tool call, plus `meta.tweakable_params` (the _encoded_ field placeholders — see `template_tweakable_params`). Chat's tweak dropdowns use it to change a binding via `POST /v1/yac/vis_instantiate`, which re-resolves the template server-side, rather than rewriting the finished spec — a rewrite cannot follow a binding into `derive` expressions or the spec `title`, and renaming a groupby drops the column those still reference. Specs without provenance keep the older spec-rewrite path (`packages/chat/src/utils/specMutations.ts`). Besides field bindings, a template can expose **choices** (`udiagent.choices`: `<ESTIMATOR>`, `<HORIZON>`, `<CI>`). These are optional enum tool params that resolve to literals and show up as tweak-panel dropdowns with no frontend change. The survival curves use them for the estimator, the time span (default 5 years, cut _after_ the estimate) and the 95% log-log Greenwood band. A **label** (`choices.LABELS`, e.g. `<ENDPOINT>`) is different: an optional enum the model sets that only fills title text server-side ("Overall survival curves for …"). It appears in `title_template`, never in the spec, and is deliberately kept out of the tweak panel, because changing it would relabel the chart without changing what it computes.

**Dynamic stratification.** A stratified chart splits by a `stratum` column it derives, not by the stratifier itself, so the strata can be _groups_ of values rather than the field's raw domain: `<GROUP:E1.F4>` resolves to that derive expression (a nested `Expr.cond`, so it compiles for both executors). The payload — named nominal groups plus an auto `Other`, or ascending quantitative cut points, capped at 10 strata — is defined and validated in `udiagent.stratify`, travels as JSON in the template's optional `grouping` tool argument (so `toolArgs` stays a string map and no transport changed), and is edited by `StratifierGroupingControl` in chat, which draws the field's distribution and lets a reader drag the thresholds. No grouping resolves to the field itself, which is what keeps every pre-existing stratified chart unchanged; a _quantitative_ stratifier must be cut, since it has no categories to draw a curve for. A stratifier a subject has **several** of — a related table with one row per (subject, value) — needs `<GROUPTAG:…>`/`<GROUPLABEL:…>` instead, which reduce the match per subject _before_ labelling so the curves partition; grouping such a table row-wise puts a subject with a matching and a non-matching row in both curves.

`apps/template-studio` (dev-only, `pnpm dev:template-studio`, port 5175) renders every template live against sample data for human review. It does **not** reimplement placeholder resolution: `packages/agent/scripts/export_template_previews.py` resolves templates with the production `validate_bindings`/`instantiate_template` and writes `public/template_previews.json` (gitignored, regenerated on dev/build; needs `uv`). Review decisions persist to the sidecar `packages/agent/src/udiagent/data/skills/template_reviews.json` via a Vite dev-server API (`vite-plugin-review-store.ts`, `apply: 'serve'` — a built copy is read-only). Reviews are keyed by `sha256(spec_template)[:12]`, not the generated tool name, which embeds a positional index and renames on insert/reorder. Full guide: `.claude/skills/vis-template-authoring/SKILL.md`.

### Filters

**One filter per column.** Chat and charts share one filter per `(entity, field)`: `col:{entity}.{field}` in `dataFiltersStore.dataSelections`, with `filterOrigins` recording who set it last (`chat` | `chart`) and the last edit replacing it. Host filters (`host-filter-{id}`) stay separate — the embedding page owns them — and read-only to the agent. A chart keeps its own per-uuid selection in the toolkit (shared selection names break the toolkit's brushes), but `DashboardCard` writes its click or brush into the column filters on its fields (`applyChartSelection`, reading only its own selection and only when it changed) and passes back a selection composed from them (`composeChartSelection`), so a filter set anywhere is drawn on every chart that selects on that column. Viz uuids are not named filters; every chart, the source included, is filtered by the column filters. A chart-made filter outlives its chart; its chat widget sits at `brushAnchors`.

**The agent.** Each completions request carries the active filter set (`filters`, built by `agentFilterState`; read by `udiagent.filters`), stated under "Current filters" in the orchestrate, filter and explain prompts — the transcript's `FilterData` calls show only what was first asked for, and past ones are answered in the history as possibly superseded. The orchestrator's `FilterData` tool only routes: a separate filter call turns the request into `ApplyFilterOperations` (add / modify / remove / clear), validated against the schema, the domains and that state, retried with every rejection replayed as in vis generation, and returned as one `FilterData` call per operation (`op` absent = add). Chat's `syncFiltersFromMessages` applies each call **once** (`appliedFilterOps`), so later syncs never undo user edits and a reset replays to the same state; ids in older sessions (`message-filter-{i}-{j}`) map to columns while replaying. Session exports carry the column filters, scopes and origins in an optional `filters` block.

**Scope.** A filter may have a scope (`filterScopes`: subject entity + `match` any/all/none; absent = row-level): `getNamedFilters` then reaches every table through the subject's key via `getSubjectRelationship` (direct FKs only), including the filter's own table, which keeps every row of a matching subject. Both executors implement `match: 'none'`; parity goldens cover all three matches, same- and cross-table.

### Dev/test data (single source of truth)

Sample data packages live once at repo-root **`sample-data/`** (HuBMAP package fetched fresh from the production portal `…/metadata/v0/udi/`, plus penguins + `hubmap_cube/`, a small pre-aggregated marginal cube derived from `hubmap/donors.tsv` by `scripts/gen-cube-sample-data.mjs` so `data_cube`-tagged templates have data to render against). `scripts/copy-sample-data.mjs` syncs it into each frontend's static dir on dev/build (`packages/chat/public/data`, `apps/template-studio/public/data`, `apps/site/public/app/data` — all gitignored, wired via each package's `sync-data` script); the toolkit's Storybook mounts it via `staticDirs` (`.storybook/main.ts`, served at `/data`). **Edit `sample-data/`, not the `public/data` copies.** `sample-data/catalog.json` lists the packages and predefined sessions (`<pkg>/sessions/*.json`, session exports) the public site offers: the site's app page reads it for `?package=<id>&session=<id>` and its dataset switcher (`apps/site/src/components/AppShell.tsx`, logic in `src/lib/catalog.ts`), the landing page for its cards. The chat's `src/app/catalog.test.ts` fails if a session charts a table its package lacks. The standalone chat app knows nothing of the catalog: it is configured only by env vars. Chat defaults to the bundled `/data/hubmap/datapackage.json` (override with `VITE_UDI_DATA_PACKAGE`). The Python agent's `packages/agent/data/` is separate (JSON/JSONL benchmark fixtures, not these tabular packages).

### Data Flow

```
Data package load (once per session):
  chat dataPackageStore.fetchDataPackage(path)
    → udi-toolkit loadDataPackage(sources, { onEntityDomains, ... })
      → fetches/parses each CSV once (Arquero), seeds shared Pinia DataSourcesStore
      → Web Worker streams per-field domains back
User query → chat ChatPanel → POST /v1/yac/completions (udiagent.server)
  → Orchestrator.run(messages, data_schema, data_domains)
    → GPT tool-calling (CreateVisualization, FilterData, FreeTextExplain, ClarifyVariable, Rebuff)
    → skills-based UDI grammar spec generation + schema validation w/ bounded retry
  → tool_calls list → dashboardStore (Zustand) → DashboardCard → UDIVis (reads cached tables)
```

**Server-side data mode (alternative to the browser Arquero path above):** a data package can be backed by a database instead of CSVs. The agent compiles the grammar's `transformation` pipeline to SQL ("Compiler B") and runs it against StarRocks/DuckDB via `POST /v1/yac/query`; schema/domains come from `GET /v1/yac/metadata`. The toolkit's Arquero executor is "Compiler A" (the reference semantics); parity between the two is test-enforced (`packages/agent/tests/test_query_parity.py` vs goldens generated by the real Arquero executor). Enable per-package with `VITE_UDI_REMOTE_PACKAGE`; configure backends with `UDI_QUERY_BACKENDS`. **Full guide: `packages/agent/src/udiagent/query/README.md`.**

### Key details

- **udi-toolkit** (`packages/grammar/`) exposes `UDIVis` plus headless APIs from `udi-toolkit/react` (and `/ce`): `loadDataPackage`, `queryData` (memoized per sources/transformations/selectionHash/tablesVersion; `{ displayDataOnly: true }` skips the allData pass), `subscribeToSelections`, `clearAllSelections`. All share one Pinia `DataSourcesStore` singleton. Sources, `*.stories.ts`, and `.storybook/` sit flat at the package root; Storybook deliberately loads `.storybook/vite.config.stub.ts` instead of the package's `vite.config.js` (the lib build — dts emit, vue/pinia externalized — would break the preview).
- **chat** bridges the toolkit as a Vue Custom Element via `udi-toolkit/react`. Zustand stores are **vanilla** (`createStore`), instantiated per-provider in `src/app/UDIChatContext.tsx` — never import a store module directly into a component. Pinia is the single source of truth for brush selections; no React-side mirror. Path alias `@/` → `src/`. Debug mode: type `//admin` in chat input.
- **Chart history sent to the model is compacted.** The client echoes each earlier chart back as a `RenderVisualization` call carrying its full spec. `normalize_tool_calls` (`udiagent.messages`) shows a template-made chart to the model as `chart_id` + `template_tool` + `template_args` instead (freehand charts keep their spec). The internal orchestrator tool `GetVisualizationSpec(chart_id)` reads a full spec back when a question needs it, and marks the chart revealed for the rest of the turn. A long spec made follow-ups reverse-engineer the template call, and the model misread its derived columns as options to set.
- **HTTP API spec.** `packages/agent/openapi.json` is FastAPI's `app.openapi()`, written by `scripts/gen_openapi.py` and rendered by `starlight-openapi` at `/udi-yac/docs/backend/http-api/`. Describe endpoints where they're declared: `summary`/`tags`/`responses=` on the route (docs-only models in `server/models.py`, declared via `responses=` so they never filter output) and `Field(description=…)` on request models. `verify_jwt` carries an `HTTPBearer(auto_error=False)` dependency only so the spec shows the bearer scheme.
- **agent** is a publishable library — configuration via constructor params, not env vars; server (`udiagent.server`, `[server]` extra) is a reference app; JWT auth (`INSECURE_DEV_MODE=1` skips in dev); langfuse optional via `_compat.py`, as is Bedrock SigV4 (`bedrock=True` → `openai.providers.bedrock`, `[bedrock]` extra).
- **Site** (`apps/site`, `pnpm dev:site`; local dev in `apps/site/README.md`). The app page imports `udi-yac` from `packages/chat/dist` (the library build), so chat changes reach it only through **Dev: chat library (watch)**. It reads the chat's `VITE_UDI_*` agent settings (`envDir` is `packages/chat`). **Dev: all** starts the site, the library watch and the agent. The grammar pages (`src/content/docs/grammar/*.mdx`, specs in `src/grammar/`) draw live charts with `<udi-vis>` from `udi-toolkit/ce` (`components/UdiVis.astro`); the editor (`src/pages/grammar/editor.astro` + `components/GrammarEditor.tsx`, Monaco validating against `packages/grammar/UDIGrammarSchema.json`) reads lz-string `?spec=`, and `/udi-yac/grammar/` redirects the old demo's `#/Editor?spec=…` hash links. Specs keep page-relative `./data/` paths; `grammar/urls.ts` `resolveSpec` points them at `/udi-yac/app/data/`. The HuBMAP portal's CORS admits only the Pages origin, so HuBMAP specs read `sample-data/hubmap` in dev. Starlight with `base: '/udi-yac'`, docs under `src/content/docs/docs/`. Hand-written user pages live in `docs/using/`. `scripts/sync-docs.mjs` (run on dev/build, output gitignored) copies the package READMEs into `docs/integrate/` and the agent's README + `packages/agent/docs/*.md` + query README into `docs/backend/` (repo-relative links become GitHub URLs, or site links when they target another synced file), renders the Python API reference (`docs/backend/python-api.md`) from docstrings with `uvx griffe2md` (config: `[tool.griffe2md]` in the agent's `pyproject.toml`), and builds `docs/charts.md` from `template_visualizations.json`; `starlight-typedoc` renders `packages/chat/src/index.ts` into `docs/api/`. **Edit the READMEs/docs/docstrings/TSDoc, not the generated pages.** The agent's env-var table lives in `packages/agent/docs/server.md`, generated by `scripts/gen_env_docs.py`. Starlight doesn't prefix markdown links with `base`, so content links spell out `/udi-yac/…`.
- Feature boundaries in chat follow bulletproof-react: `app/`, `features/{chat,dashboard,data-package,tool-calls}` with `index.ts` barrels, shared code in top-level `components/`/`stores/`/`types/`/`utils/`.

## Code Style

- Prettier: `singleQuote: true`, `printWidth: 100`; 2-space indent, LF. Root husky + lint-staged run prettier on staged files.
- Vue 3 Composition API with `<script setup>` (grammar); React function components + hooks (chat).
- Strict TypeScript; prefer `unknown` + narrowing over `any`.
- Python ≥ 3.12 (agent) / ≥ 3.13 (grammar-py), managed via uv; pytest for tests.

# AWS Guidance

- Where these AWS rules conflict with the project's own instructions, the
  project's instructions take precedence.
- Prefer the AWS MCP Server for AWS interactions — it provides sandboxed
  execution, observability, and audit logging. If unavailable, use the
  AWS CLI directly.
- Before starting a task, check whether a relevant AWS skill is available.
  Load the skill with `retrieve_skill` and prefer its guidance over
  general knowledge.
- When uncertain about specific AWS details (API parameters, permissions,
  limits, error codes), verify against documentation rather than guessing.
  State uncertainty explicitly if you cannot confirm.
- When creating infrastructure, prefer infrastructure-as-code (AWS CDK or
  CloudFormation) over direct CLI commands.
- When working with infrastructure, follow AWS Well-Architected Framework
  principles.
- Do not use em dashes in AWS resource names or descriptions. Use
  hyphens instead.

## Secret Safety

- MUST load the `aws-secrets-manager` skill first for any secret,
  credential, API key, token, or password task. MUST NOT call
  `secretsmanager get-secret-value` or `batch-get-secret-value`, and MUST
  NOT hit the Secrets Manager Agent daemon directly. MUST use
  `{{resolve:secretsmanager:secret-id:SecretString:json-key}}` with
  `asm-exec` so the secret resolves at runtime without entering context.
