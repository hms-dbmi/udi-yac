"""Event-free survival: the survival templates' end event is a LIST.

Overall survival stops the clock at death. Event-free survival stops it at the
FIRST of progression, recurrence, a second malignancy or death — the same
pipeline with a different set of end events. So the end event is a `<V2:list>`
placeholder: the model lists whichever event types the question means, a row
holding any of them is an end event, and each subject's end is the earliest.

Both halves are load-bearing. Listing several values without taking the
earliest would stop the clock at a subject's death even when it progressed
years before; taking the earliest of one value is what overall survival always
did, since a subject dies once.
"""

import json

import pytest

from udiagent.generate_tools import _value_param_schema
from udiagent.query import DuckDBConnector, QueryEngine
from udiagent.schema import parse_schema_from_dict
from udiagent.vis_generate import (
    _load_generated_tools,
    instantiate_template,
    validate_bindings,
    value_list,
)

#   p1  progresses at 100, dies at 400: OS event at 400, EFS event at 100.
#   p2  recurs at 50 and again at 80: EFS takes the FIRST, 50. Alive, so OS
#       censors it at its status date.
#   p3  dies at 300 with nothing before it: the same event under both.
#   p4  no event at all, alive: censored at its status date under both.
#   p5  a second malignancy at 200, alive.
_EVENTS = """subject,event,day
p1,Initial,0
p1,Progressive,100
p1,Deceased,400
p2,Initial,0
p2,Recurrence,80
p2,Recurrence,50
p3,Initial,0
p3,Deceased,300
p4,Initial,0
p5,Initial,0
p5,Second Malignancy,200
"""

_PATIENTS = """subject,status,asof
p1,deceased,400
p2,alive,500
p3,deceased,300
p4,alive,600
p5,alive,700
"""

EFS_END = ["Progressive", "Recurrence", "Second Malignancy", "Deceased"]


@pytest.fixture()
def run(tmp_path):
    events = tmp_path / "events.csv"
    events.write_text(_EVENTS)
    patients = tmp_path / "patients.csv"
    patients.write_text(_PATIENTS)
    schema = parse_schema_from_dict(
        {
            "udi:path": "",
            "resources": [
                {
                    "name": "events",
                    "path": str(events),
                    "udi:row_count": 11,
                    "schema": {
                        "fields": [
                            {"name": "subject", "udi:data_type": "nominal"},
                            {"name": "event", "udi:data_type": "nominal"},
                            {"name": "day", "udi:data_type": "quantitative"},
                        ]
                    },
                },
                {
                    "name": "patients",
                    "path": str(patients),
                    "udi:row_count": 5,
                    "schema": {
                        "fields": [
                            {"name": "subject", "udi:data_type": "nominal"},
                            {"name": "status", "udi:data_type": "nominal"},
                            {"name": "asof", "udi:data_type": "quantitative"},
                        ]
                    },
                },
            ],
        }
    )
    _defs, dispatch, templates, _tags = _load_generated_tools()
    tool = next(n for n in dispatch if n.endswith("_line_survival"))
    idx, param_map = dispatch[tool]
    engine = QueryEngine(
        DuckDBConnector(views={"events": str(events), "patients": str(patients)}),
        table_map={"events": "events", "patients": "patients"},
    )

    def _run(end_events):
        args = {
            "entity1": "events",
            "entity1_field1": "subject",
            "entity1_field2": "event",
            "entity1_field3": "day",
            "entity2": "patients",
            "entity2_field1": "subject",
            "entity2_field2": "status",
            "entity2_field3": "asof",
            "value1": "Initial",
            "value2": end_events,
            "value3": "alive",
        }
        bindings = {param_map[k]: v for k, v in args.items() if k in param_map}
        assert validate_bindings(templates[idx], bindings, schema) == []
        spec = instantiate_template(templates[idx], bindings, schema)
        rows = engine.run_query(source=spec["source"], transformation=spec["transformation"])[
            "displayData"
        ]
        return {r["subject"]: (r["survival days"], r["died"]) for r in rows}

    return _run


def test_overall_survival_stops_the_clock_at_death(run):
    assert run(["Deceased"]) == {
        "p1": (400, 1),
        "p2": (500, 0),
        "p3": (300, 1),
        "p4": (600, 0),
        "p5": (700, 0),
    }


def test_event_free_survival_stops_the_clock_at_the_first_listed_event(run):
    assert run(EFS_END) == {
        "p1": (100, 1),  # progression, not the later death
        "p2": (50, 1),  # the earlier of two recurrences
        "p3": (300, 1),
        "p4": (600, 0),  # no event of any kind: censored, as under OS
        "p5": (200, 1),
    }


def test_a_bare_string_is_the_one_element_list(run):
    """A chart saved before the parameter took lists still means the same."""
    assert run("Deceased") == run(["Deceased"])
    # A client that keeps every argument a string sends the list back encoded.
    assert run(json.dumps(EFS_END)) == run(EFS_END)


def _survival_template():
    _defs, dispatch, templates, _tags = _load_generated_tools()
    tool = next(n for n in dispatch if n.endswith("_line_survival"))
    idx, param_map = dispatch[tool]
    return templates[idx], param_map


def test_a_list_compiles_to_one_comparison_per_value():
    template, param_map = _survival_template()
    bindings = {"E1": "events", "E1.F2": "event", "V2": ["a", 'b "quoted"']}
    spec = json.dumps(instantiate_template(template, bindings, {"entities": {}}))
    assert '"op": "||"' in spec
    # Values travel as structured literals, so a quote cannot break the JSON.
    assert '{"literal": "b \\"quoted\\""}' in spec


def test_every_listed_value_is_checked_against_the_column():
    """One misspelt end event in four does not empty the chart — it silently
    drops that event from the definition, which is worse for being quiet."""
    template, param_map = _survival_template()
    schema = {
        "entities": {
            "events": {
                "fields": {
                    "subject": {"type": "nominal"},
                    "event": {"type": "nominal"},
                    "day": {"type": "quantitative"},
                }
            },
            "patients": {
                "fields": {
                    "subject": {"type": "nominal"},
                    "status": {"type": "nominal"},
                    "asof": {"type": "quantitative"},
                }
            },
        },
        "relationships": [],
    }
    bindings = {
        "E1": "events",
        "E1.F1": "subject",
        "E1.F2": "event",
        "E1.F3": "day",
        "E2": "patients",
        "E2.F1": "subject",
        "E2.F2": "status",
        "E2.F3": "asof",
        "V1": "Initial",
        "V2": ["Progressive", "recurrence"],
        "V3": "alive",
    }
    domains = [
        {
            "entity": "events",
            "field": "event",
            "type": "point",
            "domain": {"values": ["Initial", "Progressive", "Recurrence"]},
        },
        {
            "entity": "patients",
            "field": "status",
            "type": "point",
            "domain": {"values": ["alive", "deceased"]},
        },
    ]
    errors = validate_bindings(template, bindings, schema, data_domains=domains)
    assert len(errors) == 1 and "'Recurrence'" in errors[0], errors

    bindings["V2"] = []
    assert any("is empty" in e for e in validate_bindings(template, bindings, schema))


def test_the_end_events_are_an_array_parameter_and_the_start_event_is_not():
    defs, dispatch, _templates, _tags = _load_generated_tools()
    survival_tools = [
        d["function"]
        for d in defs
        if "_line_survival" in d["function"]["name"]
        and "cube" not in d["function"]["name"]
    ]
    assert len(survival_tools) == 11
    for tool in survival_tools:
        props = tool["parameters"]["properties"]
        assert props["value2"]["type"] == "array", tool["name"]
        assert props["value1"]["type"] == "string", tool["name"]
        assert "event-free survival" in tool["description"], tool["name"]


def test_value_list_reads_every_shape_a_binding_arrives_in():
    assert value_list(["a", "b"]) == ["a", "b"]
    assert value_list('["a", "b"]') == ["a", "b"]
    assert value_list("a") == ["a"]
    # Brackets in a plain value are a value, not a malformed list.
    assert value_list("[unparseable") == ["[unparseable"]
    assert value_list(None) == []
    assert _value_param_schema("V2:list")["type"] == "array"
    assert _value_param_schema("V2")["type"] == "string"
