"""Fields that split marks by colour or offset, rather than placing them on an axis.

Reported against the radiant subset of pcx (313 patients): "count of patients by
gender" drew a grouped bar chart with `research_id` as its colour and offset —
under the 500-category axis cap, so nothing refused it — and another time with
`gender` as both the x axis and the colour and offset.
"""

import json

import udiagent.vis_generate as vg
from udiagent.vis_generate import (
    FALLBACK_VALIDATION_FAILED,
    MAX_SPLIT_CATEGORIES,
    _parse_request_schema,
    validate_bindings,
)

_SCHEMA = json.dumps(
    {
        "name": "tiny",
        "udi:path": "./data/tiny/",
        "resources": [
            {
                "name": "Demographics",
                "type": "table",
                "path": "demographics.csv",
                "udi:row_count": 313,
                "schema": {
                    "fields": [
                        {"name": "research_id", "udi:data_type": "nominal", "udi:cardinality": 313},
                        {"name": "gender", "udi:data_type": "nominal", "udi:cardinality": 2},
                        {"name": "race", "udi:data_type": "nominal", "udi:cardinality": 25},
                    ]
                },
            }
        ],
    }
)


def _tool(suffix):
    """(name, placeholder -> parameter, template) for the generated tool ending in `suffix`."""
    _defs, dispatch, templates, _tags = vg._load_generated_tools()
    name = next(n for n in dispatch if n.endswith(suffix))
    idx, param_map = dispatch[name]
    return name, {ph: param for param, ph in param_map.items()}, templates[idx]


GROUPED = "_stacked_bar_count_vert_grouped"
BAR = "_barchart_count_vert_grouped"


def _errors(suffix, **bindings):
    _name, _params, template = _tool(suffix)
    return validate_bindings(template, bindings, _parse_request_schema(_SCHEMA))


def test_a_subject_id_cannot_split_bars_though_it_fits_on_an_axis():
    assert 313 > MAX_SPLIT_CATEGORIES
    errors = _errors(GROUPED, E="Demographics", F1="research_id", F2="gender")
    assert len(errors) == 1
    # Names the way out, since the retry reads it.
    assert "313 unique values" in errors[0] and "one bar per category" in errors[0]

    assert _errors(BAR, E="Demographics", F="research_id") == []


def test_a_field_with_a_few_dozen_values_can_still_split_bars():
    assert _errors(GROUPED, E="Demographics", F1="race", F2="gender") == []


def test_one_field_cannot_be_both_the_axis_and_the_split():
    errors = _errors(GROUPED, E="Demographics", F1="gender", F2="gender")
    assert len(errors) == 1
    assert "'F1' and 'F2' are both set to 'gender'" in errors[0]


def test_an_over_cap_split_fails_rather_than_listing_subject_ids(monkeypatch):
    """The value-count table answers a question about too many categories on an
    axis. A split by a subject id was the wrong field, and a list of the ids
    answers nothing."""
    name, params, _template = _tool(GROUPED)
    call = (
        name,
        {params["E"]: "Demographics", params["F1"]: "research_id", params["F2"]: "gender"},
    )
    monkeypatch.setattr(vg, "_call_llm_with_tools", lambda *args, **kwargs: call)

    out = vg._execute_generate(
        skill=None,
        context={
            "agent": object(),
            "grammar": {},
            "config": {},
            "data_schema": _SCHEMA,
            "messages": [{"role": "user", "content": "Count of patients by gender"}],
            "openai_api_key": None,
            "usage": None,
            "req_id": "testreq1",
        },
    )

    assert out["generation_failed"]["reason"] == FALLBACK_VALIDATION_FAILED
    assert "313 unique values" in out["generation_failed"]["errors"][0]
