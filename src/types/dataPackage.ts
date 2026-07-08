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
