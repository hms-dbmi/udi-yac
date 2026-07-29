"""Regression tests for schema-backed structured text."""

from udiagent.schema import parse_schema_from_dict
from udiagent.structured_functions import segment_structured_text


def test_field_count_matches_all_declared_schema_fields():
    raw_schema = {
        "resources": [
            {
                "name": "donors",
                "udi:row_count": 2,
                "schema": {
                    "fields": [
                        {"name": "observed", "udi:cardinality": 2},
                        {"name": "empty", "udi:cardinality": 0},
                        {"name": "unannotated"},
                    ]
                },
            }
        ]
    }

    schema = parse_schema_from_dict(raw_schema)
    segments, has_structured = segment_structured_text(
        'The donors entity has {field_count("donors")} attributes: '
        '{field_names("donors")}.',
        schema,
    )

    assert has_structured is True
    assert schema["entities"]["donors"]["fields"] == {
        "observed": {"type": "", "cardinality": 2},
        "empty": {"type": "", "cardinality": 0},
        "unannotated": {"type": "", "cardinality": 0},
    }
    assert segments == [
        "The donors entity has ",
        {
            "expression": '{field_count("donors")}',
            "label": "field count of donors",
            "value": "3",
        },
        " attributes: ",
        {
            "expression": '{field_names("donors")}',
            "label": "field names of donors",
            "value": "empty, observed, unannotated",
        },
        ".",
    ]
