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
  'udi:row_count'?: number;
  schema: {
    fields: Array<{
      name: string;
      description?: string;
      'udi:data_type'?: string;
    }>;
    foreignKeys?: Array<{
      fields: string[];
      reference: {
        resource: string;
        fields: string[];
      };
    }>;
  };
}

export interface DataPackage {
  'udi:path': string;
  resources: DataPackageResource[];
}
