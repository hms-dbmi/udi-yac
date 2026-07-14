# UDI Grammar App

`udi-grammar-app` is a [Quasar](https://quasar.dev/) demo application for the
Universal Discovery Interface (UDI) Grammar. It provides an interactive code
editor for authoring UDI grammar specs and previewing the resulting
visualizations, built on top of the [`udi-toolkit`](../../packages/grammar)
library.

This app is private (not published); it exists to exercise and showcase the
toolkit. For the grammar reference, the spec examples, and the `udi-toolkit`
API (`UDIVis`, `queryData`, `loadDataPackage`, `subscribeToSelections`), see the
toolkit README in [`packages/grammar`](../../packages/grammar).

## Development

The app depends on `udi-toolkit` via `workspace:*`, so build the toolkit first
(the app's `quasar.config.ts` additionally aliases `udi-toolkit` to the
toolkit's source, so component edits hot-reload here). From the repo root:

```bash
pnpm build:toolkit      # build udi-toolkit
pnpm dev:grammar        # start the demo app (quasar dev)
```

Or scoped to this package:

```bash
pnpm --filter udi-grammar-app dev
```

Each `dev`/`build` first runs `sync-data` to copy the shared
[`sample-data/`](../../sample-data) into this app's gitignored `public/data`.

### Build for production

```bash
pnpm build:grammar      # from the repo root (base path /udi-yac/grammar/)
# or: pnpm --filter udi-grammar-app build
```
