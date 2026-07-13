import type { Message } from '@/types/messages';
import { httpError } from '@/utils/httpError';

export interface QueryConfig {
  apiBaseUrl: string;
  authToken?: string;
  openAiKey?: string;
  model?: string;
}

function toYaml(obj: unknown, indent = 0): string {
  const pad = '  '.repeat(indent);
  if (obj === null || obj === undefined) return `${pad}null`;
  if (typeof obj === 'string') return `${pad}${obj}`;
  if (typeof obj === 'number' || typeof obj === 'boolean') return `${pad}${obj}`;
  if (Array.isArray(obj)) {
    return obj.map((item) => `${pad}- ${toYaml(item, indent + 1).trimStart()}`).join('\n');
  }
  if (typeof obj === 'object') {
    return Object.entries(obj)
      .map(([key, val]) => {
        const child = toYaml(val, indent + 1);
        if (typeof val === 'object' && val !== null) {
          return `${pad}${key}:\n${child}`;
        }
        return `${pad}${key}: ${child.trimStart()}`;
      })
      .join('\n');
  }
  return `${pad}${String(obj)}`;
}

function constructQueryBody(
  messages: Message[],
  model: string,
  dataSchema: string,
  dataDomains: string,
) {
  const processed = structuredClone(messages).map((msg) => {
    if (msg.role === 'user' && msg.tool_calls?.length) {
      const yamlParts = msg.tool_calls.map((call) => {
        const name = call.function?.name ?? call.name ?? 'unknown';
        const args = call.function?.arguments ?? call.arguments ?? {};
        return `tool_call: ${name}\n${toYaml(args)}`;
      });
      const yamlContent = yamlParts.join('\n---\n');
      return {
        role: msg.role,
        content: msg.content ? `${msg.content}\n\n${yamlContent}` : yamlContent,
      };
    }
    return msg;
  });

  return { model, messages: processed, dataSchema, dataDomains };
}

export interface ToolCallResponse {
  name: string;
  arguments: Record<string, unknown>;
}

/** Per-request token usage, parsed from the server's `X-Usage-*` headers. */
export interface Usage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  /** Cached share of `promptTokens` (0 when the provider doesn't report it). */
  cachedPromptTokens: number;
  /** Reasoning share of `completionTokens` (0 when not reported). */
  reasoningTokens: number;
  model?: string;
}

export interface QueryResult {
  toolCalls: ToolCallResponse[];
  usage: Usage;
}

function parseUsage(headers: Headers): Usage {
  const num = (name: string) => Number(headers.get(name)) || 0;
  return {
    promptTokens: num('X-Usage-Prompt-Tokens'),
    completionTokens: num('X-Usage-Completion-Tokens'),
    totalTokens: num('X-Usage-Total-Tokens'),
    cachedPromptTokens: num('X-Usage-Cached-Prompt-Tokens'),
    reasoningTokens: num('X-Usage-Reasoning-Tokens'),
    model: headers.get('X-Usage-Model') ?? undefined,
  };
}

export async function queryLLM(
  config: QueryConfig,
  messages: Message[],
  dataSchema: string,
  dataDomains: string,
  conversationId?: string,
): Promise<QueryResult> {
  const model = config.model ?? 'agenticx/UDI-VIS-Beta-v2-Llama-3.1-8B';
  const body = constructQueryBody(messages, model, dataSchema, dataDomains);

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  // The backend requires an Authorization header (even in dev mode).
  // Use the provided authToken, or fall back to a dev placeholder.
  headers['Authorization'] = `Bearer ${config.authToken ?? 'dev'}`;
  if (config.openAiKey) {
    headers['X-OpenAI-Key'] = config.openAiKey;
  }
  // Per-conversation ID for server-side tracing (Langfuse session grouping).
  if (conversationId) {
    headers['X-Conversation-Id'] = conversationId;
  }

  const response = await fetch(`${config.apiBaseUrl}/v1/yac/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw await httpError(response);
  }

  const data = await response.json();
  return { toolCalls: data as ToolCallResponse[], usage: parseUsage(response.headers) };
}
