"""Everything the request contains must be reachable by the orchestrator.

The bug this file exists for. The orchestrate prompt was rendered from
`data_domains` alone — the schema was a parameter of `run()` that the decision
never saw — and the client deleted any categorical column with 80+ distinct
values from those domains. "Patient Agents" has only two columns, 665 and 97
distinct, so both were deleted and the table vanished from the prompt entirely.
Asked to chart chemotherapy agents, the agent replied that the table "does not
exist in the currently loaded dataset schema" and that there was "no field for
individual chemo agents". Both were in the request.

So: the schema is the inventory and must be in the prompt; a trimmed value list
must say it is trimmed; and the full list must be one call away.
"""

import json

import pytest

from udiagent.orchestrator import MAX_VALUE_LOOKUPS, Orchestrator
from udiagent.schema import simplify_data_domains, simplify_data_schema
from udiagent.skills import load_skills, render_template
from udiagent.tools import INTERNAL_ORCHESTRATOR_TOOLS, ORCHESTRATOR_TOOLS

#: A table whose every column is high-cardinality — the case that used to
#: disappear completely rather than merely lose its values.
_SCHEMA = json.dumps(
    {
        "name": "tiny",
        "udi:path": "./data/tiny/",
        "resources": [
            {
                "name": "Patient Agents",
                "type": "table",
                "path": "agents.csv",
                "udi:row_count": 3711,
                "schema": {
                    "fields": [
                        {"name": "research_id", "udi:data_type": "nominal",
                         "udi:cardinality": 665},
                        {"name": "chemotherapy_agent", "udi:data_type": "nominal",
                         "udi:cardinality": 97},
                    ]
                },
            },
            {
                "name": "Medical Therapy",
                "type": "table",
                "path": "therapy.csv",
                "udi:row_count": 1188,
                "schema": {
                    "fields": [
                        {"name": "chemotherapy_type", "udi:data_type": "nominal",
                         "udi:cardinality": 5},
                    ]
                },
            },
        ],
    }
)

#: As the client now sends them: every column present, long ones capped with an
#: honest count.
_DOMAINS = json.dumps(
    [
        {
            "entity": "Patient Agents",
            "field": "chemotherapy_agent",
            "type": "point",
            "fieldDescription": "",
            "domain": {"values": [f"Drug{i}" for i in range(97)], "distinct": 97},
        },
        {
            "entity": "Patient Agents",
            "field": "research_id",
            "type": "point",
            "fieldDescription": "",
            "domain": {"values": [], "distinct": 665, "omitted": True},
        },
        {
            "entity": "Medical Therapy",
            "field": "chemotherapy_type",
            "type": "point",
            "fieldDescription": "",
            "domain": {"values": ["A", "B", "C"], "distinct": 3},
        },
    ]
)


def _orchestrate_prompt():
    skills = load_skills()
    return render_template(
        skills["orchestrate"].instructions,
        {
            "data_schema": simplify_data_schema(_SCHEMA),
            "data_domains": simplify_data_domains(_DOMAINS),
        },
    )


# --- the prompt ---------------------------------------------------------------


def test_the_prompt_names_every_table_and_column_in_the_schema():
    prompt = _orchestrate_prompt()
    for expected in (
        "Patient Agents",
        "chemotherapy_agent",
        "research_id",
        "Medical Therapy",
        "chemotherapy_type",
    ):
        assert expected in prompt, f"{expected} missing from the orchestrate prompt"


def test_the_prompt_says_the_schema_is_the_authority():
    """Both sections are present, so the model has to be told which one settles
    whether something exists — otherwise a column absent from the sample reads
    as a column that is not there."""
    prompt = _orchestrate_prompt()
    assert "authoritative" in prompt.lower()
    assert "Never refuse" in prompt


def test_a_table_with_no_listable_values_still_appears():
    """`Patient Agents` has nothing but high-cardinality columns. Under the old
    filter that removed it from the payload altogether."""
    assert "Patient Agents" in simplify_data_domains(_DOMAINS)


# --- honest trimming -----------------------------------------------------------


def test_a_shortened_list_says_how_much_it_is_hiding():
    rendered = simplify_data_domains(_DOMAINS)
    assert "showing 8 of 97" in rendered
    assert 'ListFieldValues("Patient Agents", "chemotherapy_agent")' in rendered


def test_a_complete_short_list_is_not_labelled_as_a_sample():
    """Claiming a sample where there is none would push the model into a
    pointless lookup on every small column."""
    rendered = simplify_data_domains(_DOMAINS)
    assert "values: [A, B, C]" in rendered
    assert "showing 3 of 3" not in rendered


def test_an_identifier_column_reports_its_count_rather_than_its_values():
    rendered = simplify_data_domains(_DOMAINS)
    assert "665 distinct" in rendered
    assert "not listed" in rendered


# --- the way out ----------------------------------------------------------------


@pytest.fixture()
def orchestrator():
    return Orchestrator.__new__(Orchestrator)


def test_list_field_values_returns_what_the_prompt_withheld(orchestrator):
    answer = orchestrator._lookup_field_values(
        {"entity": "Patient Agents", "field": "chemotherapy_agent"}, _DOMAINS
    )
    assert "97 distinct" in answer
    # The values the prompt's 8-value sample did not show.
    assert "Drug96" in answer and "Drug50" in answer


def test_list_field_values_is_honest_when_it_has_nothing_to_add(orchestrator):
    answer = orchestrator._lookup_field_values(
        {"entity": "Patient Agents", "field": "research_id"}, _DOMAINS
    )
    assert "665" in answer
    assert "too many to list" in answer


def test_an_unknown_column_names_the_ones_that_exist(orchestrator):
    answer = orchestrator._lookup_field_values(
        {"entity": "Patient Agents", "field": "nope"}, _DOMAINS
    )
    assert "No column 'nope'" in answer
    assert "Patient Agents.chemotherapy_agent" in answer


def test_the_lookup_tool_is_offered_and_marked_internal():
    """Internal: it gathers context and loops, so it must never reach the client
    as an outcome of the turn."""
    names = [t["function"]["name"] for t in ORCHESTRATOR_TOOLS]
    assert "ListFieldValues" in names
    assert INTERNAL_ORCHESTRATOR_TOOLS == {"ListFieldValues"}
    assert MAX_VALUE_LOOKUPS >= 1
