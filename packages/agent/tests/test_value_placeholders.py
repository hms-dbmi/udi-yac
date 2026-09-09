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


def test_survival_capability_is_advertised_to_the_orchestrator():
    """The orchestrator must know survival curves are possible.

    `Rebuff`'s description tells the model to use it for "requests for unsupported
    chart types", and `CreateVisualization` advertises its capabilities by listing
    them. A survival request was therefore being rebuffed as unsupported simply
    because the list did not mention it. This pins both halves of the fix.
    """
    from udiagent.skills import load_skills, render_template
    from udiagent.tools import ORCHESTRATOR_TOOLS

    create = next(
        tool["function"]
        for tool in ORCHESTRATOR_TOOLS
        if tool["function"]["name"] == "CreateVisualization"
    )
    description = create["description"].lower()
    for term in ("survival", "kaplan-meier", "km"):
        assert term in description, f"CreateVisualization should advertise {term!r}"

    instructions = render_template(
        load_skills()["orchestrate"].instructions, {"data_domains": ""}
    ).lower()
    assert "survival" in instructions
    # Must route to CreateVisualization rather than Rebuff.
    assert "rebuff" in instructions, "the prompt should say survival is not a Rebuff case"
    # And must not let the agent claim a true Kaplan-Meier estimate.
    assert "not" in instructions and "kaplan-meier" in instructions


def test_concat_compiles_to_sql():
    """`concat` must work server-side too, or the portable survival templates
    would silently become browser-only just because they build a label."""
    from udiagent.query.errors import UnsupportedQueryError
    from udiagent.query.expr import ExprContext, compile_expr

    ctx = ExprContext(quote=lambda c: f'"{c}"', placeholder="?", params=[])
    sql = compile_expr(
        {"concat": [{"field": "org"}, {"literal": " "}, {"field": "pct"}, {"literal": "%"}]},
        ctx,
    )
    assert sql.startswith("CONCAT("), sql
    # Numbers must be cast, or a numeric column would not concatenate as text.
    assert sql.count("CAST(") == 4, sql
    assert ctx.params == [" ", "%"], "literals must be parameterised, not inlined"

    with pytest.raises(UnsupportedQueryError):
        compile_expr({"concat": []}, ExprContext(quote=str, placeholder="?", params=[]))


# ---------------------------------------------------------------------------
# A value is checked against the column it is compared to, when domains are given
# ---------------------------------------------------------------------------

#: What the client sends alongside the schema. Only categorical columns carry a
#: value list; an interval domain is a min/max and says nothing about strings.
DOMAINS = [
    {
        "entity": "events",
        "field": "event_type",
        "type": "point",
        "domain": {"values": ["Initial CNS Tumor", "Deceased", "Progressive"]},
        "fieldDescription": "",
    },
    {
        "entity": "events",
        "field": "day",
        "type": "interval",
        "domain": {"min": 0, "max": 900},
        "fieldDescription": "",
    },
]


def test_a_value_absent_from_its_column_is_rejected():
    """The failure this exists for produces an EMPTY chart, not a wrong one.

    Every conditional the value feeds is false, so no row has a start or an end
    and the curve has nothing to draw. Nothing else catches it: the type checks
    pass happily when two tables are bound the wrong way round, because both have
    a nominal column and a numeric one.
    """
    errors = validate_bindings(
        TEMPLATE, {**BASE, "V1": "vital_status_is_not_an_event"}, SCHEMA, DOMAINS
    )
    assert len(errors) == 1
    assert "does not appear in column 'event_type'" in errors[0]
    # Names what would go wrong, and what the alternatives are.
    assert "empty" in errors[0]
    assert "Initial CNS Tumor" in errors[0]


def test_a_value_present_in_its_column_is_accepted():
    errors = validate_bindings(TEMPLATE, {**BASE, "V1": "Deceased"}, SCHEMA, DOMAINS)
    assert errors == [], errors


def test_a_case_mismatch_is_reported_as_one():
    """Different mistake, different fix: the model was told to copy exactly."""
    errors = validate_bindings(TEMPLATE, {**BASE, "V1": "deceased"}, SCHEMA, DOMAINS)
    assert len(errors) == 1
    assert "'Deceased' does" in errors[0]
    assert "including case" in errors[0]


def test_without_domains_nothing_is_checked():
    """Not every caller has them — re-instantiating a stored chart has only the
    schema — and a missing domain must mean unchecked, never invalid."""
    assert validate_bindings(TEMPLATE, {**BASE, "V1": "anything at all"}, SCHEMA) == []


def test_a_column_with_no_domain_is_left_alone():
    """A high-cardinality column is dropped before the domains are sent, and an
    interval domain cannot say whether a string occurs."""
    interval_only = [d for d in DOMAINS if d["type"] == "interval"]
    assert (
        validate_bindings(TEMPLATE, {**BASE, "V1": "unverifiable"}, SCHEMA, interval_only)
        == []
    )


def test_the_pairing_follows_the_template_not_a_convention():
    """`value_field_pairs` reads which column each value is tested on out of the
    spec, so a template comparing V2 against a different column is checked
    against that one rather than against the first nominal field it finds."""
    from udiagent.vis_generate import value_field_pairs

    pairs = value_field_pairs(TEMPLATE)
    assert pairs == {"V1": {"F2"}}


def test_the_survival_template_pairs_its_events_with_the_event_column():
    """The real template, and the shape the reported empty chart came from: two
    values on the event log's type column, one on the censoring table's status."""
    from udiagent.vis_generate import _load_generated_tools, value_field_pairs

    generated = _load_generated_tools()
    assert generated is not None
    _defs, dispatch, templates, _tags = generated
    idx, _param_map = dispatch[
        next(n for n in dispatch if n.endswith("_line_survival"))
    ]
    assert value_field_pairs(templates[idx]) == {
        "V1": {"E1.F2"},
        "V2": {"E1.F2"},
        "V3": {"E2.F2"},
    }
