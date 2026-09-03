"""Tests for relationship derivation and its exposure in the simplified
schema the LLM consumes (direct FKs + shared-parent sibling bridge)."""

import json

from udiagent.schema import derive_relationships, simplify_data_schema


def _star_schema():
    """pcx-shaped: Patient parent, Event + Surgery children on research_id."""
    child = lambda name: {  # noqa: E731
        "name": name,
        "path": f"{name.lower()}.csv",
        "udi:row_count": 10,
        "schema": {
            "fields": [{"name": "research_id", "udi:data_type": "nominal", "udi:cardinality": 5}],
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
                        {"name": "research_id", "udi:data_type": "nominal", "udi:cardinality": 5}
                    ]
                },
            },
            child("Event"),
            child("Surgery"),
        ],
    }


def test_direct_relationships_from_foreign_keys():
    rels = derive_relationships(_star_schema())
    direct = [r for r in rels if r["kind"] == "direct"]
    assert {
        "from_entity": "Event",
        "from_field": "research_id",
        "to_entity": "Patient",
        "to_field": "research_id",
        "kind": "direct",
        "cardinality": "many-to-one",
    } in direct
    assert len(direct) == 2


def test_sibling_bridge_between_children_of_shared_parent():
    rels = derive_relationships(_star_schema())
    siblings = [r for r in rels if r["kind"] == "sibling"]
    assert len(siblings) == 1
    sibling = siblings[0]
    assert {sibling["from_entity"], sibling["to_entity"]} == {"Event", "Surgery"}
    assert sibling["from_field"] == sibling["to_field"] == "research_id"
    assert sibling["via"] == "Patient"


def test_no_relationships_without_foreign_keys():
    schema = _star_schema()
    for resource in schema["resources"]:
        resource["schema"].pop("foreignKeys", None)
    assert derive_relationships(schema) == []


def test_simplified_schema_exposes_relationships_to_llm():
    text = simplify_data_schema(json.dumps(_star_schema()))
    assert "relationships:" in text
    assert "Event.research_id -> Patient.research_id (many-to-one)" in text
    assert "siblings — both reference Patient" in text


def test_simplified_schema_without_fks_has_no_relationships_section():
    schema = _star_schema()
    for resource in schema["resources"]:
        resource["schema"].pop("foreignKeys", None)
    assert "relationships:" not in simplify_data_schema(json.dumps(schema))


def test_simplified_schema_exposes_row_count_and_identifier():
    """Grain has to be visible to the model: without row_count beside each
    column's unique_values, "191 rows over 69 unique research_id" — i.e. many
    rows per patient — is unknowable, and counting rows looks like counting
    patients."""
    schema = _star_schema()
    patient = next(r for r in schema["resources"] if r["name"] == "Patient")
    patient["schema"]["primaryKey"] = ["research_id"]

    text = simplify_data_schema(json.dumps(schema))
    lines = [line.strip() for line in text.splitlines()]

    assert "row_count: 5" in lines  # Patient
    assert "row_count: 10" in lines  # its children
    assert "identifier: research_id" in lines


def test_identifier_falls_back_to_a_unique_field():
    """Packages generated before primaryKey inference still mark unique
    columns, and that is enough to name the entity's key."""
    schema = _star_schema()
    patient = next(r for r in schema["resources"] if r["name"] == "Patient")
    patient["schema"]["fields"][0]["udi:unique"] = True

    text = simplify_data_schema(json.dumps(schema))
    assert "identifier: research_id" in [line.strip() for line in text.splitlines()]


def test_child_tables_get_no_identifier_when_nothing_is_unique():
    text = simplify_data_schema(json.dumps(_star_schema()))
    assert "identifier:" not in text
