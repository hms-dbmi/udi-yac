export interface Message {
  role: 'user' | 'system' | 'assistant';
  content: string;
  tool_calls?: ToolCall[];
  linkedVisFilterId?: string;
}

export interface ToolCall {
  function: FlatToolCall;
  // Legacy flat shape (some older data has name/arguments directly on the call)
  name?: string;
  arguments?: Arguments;
}

export interface FlatToolCall {
  name: string;
  arguments: Arguments;
  meta?: Record<string, unknown>;
}

/**
 * Tool-call arguments can contain arbitrary nested JSON values (e.g.
 * `filter: { intervalRange: { min, max } }` on FilterData, or `spec: string`
 * on RenderVisualization). The previous `{ [key: string]: string }` typing
 * did not match the reality. Callers should narrow to a specific
 * tool-call-args interface from `@/features/tool-calls/types` before use.
 */
export type Arguments = Record<string, unknown>;
