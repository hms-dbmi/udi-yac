"""The survival title names its endpoint: overall vs event-free survival.

The events that end a curve are data values (`value2`), which differ per dataset,
so the endpoint is not inferred from them: the model names it in the optional
`endpoint` argument, and the server fills the title from that. It is a label,
not a computation, so it must never be offered in the tweak panel, where
flipping it would relabel a chart without changing which events end it.
"""

import pytest

from udiagent.choices import ENDPOINT
from udiagent.vis_generate import (
    _load_generated_tools,
    resolve_text_templates,
    template_tweakable_params,
    validate_bindings,
)

_SINGLE = "vis_052_line_survival"
_STRATIFIED = "vis_053_line_survival_baseline"


def _event_log_survival_tools():
    defs, _dispatch, _templates, _tags = _load_generated_tools()
    return [
        d["function"]
        for d in defs
        if "_line_survival" in d["function"]["name"]
        and "_cube" not in d["function"]["name"]
    ]


@pytest.mark.parametrize(
    "endpoint, title",
    [
        ("overall_survival", "Overall survival curve for {ent:entity2}"),
        ("event_free_survival", "Event-free survival curve for {ent:entity2}"),
        ("progression_free_survival", "Progression-free survival curve for {ent:entity2}"),
        (None, "Survival curve for {ent:entity2}"),
    ],
)
def test_the_title_names_the_endpoint(endpoint, title):
    bindings = {"ENDPOINT": endpoint} if endpoint else {}
    assert resolve_text_templates(_SINGLE, bindings)["title"] == title


def test_the_stratified_title_keeps_its_other_tokens():
    """Only the endpoint is filled here; the stratifier stays a token the client
    resolves, so a stratifier swapped in the tweak panel still renames it."""
    text = resolve_text_templates(_STRATIFIED, {"ENDPOINT": "event_free_survival"})
    assert text["title"] == "Event-free survival curves for {ent:entity2} by {col:entity1_field4}"


def test_every_event_log_survival_tool_offers_the_endpoint_as_an_optional_enum():
    tools = _event_log_survival_tools()
    assert len(tools) == 11
    for tool in tools:
        properties = tool["parameters"]["properties"]
        assert properties["endpoint"]["enum"] == list(ENDPOINT.options), tool["name"]
        assert "endpoint" not in tool["parameters"]["required"], tool["name"]


def test_an_unknown_endpoint_is_refused():
    _defs, dispatch, templates, _tags = _load_generated_tools()
    idx, _param_map = dispatch[_SINGLE]
    errors = validate_bindings(templates[idx], {"ENDPOINT": "disease_free"}, {"entities": {}})
    assert any("not a valid endpoint" in e for e in errors), errors


def test_the_endpoint_is_not_a_tweak():
    _defs, dispatch, templates, _tags = _load_generated_tools()
    idx, param_map = dispatch[_STRATIFIED]
    params = template_tweakable_params(
        templates[idx], param_map, {"ENDPOINT": "overall_survival"}, {"entities": {}}
    )
    assert "endpoint" not in {p["param"] for p in params}
    # The endpoint is text only: it never reaches the spec it would have to change.
    assert "<ENDPOINT>" not in templates[idx]


_CUBE_SINGLE = "vis_063_line_survival_cube"
_CUBE_STRATIFIED = "vis_064_line_survival_cube_stratified"


@pytest.mark.parametrize(
    "endpoint, title",
    [
        ("overall_survival", "Overall survival curve over {enc:x}"),
        ("event_free_survival", "Event-free survival curve over {enc:x}"),
        (None, "Survival curve over {enc:x}"),
    ],
)
def test_the_cube_title_names_the_endpoint(endpoint, title):
    """A cube holding both EFS and OS needs the title to say which one it is."""
    bindings = {"ENDPOINT": endpoint} if endpoint else {}
    assert resolve_text_templates(_CUBE_SINGLE, bindings)["title"] == title


def test_the_stratified_cube_title_keeps_its_other_tokens():
    text = resolve_text_templates(_CUBE_STRATIFIED, {"ENDPOINT": "overall_survival"})
    assert text["title"] == "Overall survival curves over {enc:x} by {col:dimension3}"


def test_both_cube_survival_tools_offer_the_endpoint_as_an_optional_enum():
    defs, _dispatch, _templates, _tags = _load_generated_tools()
    tools = [d["function"] for d in defs if "_survival_cube" in d["function"]["name"]]
    assert len(tools) == 2
    for tool in tools:
        properties = tool["parameters"]["properties"]
        assert properties["endpoint"]["enum"] == list(ENDPOINT.options), tool["name"]
        assert "endpoint" not in tool["parameters"]["required"], tool["name"]
