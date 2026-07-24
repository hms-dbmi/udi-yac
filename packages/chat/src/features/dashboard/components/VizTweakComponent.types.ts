/**
 * Narrow structural shapes used by VizTweakComponent when walking a
 * UDIGrammar spec's representation layers. These deliberately mirror a
 * subset of the grammar's layer/mapping types so the component can
 * introspect without depending on the full upstream type graph.
 */

export interface TweakableParam {
  /** Value shown in the dropdown: the source field (field/dimension) or, for a
   * measure, the rollup's input field. */
  field: string;
  encoding: string;
  options: string[];
  /** How a swap is applied:
   *  - 'field': plain encoding rewrite (setMappingFieldByEncoding)
   *  - 'dimension': group-by field, rewrite encoding + groupby (swapDimensionField)
   *  - 'measure': aggregated rollup input, rewrite via swapMeasureField */
  kind: 'field' | 'dimension' | 'measure';
  /** For 'measure': the rollup output column the encoding is bound to. */
  outputKey?: string;
}

export interface MappingLike {
  field?: string;
  encoding?: string;
  type?: string;
}

export interface LayerLike {
  mark?: string;
  mapping?: MappingLike | MappingLike[];
}
