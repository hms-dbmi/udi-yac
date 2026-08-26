export type { IntervalDomain, CategoricalDomain, DataFieldDomain } from 'udi-toolkit/react';

export interface DataPackageResource {
  name: string;
  path: string;
  schema: {
    fields: Array<{
      name: string;
      description?: string;
      type?: string;
      'udi:cardinality'?: number;
      'udi:data_type'?: string;
      'udi:overlapping_fields'?: string[] | 'all';
      'udi:unique'?: boolean;
    }>;
    primaryKey?: string[];
    foreignKeys?: Array<{
      fields: string[];
      'udi:cardinality'?: {
        from: 'one' | 'many';
        to: 'one' | 'many';
      };
      reference: {
        resource: string;
        fields: string[];
      };
    }>;
  };
  encoding?: string;
  format?: string;
  mediatype?: string;
  scheme?: string;
  type?: string;
  'udi:column_count'?: number;
  'udi:row_count'?: number;
  /** True when this resource is a pre-aggregated powerset cube: one row per
   *  dimension-subset combination, non-participating dimensions null, the
   *  measure pre-aggregated over the matching line-item rows. */
  'udi:cube'?: boolean;
  /** The cube's dimension columns. */
  'udi:dimensions'?: string[];
  /** The cube's measure columns. */
  'udi:measures'?: string[];
  /** How each measure re-aggregates when a marginal is contracted (rolled up
   *  across a dimension). Omitted measures are assumed additive; see
   *  `getCubeMeasureOp` for the fallback. */
  'udi:measure_aggregations'?: Record<string, string>;
}

/** Cube roles for one resource, as the dashboard needs them. */
export interface CubeInfo {
  dimensions: string[];
  measures: string[];
}

export interface DataPackage {
  'udi:path': string;
  resources: DataPackageResource[];
}

export type Row = Record<string, unknown>;

export type ExportRowSet = {
  displayRows: Row[];
};

export interface ValidStatus {
  isValid: 'yes' | 'no' | 'unknown';
}

export interface EntityRelationship {
  originKey: string;
  targetKey: string;
}
