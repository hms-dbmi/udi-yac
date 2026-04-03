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

export interface Arguments {
  [key: string]: string;
}
