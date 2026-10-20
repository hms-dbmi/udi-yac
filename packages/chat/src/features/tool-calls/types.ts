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
/** How a subject-scoped filter tests a subject's rows: at least one passes,
 *  every one does, or none does. */
export type FilterMatch = 'any' | 'all' | 'none';

/**
 * A filter tested per subject (e.g. per patient) rather than per row. Absent
 * means row-level: a chart of the filtered table keeps the matching rows. With
 * a scope it keeps every row of each subject that matches.
 */
export interface FilterScope {
  entity: string;
  match: FilterMatch;
}

/**
 * A FilterData call that defines a filter. `op` is absent on an add, as on
 * every call made before filter operations existed; a `modify` redefines the
 * filter `id` in place, keeping its id and its chip.
 */
export interface FilterDataArgs {
  op?: 'add' | 'modify';
  id?: string;
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
  scope?: FilterScope | null;
}

/** A FilterData call that removes the filter `id`. */
export interface FilterRemoveArgs {
  op: 'remove';
  id: string;
  title?: string;
}

/** A FilterData call that removes every filter the agent made. */
export interface FilterClearArgs {
  op: 'clear';
}

export type FilterOperationArgs = FilterDataArgs | FilterRemoveArgs | FilterClearArgs;

// ---------------------------------------------------------------------------
// CreateVisualization
// ---------------------------------------------------------------------------
export interface CreateVisualizationArgs {
  description: string;
  title: string;
}
