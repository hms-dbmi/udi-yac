# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Overview

Monorepo for the **Universal Discovery Interface (UDI)** — an AI-powered system for querying and visualizing biomedical datasets via natural language. `packages/` holds publishable libraries; `apps/` holds private applications. Formerly four separate repos, merged via `git subtree` with full history (browse a package's pre-merge history via the second parent of its `Add 'packages/<name>/'` merge commit). The old `udi-grammar` repo (imported as `packages/grammar/`) was later split in-tree into `packages/grammar` (udi-toolkit, formerly nested at `src/components/`) and `apps/grammar-app` — use `git log --follow` on files in either to trace history across those renames.

| Directory              | Published as            | Stack                                | Role                                          |
| ---------------------- | ----------------------- | ------------------------------------ | --------------------------------------------- |
| `packages/grammar/`    | `udi-toolkit` (npm)     | TypeScript, Vue 3, Vite              | Grammar types + UDIVis + Storybook            |
| `apps/grammar-app/`    | — (private)             | TypeScript, Vue 3, Quasar, Vite      | Demo app (`udi-grammar-app`) for the toolkit  |
| `packages/chat/`       | `udi-yac` (npm)         | TypeScript, React 19, Tailwind, Vite | Chat UI — library + standalone SPA            |
| `packages/agent/`      | `udiagent` (PyPI)       | Python, OpenAI, FastAPI (optional)   | LLM orchestrator + reference FastAPI server   |
| `packages/grammar-py/` | `udi-grammar-py` (PyPI) | Python, hatchling                    | Python library for building UDI grammar specs |

Two workspaces share the repo root:

- **pnpm workspace** (`pnpm-workspace.yaml`): `packages/chat`, `packages/grammar` (udi-toolkit), `apps/grammar-app`. Both chat and grammar-app depend on `udi-toolkit: workspace:*` — toolkit exports point at `dist/`, so **build the toolkit before building/typechecking its consumers**. grammar-app additionally aliases `udi-toolkit` to the toolkit's _source_ in its `quasar.config.ts` `extendViteConf`, so component edits hot-reload in the demo app (typechecking still reads `dist/index.d.ts`). Root `.npmrc` sets `shamefully-hoist=true` (required by Quasar under pnpm). Dependency `overrides` (former yarn `resolutions`) live in `pnpm-workspace.yaml`; the vite pin is deliberately scoped to `udi-toolkit>vite` / `@quasar/app-vite>vite` so chat's vitest keeps its own internal vite.
- **uv workspace** (`pyproject.toml`): `packages/agent` + `packages/grammar-py`, single root `uv.lock`. `udiagent[codegen]` resolves `udi-grammar-py` from the workspace during development. Note: `uv build` in a member dir writes to the workspace **root** `dist/` unless you pass `--out-dir`.

## Build & Dev Commands

Onboarding: `pnpm setup` (or `node scripts/setup.mjs`) — creates local env files from templates (`packages/chat/.env.local`, `packages/agent/.env`; never clobbers), `pnpm install`, builds the toolkit, and `uv sync --all-extras`. Start dev via the `.vscode/tasks.json` **Dev: chat + agent** task (default build task) or `pnpm dev:chat` / `dev:agent` / `dev:grammar` / `dev:storybook`.

Root scripts (pnpm ≥ 11):

```bash
pnpm install            # whole JS workspace; runs quasar prepare + husky
pnpm build:toolkit      # udi-toolkit build:all (Vue + CE + React targets)
pnpm build:chat         # toolkit, then chat standalone SPA
pnpm build:chat:lib     # toolkit, then udi-yac library build
pnpm build:grammar      # toolkit, then quasar demo app (base path /udi-yac/grammar/)
pnpm build:storybook    # toolkit storybook static build
pnpm test               # toolkit build, then all JS tests
pnpm lint / pnpm format # recursive
```

Per-package (use `--filter`, no cd needed): `pnpm --filter udi-yac typecheck|test|lint|format:check|build|build:lib`, `pnpm --filter udi-toolkit build:all|storybook|build-schema`, `pnpm --filter udi-grammar-app dev`.

Python:

```bash
cd packages/agent && uv sync --extra server --extra langfuse --extra test && uv run pytest
cd packages/grammar-py && uv sync && uv run pytest
uv run --project packages/agent --extra server fastapi dev packages/agent/src/udiagent/server/app.py --port 8007   # dev server
```

Toolkit smoke tests (after `pnpm build:toolkit`): `node test/smoke-{vue,ce,react,exports}.mjs` in `packages/grammar`.

Local query backends (server-side data dev/testing): **DuckDB** (`dev/duckdb/README.md`) is the no-container path — `seed_duckdb.py` loads any CSV dir into a local `.duckdb` file + `duckdb-backends.json`; **StarRocks** (`dev/starrocks/README.md`) is the container path — docker compose up, then `seed_starrocks.py`. Both share CSV cleaning/typing/FK carry-through so results match. `.vscode/tasks.json` **Data:** tasks automate each (`Data: Regenerate + seed pcx` for StarRocks, `Data: Regenerate + seed pcx (DuckDB)` for DuckDB) — both chain `gen_datapackage.py` → seed. `UDI_STARROCKS_TEST=1 uv run pytest tests/test_query_parity.py` runs parity goldens on live StarRocks; the default `uv run pytest` already runs them on DuckDB. To point the chat back at the bundled HuBMAP CSV dumps (browser/interactive mode, no server-side backend), run the **Data: Use HuBMAP (CSV, browser mode)** task — it's `scripts/set-chat-data-source.mjs <package>`, which sets `VITE_UDI_DATA_PACKAGE` and disables `VITE_UDI_REMOTE_PACKAGE` in `packages/chat/.env.local`.

## CI / Releases (.github/workflows/)

Path-filtered per package: `ci-chat.yml`, `ci-toolkit.yml`, `ci-python.yml`. Combined GitHub Pages deploy (`pages.yml`): chat SPA at `/udi-yac/`, grammar demo at `/udi-yac/grammar/`. Releases are tagged per package — `udi-yac-vX.Y.Z`, `udi-toolkit-vX.Y.Z`, `udiagent-vX.Y.Z`, `udi-grammar-py-vX.Y.Z` (`release-*.yml`; udiagent publishes on release-published events guarded by tag prefix). **Release ordering**: `udi-yac`'s `workspace:*` dep on udi-toolkit is rewritten to the exact in-tree version at publish time, so publish udi-toolkit first whenever its version moved. `deploy-agent.yml` needs the self-hosted EC2 runner registered to this repo.

## Architecture

### UDI Grammar Spec

JSON spec with three top-level keys: **`source`** (CSV data sources), **`transformation`** (groupby, rollup, binby, join, derive, filter, orderby, kde), **`representation`** (bar/point/line/area/arc/text/rect/geometry layers or row-based tables). Canonical TypeScript definition: `packages/grammar/GrammarTypes.ts`; `UDIGrammarSchema.json` (checked in at `packages/grammar/`) is generated from it via `pnpm --filter udi-toolkit build-schema`.

### Dev/test data (single source of truth)

Sample data packages live once at repo-root **`sample-data/`** (HuBMAP package fetched fresh from the production portal `…/metadata/v0/udi/`, plus penguins + loose HuBMAP CSVs + a curated `hubmap_examples/` subset). `scripts/copy-sample-data.mjs` syncs it into each frontend's static dir on dev/build (`packages/chat/public/data`, `apps/grammar-app/public/data` — both gitignored, wired via each package's `sync-data` script); the toolkit's Storybook mounts it via `staticDirs` (`.storybook/main.ts`, served at `/data`). **Edit `sample-data/`, not the `public/data` copies.** Chat defaults to the bundled `/data/hubmap/datapackage.json` (override with `VITE_UDI_DATA_PACKAGE`). The Python agent's `packages/agent/data/` is separate (JSON/JSONL benchmark fixtures, not these tabular packages).

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
- **chat** bridges the toolkit as a Vue Custom Element via `udi-toolkit/react`. Zustand stores are **vanilla** (`createStore`), instantiated per-provider in `src/app/UDIChatContext.tsx` — never import a store module directly into a component. Pinia is the single source of truth for brush selections; no React-side mirror. Path alias `@/` → `src/`. Debug mode: type `!/admin` in chat input.
- **agent** is a publishable library — configuration via constructor params, not env vars; server (`udiagent.server`, `[server]` extra) is a reference app; JWT auth (`INSECURE_DEV_MODE=1` skips in dev); langfuse optional via `_compat.py`.
- Feature boundaries in chat follow bulletproof-react: `app/`, `features/{chat,dashboard,data-package,tool-calls}` with `index.ts` barrels, shared code in top-level `components/`/`stores/`/`types/`/`utils/`.

## Code Style

- Prettier: `singleQuote: true`, `printWidth: 100`; 2-space indent, LF. Root husky + lint-staged run prettier on staged files.
- Vue 3 Composition API with `<script setup>` (grammar); React function components + hooks (chat).
- Strict TypeScript; prefer `unknown` + narrowing over `any`.
- Python ≥ 3.12 (agent) / ≥ 3.13 (grammar-py), managed via uv; pytest for tests.
