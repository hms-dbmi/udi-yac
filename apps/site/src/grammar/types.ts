import type { UDIGrammar } from 'udi-toolkit';

export interface Example {
  name: string;
  spec: UDIGrammar;
  description?: string;
  /** Tutorial only: lines of the pretty-printed spec to highlight. */
  highlightLines?: number[];
}

export interface ExampleGroup {
  name: string;
  examples: Example[];
  description?: string;
}
