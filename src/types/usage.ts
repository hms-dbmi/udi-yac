/**
 * Accumulated token usage for a conversation, summed from each response's
 * per-request `Usage` (see `features/chat/api/completions.ts`). Lives here
 * (rather than in the chat store) because it is also persisted through the
 * dashboard's session import/export, so two features share the shape.
 */
export interface SessionUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  /** Cached share of `promptTokens` (0 when the provider doesn't report it). */
  cachedPromptTokens: number;
  /** Reasoning share of `completionTokens` (0 when not reported). */
  reasoningTokens: number;
  requests: number;
  lastModel?: string;
}

export const EMPTY_USAGE: SessionUsage = {
  promptTokens: 0,
  completionTokens: 0,
  totalTokens: 0,
  cachedPromptTokens: 0,
  reasoningTokens: 0,
  requests: 0,
};
