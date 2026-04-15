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
export interface RebuffArgs {
  message: string;
  suggestions: string[];
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
