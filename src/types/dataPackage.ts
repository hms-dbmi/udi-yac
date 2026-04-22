export interface IntervalDomain {
  min: number;
  max: number;
}

export interface CategoricalDomain {
  values: string[];
}

export interface DataFieldDomain {
  entity: string;
  field: string;
  type: 'interval' | 'point';
  domain: IntervalDomain | CategoricalDomain;
  fieldDescription: string;
}

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
  allRows: Row[];
};

export interface ValidStatus {
  isValid: 'yes' | 'no' | 'unknown';
}

export interface EntityRelationship {
  originKey: string;
  targetKey: string;
}
