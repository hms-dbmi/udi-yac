/**
 * Narrow structural shapes used by VizTweakComponent when walking a
 * UDIGrammar spec's representation layers. These deliberately mirror a
 * subset of the grammar's layer/mapping types so the component can
 * introspect without depending on the full upstream type graph.
 */

interface TweakableParamBase {
  /** Value shown in the dropdown — the field currently bound. */
  field: string;
  options: string[];
  /** What the control is called: the channel it drives, e.g. `color`. */
  label: string;
}

/**
 * A parameter inferred from a finished spec, applied by rewriting that spec.
 * Used for hand-written specs, where there is nothing else to go on.
 */
export interface HeuristicTweakableParam extends TweakableParamBase {
  /** How a swap is applied:
   *  - 'field': plain encoding rewrite (setMappingFieldByEncoding)
   *  - 'dimension': group-by field, rewrite encoding + groupby (swapDimensionField)
   *  - 'measure': aggregated rollup input, rewrite via swapMeasureField */
  kind: 'field' | 'dimension' | 'measure';
  encoding: string;
  /** For 'measure': the rollup output column the encoding is bound to. */
  outputKey?: string;
}

/**
 * A parameter of the *template* a chart was generated from, applied by asking the
 * agent to resolve that template again with the new binding.
 *
 * This is the accurate path, and the only one that works when a binding is
 * referenced from transformations as well as encodings: rewriting a finished spec
 * has to know every transformation shape a template might use, and quietly
 * corrupts the chart when it doesn't.
 */
export interface BindingTweakableParam extends TweakableParamBase {
  kind: 'binding';
  /** Tool parameter to override in the re-bind request. */
  param: string;
  /** Template placeholder it fills — for telemetry and debugging. */
  placeholder: string;
}

/**
 * The grouping that cuts a stratifier into the strata a chart draws.
 *
 * Applied the same way a `binding` is — the agent resolves the template again —
 * but it is not a field swap, so it gets its own control rather than a dropdown:
 * `field` names the column being cut and `fieldType` decides whether that
 * control lists values to combine or thresholds to cut at.
 *
 * `field` on the base type is the *serialized grouping* here, not a column, so
 * that the shared `options`/`field` plumbing keeps working; `stratifier` is the
 * column. Ugly, and the alternative — splitting the base type — costs more at
 * every call site than it saves here.
 */
export interface GroupingTweakableParam extends TweakableParamBase {
  kind: 'grouping';
  /** Tool parameter to override in the re-bind request. */
  param: string;
  /** Template placeholder it fills — for telemetry and debugging. */
  placeholder: string;
  /** The stratifier column being cut. */
  stratifier: string;
  /** Its type in the schema, which decides which editor is right. */
  stratifierType: 'nominal' | 'ordinal' | 'quantitative' | null;
  /** Entity the stratifier lives on, for looking up its domain. */
  entity: string | null;
}

export type TweakableParam =
  HeuristicTweakableParam | BindingTweakableParam | GroupingTweakableParam;

export interface MappingLike {
  field?: string;
  encoding?: string;
  type?: string;
}

export interface LayerLike {
  mark?: string;
  mapping?: MappingLike | MappingLike[];
}
