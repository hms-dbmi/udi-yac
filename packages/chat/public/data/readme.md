# YAC Dataset Format Examples

YAC expects data to be in the form of multiple related tables. The information about the tables and their relationships must be recorded in a frictionless data package file.

Frictionless Data Package: https://datapackage.org/

Frictionless data packages support multiple different types of data resources. However, the only kind that YAC currently supports are Tables

Frictionless Table Schema: https://datapackage.org/standard/table-schema/

YAC expects a few additional fields. They are all prepended with `udi:` for the universal discovery interface project.

At the top level:
| Field | Description |
|-------------|----------------------------------------------------------------------------------------------------------------|
| `udi:name` | The name of the full data resource. Can be the same as `name`. |
| `udi:path` | The path of the data resources. It is assumed that all data resources are relative to this path. This can be a relative path, or a full remote URL. |

For each table resource:
| Field | Description |
|----------------------|--------------------------------------------------|
| `udi:row_count` | The number of rows in the table. |
| `udi:column_count` | The number of data columns in the table. |

For each data field:
| Field | Description |
|-------------------------|---------------------------------------------------------------------------------------------------------------------|
| `udi:cardinality` | The number of unique values in the column. |
| `udi:unique` | `true` if the value is unique for each row, `false` otherwise. |
| `udi:data_type` | One of `quantitative`, `ordinal`, or `nominal`. |
| `udi:overlapping_fields`| List of fields that are non-null on at least one row together. If all fields overlap, this should be `all`. |

This directory contains several examples that work with YAC.
| Path | Description | Tables |
|----------------------------------------------------|--------------------------------------------------------------------|--------------|
| `./penguins/datapackage.json` | The classic Palmer Penguins test dataset. | Single Table |
| `./hubmap_avr/datapackage.json` | An export from the HuBMAP Antibody Validation Report. | Single Table |
| `./hubmap_2025-05-05/datapackage_udi.json` | An export from the HuBMAP TSV APIs. | Three Tables |
| `./MetabolomicsWorkBench/C2M2_datapackage_udi.json`| A C2M2 export from the MetabolomicsWorkbench project. | 22 Tables |
| `./MoTrPAC/C2M2_datapackage_udi.json` | A C2M2 export from the MoTrPAC project. | 14 Tables |
| `./SenNet/C2M2_datapackage_udi.json` | A C2M2 export from the SenNet project. | 6 Tables |
