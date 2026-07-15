"""Tests for the mapping-field column-flow validation.

Guards against the observed failure mode: the LLM emits a representation
mapping (e.g. y -> 'percentile') referencing a column the transformation
pipeline never produces — schema-valid, so jsonschema misses it, and the
chart renders empty.
"""

import json

import pytest

from udiagent import vis_generate
from udiagent.vis_generate import (
    _parse_and_validate,
    entity_fields_from_schema,
    spec_mapping_errors,
)

FIELDS = {
    "Event": {"research_id", "event_type", "event_date"},
    "Patient": {"research_id", "vital_status"},
}


def _spec(transformation, mapping_fields, source="Event"):
    return {
        "source": [{"name": source, "source": "x"}],
        "transformation": transformation,
        "representation": {
            "mark": "line",
            "mapping": [
                {"encoding": e, "field": f, "type": "quantitative"}
                for e, f in mapping_fields
            ],
        },
    }


def test_catches_missing_derived_field():
    # The observed bug: derive produces 'total' but the mapping asks for
    # 'percentile'.
    spec = _spec(
        [
            {"groupby": ["event_type"]},
            {"derive": {"total": {"agg": "count"}}},
        ],
        [("x", "event_date"), ("y", "percentile")],
    )
    errors = spec_mapping_errors(spec, FIELDS)
    assert len(errors) == 1
    assert "'percentile'" in errors[0]
    assert "available columns" in errors[0]


def test_passes_valid_derives_and_source_fields():
    spec = _spec(
        [
            {"filter": {"op": "!=", "left": {"field": "event_date"}, "right": {"literal": None}}},
            {"derive": {"total": {"agg": "count"}}},
            {"orderby": [{"field": "event_date", "order": "asc"}]},
        ],
        [("x", "event_date"), ("y", "total"), ("color", "event_type")],
    )
    assert spec_mapping_errors(spec, FIELDS) == []


def test_rollup_narrows_columns():
    transformation = [
        {"groupby": "event_type"},
        {"rollup": {"n": {"op": "count"}}},
    ]
    ok = _spec(transformation, [("x", "event_type"), ("y", "n")])
    assert spec_mapping_errors(ok, FIELDS) == []
    # Pre-rollup columns are gone after aggregation.
    bad = _spec(transformation, [("x", "event_date"), ("y", "n")])
    errors = spec_mapping_errors(bad, FIELDS)
    assert len(errors) == 1 and "'event_date'" in errors[0]


def test_binby_and_kde_outputs():
    binned = _spec(
        [
            {"binby": {"field": "event_date", "bins": 10}},
            {"rollup": {"count": {"op": "count"}}},
        ],
        [("x", "start"), ("x2", "end"), ("y", "count")],
    )
    assert spec_mapping_errors(binned, FIELDS) == []

    kde = _spec(
        [
            {"groupby": "event_type"},
            {"kde": {"field": "event_date"}},
        ],
        [("x", "sample"), ("y", "density"), ("color", "event_type")],
    )
    assert spec_mapping_errors(kde, FIELDS) == []
    # Raw fields don't survive kde.
    kde_bad = _spec(
        [{"kde": {"field": "event_date"}}],
        [("x", "sample"), ("y", "event_date")],
    )
    assert len(spec_mapping_errors(kde_bad, FIELDS)) == 1


def test_join_with_named_tables():
    spec = {
        "source": [
            {"name": "Event", "source": "x"},
            {"name": "Patient", "source": "y"},
        ],
        "transformation": [
            {
                "join": {"on": "research_id"},
                "in": ["Event", "Patient"],
                "out": "joined",
            },
            {"groupby": "vital_status"},
            {"rollup": {"n": {"op": "count"}}},
        ],
        "representation": {
            "mark": "bar",
            "mapping": [
                {"encoding": "x", "field": "vital_status", "type": "nominal"},
                {"encoding": "y", "field": "n", "type": "quantitative"},
            ],
        },
    }
    assert spec_mapping_errors(spec, FIELDS) == []


def test_unknown_entity():
    spec = _spec([], [("x", "event_date")], source="Nonexistent")
    errors = spec_mapping_errors(spec, FIELDS)
    assert len(errors) == 1 and "unknown source entity" in errors[0]


def test_star_field_and_missing_representation_are_fine():
    assert spec_mapping_errors({"source": [{"name": "Event", "source": "x"}]}, FIELDS) == []
    row = {
        "source": [{"name": "Event", "source": "x"}],
        "representation": {
            "mark": "row",
            "mapping": [{"encoding": "text", "field": "*", "type": "nominal", "mark": "text"}],
        },
    }
    assert spec_mapping_errors(row, FIELDS) == []


def test_entity_fields_from_schema():
    schema = json.dumps(
        {
            "resources": [
                {
                    "name": "Event",
                    "schema": {"fields": [{"name": "a"}, {"name": "b"}]},
                }
            ]
        }
    )
    assert entity_fields_from_schema(schema) == {"Event": {"a", "b"}}
    assert entity_fields_from_schema("not json") == {}
    assert entity_fields_from_schema(None) == {}


def test_correction_loop_fixes_mapping(monkeypatch):
    """End-to-end through _execute_validate: bad mapping -> one LLM
    correction -> valid."""
    bad = _spec(
        [{"derive": {"total": {"agg": "count"}}}],
        [("x", "event_date"), ("y", "percentile")],
    )
    fixed = _spec(
        [{"derive": {"total": {"agg": "count"}}}],
        [("x", "event_date"), ("y", "total")],
    )

    seen_prompts = []

    def fake_call_llm(agent, messages, grammar, config, **kwargs):
        seen_prompts.append(messages[-1]["content"])
        return json.dumps(fixed)

    monkeypatch.setattr(vis_generate, "_call_llm", fake_call_llm)

    from udiagent.grammar import load_grammar
    from udiagent.skills import load_skills

    schema_str = json.dumps(
        {
            "resources": [
                {
                    "name": "Event",
                    "schema": {
                        "fields": [
                            {"name": f} for f in sorted(FIELDS["Event"])
                        ]
                    },
                }
            ]
        }
    )
    context = {
        "agent": object(),
        "messages": [{"role": "user", "content": "plot events"}],
        "data_schema": schema_str,
        "grammar": load_grammar("udi"),
        "config": {},
        "spec_str": json.dumps(bad),
    }
    skill = load_skills()["validate"]
    result = vis_generate._execute_validate(skill, context)

    assert result["valid"] is True
    assert result["corrections"] == 1
    # The correction prompt carried the actionable error.
    assert "percentile" in seen_prompts[-1]
    assert "available columns" in seen_prompts[-1]


def test_all_templates_pass_mapping_validation():
    """The 52 generated templates are self-consistent — the validator must
    produce zero false positives on them (guards template + validator drift)."""
    from udiagent.generated_vis_tools import TEMPLATES
    from udiagent.vis_generate import instantiate_template

    fake_schema = {
        "entities": {
            "donors": {"url": "donors.tsv"},
            "samples": {"url": "samples.tsv"},
        },
        "relationships": [
            {
                "from_entity": "samples",
                "to_entity": "donors",
                "from_field": "donor.hubmap_id",
                "to_field": "hubmap_id",
            }
        ],
    }
    fields = {
        "donors": {"hubmap_id", "age_value", "sex"},
        "samples": {"donor.hubmap_id", "age_value", "sex"},
    }
    bindings = {
        "E": "donors", "E1": "samples", "E2": "donors",
        "F": "age_value", "F1": "age_value", "F2": "sex",
    }
    failures = []
    for index, template in enumerate(TEMPLATES):
        try:
            spec = instantiate_template(template, bindings, fake_schema)
        except Exception:
            continue  # instantiation quirks are covered elsewhere
        errors = spec_mapping_errors(spec, fields)
        if errors:
            failures.append((index, errors))
    assert not failures, f"templates with mapping errors: {failures}"


def test_parse_and_validate_without_entity_fields_unchanged():
    """No entity_fields -> behaves exactly as before (schema check only)."""
    from udiagent.grammar import load_grammar

    grammar = load_grammar("udi")
    spec = _spec(
        [{"derive": {"total": {"agg": "count"}}}],
        [("x", "event_date"), ("y", "percentile")],
    )
    _, errors = _parse_and_validate(json.dumps(spec), grammar["schema_dict"])
    assert errors == []  # schema-valid; the mapping bug needs entity_fields
