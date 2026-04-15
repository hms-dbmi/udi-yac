import type { DataPackage } from '@/types/dataPackage';

/**
 * Inline DataPackage describing HuBMAP donors, samples, and datasets, with
 * `udi:path` pointed at the live HuBMAP Portal metadata API. This is the
 * default `dataPackage` for the standalone app (src/App.tsx) and also serves
 * as a reference for consumers who want to construct a DataPackage inline
 * rather than fetching one as JSON.
 *
 * Row counts are point-in-time snapshots; the LLM uses them for context but
 * the actual rows are fetched by Arquero at render time.
 */
export const hubmapRemoteDataPackage: DataPackage = {
  'udi:path': 'https://portal.hubmapconsortium.org/metadata/v0/udi/',
  resources: [
    {
      name: 'donors',
      path: 'donors.tsv',
      'udi:row_count': 432,
      schema: {
        fields: [
          {
            name: 'uuid',
            'udi:data_type': 'nominal',
            description: 'Unique identifier for the donor.',
          },
          {
            name: 'hubmap_id',
            'udi:data_type': 'nominal',
            description: 'HuBMAP identifier for the donor.',
          },
          {
            name: 'age_value',
            'udi:data_type': 'quantitative',
            description: 'The time elapsed since birth.',
          },
          {
            name: 'age_unit',
            'udi:data_type': 'nominal',
            description: 'Unit for age measurement.',
          },
          { name: 'sex', 'udi:data_type': 'nominal', description: 'Biological sex of the donor.' },
          {
            name: 'race',
            'udi:data_type': 'nominal',
            description: 'Racial background of the donor.',
          },
          {
            name: 'ethnicity',
            'udi:data_type': 'nominal',
            description: 'Ethnic background of the donor.',
          },
          { name: 'cause_of_death', 'udi:data_type': 'nominal', description: 'Cause of death.' },
          {
            name: 'body_mass_index_value',
            'udi:data_type': 'quantitative',
            description: 'Body mass index.',
          },
          {
            name: 'height_value',
            'udi:data_type': 'quantitative',
            description: 'Height of the donor.',
          },
          {
            name: 'weight_value',
            'udi:data_type': 'quantitative',
            description: 'Weight of the donor.',
          },
          {
            name: 'group_name',
            'udi:data_type': 'nominal',
            description: 'Name of the contributing group.',
          },
          {
            name: 'created_timestamp',
            'udi:data_type': 'quantitative',
            description: 'Record creation timestamp.',
          },
        ],
      },
    },
    {
      name: 'samples',
      path: 'samples.tsv',
      'udi:row_count': 4489,
      schema: {
        fields: [
          {
            name: 'uuid',
            'udi:data_type': 'nominal',
            description: 'Unique identifier for the sample.',
          },
          {
            name: 'hubmap_id',
            'udi:data_type': 'nominal',
            description: 'HuBMAP identifier for the sample.',
          },
          {
            name: 'donor.hubmap_id',
            'udi:data_type': 'nominal',
            description: 'HuBMAP ID of the associated donor.',
          },
          {
            name: 'sample_category',
            'udi:data_type': 'nominal',
            description: 'Category of the sample.',
          },
          {
            name: 'organ',
            'udi:data_type': 'nominal',
            description: 'Organ the sample was taken from.',
          },
          { name: 'organ_type', 'udi:data_type': 'nominal', description: 'Specific organ type.' },
          {
            name: 'area_value',
            'udi:data_type': 'quantitative',
            description: 'The area of the sample section.',
          },
          {
            name: 'area_unit',
            'udi:data_type': 'nominal',
            description: 'The area unit of measurement.',
          },
          {
            name: 'group_name',
            'udi:data_type': 'nominal',
            description: 'Name of the contributing group.',
          },
          {
            name: 'created_timestamp',
            'udi:data_type': 'quantitative',
            description: 'Record creation timestamp.',
          },
        ],
        foreignKeys: [
          {
            fields: ['donor.hubmap_id'],
            reference: { resource: 'donors', fields: ['hubmap_id'] },
          },
        ],
      },
    },
    {
      name: 'datasets',
      path: 'datasets.tsv',
      'udi:row_count': 6323,
      schema: {
        fields: [
          {
            name: 'uuid',
            'udi:data_type': 'nominal',
            description: 'Unique identifier for the dataset.',
          },
          {
            name: 'hubmap_id',
            'udi:data_type': 'nominal',
            description: 'HuBMAP identifier for the dataset.',
          },
          {
            name: 'donor.hubmap_id',
            'udi:data_type': 'nominal',
            description: 'HuBMAP ID of the associated donor.',
          },
          { name: 'dataset_type', 'udi:data_type': 'nominal', description: 'Type of the dataset.' },
          {
            name: 'status',
            'udi:data_type': 'nominal',
            description: 'Publication status of the dataset.',
          },
          {
            name: 'mapped_organ',
            'udi:data_type': 'nominal',
            description: 'Organ the dataset maps to.',
          },
          {
            name: 'mapped_consortium',
            'udi:data_type': 'nominal',
            description: 'Consortium that contributed the dataset.',
          },
          {
            name: 'analyte_class',
            'udi:data_type': 'nominal',
            description: 'Class of analyte measured.',
          },
          {
            name: 'group_name',
            'udi:data_type': 'nominal',
            description: 'Name of the contributing group.',
          },
          {
            name: 'created_timestamp',
            'udi:data_type': 'quantitative',
            description: 'Record creation timestamp.',
          },
        ],
        foreignKeys: [
          {
            fields: ['donor.hubmap_id'],
            reference: { resource: 'donors', fields: ['hubmap_id'] },
          },
          {
            fields: ['donor.hubmap_id'],
            reference: { resource: 'samples', fields: ['donor.hubmap_id'] },
          },
        ],
      },
    },
  ],
};
