"""Counting entities in a table that holds several rows per entity.

pcx `event` has 191 rows for 69 patients, so "how many patients per diagnosis"
answered with COUNT(*) reported 155 patients for a diagnosis that 62 patients
have. The registry needs a template that counts DISTINCT keys, the counted key
must survive binding validation (its cardinality is the point, not a problem),
and the tool has to describe itself well enough to be picked.
"""

import json

from udiagent.schema import parse_schema_from_dict
from udiagent.vis_generate import (
    _load_generated_tools,
    aggregate_input_placeholders,
    instantiate_template,
    resolve_text_templates,
    validate_bindings,
)


def _event_package():
    """One row per event, many events per patient — the pcx shape."""
    return {
        "name": "pcx",
        "udi:path": "",
        "resources": [
            {
                "name": "Event",
                "path": "event.csv",
                "udi:row_count": 191,
                "schema": {
                    "fields": [
                        {
                            "name": "research_id",
                            "udi:data_type": "nominal",
                            "udi:cardinality": 69,
                        },
                        {
                            "name": "diagnosis",
                            "udi:data_type": "nominal",
                            "udi:cardinality": 8,
                        },
                    ],
                    "foreignKeys": [
                        {
                            "fields": ["research_id"],
                            "reference": {
                                "resource": "Patient",
                                "fields": ["research_id"],
                            },
                            "udi:cardinality": {"from": "many", "to": "one"},
                        }
                    ],
                },
            },
            {
                "name": "Patient",
                "path": "patient.csv",
                "udi:row_count": 69,
                "schema": {
                    "fields": [
                        {
                            "name": "research_id",
                            "udi:data_type": "nominal",
                            "udi:cardinality": 69,
                        }
                    ],
                    "primaryKey": ["research_id"],
                },
            },
        ],
    }


def _distinct_count_tools():
    defs, dispatch, templates, _tags = _load_generated_tools()
    out = []
    for name, (index, param_map) in dispatch.items():
        template = templates[index]
        if '"op": "distinct"' in template and "<E1" not in template:
            tool = next(d for d in defs if d["function"]["name"] == name)
            out.append((name, template, param_map, tool))
    return out


def test_registry_offers_a_single_entity_distinct_count():
    tools = _distinct_count_tools()
    assert tools, "no single-entity distinct-count template in the registry"
    # Both bar orientations, as for the plain count templates.
    assert len(tools) >= 2


def test_counted_key_is_exempt_from_the_category_limit():
    """69 unique research_ids is over the 50-category limit, but the key is
    aggregated, never drawn — the limit protects axes, not aggregate inputs."""
    schema = parse_schema_from_dict(_event_package())
    for _name, template, _pmap, _tool in _distinct_count_tools():
        assert "F2" in aggregate_input_placeholders(template)
        errors = validate_bindings(
            template,
            {"E": "Event", "F": "diagnosis", "F2": "research_id"},
            schema,
        )
        assert errors == [], errors


def test_instantiated_spec_counts_distinct_keys():
    schema = parse_schema_from_dict(_event_package())
    name, template, _pmap, _tool = _distinct_count_tools()[0]
    spec = instantiate_template(
        template, {"E": "Event", "F": "diagnosis", "F2": "research_id"}, schema
    )
    rollups = [t["rollup"] for t in spec["transformation"] if "rollup" in t]
    assert rollups, spec
    aggs = [agg for rollup in rollups for agg in rollup.values()]
    assert {"op": "distinct", "field": "research_id"} in aggs, aggs
    assert not any(agg.get("op") == "count" for agg in aggs), aggs

    # The card text points at the measure encoding, so the frontend resolves it
    # to what the key identifies ("Patients") rather than to "research_id".
    title, _summary = (
        resolve_text_templates(name, {"E": "Event", "F": "diagnosis", "F2": "research_id"})
    ).values()
    assert "{enc:" in title, title


def test_single_entity_tools_describe_themselves_not_their_last_field():
    """Regression: the field-description loop used to overwrite the tool
    description, so every single-entity tool advertised itself as "nominal
    field, encodes x-axis." and the model could not tell them apart."""
    defs, dispatch, templates, _tags = _load_generated_tools()
    single_entity = [
        d
        for d in defs
        if "<E1" not in templates[dispatch[d["function"]["name"]][0]]
    ]
    assert single_entity
    for tool in single_entity:
        description = tool["function"]["description"]
        assert not description.startswith(
            ("nominal field", "quantitative field", "ordinal field", "any type field")
        ), (tool["function"]["name"], description)
        assert description.startswith("["), (tool["function"]["name"], description)
