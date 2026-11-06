"""Multi-value columns (#80): a column whose cells list several values declares
its delimiter as `udi:separator`, and templates split it with <SEP:…>.

pcx joins chemotherapy agents with "," and tumor locations with ";", so a
hard-coded delimiter splits one of them into nothing: every regimen stays a
single "cisplatin,cyclophosphamide,vincristine" category, and the heatmap of
agents by diagnosis has 202 columns of combinations instead of single agents.
"""

import json
from pathlib import Path

from udiagent.query import DuckDBConnector, QueryEngine
from udiagent.schema import parse_schema_from_dict, simplify_data_schema
from udiagent.vis_generate import instantiate_template, validate_bindings

_PCX = Path(__file__).resolve().parents[3] / "sample-data" / "pcx"


def _pcx_package():
    return json.loads((_PCX / "datapackage.json").read_text())


def _template(name):
    from udiagent.generated_vis_tools import TEMPLATES, TOOL_DISPATCH

    index, param_map = TOOL_DISPATCH[name]
    return TEMPLATES[index], param_map


def test_schema_carries_the_separator_to_the_model_and_the_resolver():
    package = _pcx_package()
    fields = parse_schema_from_dict(package)["entities"]["Medical Therapy"]["fields"]
    assert fields["chemotherapy_agents"]["separator"] == ","
    assert "separator" not in fields["protocol_name_and_arm"]
    text = simplify_data_schema(package)
    assert 'separated by ","' in text and 'separated by ";"' in text


def test_sep_placeholder_reads_the_bound_fields_delimiter():
    schema = {
        "entities": {
            "T": {
                "fields": {
                    "drugs": {"type": "nominal", "separator": ","},
                    "sites": {"type": "nominal"},
                    "quoted": {"type": "nominal", "separator": '"'},
                }
            }
        }
    }
    template = '{"source": {"name": "<E>", "source": "x"}, "transformation": [{"unnest": {"field": "<F>", "separator": "<SEP:F>"}}]}'

    def separator(field):
        spec = instantiate_template(template, {"E": "T", "F": field}, schema)
        return spec["transformation"][0]["unnest"]["separator"]

    assert separator("drugs") == ","
    # Undeclared: the ";" every multi-value template assumed before.
    assert separator("sites") == ";"
    # Spliced into the spec's raw JSON, so it is escaped like a value.
    assert separator("quoted") == '"'


def test_agents_by_diagnosis_heatmap_counts_single_agents():
    """The E-002 request: diagnoses as rows, individual agents as columns."""
    template, param_map = _template("vis_083_heatmap_subjects_multivalue_join")
    args = {
        "entity1": "Medical Therapy",
        "entity1_field1": "research_id",
        "entity1_field2": "chemotherapy_agents",
        "entity2": "Event",
        "entity2_field1": "research_id",
        "entity2_field2": "cns_integrated_diagnosis",
    }
    bindings = {param_map[k]: v for k, v in args.items()}
    schema = parse_schema_from_dict(_pcx_package())
    assert validate_bindings(template, bindings, schema) == []
    spec = instantiate_template(template, bindings, schema)

    views = {
        "medical_therapy": str(_PCX / "pcx_30_medical_therapy_level_deid.csv"),
        "event": str(_PCX / "pcx_30_event_level_deid.csv"),
    }
    engine = QueryEngine(
        DuckDBConnector(views=views),
        table_map={"Medical Therapy": "medical_therapy", "Event": "event"},
    )
    rows = engine.run_query(source=spec["source"], transformation=spec["transformation"])[
        "displayData"
    ]
    agents = {row["chemotherapy_agents"] for row in rows}
    assert not any("," in agent for agent in agents)
    assert "vincristine" in agents
    cell = {
        (row["chemotherapy_agents"], row["cns_integrated_diagnosis"]): row["subjects"]
        for row in rows
    }
    # Distinct patients, matching a count over the CSVs.
    assert cell[("vincristine", "Medulloblastoma, NOS or NEC")] == 192
