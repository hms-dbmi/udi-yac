# udi-yac-site

The public YAC site, built with [Astro Starlight](https://starlight.astro.build/). `.github/workflows/pages.yml` publishes it at [hms-dbmi.github.io/udi-yac](https://hms-dbmi.github.io/udi-yac/):

| Path                       | What                                    | Source                                                   |
| -------------------------- | --------------------------------------- | -------------------------------------------------------- |
| `/udi-yac/`                | Landing page                            | `src/content/docs/index.mdx`                             |
| `/udi-yac/docs/…`          | Docs                                    | `src/content/docs/docs/`                                 |
| `/udi-yac/app/`            | The chat, with a dataset/session picker | `src/pages/app/`, embedding the `udi-yac` library        |
| `/udi-yac/grammar/`        | Grammar overview, tutorial, examples    | `src/content/docs/grammar/`, specs in `src/grammar/`     |
| `/udi-yac/grammar/editor/` | Grammar editor (Monaco + live chart)    | `src/pages/grammar/`, `src/components/GrammarEditor.tsx` |

## The app page

`/udi-yac/app/` is not the chat's standalone SPA. It is this site's page (`src/components/AppShell.tsx`), which renders `UDIChat` from the `udi-yac` library build (`packages/chat/dist`) under a bar for choosing a dataset and a predefined session.

- **Which datasets and sessions:** `sample-data/catalog.json`, which the landing page's cards also read. `?package=<id>&session=<id>` selects one; without it the first entry opens. A predefined session opens read-only (the chat's `readOnly`), with **Explore Data** to open the chat. The logic is in `src/lib/catalog.ts`, tested by `pnpm --filter udi-yac-site test`.
- **Adding a dataset:** put the package under `sample-data/<id>/` and add an entry to `catalog.json`. Predefined sessions are session exports (the dashboard's **Session → Export session**) saved as `sample-data/<id>/sessions/<name>.json` and listed under the entry. The chat's `src/app/catalog.test.ts` checks each one against its package.
- **Agent settings:** the page reads the chat's own `VITE_UDI_API_BASE_URL`, `VITE_UDI_REQUIRE_API_KEY`, `VITE_UDI_MODEL` and `VITE_UDI_ISSUE_REPORTING` (on for Pages). In dev they come from `packages/chat/.env.local`, as for **Dev: chat**; on Pages, from the repo vars. The chat's data-package variables are ignored here.
- **Data:** `sync-data` copies `sample-data/` to `public/app/data/` on dev and build. The packages' `udi:path` (`./data/<id>/`) resolves against the page, so the page must be served with its trailing slash.

To run the chat by itself against any data package, use the standalone app (`packages/chat`, **Dev: chat**), configured only by its env vars. See [Embed the chat](https://hms-dbmi.github.io/udi-yac/docs/integrate/chat/).

## Local development

The site's dev server serves the landing page, the docs, the grammar pages and the app page. Two things they read are built separately:

- **The `udi-yac` library build.** The app page imports `packages/chat/dist`, not the chat's source, so a chat change shows up only after a rebuild. **Dev: chat library (watch)** rebuilds it on every change. Without it, the page runs whatever `dist/` last held, or fails if `dist/` is missing or holds the standalone build.
- **The toolkit build.** The grammar pages render charts with `udi-toolkit/ce` and `udi-toolkit/react`, which resolve to `packages/grammar/dist`. Rerun `pnpm build:toolkit` after a toolkit change; for working on the toolkit itself, Storybook (`pnpm dev:storybook`) reloads from source.

The HuBMAP examples and tutorial read the HuBMAP portal's live metadata on the published site. The portal's CORS policy does not admit `localhost`, so in dev they read the copy in `sample-data/hubmap/` instead.

The VS Code tasks (**Terminal → Run Task…**) start the right combination:

| Task                          | Starts                                             | Gives you                                  |
| ----------------------------- | -------------------------------------------------- | ------------------------------------------ |
| **Dev: all**                  | everything below                                   | the whole site, as Pages lays it out       |
| **Dev: site**                 | Dev: site server + Dev: chat library (watch)       | landing, docs, grammar and `/udi-yac/app/` |
| **Dev: site server**          | this package, `:4321`                              | landing, docs, app page (current `dist/`)  |
| **Dev: chat library (watch)** | `vite build --mode lib --watch` in `packages/chat` | an up-to-date `packages/chat/dist`         |
| **Dev: agent**                | the agent server, `:8007`                          | asking questions in the chat               |

Open <http://localhost:4321/udi-yac/>. Browsing a predefined session needs no agent; asking a question does.

Without VS Code, run each in its own terminal from the repo root:

```bash
pnpm dev:site                                               # landing, docs, app page: :4321
pnpm --filter udi-yac exec vite build --mode lib --watch    # the library the app page embeds
pnpm dev:agent                                              # agent: :8007
```

`pnpm build:site` builds the toolkit, the library and the site in order.

The library watch build and the standalone build (`pnpm --filter udi-yac build`) both write `packages/chat/dist`, so whichever ran last wins. **Dev: chat** serves from source and touches neither.

Astro 7 starts `astro dev` in the background when it isn't attached to a terminal. If port `:4321` stays taken after you stop the task, run `pnpm --filter udi-yac-site exec astro dev stop`.

To check the real thing, run `pnpm build:site`, then `pnpm --filter udi-yac-site preview`; `apps/site/dist` is exactly what `pages.yml` publishes.

## Where the content comes from

- `src/content/docs/docs/using/`: user docs, written by hand.
- `src/content/docs/docs/integrate/`, `docs/backend/` and `docs/charts.md`: generated by `scripts/sync-docs.mjs` on every dev and build run, and gitignored.
  - The integrate and backend pages are copied from the package READMEs and `packages/agent/docs/`. Relative links become GitHub URLs, or site links when they point at another synced file.
  - The Python API reference (`backend/python-api.md`) is rendered from the agent's docstrings by `uvx griffe2md`, configured under `[tool.griffe2md]` in `packages/agent/pyproject.toml`. Without `uv` installed, a local build skips this page with a warning; CI fails instead.
  - The chart gallery is built from the agent's `template_visualizations.json`.
  - **Edit the source, not these pages.**
- `src/content/docs/docs/api/`: generated by `starlight-typedoc` from `packages/chat/src/index.ts` on every dev and build run, and gitignored. It needs the toolkit's `dist/` (`pnpm build:toolkit`).

Starlight doesn't prefix links written in markdown with `base`, so links in the content spell out `/udi-yac/…`.
