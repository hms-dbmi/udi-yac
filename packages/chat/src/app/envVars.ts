/**
 * Every Vite env var the standalone chat reads, described exactly once.
 *
 * `.env.example`, the README table, and the `ImportMetaEnv` interface in
 * `env.d.ts` are all generated from this array by
 * `scripts/gen-chat-env-docs.mjs`; CI fails if they drift, and also fails if
 * any `import.meta.env.VITE_*` read in the source is missing from here.
 * Describe a variable here and regenerate — don't edit those three by hand.
 *
 * Kept free of runtime imports (no `import.meta`) so the generator can import
 * it directly under Node's type stripping. The parsing lives in `env.ts`.
 */

/**
 * The bundled HuBMAP snapshot, synced from the repo-root `sample-data/` into
 * `public/data` on dev/build. See `sample-data/readme.md`.
 */
export const HUBMAP_DATAPACKAGE_URL = '/data/hubmap/datapackage.json';

/**
 * Every variable, described once. `docDefault` is what the generated docs
 * show; `example` seeds the commented-out line in `.env.example`.
 */
export const ENV_VARS = [
  {
    name: 'VITE_UDI_API_BASE_URL',
    docDefault: 'http://localhost:8007',
    description:
      'UDIAgent FastAPI server URL. May also be a same-origin path (e.g. `/api/yac`) when the chat sits behind the host app’s reverse proxy.',
  },
  {
    name: 'VITE_UDI_DATA_PACKAGE',
    docDefault: HUBMAP_DATAPACKAGE_URL,
    example: 'https://portal.hubmapconsortium.org/metadata/v0/udi/datapackage.json',
    description:
      'Path or URL to a `datapackage.json`. Defaults to the bundled HuBMAP snapshot synced from `sample-data/`. Ignored when `VITE_UDI_REMOTE_PACKAGE` is set.',
  },
  {
    name: 'VITE_UDI_REMOTE_PACKAGE',
    docDefault: null,
    example: 'penguins',
    description:
      'Name of a server-side data package (configured on the agent via `UDI_QUERY_BACKENDS`). When set, no CSVs load in the browser: metadata comes from `/v1/yac/metadata` and queries go to `/v1/yac/query`. Takes precedence over `VITE_UDI_DATA_PACKAGE`.',
  },
  {
    name: 'VITE_UDI_REQUIRE_API_KEY',
    docDefault: 'true',
    // Left live (uncommented) in .env.example: local dev runs against an agent
    // that has its own OPENAI_API_KEY, so the prompt is just friction. The
    // built-in default stays `true` for library consumers.
    template: 'false',
    description:
      'Prompt the user for an OpenAI key in the UI. Defaults to `true`, but `.env.example` ships `false` because local dev runs against an agent that has its own `OPENAI_API_KEY`.',
  },
  {
    name: 'VITE_UDI_MODEL',
    docDefault: null,
    example: 'gpt-5.4',
    description:
      'LLM model override. Sent **only when the user supplies their own OpenAI key** — the agent honors a requested model only alongside an `X-OpenAI-Key`, so whoever pays for the tokens picks the model. Otherwise the agent’s `GPT_MODEL_NAME` applies.',
  },
  {
    name: 'VITE_BASE',
    docDefault: '/',
    example: '/udi-yac/',
    description:
      'Public base path for the built SPA (read in `vite.config.ts`, build-time only). The library build always uses `./`.',
  },
] as const;
