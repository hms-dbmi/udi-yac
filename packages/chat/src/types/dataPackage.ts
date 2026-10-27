export type { IntervalDomain, CategoricalDomain, DataFieldDomain } from 'udi-toolkit/react';

export interface DataPackageResource {
  name: string;
  /** Friendly label for the entity, e.g. `donors` → "Donors". Frictionless's
   *  standard `title`; falls back to a humanized `name` when absent. */
  title?: string;
  path: string;
  schema: {
    fields: Array<{
      name: string;
      /** Friendly label for the column, e.g. `body_mass_index_value` → "BMI".
       *  Frictionless's standard `title`; display only — specs, filters and
       *  queries always key on `name`. */
      title?: string;
      description?: string;
      type?: string;
      'udi:cardinality'?: number;
      'udi:data_type'?: string;
      /** How a time column stores its values: `epoch_ms`, `epoch_s`, `year`, or
       *  `days` (a duration such as an age). The column keeps its
       *  `udi:data_type`; only display reads this. */
      'udi:time_format'?: string;
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
  /** Cube dimension → the line-level column it was aggregated from. A filter
   *  on either is carried to the other, since a cube has no key to join on. */
  'udi:linked_dimensions'?: Record<string, DimensionLink>;
}

/** One column of one table. */
export interface LinkedColumn {
  entity: string;
  field: string;
}

/** A cube dimension's link to the line-level column it was aggregated from. */
export interface DimensionLink extends LinkedColumn {
  /**
   * Cube value → the linked column's values it stands for, for columns that
   * spell their values differently. A value with no entry is carried across
   * as it is, so an exact link needs no map.
   */
  values?: Record<string, string[]>;
  /**
   * Which side a filter is kept and shown on: the linked column (the default)
   * or this cube dimension. A filter made on the other side is translated.
   */
  canonical?: 'linked' | 'dimension';
}

/** One column of a link group, with how its values translate to the hub's. */
export interface LinkMember extends LinkedColumn {
  /** This column's value → the hub column's values. Absent on the hub. */
  toHub?: Record<string, string[]>;
}

/** Columns that are one column across tables: every cube dimension linked to
 *  the same line-level column (the hub), and the hub itself. */
export interface LinkGroup {
  hub: LinkedColumn;
  members: LinkMember[];
  /** Where a filter on any member is kept, and so how it is shown. */
  canonical: LinkedColumn;
}

/** Cube roles for one resource, as the dashboard needs them. */
export interface CubeInfo {
  dimensions: string[];
  measures: string[];
}

export interface DataPackage {
  /** Frictionless's package name. Remote packages carry the name they were
   *  requested by, which is what the agent keys per-package config on. */
  name?: string;
  'udi:path': string;
  /** Which kind of table the agent answers from when a package holds both
   *  line-level tables and data cubes and either could serve a request. */
  'udi:prefer'?: 'line_level' | 'data_cube';
  resources: DataPackageResource[];
  /**
   * Friendly labels for categorical *values*, raw → label, applied across every
   * resource — an institution renamed once covers `donors.group_name` and
   * `samples.group_name` alike. Display only: the raw value is what reaches a
   * spec, a query or the LLM.
   */
  'udi:labels'?: Record<string, string>;
  /** Example prompts shown in the chat. When absent, the agent's
   *  `/v1/yac/examples` list is used. */
  'udi:example_prompts'?: string[];
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
