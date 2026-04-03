import type { Message } from '@/types/messages';

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
  arguments: Record<string, any>;
}

export async function queryLLM(
  config: QueryConfig,
  messages: Message[],
  dataSchema: string,
  dataDomains: string,
): Promise<ToolCallResponse[]> {
  const model = config.model ?? 'agenticx/UDI-VIS-Beta-v2-Llama-3.1-8B';
  const body = constructQueryBody(messages, model, dataSchema, dataDomains);

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  // The backend requires an Authorization header (even in dev mode).
  // Use the provided authToken, or fall back to a dev placeholder.
  headers['Authorization'] = `Bearer ${config.authToken ?? 'dev'}`;
  if (config.openAiKey) {
    headers['X-OpenAI-Key'] = config.openAiKey;
  }

  const response = await fetch(`${config.apiBaseUrl}/v1/yac/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`HTTP ${response.status}: ${errorText}`);
  }

  const data = await response.json();
  return data as ToolCallResponse[];
}
