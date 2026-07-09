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

JavaScript/TypeScript (pnpm workspace — `udi-toolkit` is consumed via `workspace:*`, so build it before the chat app):

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

## Releases

Tags are per-package: `udi-yac-vX.Y.Z`, `udi-toolkit-vX.Y.Z`, `udiagent-vX.Y.Z`, `udi-grammar-py-vX.Y.Z`. Because `udi-yac` depends on `udi-toolkit: workspace:*` (rewritten to the exact in-tree version at publish time), **publish udi-toolkit before udi-yac** whenever the toolkit version moved.
