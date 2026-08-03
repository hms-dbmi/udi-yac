"""`<V*>` placeholders bind literal data values rather than column names.

Templates that must compare against a value (an event vocabulary, a status
string) used to hardcode it, which tied them to one dataset. `<V*>` lets the model
supply the value per request. Two things need pinning: the validator must not
treat a value as a column, and substitution must escape it — values are spliced
into the spec's raw JSON string, so an unescaped quote would corrupt the spec.
"""

import json

import pytest

from udiagent.vis_generate import instantiate_template, validate_bindings

SCHEMA = {
    "entities": {
        "events": {
            "url": "events.csv",
            "fields": {
                "subject_id": {"type": "nominal", "cardinality": 500},
                "event_type": {"type": "nominal", "cardinality": 6},
                "day": {"type": "quantitative", "cardinality": 300},
            },
        }
    },
    "relationships": [],
}

# Mirrors the survival templates: a value placeholder inside a conditional.
TEMPLATE = json.dumps(
    {
        "source": {"name": "<E>", "source": "<E.url>"},
        "transformation": [
            {
                "derive": {
                    "start day": {
                        "if": {
                            "op": "==",
                            "left": {"field": "<F2:n>"},
                            "right": {"literal": "<V1>"},
                        },
                        "then": {"field": "<F3:q>"},
                        "else": {"literal": None},
                    }
                }
            },
            {"groupby": "<F1:n>"},
        ],
        "representation": {
            "mark": "line",
            "mapping": [{"encoding": "x", "field": "start day", "type": "quantitative"}],
        },
    }
)

BASE = {"E": "events", "F1": "subject_id", "F2": "event_type", "F3": "day"}


def test_value_binding_is_not_validated_as_a_column():
    """A value that is not a column name must still validate."""
    errors = validate_bindings(TEMPLATE, {**BASE, "V1": "Initial CNS Tumor"}, SCHEMA)
    assert errors == [], errors


def test_empty_value_is_rejected():
    """An empty value would make the comparison match nothing, silently."""
    errors = validate_bindings(TEMPLATE, {**BASE, "V1": "   "}, SCHEMA)
    assert any("empty" in e.lower() for e in errors), errors


def test_value_is_substituted_into_the_spec():
    spec = instantiate_template(TEMPLATE, {**BASE, "V1": "Initial CNS Tumor"}, SCHEMA)
    condition = spec["transformation"][0]["derive"]["start day"]["if"]
    assert condition["right"]["literal"] == "Initial CNS Tumor"
    assert condition["left"]["field"] == "event_type"


@pytest.mark.parametrize(
    "value",
    [
        'Grade "III"',          # double quotes would end the JSON string early
        "back\\slash",          # a lone backslash would start an escape
        "line\nbreak",          # a raw newline is illegal inside a JSON string
        'both "q" and \\ x',
    ],
)
def test_hostile_values_do_not_corrupt_the_spec(value):
    """Values are spliced into raw JSON, so they must be escaped, not trusted."""
    spec = instantiate_template(TEMPLATE, {**BASE, "V1": value}, SCHEMA)
    assert spec["transformation"][0]["derive"]["start day"]["if"]["right"]["literal"] == value


def test_value_placeholders_are_exposed_as_tool_parameters():
    """The model can only fill a value if the tool actually offers the parameter."""
    from udiagent.generated_vis_tools import TOOL_DEFS, TOOL_DISPATCH

    survival = [d for d in TOOL_DEFS if "survival" in d["function"]["name"]]
    assert survival, "expected the survival templates to be generated"
    for tool in survival:
        name = tool["function"]["name"]
        properties = tool["function"]["parameters"]["properties"]
        assert "value1" in properties and "value2" in properties, name
        # And the description must say it is a value, not a column — the obvious
        # failure mode is the model passing a column name.
        assert "not a column name" in properties["value1"]["description"], name
        param_map = TOOL_DISPATCH[name][1]
        assert param_map["value1"] == "V1" and param_map["value2"] == "V2", name


def test_no_survival_template_hardcodes_an_event_value():
    """The point of the change: nothing dataset-specific left in the specs."""
    import os

    path = os.path.join(
        os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
        "src",
        "udiagent",
        "data",
        "skills",
        "template_visualizations.json",
    )
    with open(path) as f:
        templates = json.load(f)

    for index, template in enumerate(templates):
        if "survival" not in (template.get("description") or "").lower():
            continue
        spec = template["spec_template"]
        assert "<V1>" in spec and "<V2>" in spec, f"template {index} lost its value placeholders"
        for leaked in ("Initial CNS Tumor", "Deceased"):
            assert leaked not in spec, f"template {index} still hardcodes {leaked!r}"
            assert leaked not in (template.get("description") or "")
            assert leaked not in (template.get("design_considerations") or "")
