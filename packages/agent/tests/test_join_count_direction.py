"""A join followed by COUNT(*) only answers "how many E1" from the many side.

Observed failure: "how many donors, grouped by sample health_status" picked the
cross-entity count template with entity1=donors. donors x samples is one row
per SAMPLE (hubmap: 499 donors -> 5044 rows), so the chart reported 428 donors
as "relatively healthy" where 47 donors are. The template itself is fine for
the many side; the binding direction is what has to be checked.
"""

import json

from udiagent.schema import parse_schema_from_dict
from udiagent.vis_generate import (
    _counts_e1_rows_after_join,
    _load_generated_tools,
    validate_bindings,
)


def _star_package():
    """Patient parent; Event + Surgery children on research_id (pcx-shaped)."""

    def child(name):
        return {
            "name": name,
            "path": f"{name.lower()}.csv",
            "udi:row_count": 10,
            "schema": {
                "fields": [
                    {"name": "research_id", "udi:data_type": "nominal", "udi:cardinality": 5},
                    {"name": "kind", "udi:data_type": "nominal", "udi:cardinality": 3},
                ],
                "foreignKeys": [
                    {
                        "fields": ["research_id"],
                        "reference": {"resource": "Patient", "fields": ["research_id"]},
                        "udi:cardinality": {"from": "many", "to": "one"},
                    }
                ],
            },
        }

    return {
        "name": "pcx",
        "udi:path": "",
        "resources": [
            {
                "name": "Patient",
                "path": "patient.csv",
                "udi:row_count": 5,
                "schema": {
                    "fields": [
                        {"name": "research_id", "udi:data_type": "nominal", "udi:cardinality": 5},
                        {"name": "sex", "udi:data_type": "nominal", "udi:cardinality": 2},
                    ]
                },
            },
            child("Event"),
            child("Surgery"),
        ],
    }


def _cross_entity_count_templates():
    """Registry templates that join E1 to E2 and then count E1 rows."""
    generated = _load_generated_tools()
    assert generated is not None, "generated_vis_tools must be importable"
    _defs, _dispatch, templates, _tags = generated
    return [t for t in templates if _counts_e1_rows_after_join(t)]


def test_registry_has_cross_entity_count_templates():
    assert _cross_entity_count_templates(), "detector matched nothing — shape drifted?"


def test_detector_ignores_single_entity_self_joins():
    """The proportion templates join a table to its own group counts. Both of
    their counts are row counts of one table, which is what a proportion needs."""
    generated = _load_generated_tools()
    _defs, _dispatch, templates, _tags = generated
    for template in templates:
        spec = json.loads(template)
        transforms = spec.get("transformation") or []
        joins = any("join" in t for t in transforms if isinstance(t, dict))
        if joins and "<E1>" not in template:
            assert not _counts_e1_rows_after_join(template)


def test_counting_the_one_side_is_rejected():
    schema = parse_schema_from_dict(_star_package())
    for template in _cross_entity_count_templates():
        errors = validate_bindings(
            template, {"E1": "Patient", "E2": "Event", "F": "kind", "F2": "kind"}, schema
        )
        assert errors, template
        assert "many" in " ".join(errors), errors


def test_counting_the_many_side_is_allowed():
    schema = parse_schema_from_dict(_star_package())
    passed = 0
    for template in _cross_entity_count_templates():
        errors = validate_bindings(
            template,
            {"E1": "Event", "E2": "Patient", "F": "sex", "F1": "kind", "F2": "sex"},
            schema,
        )
        direction = [e for e in errors if "many" in e or "siblings" in e]
        assert not direction, (template, errors)
        passed += 1
    assert passed


def test_sibling_pairs_never_reach_the_direction_check():
    """Two children of one parent multiply on join, so neither side's row count
    is an entity count either — but the binding schema lists only direct FKs,
    so the existing no-relationship check already blocks the pair. (The
    prompt's `relationships:` text does advertise sibling links, hence this
    guard against that ever changing without the direction check catching up.)"""
    schema = parse_schema_from_dict(_star_package())
    for template in _cross_entity_count_templates():
        errors = validate_bindings(
            template,
            {"E1": "Event", "E2": "Surgery", "F": "kind", "F1": "kind", "F2": "kind"},
            schema,
        )
        assert errors, template
