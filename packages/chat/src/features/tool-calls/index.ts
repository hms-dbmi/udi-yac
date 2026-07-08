/**
 * Public API of the `tool-calls` feature. Cross-feature and app-layer imports
 * must go through this barrel; intra-feature imports use relative paths.
 */

export { ToolCallRenderer } from './components/ToolCallRenderer';

export type {
  FreeTextExplainArgs,
  RebuffArgs,
  ClarifyVariableArgs,
  FilterDataArgs,
  TextSegment,
  CreateVisualizationArgs,
} from './types';
