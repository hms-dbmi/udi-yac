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
  meta?: ToolCallMeta;
}

export interface FlatToolCall {
  name: string;
  arguments: Arguments;
  meta?: ToolCallMeta;
}

/**
 * One template parameter a user may re-bind on a rendered chart, as described by
 * the agent. The agent decides what is offerable — it holds the template — and
 * the UI only renders a control per descriptor and sends the new value back.
 */
export interface TemplateParamDescriptor {
  /** Tool parameter name to send back, e.g. `field4`. */
  param: string;
  /** The template placeholder it fills, e.g. `F4`. For debugging/telemetry. */
  placeholder: string;
  /** Entity whose fields are valid values (a join template binds two). */
  entity?: string;
  /** Field type the template requires; null/absent means unconstrained. */
  type?: 'nominal' | 'ordinal' | 'quantitative' | null;
  /** Visual channels this parameter is drawn on, e.g. `['color']`. */
  encodings: string[];
  /** Display label — the channels, or the parameter name as a fallback. */
  label: string;
  /** Currently bound field. */
  value: string;
}

/**
 * Side-channel the agent attaches to a tool call. Not sent back to the model
 * (`getMessagesFormattedForLLM` rebuilds calls from name + arguments only), but
 * kept in the transcript so a restored conversation is as tweakable as a live one.
 */
export interface ToolCallMeta {
  /** Template tool that produced the spec, e.g. `vis_053_line_survival`. */
  tool_used?: string | null;
  /** Bindings it was resolved with, keyed by tool parameter name. */
  tool_args?: Record<string, string> | null;
  /** Parameters the agent will accept a re-binding for. */
  tweakable_params?: TemplateParamDescriptor[];
  valid?: boolean;
  corrections?: number;
  /** Forward-compatible: the agent adds diagnostic keys over time. */
  [key: string]: unknown;
}

/**
 * Tool-call arguments can contain arbitrary nested JSON values (e.g.
 * `filter: { intervalRange: { min, max } }` on FilterData, or `spec: string`
 * on RenderVisualization). The previous `{ [key: string]: string }` typing
 * did not match the reality. Callers should narrow to a specific
 * tool-call-args interface from `@/features/tool-calls/types` before use.
 */
export type Arguments = Record<string, unknown>;
