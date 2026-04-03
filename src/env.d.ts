/// <reference types="vite/client" />

// Module declarations for dependencies resolved via Vite aliases
declare module 'udi-toolkit/react' {
  import type { CSSProperties } from 'react';

  export interface UDIGrammar {
    source: any;
    transformation?: any[];
    representation?: any;
    config?: Record<string, any>;
    [key: string]: any;
  }

  export interface ActiveDataSelection {
    dataSourceKey: string;
    type: 'interval' | 'point';
    selection: Record<string, any>;
  }

  export type DataSelections = Record<string, ActiveDataSelection>;
  export type DataSelection = ActiveDataSelection;
  export type RangeSelection = Record<string, [number, number]>;
  export type PointSelection = Record<string, string[]>;

  export interface UDIVisProps {
    spec: UDIGrammar;
    selections?: DataSelections;
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
}

declare module 'udi-toolkit' {
  export * from 'udi-toolkit/react';
}

declare module 'arquero' {
  export function loadCSV(path: string, options?: any): Promise<any>;
}
