/**
 * TypeScript interfaces for orchestrator tool call arguments.
 *
 * These match the OpenAI function-calling schemas defined in the backend's
 * ORCHESTRATOR_TOOLS list and represent the payload the frontend receives
 * inside `tool_calls[].function.arguments`.
 */

// ---------------------------------------------------------------------------
// Rebuff
// ---------------------------------------------------------------------------
/**
 * Machine-readable rebuff discriminator. Emitted by the backend only for
 * cases the frontend needs to branch on (e.g. prompt the user for their
 * own API key when the server key is over quota). Ordinary rebuffs omit
 * the field — callers should treat absence as "plain rebuff".
 */
export type RebuffReason = 'budget_exceeded';

export interface RebuffArgs {
  message: string;
  suggestions: string[];
  reason?: RebuffReason;
}

// ---------------------------------------------------------------------------
// ClarifyVariable
// ---------------------------------------------------------------------------
export interface ClarifyCandidate {
  field_name: string;
  entity: string;
  description?: string;
}

export interface AmbiguousVariable {
  query_term: string;
  candidates: ClarifyCandidate[];
}

export interface ClarifyVariableArgs {
  message: string;
  ambiguous_variables: AmbiguousVariable[];
}

// ---------------------------------------------------------------------------
// FreeTextExplain
// ---------------------------------------------------------------------------
export type FreeTextResponseType = 'capabilities' | 'data_summary' | 'general';

export interface StructuredTextElement {
  value: string;
  [key: string]: unknown;
}

export type TextSegment = string | StructuredTextElement;

export interface FreeTextExplainArgs {
  response_type: FreeTextResponseType;
  text: TextSegment[];
  has_structured_elements: boolean;
}

// ---------------------------------------------------------------------------
// FilterData
// ---------------------------------------------------------------------------
export interface FilterDataArgs {
  title: string;
  entity: string;
  field: string;
  filter: {
    filterType: 'point' | 'interval';
    intervalRange: {
      min: number;
      max: number;
    };
    pointValues: string[];
  };
}

// ---------------------------------------------------------------------------
// CreateVisualization
// ---------------------------------------------------------------------------
export interface CreateVisualizationArgs {
  description: string;
  title: string;
}
