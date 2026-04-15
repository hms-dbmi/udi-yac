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

// Module declarations for dependencies resolved via Vite aliases. The actual
// `UDIGrammar` type lives in `udi-grammar/src/components/GrammarTypes.ts` and
// is a discriminated union of mark-specific layer types. The shim below keeps
// this React app decoupled from those types while modelling the fields the
// app actually reads/writes. Use `unknown` over `any` so implicit widening
// errors surface at call sites rather than silently leaking.
declare module 'udi-toolkit/react' {
  import type { CSSProperties } from 'react';

  export interface UDIGrammar {
    source: unknown;
    transformation?: unknown[];
    representation?: unknown;
    config?: Record<string, unknown>;
    [key: string]: unknown;
  }

  export interface ActiveDataSelection {
    dataSourceKey: string;
    type: 'interval' | 'point';
    selection: Record<string, unknown[]>;
  }

  export type DataSelections = Record<string, ActiveDataSelection>;
  export type DataSelection = ActiveDataSelection;
  export type RangeSelection = Record<string, [number, number]>;
  export type PointSelection = Record<string, string[]>;

  export interface UDIVisProps {
    spec: UDIGrammar;
    selections?: DataSelections;
    /** Map entity names to canonical data URLs, overriding whatever the spec contains. */
    sourceResolver?: Record<string, string>;
    onSelectionChange?: (selections: DataSelections) => void;
    onDataReady?: (payload: {
      data: object[] | null;
      allData: object[] | null;
      isSubset: boolean;
    }) => void;
    className?: string;
    style?: CSSProperties;
  }

  export function UDIVis(props: UDIVisProps): JSX.Element;

  export interface QueryDataSpec {
    source: { name: string; source: string } | { name: string; source: string }[];
    transformation?: unknown[];
  }

  export interface QueryDataResult {
    displayData: object[];
    allData: object[];
    isSubset: boolean;
  }

  export function queryData(
    spec: QueryDataSpec,
    selections?: DataSelections,
    sourceResolver?: Record<string, string>,
  ): Promise<QueryDataResult | null>;
}

declare module 'udi-toolkit' {
  export * from 'udi-toolkit/react';
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
