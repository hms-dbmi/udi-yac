"""Fields that split marks by colour or offset, rather than placing them on an axis.

Reported against the radiant subset of pcx (313 patients): "count of patients by
gender" drew a grouped bar chart with `research_id` as its colour and offset —
under the 500-category axis cap, so nothing refused it — and another time with
`gender` as both the x axis and the colour and offset.

The split cap is deliberately narrow: only a field splitting the bars of a
categorical axis. A pie's colour is its category, a dot plot's colour repeats its
axis, and a survival stratifier has a `grouping`; those keep the axis cap.
"""

import json

import udiagent.vis_generate as vg
from udiagent.vis_generate import (
    FALLBACK_VALIDATION_FAILED,
    MAX_DRAWN_CATEGORIES,
    MAX_SPLIT_CATEGORIES,
    VALUE_COUNTS_TOOL_SUFFIX,
    _parse_request_schema,
    placeholder_encoding_info,
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
                        {"name": "location", "udi:data_type": "nominal", "udi:cardinality": 120},
                        {"name": "postal_code", "udi:data_type": "nominal", "udi:cardinality": 600},
                        {"name": "age", "udi:data_type": "quantitative", "udi:cardinality": 300},
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
STACKED = "_stacked_bar_count_vert_stacked_grouped"
BAR = "_barchart_count_vert_grouped"
PIE = "_circular_proportion_distribution"
DOTS = "_grouped_dot_distribution"
CUBE_SURVIVAL = "_line_survival_cube_stratified"


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


def test_a_stacked_bar_split_is_capped_too():
    errors = _errors(STACKED, E="Demographics", F1="location", F2="gender")
    assert len(errors) == 1 and "120 unique values" in errors[0]


def test_a_pie_or_dot_plot_colour_keeps_the_axis_cap():
    """A pie's colour is its only category, and a dot plot's repeats its axis."""
    assert MAX_SPLIT_CATEGORIES < 120 < MAX_DRAWN_CATEGORIES
    assert _errors(PIE, E="Demographics", F="location") == []
    assert _errors(DOTS, E="Demographics", F1="age", F2="location") == []


_CUBE_SCHEMA = {
    "name": "cube",
    "udi:path": "./data/cube/",
    "resources": [
        {
            "name": "Os",
            "type": "table",
            "path": "os.csv",
            "udi:row_count": 100,
            "udi:cube": True,
            "udi:measures": ["cnt"],
            "udi:dimensions": ["months", "status"],
            "schema": {
                "fields": [
                    {"name": "cnt", "udi:data_type": "quantitative", "udi:cardinality": 50},
                    {"name": "months", "udi:data_type": "quantitative", "udi:cardinality": 60},
                    {"name": "status", "udi:data_type": "nominal", "udi:cardinality": 2},
                ]
            },
        }
    ],
}


def test_fields_combined_in_a_derive_are_not_duplicate_channels():
    """The cube survival curve draws D1 and D3 only through derives (the time in
    years, the stratum), so they are not two channels showing one column."""
    _name, _params, template = _tool(CUBE_SURVIVAL)
    assert not placeholder_encoding_info(template)["D1"]["direct_encodings"]
    bindings = {
        "E": "Os", "D1": "months", "D2": "status", "D3": "months",
        "V1": "deceased", "V2": "alive",
    }
    errors = validate_bindings(template, bindings, _parse_request_schema(_CUBE_SCHEMA))
    assert not [e for e in errors if "both set to" in e]


def _generate(monkeypatch, suffix, **bindings):
    """Run generation with a model that makes the same call on every attempt."""
    name, params, _template = _tool(suffix)
    call = (name, {params[k]: v for k, v in bindings.items()})
    monkeypatch.setattr(vg, "_call_llm_with_tools", lambda *args, **kwargs: call)
    return vg._execute_generate(
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


def test_a_pie_of_too_many_values_still_becomes_the_value_list(monkeypatch):
    out = _generate(monkeypatch, PIE, E="Demographics", F="postal_code")
    assert not out.get("generation_failed")
    assert out["tool_used"].endswith(VALUE_COUNTS_TOOL_SUFFIX)


def test_an_over_cap_split_fails_rather_than_listing_subject_ids(monkeypatch):
    """The value-count table answers a question about too many categories on an
    axis. A split by a subject id was the wrong field, and a list of the ids
    answers nothing."""
    out = _generate(monkeypatch, GROUPED, E="Demographics", F1="research_id", F2="gender")

    assert out["generation_failed"]["reason"] == FALLBACK_VALIDATION_FAILED
    assert "313 unique values" in out["generation_failed"]["errors"][0]
