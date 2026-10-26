"""The cross-table count heatmap counts DISTINCT records, not joined rows.

A therapy table holds one row per regimen, so joining it to a patient table
repeats each patient once per regimen. Counting the joined rows would report
regimens under an axis that says patients; the template reduces to one row per
(cell, patient) on the join key first.
"""

import pytest

from udiagent.query import DuckDBConnector, QueryEngine
from udiagent.schema import parse_schema_from_dict
from udiagent.vis_generate import (
    _load_generated_tools,
    instantiate_template,
    validate_bindings,
)

#   p1  two regimens on protocol A: one patient in (A, deceased), not two.
#   p2  protocols A and B: in both cells — membership, counted once in each.
#   p3  protocol B.
#   p4  no therapy at all: drops out of the inner join.
_THERAPY = """research_id,protocol
p1,A
p1,A
p2,A
p2,B
p3,B
"""

_PATIENTS = """research_id,vital_status
p1,deceased
p2,alive
p3,alive
p4,alive
"""


@pytest.fixture()
def heatmap(tmp_path):
    therapy = tmp_path / "therapy.csv"
    therapy.write_text(_THERAPY)
    patients = tmp_path / "patients.csv"
    patients.write_text(_PATIENTS)
    schema = parse_schema_from_dict(
        {
            "udi:path": "",
            "resources": [
                {
                    "name": "therapy",
                    "path": str(therapy),
                    "udi:row_count": 5,
                    "schema": {
                        "fields": [
                            {"name": "research_id", "udi:data_type": "nominal"},
                            {"name": "protocol", "udi:data_type": "nominal"},
                        ],
                        "foreignKeys": [
                            {
                                "fields": ["research_id"],
                                "reference": {
                                    "resource": "patients",
                                    "fields": ["research_id"],
                                },
                            }
                        ],
                    },
                },
                {
                    "name": "patients",
                    "path": str(patients),
                    "udi:row_count": 4,
                    "schema": {
                        "fields": [
                            {"name": "research_id", "udi:data_type": "nominal"},
                            {"name": "vital_status", "udi:data_type": "nominal"},
                        ],
                        "primaryKey": ["research_id"],
                    },
                },
            ],
        }
    )
    _defs, dispatch, templates, _tags = _load_generated_tools()
    tool = next(n for n in dispatch if n.endswith("_heatmap_count_join"))
    idx, param_map = dispatch[tool]
    args = {
        "entity1": "therapy",
        "entity1_field1": "protocol",
        "entity2": "patients",
        "entity2_field2": "vital_status",
    }
    bindings = {param_map[k]: v for k, v in args.items() if k in param_map}
    assert validate_bindings(templates[idx], bindings, schema) == []
    spec = instantiate_template(templates[idx], bindings, schema)
    engine = QueryEngine(
        DuckDBConnector(views={"therapy": str(therapy), "patients": str(patients)}),
        table_map={"therapy": "therapy", "patients": "patients"},
    )
    rows = engine.run_query(source=spec["source"], transformation=spec["transformation"])[
        "displayData"
    ]
    return {(r["protocol"], r["vital_status"]): r["count patients"] for r in rows}


def test_cells_count_distinct_patients_not_joined_rows(heatmap):
    assert heatmap == {
        ("A", "deceased"): 1,  # p1's two regimens are one patient
        ("A", "alive"): 1,
        ("B", "alive"): 2,
    }
