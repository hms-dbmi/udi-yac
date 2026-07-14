"""Part A: a single agent/tool set serves arbitrary per-request schemas.

These tests exercise the deterministic core of the generated-tools path —
schema parsing, binding validation, and template instantiation — without any
OpenAI calls. They prove that the schema used for validation/instantiation
comes from the per-request ``data_schema`` (not a schema baked into
``generated_vis_tools``), so one process can serve multiple different datasets.
"""

import json

from udiagent.schema import parse_schema_from_dict
from udiagent.vis_generate import (
    _parse_request_schema,
    _load_generated_tools,
    instantiate_template,
    validate_bindings,
)


def _resource(name, path, fields, row_count=100, foreign_keys=None):
    return {
        "name": name,
        "path": path,
        "udi:row_count": row_count,
        "schema": {
            "fields": [
                {"name": fn, "udi:data_type": ft, "udi:cardinality": card}
                for fn, ft, card in fields
            ],
            "foreignKeys": foreign_keys or [],
        },
    }


# A standalone single-table dataset.
PENGUINS = {
    "udi:path": "https://example.org/penguins/",
    "resources": [
        _resource(
            "penguins",
            "penguins.csv",
            [
                ("species", "nominal", 3),
                ("island", "nominal", 3),
                ("sex", "nominal", 2),
                ("body_mass_g", "quantitative", 94),
            ],
            row_count=344,
        )
    ],
}

# A different dataset with a relationship between two tables.
LABS = {
    "udi:path": "https://example.org/labs/",
    "resources": [
        _resource(
            "patients",
            "patients.csv",
            [("id", "nominal", 50), ("cohort", "nominal", 4)],
            row_count=50,
        ),
        _resource(
            "results",
            "results.csv",
            [("patient_id", "nominal", 50), ("value", "quantitative", 200)],
            row_count=200,
            foreign_keys=[
                {
                    "fields": ["patient_id"],
                    "reference": {"resource": "patients", "fields": ["id"]},
                    "udi:cardinality": {"from": "many", "to": "one"},
                }
            ],
        ),
    ],
}


def test_parse_request_schema_includes_url_and_relationships():
    parsed = _parse_request_schema(json.dumps(PENGUINS))
    assert parsed["entities"]["penguins"]["url"] == "https://example.org/penguins/penguins.csv"
    assert parsed["relationships"] == []
    # accepts an already-parsed dict too
    assert _parse_request_schema(PENGUINS) == parsed

    labs = _parse_request_schema(LABS)
    assert len(labs["relationships"]) == 1
    rel = labs["relationships"][0]
    assert rel["from_entity"] == "results" and rel["to_entity"] == "patients"
    assert rel["from_field"] == "patient_id" and rel["to_field"] == "id"


def test_parse_request_schema_degrades_gracefully_on_garbage():
    empty = _parse_request_schema("not json {")
    assert empty["entities"] == {} and empty["relationships"] == []
    assert _parse_request_schema(None)["entities"] == {}


def _single_entity_field_templates():
    """All generated single-entity templates whose param_map is {entity:E, field:F}."""
    generated = _load_generated_tools()
    assert generated is not None, "generated_vis_tools must be importable"
    _tool_defs, tool_dispatch, templates = generated
    out = []
    for _name, (idx, param_map) in tool_dispatch.items():
        template = templates[idx]
        if "<E1" in template or "<E2" in template:
            continue
        if param_map == {"entity": "E", "field": "F"}:
            out.append(template)
    return out


def _working_binding(templates, schema, entity, candidate_fields):
    """Find the first (template, field) that validates cleanly for the schema."""
    for template in templates:
        for field in candidate_fields:
            if validate_bindings(template, {"E": entity, "F": field}, schema) == []:
                return template, field
    return None, None


def test_single_instance_resolves_each_schema_own_url():
    """The SAME generated templates instantiate against two different schemas,
    each producing its own dataset URL — proving per-request routing."""
    templates = _single_entity_field_templates()
    assert templates, "expected single-entity field tools in the generated module"

    penguins_schema = _parse_request_schema(PENGUINS)
    template_p, field_p = _working_binding(
        templates, penguins_schema, "penguins", ["species", "island", "sex", "body_mass_g"]
    )
    assert template_p is not None
    spec_p = instantiate_template(template_p, {"E": "penguins", "F": field_p}, penguins_schema)
    assert spec_p["source"]["source"] == "https://example.org/penguins/penguins.csv"
    assert spec_p["source"]["name"] == "penguins"

    labs_schema = _parse_request_schema(LABS)
    template_l, field_l = _working_binding(
        templates, labs_schema, "patients", ["cohort", "id"]
    )
    assert template_l is not None
    spec_l = instantiate_template(template_l, {"E": "patients", "F": field_l}, labs_schema)
    assert spec_l["source"]["source"] == "https://example.org/labs/patients.csv"
    assert spec_l["source"]["name"] == "patients"


def test_validate_bindings_uses_request_schema_not_baked_in():
    """A field valid for one schema is rejected for another — the validator
    reads the per-request schema, never a HuBMAP-baked one."""
    templates = _single_entity_field_templates()
    penguins_schema = _parse_request_schema(PENGUINS)
    labs_schema = _parse_request_schema(LABS)

    template, field = _working_binding(
        templates, penguins_schema, "penguins", ["species", "island", "sex"]
    )
    assert template is not None, "expected a nominal-field single-entity tool"

    # the field validates on penguins ...
    assert validate_bindings(template, {"E": "penguins", "F": field}, penguins_schema) == []

    # ... but that same field does NOT exist on labs' patients -> not-found error
    errs = validate_bindings(template, {"E": "patients", "F": field}, labs_schema)
    assert any("not found" in e.lower() for e in errs)

    # unknown entity -> error listing available entities from the request schema
    errs2 = validate_bindings(template, {"E": "donors", "F": field}, penguins_schema)
    assert any("penguins" in e for e in errs2)


def test_hubmap_still_resolves_from_request_schema():
    """Regression: the real HuBMAP schema, passed as a request schema, still
    resolves a single-entity template to a HuBMAP dataset URL."""
    import os

    schema_path = os.path.join(
        os.path.dirname(os.path.dirname(__file__)),
        "data",
        "data_domains",
        "hubmap_data_schema.json",
    )
    raw = json.load(open(schema_path))
    parsed = parse_schema_from_dict(raw)
    templates = _single_entity_field_templates()

    # pick any entity that has a nominal field and bind it
    for entity, info in parsed["entities"].items():
        nominal_fields = [fn for fn, fi in info["fields"].items() if fi["type"] == "nominal"]
        template, field = _working_binding(templates, parsed, entity, nominal_fields)
        if template is not None:
            spec = instantiate_template(template, {"E": entity, "F": field}, parsed)
            assert spec["source"]["name"] == entity
            assert spec["source"]["source"].startswith(raw["udi:path"])
            return
    raise AssertionError("no HuBMAP entity produced a valid single-entity binding")
