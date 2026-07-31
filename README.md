# udi-yac

Monorepo for the **Universal Discovery Interface (UDI)** — an AI-powered system for querying and visualizing biomedical datasets via natural language.

Formerly four separate repositories, merged with full commit history preserved via `git subtree`. Plain `git log -- packages/<name>` stops at the import boundary (files lived at different paths before); to browse a package's pre-merge history, follow the second parent of its import commit:

```bash
git log "$(git log --merges --grep="Add 'packages/chat/'" -n1 --format=%H)^2"
```

## Packages

| Directory                                    | Published as                                                        | Stack                    | Role                                       |
| -------------------------------------------- | ------------------------------------------------------------------- | ------------------------ | ------------------------------------------ |
| [`packages/grammar`](packages/grammar)       | [`udi-toolkit`](https://www.npmjs.com/package/udi-toolkit) (npm)    | Vue 3, Vite              | Grammar types, UDIVis component, Storybook |
| [`apps/grammar-app`](apps/grammar-app)       | — (private)                                                         | Vue 3, Quasar, Vite      | Demo app for the grammar/toolkit           |
| [`packages/chat`](packages/chat)             | [`udi-yac`](https://www.npmjs.com/package/udi-yac) (npm)            | React 19, Tailwind, Vite | Chat UI — library + standalone SPA         |
| [`packages/agent`](packages/agent)           | [`udiagent`](https://pypi.org/project/udiagent/) (PyPI)             | Python, OpenAI, FastAPI  | LLM orchestrator + reference server        |
| [`packages/grammar-py`](packages/grammar-py) | [`udi-grammar-py`](https://pypi.org/project/udi-grammar-py/) (PyPI) | Python, hatchling        | Python builder for UDI grammar specs       |

Former homes: [udi-grammar](https://github.com/hms-dbmi/udi-grammar), [udi-chat-react](https://github.com/NickAkhmetov/udi-chat-react), [UDIAgent](https://github.com/hms-dbmi/UDIAgent), [udi-grammar-py](https://github.com/hms-dbmi/udi-grammar-py).

## Quickstart

**Onboarding (one command).** Requires [Node ≥ 22](https://nodejs.org) with pnpm (`corepack enable`) and [uv](https://docs.astral.sh/uv/). Then:

```bash
node scripts/setup.mjs      # or: pnpm setup
```

This creates local env files from their templates, installs the JS (pnpm) and Python (uv) workspaces, and builds the toolkit. Set `OPENAI_API_KEY` in `packages/agent/.env`, then start the stack with the **Dev: chat + agent** VS Code task (Ctrl/Cmd+Shift+B) or `pnpm dev:chat` + `pnpm dev:agent` (other servers: `pnpm dev:grammar`, `pnpm dev:storybook`).

Manual/CI steps — JavaScript/TypeScript (pnpm workspace, `udi-toolkit` consumed via `workspace:*`, so build it before the chat app):

```bash
pnpm install
pnpm build:toolkit     # udi-toolkit → packages/grammar/dist
pnpm build:chat        # standalone chat SPA
pnpm build:chat:lib    # udi-yac library build
pnpm build:grammar     # quasar demo app
pnpm build:storybook
pnpm test              # builds toolkit, then runs all JS tests
```

Python (independent uv projects, shared root uv workspace):

```bash
cd packages/agent && uv sync --extra server --extra langfuse --extra test && uv run pytest
cd packages/grammar-py && uv sync && uv run pytest
```

### Running against data: browser (Arquero) vs. server-side (remote)

The chat gets its data one of two ways. Both run the same grammar; the SQL
executor's results are held in parity with the Arquero one by a test suite.

**Browser / interactive mode (default).** CSVs load into the browser and the
toolkit runs the grammar pipeline client-side with Arquero — no database, no
query backend. The chat defaults to the bundled HuBMAP package
(`/data/hubmap/datapackage.json`); reset to it or switch to another bundled
package with `node scripts/set-chat-data-source.mjs [package]` (or the **Data:
Use HuBMAP (CSV, browser mode)** VS Code task).

**Server-side / remote mode.** Data stays in a database; the agent compiles the
grammar to SQL and runs it there, so the browser never loads the CSVs. Both
backends seed the committed `sample-data/penguins` package by default.

- **DuckDB — no container** (easiest). In VS Code, run the **Data: Use penguins
  (remote/DuckDB)** task (seeds penguins + points the chat at it), then **Dev:
  chat + agent (remote/DuckDB)**. Manually:

  ```bash
  uv run --project packages/agent --extra duckdb \
    python packages/agent/scripts/seed_duckdb.py            # → packages/agent/penguins.duckdb
  UDI_QUERY_BACKENDS=packages/agent/duckdb-backends.json INSECURE_DEV_MODE=1 \
    uv run --project packages/agent --extra server --extra duckdb \
    fastapi dev packages/agent/src/udiagent/server/app.py --port 8007
  ```

  Then `node scripts/set-chat-data-source.mjs penguins --remote` and
  `pnpm dev:chat`. (The plain `pnpm dev:agent` / **Dev: agent** task starts the
  agent _without_ `UDI_QUERY_BACKENDS`, so remote packages 404 — use the remote
  task/command above.) Full guide: [`dev/duckdb/README.md`](dev/duckdb/README.md).

- **StarRocks — Docker** (closest to a production OLAP target):

  ```bash
  docker compose -f dev/starrocks/docker-compose.yml up -d
  cd packages/agent && uv sync --extra starrocks && uv run python scripts/seed_starrocks.py
  ```

  Then set `VITE_UDI_REMOTE_PACKAGE=penguins`, start the agent
  (`UDI_QUERY_BACKENDS=$(pwd)/starrocks-backends.json`), and `pnpm dev:chat`.
  Full guide: [`dev/starrocks/README.md`](dev/starrocks/README.md).

How the compiler and parity work: [`packages/agent/src/udiagent/query/README.md`](packages/agent/src/udiagent/query/README.md).

## Sample data

Dev/test data packages live once at [`sample-data/`](sample-data) (the single source of truth). Each frontend's `dev`/`build` syncs it into its own gitignored `public/data` via [`scripts/copy-sample-data.mjs`](scripts/copy-sample-data.mjs); the toolkit's Storybook serves it via `staticDirs`. Edit `sample-data/`, not the copies. See [`sample-data/readme.md`](sample-data/readme.md).

## Releases

Tags are per-package: `udi-yac-vX.Y.Z`, `udi-toolkit-vX.Y.Z`, `udiagent-vX.Y.Z`, `udi-grammar-py-vX.Y.Z`. Because `udi-yac` depends on `udi-toolkit: workspace:*` (rewritten to the exact in-tree version at publish time), **publish udi-toolkit before udi-yac** whenever the toolkit version moved.
