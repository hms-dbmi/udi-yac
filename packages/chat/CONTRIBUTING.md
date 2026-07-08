# Contributing to udi-yac

This guide explains how the codebase is organized, why it's organized that way, and how to make changes that fit the existing structure. The package publishes to npm as `udi-yac`; the repository directory remains `udi-chat-react`.

## Why this structure exists

`udi-yac` is a React port of a Vue 3 / Quasar app and ships in two modes — as a publishable library (the `<UDIChat>` component) and as a standalone SPA. To keep both modes maintainable as the feature set grows, the source is laid out in a [bulletproof-react](https://github.com/alan2207/bulletproof-react)-style: a small composition root, a flat collection of feature modules, and a few shared leaf layers.

The cost of forgetting the boundaries (any feature reaching into any other) is what bulletproof-react calls a "spider web of dependencies": a change to one feature triggers cascading rewrites across the codebase. We use [`eslint-plugin-project-structure`](https://www.npmjs.com/package/eslint-plugin-project-structure) to make those boundaries enforceable rather than aspirational.

The rules also encode the team's bias: **prefer locality**. Code that's only used by one feature lives inside that feature. Code that's truly cross-cutting (and there's not much of it) goes in shared layers.

## The four layers

```
src/
  app/                          # composition root
  features/{chat,dashboard,data-package,tool-calls}/
                                # the actual product surface
  components/ui/, lib/, utils/, stores/, types/
                                # shared leaves
  index.ts, index.css, env.d.ts, data/
                                # entry + demo glue
```

### `src/app/` — composition root

Contains the things that wire features together: the `UDIChat` root component, the `UDIChatProvider` context that owns every Zustand store instance, the error boundary, the `UDIChatConfig` type, and the runtime config validator. It's the only layer allowed to import from a feature's _internals_ (not just its barrel) — this is necessary because `UDIChatContext.tsx` imports `createXStore` factories from each feature's stores directory.

If something is "wiring" or "shell," it belongs here. If something is product surface, it does not.

### `src/features/*/` — the product

Every meaningful capability lives in a feature folder:

| Feature        | Owns                                                                                                       |
| -------------- | ---------------------------------------------------------------------------------------------------------- |
| `chat`         | The chat panel and its hooks, the conversation store, the `/v1/yac/completions` API client                 |
| `dashboard`    | The dashboard panel and pinned-viz cards, the dashboard / filter / selection / memory-bank stores          |
| `data-package` | Data package loading, the off-main-thread domain worker, structured-text parsing                           |
| `tool-calls`   | Renderers for each tool call (`ToolCallRenderer` and the per-tool components) plus the tool-call arg types |

Each feature has the same internal shape:

```
features/<name>/
  index.ts          # public barrel — only export what other features / app actually need
  types.ts          # feature-owned types (optional)
  components/       # PascalCase .tsx files
  hooks/            # custom hooks
  stores/           # vanilla Zustand stores
  api/              # backend clients
  utils/            # pure helpers
  workers/          # web workers
```

Not all subfolders are required. Add only what the feature needs.

### `src/components/ui/` — generic UI primitives

shadcn/ui-style primitives (button, dialog, tabs, …). These have no knowledge of UDI. They may import from `src/lib/` and other UI primitives, nothing else.

### `src/{lib,utils,types,stores}/` — shared leaves

These layers exist for things that are genuinely cross-feature.

- **`lib/`** — small UI helpers (currently just `cn()` for Tailwind class merging).
- **`utils/`** — pure functions used across features (currently `specMutations.ts` for UDI grammar walking).
- **`types/`** — types used by ≥3 features (currently `messages.ts` and `dataPackage.ts`).
- **`stores/`** — Zustand stores used by ≥2 features (currently just `globalStore.ts` for debug mode).

A type or helper used by one feature does **not** belong here — it belongs inside that feature.

## Module boundaries (the lint rule)

[`eslint.config.js`](eslint.config.js) wires up `project-structure/independent-modules` with these rules:

| Source file lives in   | May import from                                                                              |
| ---------------------- | -------------------------------------------------------------------------------------------- |
| `src/features/X/**`    | own family, other features' `index.ts` only, `src/{utils,types,lib,stores,components/ui}/**` |
| `src/app/**`           | any feature internal, all shared layers                                                      |
| `src/components/ui/**` | sibling UI, `src/lib/`                                                                       |
| `src/utils/**`         | `src/{utils,types,lib,stores}/`, feature barrels                                             |
| `src/types/**`         | shared layers only                                                                           |
| `src/lib/**`           | sibling lib                                                                                  |
| `src/stores/**`        | `src/{stores,types,lib}/`                                                                    |

The big one is rule #1: **a feature cannot import another feature's internals**. To consume something from another feature, you import it from that feature's `index.ts` barrel. This means features can be deleted, refactored, or rewritten without anything outside them caring — the contract is the barrel.

There are two intentional exceptions:

1. **`app/` is allowed to reach into anything.** `UDIChatContext` needs the raw `createXStore` factories — a feature barrel can't surface them in a usable way for context wiring.
2. **`components/ui/`, `src/lib/`, `src/types/`** can be imported from anywhere as leaf layers. These never reach back up.

## Working with barrels (`index.ts`)

Each feature has an `index.ts` that re-exports its public surface. **The barrel is not a dump of every export** — it's a contract: only put something in the barrel if another feature or the app layer needs it.

When you add something to a feature, ask:

- **Is anything outside this feature going to import it?**
  - No → don't add it to the barrel. Use a relative import (`./components/Foo`) inside the feature.
  - Yes → add it to the barrel. The lint rule will fail outside imports until you do.

When you find yourself wanting to expose something from another feature, prefer pushing that something _into_ the consuming feature first, or _up_ into a shared layer. Cross-feature exports are fine but should be deliberate, not default.

## Common scenarios

### Add a new component to an existing feature

1. Create the file at `src/features/<feature>/components/MyComponent.tsx`.
2. Inside the file, import from siblings via relative paths (`./Other`), from cross-feature via the barrel (`@/features/dashboard`), and from shared layers via `@/{utils,types,lib,stores,components/ui}/...`.
3. Inline the `Props` type above the component — that's the convention. Only extract types when they're shared.
4. If a sibling needs to use it, import it relatively. If another feature or the app needs it, add it to the feature's `index.ts`.

### Add a new hook

Same as components — under `src/features/<feature>/hooks/`. Hooks that read or write multiple stores go here, not in `src/utils/`. If a hook genuinely belongs to two features, that's a smell — usually one of them really owns it.

### Add a new store

Under `src/features/<feature>/stores/`. Define and export a `createXStore` factory and the `XState` interface. Then update [src/app/UDIChatContext.tsx](src/app/UDIChatContext.tsx) to instantiate it and expose `useX` / `useXStore` hooks. Add the `createXStore` and `XState` exports to the feature's `index.ts` so the context wiring is allowed by lint (the context lives in `app/`, which would be allowed to reach internals anyway, but barrel-exporting is cleaner).

If the store is genuinely cross-feature (used by ≥2 unrelated features that don't have a clear owner), put it in `src/stores/` instead. `globalStore.ts` is the only current example.

### Add a new feature

1. `mkdir -p src/features/<name>/{components,hooks,stores,utils}` (only the subfolders you need).
2. Create `src/features/<name>/index.ts` with the public exports. The lint rule **requires** this barrel.
3. Add any feature-owned types to `src/features/<name>/types.ts`.
4. If the feature has stores, wire them through [src/app/UDIChatContext.tsx](src/app/UDIChatContext.tsx).

### Move something from a feature into shared

Justify the promotion: is it actually used by 2+ features and not naturally owned by either? If yes, move it to `src/{utils,types,lib,stores}/`. If only one feature uses it and another _might_ eventually, leave it where it is. Move it later when there's a real consumer.

### Move something from shared into a feature

If `src/utils/foo.ts` is only consumed by one feature, move it into that feature's `utils/`. Shared layers should genuinely be shared.

## Conventions

- **Path alias**: `@/...` resolves to `src/...`.
- **Inline `Props`**: `interface XxxProps { ... }` declared above each component. Don't extract Props types into a `types.ts` unless they're reused — locality is more valuable than uniformity here.
- **Zustand stores are vanilla** (`createStore`, not `create`) and accessed only via `UDIChatContext` hooks. Never import a store module directly into a component — the rule blocks it across feature boundaries, and it's a maintenance hazard within a feature too.
- **Tailwind classes via `cn()`** from `@/lib/utils`.
- **No `any` if you can avoid it** — prefer `unknown` plus a local narrowing interface. The repo has a `@typescript-eslint/no-explicit-any: warn` rule.

## Common ESLint errors

### `🔥 This import is not allowed in the module 'Feature internals'`

You're importing from another feature's internals. Switch to that feature's barrel:

```diff
- import { foo } from '@/features/dashboard/stores/dashboardStore';
+ import { foo } from '@/features/dashboard';
```

If the symbol isn't exported from the barrel, add it there.

### `🔥 Cannot find module. If the import includes a path alias, …`

Either the import path is wrong, or you're importing something the plugin doesn't know how to resolve. If you add a new path alias, register it under `pathAliases` in [eslint.config.js](eslint.config.js) too.

### `🔥 The 'X' key does not exist in the reusableImportPatterns object`

You used `{ts,tsx}`-style brace expansion in a pattern. The plugin treats `{X}` as a reusable-pattern reference, not as glob brace expansion. Spell out alternatives explicitly:

```diff
- 'src/features/*/index.{ts,tsx}'
+ 'src/features/*/index.ts'
```

## Verification before pushing

```bash
pnpm typecheck    # tsc -b --noEmit
pnpm lint         # eslint with project-structure rules
pnpm test         # vitest run
pnpm build        # standalone SPA build
pnpm build:lib    # library build — must keep dist/index.d.ts public surface stable
```

The library build (`pnpm build:lib`) is the most important check before any release-bound change — `dist/index.d.ts` defines the API surface external consumers depend on (`UDIChat`, `UDIChatConfig`, `DataPackage*`, `joinDataPath`, `LoadingPhase`).

## Reading further

- [bulletproof-react](https://github.com/alan2207/bulletproof-react) — the structural inspiration.
- [eslint-plugin-project-structure docs](https://github.com/Igorkowalski94/eslint-plugin-project-structure/wiki) — full rule reference for the boundary enforcement.
