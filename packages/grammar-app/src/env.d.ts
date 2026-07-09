// Vite ambient types for `?worker` imports (boot/monaco.ts) and
// import.meta.hot (stores/example-store.ts). Previously leaked in via the
// toolkit source's own vite/client reference when it lived under src/.
/// <reference types="vite/client" />

declare namespace NodeJS {
  interface ProcessEnv {
    NODE_ENV: string;
    VUE_ROUTER_MODE: 'hash' | 'history' | 'abstract' | undefined;
    VUE_ROUTER_BASE: string | undefined;
  }
}
