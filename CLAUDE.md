# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Overview

Monorepo for the **Universal Discovery Interface (UDI)** — an AI-powered system for querying and visualizing biomedical datasets via natural language. Formerly four separate repos, merged via `git subtree` with full history (browse a package's pre-merge history via the second parent of its `Add 'packages/<name>/'` merge commit).

| Directory              | Published as                               | Stack                                | Role                                                              |
| ---------------------- | ------------------------------------------ | ------------------------------------ | ----------------------------------------------------------------- |
| `packages/grammar/`    | `udi-toolkit` (npm, from `src/components`) | TypeScript, Vue 3, Quasar, Vite      | Grammar types + UDIVis + Storybook + demo app (`udi-grammar-app`) |
| `packages/chat/`       | `udi-yac` (npm)                            | TypeScript, React 19, Tailwind, Vite | Chat UI — library + standalone SPA                                |
| `packages/agent/`      | `udiagent` (PyPI)                          | Python, OpenAI, FastAPI (optional)   | LLM orchestrator + reference FastAPI server                       |
| `packages/grammar-py/` | `udi-grammar-py` (PyPI)                    | Python, hatchling                    | Python library for building UDI grammar specs                     |

Two workspaces share the repo root:

- **pnpm workspace** (`pnpm-workspace.yaml`): `packages/chat`, `packages/grammar`, and the nested `packages/grammar/src/components` (udi-toolkit). `packages/chat` depends on `udi-toolkit: workspace:*` — toolkit exports point at `dist/`, so **build the toolkit before building/testing chat**. Root `.npmrc` sets `shamefully-hoist=true` (required by Quasar under pnpm). Dependency `overrides` (former yarn `resolutions`) live in `pnpm-workspace.yaml`; the vite pin is deliberately scoped to `udi-toolkit>vite` / `@quasar/app-vite>vite` so chat's vitest keeps its own internal vite.
- **uv workspace** (`pyproject.toml`): `packages/agent` + `packages/grammar-py`, single root `uv.lock`. `udiagent[codegen]` resolves `udi-grammar-py` from the workspace during development. Note: `uv build` in a member dir writes to the workspace **root** `dist/` unless you pass `--out-dir`.

## Build & Dev Commands

Root scripts (pnpm ≥ 11):

```bash
pnpm install            # whole JS workspace; runs quasar prepare + husky
pnpm build:toolkit      # udi-toolkit build:all (Vue + CE + React targets)
pnpm build:chat         # toolkit, then chat standalone SPA
pnpm build:chat:lib     # toolkit, then udi-yac library build
pnpm build:grammar      # quasar demo app (base path /udi-yac/grammar/)
pnpm build:storybook    # storybook static build
pnpm test               # toolkit build, then all JS tests
pnpm lint / pnpm format # recursive
```

Per-package (use `--filter`, no cd needed): `pnpm --filter udi-yac typecheck|test|lint|format:check|build|build:lib`, `pnpm --filter udi-toolkit build:all`, `pnpm --filter udi-grammar-app dev|storybook`.

Python:

```bash
cd packages/agent && uv sync --extra server --extra langfuse --extra test && uv run pytest
cd packages/grammar-py && uv sync && uv run pytest
uv run fastapi dev packages/agent/src/udiagent/server/app.py --port 8007   # dev server
```

Toolkit smoke tests (after `pnpm build:toolkit`): `node test/smoke-{vue,ce,react,exports}.mjs` in `packages/grammar/src/components`.

## CI / Releases (.github/workflows/)

Path-filtered per package: `ci-chat.yml`, `ci-toolkit.yml`, `ci-python.yml`. Combined GitHub Pages deploy (`pages.yml`): chat SPA at `/udi-yac/`, grammar demo at `/udi-yac/grammar/`. Releases are tagged per package — `udi-yac-vX.Y.Z`, `udi-toolkit-vX.Y.Z`, `udiagent-vX.Y.Z`, `udi-grammar-py-vX.Y.Z` (`release-*.yml`; udiagent publishes on release-published events guarded by tag prefix). **Release ordering**: `udi-yac`'s `workspace:*` dep on udi-toolkit is rewritten to the exact in-tree version at publish time, so publish udi-toolkit first whenever its version moved. `deploy-agent.yml` needs the self-hosted EC2 runner registered to this repo.

## Architecture

### UDI Grammar Spec

JSON spec with three top-level keys: **`source`** (CSV data sources), **`transformation`** (groupby, rollup, binby, join, derive, filter, orderby, kde), **`representation`** (bar/point/line/area/arc/text/rect/geometry layers or row-based tables). Canonical TypeScript definition: `packages/grammar/src/components/GrammarTypes.ts`; `UDIGrammarSchema.json` is generated from it (`yarn build-schema` equivalent: `pnpm --filter udi-grammar-app build-schema`).

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

### Key details

- **udi-toolkit** (`packages/grammar/src/components/`) exposes `UDIVis` plus headless APIs from `udi-toolkit/react` (and `/ce`): `loadDataPackage`, `queryData` (memoized per sources/transformations/selectionHash/tablesVersion; `{ displayDataOnly: true }` skips the allData pass), `subscribeToSelections`, `clearAllSelections`. All share one Pinia `DataSourcesStore` singleton.
- **chat** bridges the toolkit as a Vue Custom Element via `udi-toolkit/react`. Zustand stores are **vanilla** (`createStore`), instantiated per-provider in `src/app/UDIChatContext.tsx` — never import a store module directly into a component. Pinia is the single source of truth for brush selections; no React-side mirror. Path alias `@/` → `src/`. Debug mode: type `!/admin` in chat input.
- **agent** is a publishable library — configuration via constructor params, not env vars; server (`udiagent.server`, `[server]` extra) is a reference app; JWT auth (`INSECURE_DEV_MODE=1` skips in dev); langfuse optional via `_compat.py`.
- Feature boundaries in chat follow bulletproof-react: `app/`, `features/{chat,dashboard,data-package,tool-calls}` with `index.ts` barrels, shared code in top-level `components/`/`stores/`/`types/`/`utils/`.

## Code Style

- Prettier: `singleQuote: true`, `printWidth: 100`; 2-space indent, LF. Root husky + lint-staged run prettier on staged files.
- Vue 3 Composition API with `<script setup>` (grammar); React function components + hooks (chat).
- Strict TypeScript; prefer `unknown` + narrowing over `any`.
- Python ≥ 3.12 (agent) / ≥ 3.13 (grammar-py), managed via uv; pytest for tests.
