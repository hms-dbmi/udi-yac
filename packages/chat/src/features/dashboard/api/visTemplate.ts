import type { UDIGrammar } from 'udi-toolkit/react';
import type { TemplateParamDescriptor } from '@/types/messages';
import { extractErrorDetail } from '@/utils/httpError';

export interface VisTemplateConfig {
  apiBaseUrl: string;
  authToken?: string;
}

export interface VisRebindResult {
  spec: UDIGrammar;
  /** Bindings the agent accepted, to send back with the next change. */
  toolArgs: Record<string, string>;
  params: TemplateParamDescriptor[];
}

/**
 * A re-bind the agent refused, with the reason it gave.
 *
 * `code` is what callers act on: `unknown_template` means the agent's templates
 * have moved on from this chart, so the control should be withdrawn rather than
 * retried, whereas an invalid binding is worth showing and letting the user pick
 * again.
 */
export class VisRebindError extends Error {
  readonly code: string | undefined;
  readonly status: number;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = 'VisRebindError';
    this.status = status;
    this.code = code;
  }
}

/**
 * Ask the agent to resolve a visualization template again with new bindings.
 *
 * The agent owns placeholder resolution and binding validation, so this is a thin
 * request/response — deliberately not a client-side spec rewrite, which cannot
 * stay correct once a binding is referenced from transformations as well as
 * encodings.
 */
export async function instantiateVisTemplate(
  config: VisTemplateConfig,
  body: { tool: string; toolArgs: Record<string, string>; dataSchema: string },
  signal?: AbortSignal,
): Promise<VisRebindResult> {
  const response = await fetch(`${config.apiBaseUrl}/v1/yac/vis_instantiate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.authToken ?? 'dev'}`,
    },
    body: JSON.stringify(body),
    signal: signal ?? null,
  });

  if (!response.ok) {
    const text = await response.text();
    let code: string | undefined;
    try {
      const parsed = JSON.parse(text) as { code?: unknown };
      if (typeof parsed.code === 'string') code = parsed.code;
    } catch {
      // Non-JSON error body (a proxy, say) — the detail extractor still copes.
    }
    throw new VisRebindError(extractErrorDetail(text), response.status, code);
  }

  return (await response.json()) as VisRebindResult;
}
