"""A `<` comparison operator in a template is not a placeholder.

Placeholders are found by scanning the spec's raw JSON *string*, so the pattern
that recognises them decides what else in that string gets eaten. `<[^>]+>` — the
obvious pattern — matches from the `<` of `"op": "<="` to the next `>` anywhere in
the document, typically the `>` of a later `"op": ">="`, and resolving that match
deletes every key in between. The failure surfaces far away, as an unparseable
spec, so it is pinned here rather than left to a template review to catch.
"""

import json
import re

import pytest

from udiagent.vis_generate import PLACEHOLDER, instantiate_template, validate_bindings

SCHEMA = {
    "entities": {
        "events": {
            "url": "events.csv",
            "fields": {
                "subject_id": {"type": "nominal", "cardinality": 500},
                "day": {"type": "quantitative", "cardinality": 300},
            },
        }
    },
    "relationships": [],
}

# Both operators, in that order: `<=` opens the bad match and `>=` closes it.
TEMPLATE = json.dumps(
    {
        "source": {"name": "<E>", "source": "<E.url>"},
        "transformation": [
            {
                "derive": {
                    "early": {
                        "if": {"op": "<=", "left": {"field": "<F1:q>"}, "right": {"literal": 2}},
                        "then": {"literal": 1},
                        "else": {"literal": 0},
                    }
                }
            },
            {"filter": {"op": ">=", "left": {"field": "<F1>"}, "right": {"literal": 0}}},
        ],
        "representation": [
            {
                "mark": "line",
                "mapping": [
                    {"encoding": "x", "field": "<F1>", "type": "quantitative"},
                    {"encoding": "y", "field": "early", "type": "quantitative"},
                ],
            }
        ],
    }
)

BINDINGS = {"E": "events", "F1": "day"}


@pytest.mark.parametrize(
    "text, expected",
    [
        ('{"op": "<="}', []),
        ('{"op": "<=", "x": "y"}, {"op": ">="}', []),
        ('{"field": "<F1:q>"}', ["F1:q"]),
        ('"<MARGINAL:D1,D2>"', ["MARGINAL:D1,D2"]),
        ('"<E1.r.E2.id.from>"', ["E1.r.E2.id.from"]),
    ],
)
def test_pattern_matches_placeholders_only(text, expected):
    assert re.findall(PLACEHOLDER, text) == expected


def test_operators_survive_instantiation():
    """The whole point: a spec using `<=` still resolves to the spec it declared."""
    spec = instantiate_template(TEMPLATE, BINDINGS, SCHEMA)

    derive = spec["transformation"][0]["derive"]["early"]
    assert derive["if"]["op"] == "<="
    assert derive["if"]["left"] == {"field": "day"}
    # The keys the loose pattern used to swallow.
    assert derive["then"] == {"literal": 1}
    assert derive["else"] == {"literal": 0}
    assert spec["transformation"][1]["filter"]["op"] == ">="


def test_operators_are_not_reported_as_missing_bindings():
    """`validate_bindings` scans the same string; `<=` must not read as a column."""
    assert validate_bindings(TEMPLATE, BINDINGS, SCHEMA) == []
