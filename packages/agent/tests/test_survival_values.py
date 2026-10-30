"""What each literal value of a survival curve is for.

Reported on the combined pcx package: "Show survival for the Seattle data by
diagnosis" drew a curve collapsed into a vertical line about 1 run in 5. The model
had set the end events (`value2`) to the start event, so every patient ended at
time 0. Other runs set the censored status (`value3`) to `deceased`. The value
parameters said only "a literal value", so the model guessed their roles.
"""

import json
from pathlib import Path

import pytest

import udiagent.vis_generate as vg
from udiagent.vis_generate import _parse_request_schema, validate_bindings

_PACKAGE = Path(__file__).parents[3] / "sample-data/pcx/combined_oct_28/datapackage.json"

#: The failing run's arguments, verbatim.
_RELATED = {
    "endpoint": "overall_survival",
    "entity1": "Event",
    "entity1_field1": "research_id",
    "entity1_field2": "event_type",
    "entity1_field3": "age_at_event_days",
    "entity2": "Demographics",
    "entity2_field": "diagnosis_type_cohort",
    "entity2_field1": "research_id",
    "entity3": "Patient",
    "entity3_field1": "research_id",
    "entity3_field2": "vital_status",
    "entity3_field3": "age_at_vital_status_days",
    "estimator": "kaplan_meier",
    "value1": "Initial CNS Tumor",
    "value2": ["Initial CNS Tumor"],
    "value3": "deceased",
}


def _validate(tool, args):
    _defs, dispatch, templates, _tags = vg._load_generated_tools()
    idx, param_map = dispatch[tool]
    bindings = {param_map[k]: v for k, v in args.items() if k in param_map}
    schema = _parse_request_schema(json.loads(_PACKAGE.read_text()))
    return validate_bindings(templates[idx], bindings, schema, None, vg.shared_entities_for(tool))


def test_a_curve_cannot_end_on_its_start_event():
    errors = _validate("vis_057_line_survival_related", {**_RELATED, "value3": "alive"})
    assert len(errors) == 1
    assert "'Initial CNS Tumor' cannot be both the event that starts the clock" in errors[0]

    fixed = {**_RELATED, "value2": ["Deceased"], "value3": "alive"}
    assert _validate("vis_057_line_survival_related", fixed) == []


def test_the_censored_status_cannot_name_an_end_event():
    args = {**_RELATED, "value2": ["Deceased"], "value3": "deceased"}
    errors = _validate("vis_057_line_survival_related", args)
    assert len(errors) == 1 and "'deceased' (value3)" in errors[0]


def test_a_cube_curve_cannot_censor_its_events():
    args = {
        "entity": "Os",
        "dimension1": "overall_survival_months",
        "dimension2": "vital_status",
        "value1": "deceased",
        "value2": "deceased",
    }
    errors = _validate("vis_063_line_survival_cube", args)
    assert len(errors) == 1 and "the event status (value1) and the censored" in errors[0]


@pytest.mark.parametrize(
    "tool",
    [
        name
        for name, (_idx, param_map) in vg._load_generated_tools()[1].items()
        if "V3" in param_map.values()
    ],
)
def test_every_event_log_curve_says_what_its_values_are_for(tool):
    defs = {d["function"]["name"]: d for d in vg._load_generated_tools()[0]}
    properties = defs[tool]["function"]["parameters"]["properties"]
    assert "STARTS the clock" in properties["value1"]["description"]
    assert "END the clock" in properties["value2"]["description"]
    assert "censored" in properties["value3"]["description"]
