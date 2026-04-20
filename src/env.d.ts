/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** UDIAgent FastAPI server URL — used by App.tsx as a fallback default. */
  readonly VITE_UDI_API_BASE_URL?: string;
  /** Path or URL to a datapackage_udi.json file — used by App.tsx. */
  readonly VITE_UDI_DATA_PACKAGE?: string;
  /** "false" to disable the in-app OpenAI key prompt. */
  readonly VITE_UDI_REQUIRE_API_KEY?: string;
  /** Optional LLM model name override forwarded to the backend. */
  readonly VITE_UDI_MODEL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare module 'arquero' {
  // Minimal shim — only the APIs this app actually calls.
  export interface ArqueroTable {
    columnNames(): string[];
    array(column: string): unknown[];
    rollup(spec: Record<string, string>): ArqueroTable;
    objects(): unknown[];
  }
  export interface LoadCSVOptions {
    delimiter?: string;
    [key: string]: unknown;
  }
  export function loadCSV(path: string, options?: LoadCSVOptions): Promise<ArqueroTable>;
  export function fromCSV(input: string, options?: LoadCSVOptions): ArqueroTable;
}
