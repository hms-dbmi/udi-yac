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
}

export interface DataPackage {
  'udi:path': string;
  resources: DataPackageResource[];
  /**
   * Friendly labels for categorical *values*, raw → label, applied across every
   * resource — an institution renamed once covers `donors.group_name` and
   * `samples.group_name` alike. Display only: the raw value is what reaches a
   * spec, a query or the LLM.
   */
  'udi:labels'?: Record<string, string>;
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
