import type { UDIGrammar } from 'udi-toolkit';

export interface Example {
  name: string;
  spec: UDIGrammar;
  description?: string;
  thumbnail?: string;
  highlightLines?: number[];
}

export interface ExampleGroup {
  name: string;
  examples: Example[];
  description?: string;
}
