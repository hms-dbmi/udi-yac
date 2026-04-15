/**
 * Narrow structural shapes used by VizTweakComponent when walking a
 * UDIGrammar spec's representation layers. These deliberately mirror a
 * subset of the grammar's layer/mapping types so the component can
 * introspect without depending on the full upstream type graph.
 */

export interface TweakableParam {
  field: string;
  encoding: string;
  options: string[];
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
