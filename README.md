# udi-yac

React implementation of the UDI Chat interface — an AI-powered system for querying and visualizing biomedical datasets via natural language. This is a React port of the original Vue 3/Quasar `udi-chat` app. Published on npm as [`udi-yac`](https://www.npmjs.com/package/udi-yac); the repository directory remains `udi-chat-react`.

## Quick Start

```bash
pnpm install
pnpm dev          # dev server
pnpm build        # standalone app build (dist/)
pnpm build:lib    # library build (dist/, consumes entry from src/index.ts)
pnpm lint         # eslint
pnpm format       # prettier
pnpm typecheck    # tsc --noEmit
pnpm test         # vitest (one-shot)
pnpm test:watch   # vitest in watch mode
```

### Standalone app config (env vars)

The standalone `App.tsx` reads these Vite env vars (see `.env.example`). Copy `.env.example` to `.env.local` to override locally:

| Var                        | Default                                                             | Purpose                                                                               |
| -------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `VITE_UDI_API_BASE_URL`    | `http://localhost:8007`                                             | UDIAgent FastAPI server URL                                                           |
| `VITE_UDI_DATA_PACKAGE`    | (unset → inline HuBMAP API package from `src/data/hubmapRemote.ts`) | Optional path/URL to a `datapackage_udi.json`. Overrides the inline default when set. |
| `VITE_UDI_REQUIRE_API_KEY` | `true`                                                              | Set to `false` to skip the in-app OpenAI key prompt                                   |
| `VITE_UDI_MODEL`           | (unset)                                                             | Optional LLM model override                                                           |

By default the standalone app talks to the live HuBMAP Portal metadata API. To use the locally bundled snapshot instead, set:

```
VITE_UDI_DATA_PACKAGE=/data/hubmap_2025-05-05/datapackage_udi.json
```

> **Note on `build` vs `build:lib`**: `pnpm build` produces a deployable standalone SPA — this is the default so CI/deploy pipelines behave as expected. To build the publishable library bundle (the `UDIChat` React component), use `pnpm build:lib`, which invokes `vite build --mode lib` and emits both JS and `.d.ts` files under `dist/`.

## Stack

- **React 19** with TypeScript
- **Tailwind 4** + **shadcn/ui** (Base UI primitives)
- **Zustand** for state management (vanilla stores via React Context)
- **UDI Toolkit** (Vue Custom Elements) for grammar-based visualization rendering
- **Arquero** for client-side data loading and domain computation
- **Vite** for dev server and library builds

## Architecture

### Dual Build Modes

The project builds as both a **library** and a **standalone app**:

- **Library** (`pnpm build`): Exports the `UDIChat` component and `UDIChatConfig` type. Consumers provide React and render `<UDIChat>` with configuration props.
- **Standalone** (`pnpm build:app`): Builds `App.tsx` as a full SPA with dev defaults.

### Library Usage

```tsx
import { UDIChat } from 'udi-yac';
import 'udi-yac/style.css';

<UDIChat
  apiBaseUrl="http://localhost:8007"
  dataPackagePath="./data/hubmap_2025-05-05/datapackage_udi.json"
  authToken="your-jwt-token" // optional
  requireApiKey // optional — prompts for OpenAI key
  model="agenticx/UDI-VIS-Beta-v2" // optional
/>;
```

### Config Props

| Prop               | Type                 | Description                                                                                                     |
| ------------------ | -------------------- | --------------------------------------------------------------------------------------------------------------- |
| `apiBaseUrl`       | `string`             | Base URL for the UDIAgent API                                                                                   |
| `dataPackagePath`  | `string?`            | URL/path to `datapackage_udi.json`. Ignored when `dataPackage` is provided.                                     |
| `dataPackage`      | `DataPackage?`       | Provide a data package object directly instead of fetching from a URL. Takes precedence over `dataPackagePath`. |
| `dataFieldDomains` | `DataFieldDomain[]?` | Pre-computed field domains. Skips CSV loading for domain computation when provided with `dataPackage`.          |
| `fetchOptions`     | `RequestInit?`       | Custom fetch options (headers, credentials, etc.) forwarded to all data-loading fetch calls.                    |
| `authToken`        | `string?`            | JWT bearer token for API auth                                                                                   |
| `requireApiKey`    | `boolean?`           | Show API key input before chatting                                                                              |
| `model`            | `string?`            | LLM model name override                                                                                         |
| `downloadActions`  | `DownloadAction[]?`  | Extra items appended to the Download Data dropdown. See [Custom download actions](#custom-download-actions).    |
| `entityIcons`      | `EntityIconMap?`     | Icon overrides for entity count chips. See [Custom entity icons](#custom-entity-icons).                         |
| `mascot`           | `ReactNode \| null?` | Replace or hide the welcome mascot. See [Custom mascot](#custom-mascot).                                        |
| `splashMessages`   | `readonly string[]?` | Override or hide the randomised prompt above the mascot. See [Custom splash messages](#custom-splash-messages). |
| `className`        | `string?`            | CSS class for the root element                                                                                  |
| `style`            | `CSSProperties?`     | Inline styles for the root element                                                                              |

### Data Source Configuration

There are three ways to provide data to `UDIChat`, from simplest to most flexible:

#### 1. Local data package file (default)

Point `dataPackagePath` to a `datapackage_udi.json` file. The JSON must contain a `udi:path` base path and `resources` with relative file paths. CSVs are loaded client-side via Arquero.

```tsx
<UDIChat
  apiBaseUrl="http://localhost:8007"
  dataPackagePath="./data/hubmap_2025-05-05/datapackage_udi.json"
/>
```

#### 2. Remote data sources

Data packages can reference remote URLs. Set `udi:path` to a remote base URL and keep resource `path` values as relative filenames. Arquero's `loadCSV` uses `fetch()` internally, so remote URLs work out of the box.

If the remote server requires authentication, pass `fetchOptions` with the necessary headers. These are forwarded to all `fetch()` calls — both the data package JSON fetch and CSV loading:

```tsx
<UDIChat
  apiBaseUrl="http://localhost:8007"
  dataPackagePath="https://portal.example.com/metadata/datapackage_udi.json"
  fetchOptions={{
    headers: { Authorization: 'Bearer <token>' },
    credentials: 'include',
  }}
/>
```

> **Note:** The remote server must send appropriate CORS headers (`Access-Control-Allow-Origin`) for browser-based fetching to work.

#### 3. Inline data package (no fetch)

Pass a `DataPackage` object directly via the `dataPackage` prop. This is useful when you build the schema programmatically or receive it from an API. CSVs are still loaded from the URLs in `udi:path` + `resource.path` for domain computation, unless you also provide `dataFieldDomains` to skip that step entirely.

```tsx
import type { DataPackage } from 'udi-yac';

const myDataPackage: DataPackage = {
  'udi:path': 'https://portal.hubmapconsortium.org/metadata/v0/',
  resources: [
    {
      name: 'donors',
      path: 'donors.tsv',
      'udi:row_count': 281,
      schema: {
        fields: [
          {
            name: 'age_value',
            description: 'The time elapsed since birth.',
            'udi:data_type': 'quantitative',
          },
          { name: 'sex', description: 'Biological sex of the donor.', 'udi:data_type': 'nominal' },
          // ... more fields
        ],
      },
    },
    // ... more resources
  ],
};

<UDIChat apiBaseUrl="http://localhost:8007" dataPackage={myDataPackage} />;
```

To skip CSV loading entirely (e.g. when you already have domain metadata), pass pre-computed domains:

```tsx
import type { DataFieldDomain } from 'udi-yac';

const myDomains: DataFieldDomain[] = [
  {
    entity: 'donors',
    field: 'age_value',
    type: 'interval',
    fieldDescription: 'The time elapsed since birth.',
    domain: { min: 1, max: 87 },
  },
  {
    entity: 'donors',
    field: 'sex',
    type: 'point',
    fieldDescription: 'Biological sex of the donor.',
    domain: { values: ['Male', 'Female'] },
  },
  // ...
];

<UDIChat
  apiBaseUrl="http://localhost:8007"
  dataPackage={myDataPackage}
  dataFieldDomains={myDomains}
/>;
```

See [`src/data/hubmapRemote.ts`](src/data/hubmapRemote.ts) for the canonical inline DataPackage example targeting the live HuBMAP Portal — this is also the default the standalone `App.tsx` uses.

## Features

### Chat Interface

- Natural language input with LLM-powered responses
- Tool call rendering: visualizations, filters, explanations, clarifications, rebuffs
- Example prompts dialog (fetched from backend `/v1/yac/examples`)
- Conversation reset, save/export as JSON
- API key input with localStorage persistence

### Visualization Dashboard

- Auto-pinned visualizations from assistant responses
- Interactive Vega-Lite charts via UDI Grammar spec → UDIVis (Vue CE)
- **Cross-chart filtering**: brush selections on one chart filter all others
- **Expand/collapse** visualizations to full width
- **Table view toggle**: switch between chart and raw data table
- **Field tweaking**: swap x/y/color encodings via dropdowns
- **Spec inspector**: view/copy JSON spec, open in UDI Grammar Editor (lz-string compressed URL)
- **Hover highlighting** across chat messages and dashboard cards
- **Memory bank**: restore recently closed visualizations

### Data Filtering

- **Interval filters**: range sliders for numeric fields
- **Point filters**: checkbox selection for categorical fields
- **Filter toolbar**: active filter chips with clear buttons
- **Cross-entity filtering**: filters propagate across related entities via foreign keys
- **Null value filtering** toggle

### Data Management

- **Entity counts**: per-entity row counts with dynamic filtered counts
- **Download**: filtered data as ZIP of CSVs, or manifest (hubmap_id extraction). Consumers can extend the dropdown with custom actions via the `downloadActions` prop — see [Custom download actions](#custom-download-actions).
- Data package loading with domain computation (Arquero)

### Custom download actions

Pass `downloadActions` on `UDIChatConfig` to append consumer-specific entries to the Download Data dropdown. Each action's `onClick` receives a snapshot of the current filters and the per-source rows the built-in "Download Raw Data" would have used, so you can export to custom formats, post to an API, or route to another tool.

```tsx
import { UDIChat } from 'udi-yac';
import type { DownloadAction } from 'udi-yac';

const sendToWorkspaces: DownloadAction = {
  label: 'Open in Workspaces',
  disabled: (ctx) => ctx.rowsBySource.every((r) => r.rows.length === 0),
  onClick: async ({ rowsBySource, filters }) => {
    const ids = rowsBySource.flatMap(({ rows }) =>
      rows.map((r) => String(r['hubmap_id'] ?? '')).filter(Boolean),
    );
    await fetch('/api/workspaces', {
      method: 'POST',
      body: JSON.stringify({ ids, filters }),
    });
  },
};

<UDIChat apiBaseUrl="http://localhost:8007" downloadActions={[sendToWorkspaces]} />;
```

The `DownloadActionContext` passed to each callback contains:

| Field          | Type                                | Notes                                                              |
| -------------- | ----------------------------------- | ------------------------------------------------------------------ |
| `rowsBySource` | `{ source: string; rows: Row[] }[]` | Post-filter, post-brush rows — same data the built-in ZIP exports. |
| `filters`      | `DataSelections`                    | Active filter selections keyed by filter id.                       |
| `dataPackage`  | `DataPackage \| null`               | The loaded data package; null until first resolution completes.    |

Custom actions render after the two built-in items, separated by a divider.

### Custom entity icons

Pass `entityIcons` on `UDIChatConfig` to change the icon rendered on each entity count chip in the dashboard header. Keys are entity names exactly as they appear in the data package (`resources[].name`). Any component that accepts a `className` prop works — lucide-react icons are typical.

```tsx
import { UDIChat } from 'udi-yac';
import type { EntityIconMap } from 'udi-yac';
import { Dna, FlaskConical } from 'lucide-react';

const icons: EntityIconMap = {
  // Override the default icon for an existing entity:
  samples: FlaskConical,
  // Add an icon for a custom entity:
  sequencing_runs: Dna,
};

<UDIChat apiBaseUrl="http://localhost:8007" entityIcons={icons} />;
```

Consumer entries are merged on top of the built-in icons (`donors`, `samples`, `datasets`, …) — you only need to supply the names you want to override or add. Entities with no match fall back to a generic table icon.

### Custom mascot

The empty-dashboard welcome splash renders a YAC mascot by default. Consumers can replace it or hide it via the `mascot` prop on `UDIChatConfig`:

| Value              | Result                                                                 |
| ------------------ | ---------------------------------------------------------------------- |
| `undefined` (omit) | Renders the built-in YAC mascot image.                                 |
| `null`             | Hides the mascot entirely. The speech-bubble prompt above still shows. |
| Any `ReactNode`    | Renders the provided node in place of the mascot image.                |

```tsx
import { UDIChat } from 'udi-yac';

// Replace with a custom image:
<UDIChat
  apiBaseUrl="http://localhost:8007"
  mascot={<img src="/my-mascot.svg" alt="" className="w-60 h-60 object-contain" />}
/>

// Hide entirely:
<UDIChat apiBaseUrl="http://localhost:8007" mascot={null} />
```

### Custom splash messages

One prompt is picked at random from a built-in pool (`"Ask me for a visualization!"`, `"What data would you like to explore?"`, etc.) and shown in the speech bubble above the mascot. Override via `splashMessages` on `UDIChatConfig`:

| Value              | Result                                                 |
| ------------------ | ------------------------------------------------------ |
| `undefined` (omit) | Random pick from the built-in defaults.                |
| Non-empty array    | Random pick from the provided strings exclusively.     |
| `[]`               | Hides the speech bubble entirely (mascot still shows). |

```tsx
<UDIChat
  apiBaseUrl="http://localhost:8007"
  splashMessages={[
    'Ask me about donors, samples, or datasets.',
    'Try “average age by sex”.',
  ]}
/>

// Hide the speech bubble:
<UDIChat apiBaseUrl="http://localhost:8007" splashMessages={[]} />
```

The selection is made once per `UDIChat` mount, so the message doesn't flicker between renders.

### Debug Mode (type `!/admin` in chat)

- System prompts toggle (show/hide system messages)
- Conversation sidebar drawer (load saved session JSON files)
- Export test case for benchmarking
- Download data domains / data schema as JSON
- Save conversation export

## Project Structure

The codebase follows a [bulletproof-react](https://github.com/alan2207/bulletproof-react)-style layout. Module boundaries are enforced by [`eslint-plugin-project-structure`](https://www.npmjs.com/package/eslint-plugin-project-structure) (see [eslint.config.js](eslint.config.js)). For the reasoning behind the layout and a guide to working within it, see [CONTRIBUTING.md](CONTRIBUTING.md).

```
src/
  index.ts                          # Library entry: exports UDIChat + UDIChatConfig
  index.css                         # Global Tailwind base + custom CSS
  env.d.ts                          # Vite client types

  app/                              # Composition root (allowed to reach into any feature)
    main.tsx                        # Vite app bootstrap
    App.tsx                         # Standalone app entry (inline HuBMAP package)
    UDIChat.tsx                     # Root component (provider + layout)
    UDIChatConfig.ts                # UDIChatConfig type (extracted to break circular)
    UDIChatContext.tsx              # Provider + hooks wiring all Zustand stores
    ErrorBoundary.tsx               # React error boundary
    validateConfig.ts (+ .test.ts)  # Runtime validation for UDIChatConfig

  features/
    chat/
      index.ts                      # Public barrel — cross-feature consumers import only from here
      api/
        completions.ts              # POST /v1/yac/completions client + QueryConfig type
      components/
        ChatPanel.tsx               # Slim orchestrator (~85 lines)
        ChatHeaderBar.tsx           # Toolbar — owns debugMode subscription
        DebugToggleSection.tsx      # System-prompt toggle — owns debugMode + messages
        ClosedVisualizationsPanel.tsx  # Recently-closed viz strip — owns memoryBank
        ChatInput.tsx               # Message input
        MessageList.tsx             # Message history with auto-scroll
        MessageBubble.tsx           # Single message + tool call tabs
        ConversationList.tsx        # Sidebar with saved session files
        ApiKeyInput.tsx             # OpenAI API key input
      hooks/
        useChatApi.ts               # LLM API integration hook
        useExamplePrompts.ts        # /v1/yac/examples fetch
        useResetHandlers.ts         # Bundled "reset everything" action
        useDebugExports.ts          # Debug-mode export buttons (save / test case / data)
      stores/
        conversationStore.ts        # Chat messages, save/load/export

    dashboard/
      index.ts                      # Public barrel
      components/
        DashboardPanel.tsx          # Dashboard layout (counts, filters, viz grid)
        DashboardCard.tsx           # Single pinned viz (chart, toolbar, tweak, spec)
        DataCounts.tsx              # Per-entity row counts (total + filtered)
        FilterToolbar.tsx           # Active filter chips
        DownloadButton.tsx          # CSV/manifest download dropdown
        VizTweakComponent.tsx       # Field encoding swap dropdowns
        VizTweakComponent.types.ts  # TweakableParam, LayerLike, MappingLike
        WelcomeSplash.tsx           # Empty dashboard placeholder
      stores/
        dashboardStore.ts           # Pinned vizzes, interactivity, expand/table/hover
        dataFiltersStore.ts         # Interval/point filter state, message sync
        selectionsStore.ts          # Cross-viz brush selection coordination
        memoryBankStore.ts          # Closed visualization restoration

    data-package/
      index.ts                      # Public barrel
      types.ts                      # Web Worker protocol types
      stores/
        dataPackageStore.ts         # Data schema, field domains, entity relationships
      utils/
        joinDataPath.ts             # Path joining for local + remote data URLs
        structuredTextParser.ts     # Template function evaluation for explanations
      workers/
        domainWorker.ts             # Off-main-thread domain computation

    tool-calls/
      index.ts                      # Public barrel
      types.ts                      # Args for each tool call type
      components/
        ToolCallRenderer.tsx        # Dispatches tool calls to renderers
        VisualizationCard.tsx       # UDIVis preview (chat) / pinned badge
        FilterComponent.tsx         # Filter dispatcher (interval/point)
        IntervalFilterComponent.tsx
        PointFilterComponent.tsx
        FreeTextExplain.tsx         # Markdown explanation with structured text
        RebuffNotice.tsx            # Rejection with suggestion buttons
        ClarifyVariable.tsx         # Field disambiguation UI

  components/
    ui/                             # shadcn/ui primitives (badge, button, dialog, …)

  stores/
    globalStore.ts                  # Truly cross-feature state (debug mode)

  types/
    messages.ts                     # Message, ToolCall, FlatToolCall (cross-feature)
    dataPackage.ts                  # DataPackage, DataFieldDomain, etc. (cross-feature)

  lib/
    utils.ts                        # cn() helper (clsx + tailwind-merge)

  utils/
    specMutations.ts                # Pure UDI grammar helpers

  data/
    hubmapRemote.ts                 # Inline DataPackage targeting the live HuBMAP Portal API
```

### Module boundaries

The `project-structure/independent-modules` rule enforces these import boundaries:

| From                 | Can import                                                                                       |
| -------------------- | ------------------------------------------------------------------------------------------------ |
| `src/features/X/**`  | own family, **other features' `index.ts` only**, `src/{utils,types,lib,stores,components/ui}/**` |
| `src/app/**`         | any feature internal, all shared layers                                                          |
| `src/components/ui/` | sibling UI, `src/lib/`                                                                           |
| `src/utils/`         | `src/{utils,types,lib,stores}/`, feature barrels                                                 |
| `src/{types,lib}/`   | shared layers only                                                                               |
| `src/stores/`        | `src/{stores,types,lib}/`                                                                        |

Cross-feature imports must go through the feature's `index.ts` barrel — direct paths like `@/features/dashboard/stores/dataFiltersStore` from another feature will fail lint.

## API Integration

The app communicates with a UDIAgent backend:

| Endpoint               | Method | Purpose                           |
| ---------------------- | ------ | --------------------------------- |
| `/v1/yac/completions`  | POST   | Send messages, receive tool calls |
| `/v1/yac/examples`     | GET    | Fetch example prompts             |
| `/sessions/{filename}` | GET    | Load saved conversation files     |

Request body for completions:

```json
{
  "model": "...",
  "messages": [...],
  "dataSchema": "...",
  "dataDomains": "..."
}
```

## Relationship to udi-grammar

Visualizations are rendered by the `UDIVis` Vue Custom Element from the `udi-grammar` package, consumed via the published [`udi-toolkit`](https://www.npmjs.com/package/udi-toolkit) npm package. The React wrapper (`udi-toolkit/react`) bridges Vue CE props and events:

- **Props** (`spec`, `selections`): set via `useLayoutEffect` on the DOM element
- **Events** (`selection-change`, `data-ready`): listened via `addEventListener`, with Vue CE array-wrapping unwrapped
