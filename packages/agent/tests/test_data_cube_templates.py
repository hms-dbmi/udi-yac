"""Part B + C: data-cube template set, generalized to arbitrary cube schemas,
selected by tag. No OpenAI calls.
"""

import json
import os

import jsonschema

from udiagent.schema import parse_schema_from_dict, schema_is_cube
from udiagent.skills import _package_data_path
from udiagent.vis_generate import (
    _parse_request_schema,
    _load_generated_tools,
    _active_template_tags,
    _select_tools,
    instantiate_template,
    validate_bindings,
)

_PKG = _package_data_path()
_AGENT_ROOT = os.path.dirname(os.path.dirname(__file__))

# Chart types that are impossible on a pre-aggregated cube.
EXCLUDED_CHART_TYPES = {
    "scatterplot",
    "grouped_scatter",
    "dot",
    "grouped_dot",
    "histogram",
}


def _cube_templates():
    path = _PKG / "skills" / "template_visualizations_cube.json"
    return json.loads(path.read_text())


def _encounter_cube_schema():
    path = os.path.join(_AGENT_ROOT, "data", "data_domains", "encounter_cube_schema.json")
    return parse_schema_from_dict(json.load(open(path)))


# A completely different cube — different entity, dims, and measure — used to
# prove the templates are not bound to the encounter cube's dimensions.
SALES_CUBE = {
    "udi:path": "https://example.org/sales/",
    "resources": [
        {
            "name": "sales_cube",
            "path": "sales.csv",
            "udi:row_count": 999,
            "udi:cube": True,
            "udi:measures": ["revenue"],
            "udi:dimensions": ["region", "product", "quarter"],
            "schema": {
                "fields": [
                    {"name": "revenue", "udi:data_type": "quantitative", "udi:cardinality": 900},
                    {"name": "region", "udi:data_type": "nominal", "udi:cardinality": 4},
                    {"name": "product", "udi:data_type": "nominal", "udi:cardinality": 12},
                    {"name": "quarter", "udi:data_type": "temporal", "udi:cardinality": 8},
                ]
            },
        }
    ],
}


# ---------------------------------------------------------------------------
# Template set: loading, tagging, grammar conformance
# ---------------------------------------------------------------------------


def test_cube_templates_load_and_are_tagged():
    templates = _cube_templates()
    assert len(templates) == 11
    for t in templates:
        assert t["tags"] == ["data_cube"]


def test_cube_templates_exclude_per_record_chart_types():
    types = {t["chart_type"] for t in _cube_templates()}
    assert types.isdisjoint(EXCLUDED_CHART_TYPES)


def test_cube_specs_validate_against_grammar():
    grammar = json.loads((_PKG / "UDIGrammarSchema.json").read_text())
    for t in _cube_templates():
        spec = json.loads(t["spec_template"])
        jsonschema.validate(instance=spec, schema=grammar)


def test_cube_templates_never_count_raw_rows():
    # A cube is pre-aggregated: no re-aggregation via count.
    for t in _cube_templates():
        assert '"op": "count"' not in t["spec_template"]


# ---------------------------------------------------------------------------
# Schema parsing carries cube metadata
# ---------------------------------------------------------------------------


def test_parse_schema_marks_cube_dimensions_and_measures():
    parsed = _encounter_cube_schema()
    ent = parsed["entities"]["encounter_counts"]
    assert ent["is_cube"] is True
    assert ent["measures"] == ["cnt"]
    assert "class_display" in ent["dimensions"] and "period_start_month" in ent["dimensions"]
    assert schema_is_cube(parsed)

    # a line-item (non-cube) schema is not a cube
    non_cube = _parse_request_schema(
        {
            "udi:path": "./",
            "resources": [
                {
                    "name": "t",
                    "path": "t.csv",
                    "udi:row_count": 5,
                    "schema": {"fields": [{"name": "a", "udi:data_type": "nominal", "udi:cardinality": 3}]},
                }
            ],
        }
    )
    assert not schema_is_cube(non_cube)


# ---------------------------------------------------------------------------
# Generalization: the SAME cube template serves different cube schemas
# ---------------------------------------------------------------------------


def _cube_tools_by_param(param_map):
    generated = _load_generated_tools()
    assert generated is not None
    _defs, tool_dispatch, templates, tool_tags = generated
    out = []
    for name, (idx, pm) in tool_dispatch.items():
        if tool_tags.get(name) == ["data_cube"] and pm == param_map:
            out.append(templates[idx])
    return out


def test_marginal_filter_generalizes_across_cube_schemas():
    """A single-dimension cube bar template instantiates correctly against two
    different cubes, each producing a marginal filter over its OWN dimensions."""
    templates = _cube_tools_by_param({"entity": "E", "dimension": "D"})
    assert templates, "expected a cube tool bound by (entity, dimension)"

    # Encounter cube
    enc = _encounter_cube_schema()
    template, dim = None, None
    for t in templates:
        if validate_bindings(t, {"E": "encounter_counts", "D": "class_display"}, enc) == []:
            template, dim = t, "class_display"
            break
    assert template is not None
    spec = instantiate_template(template, {"E": "encounter_counts", "D": dim}, enc)
    filt = spec["transformation"][0]["filter"]
    assert "d['class_display'] != null" in filt
    # every other encounter dimension is nulled out
    for other in ["period_start_month", "age_at_visit", "gender", "race_display", "ethnicity_display"]:
        assert f"d['{other}'] == null" in filt
    # measure resolved from the schema
    assert any(m["field"] == "cnt" for m in spec["representation"]["mapping"])

    # Sales cube — different dims + measure, SAME template
    sales = _parse_request_schema(SALES_CUBE)
    assert validate_bindings(template, {"E": "sales_cube", "D": "region"}, sales) == []
    spec2 = instantiate_template(template, {"E": "sales_cube", "D": "region"}, sales)
    filt2 = spec2["transformation"][0]["filter"]
    assert "d['region'] != null" in filt2
    assert "d['product'] == null" in filt2 and "d['quarter'] == null" in filt2
    assert spec2["source"]["source"] == "https://example.org/sales/sales.csv"
    assert any(m["field"] == "revenue" for m in spec2["representation"]["mapping"])


def test_two_dimension_marginal_filter():
    templates = _cube_tools_by_param({"entity": "E", "dimension1": "D1", "dimension2": "D2"})
    assert templates
    enc = _encounter_cube_schema()
    template = None
    for t in templates:
        if validate_bindings(t, {"E": "encounter_counts", "D1": "class_display", "D2": "gender"}, enc) == []:
            template = t
            break
    assert template is not None
    spec = instantiate_template(
        template, {"E": "encounter_counts", "D1": "class_display", "D2": "gender"}, enc
    )
    dumped = json.dumps(spec)
    assert "d['class_display'] != null" in dumped
    assert "d['gender'] != null" in dumped
    assert "d['age_at_visit'] == null" in dumped


def test_validate_rejects_measure_bound_as_dimension():
    templates = _cube_tools_by_param({"entity": "E", "dimension": "D"})
    enc = _encounter_cube_schema()
    # 'cnt' is the measure, not a dimension -> rejected
    errs = validate_bindings(templates[0], {"E": "encounter_counts", "D": "cnt"}, enc)
    assert any("not a dimension" in e.lower() for e in errs)


def test_line_template_accepts_temporal_dimension():
    """The cube line template requires an ordinal dimension; a temporal
    dimension (period_start_month) must satisfy it."""
    generated = _load_generated_tools()
    _defs, tool_dispatch, templates, tool_tags = generated
    enc = _encounter_cube_schema()
    line_ok = False
    for name, (idx, pm) in tool_dispatch.items():
        if tool_tags.get(name) != ["data_cube"]:
            continue
        t = templates[idx]
        if '"mark": "line"' in t:
            errs = validate_bindings(t, {"E": "encounter_counts", "D": "period_start_month"}, enc)
            assert errs == [], errs
            line_ok = True
    assert line_ok, "expected a cube line template"


# ---------------------------------------------------------------------------
# Tag-based selection (replaces the ACTIVE_TEMPLATE_SET switch)
# ---------------------------------------------------------------------------


def test_active_tags_follow_schema_kind():
    assert _active_template_tags(_encounter_cube_schema()) == {"data_cube"}
    assert _active_template_tags(_parse_request_schema(SALES_CUBE)) == {"data_cube"}
    line_item = _parse_request_schema(
        {"udi:path": "./", "resources": [
            {"name": "t", "path": "t.csv", "udi:row_count": 3,
             "schema": {"fields": [{"name": "a", "udi:data_type": "nominal", "udi:cardinality": 2}]}}
        ]}
    )
    assert _active_template_tags(line_item) == {"line_item"}


def test_selection_scopes_tools_by_tag():
    generated = _load_generated_tools()
    tool_defs, _dispatch, _templates, tool_tags = generated

    cube_only = _select_tools(tool_defs, tool_tags, {"data_cube"})
    names = {d["function"]["name"] for d in cube_only}
    assert names, "cube selection must be non-empty"
    assert all(tool_tags[n] == ["data_cube"] for n in names)
    # line-item tools are excluded from a cube request
    assert not any(tool_tags[n] == ["line_item"] for n in names)

    line_only = _select_tools(tool_defs, tool_tags, {"line_item"})
    lnames = {d["function"]["name"] for d in line_only}
    assert all(tool_tags[n] == ["line_item"] for n in lnames)
    assert len(cube_only) == 11 and len(line_only) == 52


def test_no_active_template_set_switch():
    """Regression guard: the hard-coded PR #61 switch must not exist."""
    import udiagent.vis_generate as vg

    assert not hasattr(vg, "ACTIVE_TEMPLATE_SET")
