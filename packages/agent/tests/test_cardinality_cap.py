"""The 50-category cap: charts are capped, tables are not, and a request whose
chart counts a field with too many values gets the full list instead of an error.

Reported against pcx: "Which chemotherapy agents are given most often?" failed on
`chemotherapy_agents` (198 values), because even the value-count table — the one
template that answers it — was capped.
"""

import json
from unittest.mock import MagicMock, patch

import pytest

import udiagent.vis_generate as vg
from udiagent.agent import UDIAgent
from udiagent.vis_generate import (
    FALLBACK_VALIDATION_FAILED,
    VALUE_COUNTS_TOOL_SUFFIX,
    _parse_request_schema,
    validate_bindings,
)

_SCHEMA = json.dumps(
    {
        "name": "tiny",
        "udi:path": "./data/tiny/",
        "resources": [
            {
                "name": "Medical Therapy",
                "type": "table",
                "path": "medical_therapy.csv",
                "udi:row_count": 1267,
                "schema": {
                    "fields": [
                        {"name": "research_id", "udi:data_type": "nominal", "udi:cardinality": 808},
                        {
                            "name": "chemotherapy_agents",
                            "udi:data_type": "nominal",
                            "udi:cardinality": 198,
                        },
                        {"name": "chemotherapy_type", "udi:data_type": "nominal", "udi:cardinality": 5},
                        {"name": "dose", "udi:data_type": "quantitative", "udi:cardinality": 400},
                        {"name": "day", "udi:data_type": "quantitative", "udi:cardinality": 900},
                    ]
                },
            }
        ],
    }
)


def _tool(suffix):
    """(name, placeholder -> parameter) for the generated tool ending in `suffix`."""
    _defs, dispatch, _templates, _tags = vg._load_generated_tools()
    name = next(n for n in dispatch if n.endswith(suffix))
    return name, {ph: param for param, ph in dispatch[name][1].items()}


def _template(name):
    _defs, dispatch, templates, _tags = vg._load_generated_tools()
    return templates[dispatch[name][0]]


def test_a_table_lists_every_value_but_a_chart_axis_is_capped():
    schema = _parse_request_schema(_SCHEMA)
    bindings = {"E": "Medical Therapy", "F": "chemotherapy_agents"}

    table, _ = _tool(VALUE_COUNTS_TOOL_SUFFIX)
    assert validate_bindings(_template(table), bindings, schema) == []

    bar, _ = _tool("_barchart_count_horiz_grouped")
    errors = validate_bindings(_template(bar), bindings, schema)
    assert len(errors) == 1
    # Names the way out, since the retry reads it.
    assert "198 unique values" in errors[0] and "table" in errors[0]


def _context():
    return {
        "agent": object(),
        "grammar": {},
        "config": {},
        "data_schema": _SCHEMA,
        "messages": [{"role": "user", "content": "Which chemotherapy agents are most common?"}],
        "openai_api_key": None,
        "usage": None,
        "req_id": "testreq1",
    }


def _stub_model(monkeypatch, call):
    """The model makes the same refused call on every attempt."""
    seen = []

    def fake(agent, messages, tools, config, **kwargs):
        seen.append(messages)
        return call

    monkeypatch.setattr(vg, "_call_llm_with_tools", fake)
    return seen


def test_a_chart_counting_too_many_categories_becomes_the_full_value_list(monkeypatch):
    bar, params = _tool("_barchart_count_horiz_grouped")
    seen = _stub_model(
        monkeypatch,
        (bar, {params["E"]: "Medical Therapy", params["F"]: "chemotherapy_agents"}),
    )

    out = vg._execute_generate(skill=None, context=_context())

    assert len(seen) == 3, "the model's retries still come first"
    assert not out.get("generation_failed")
    assert out["tool_used"].endswith(VALUE_COUNTS_TOOL_SUFFIX)
    assert out["tool_args"] == {"entity": "Medical Therapy", "field": "chemotherapy_agents"}
    spec = json.loads(out["spec_str"])
    assert {"groupby": "chemotherapy_agents"} in spec["transformation"]
    # Re-bindable like any template chart, and says why it is a list.
    assert out["tweakable_params"]
    assert "198 distinct values" in out["text_templates"]["summary"]


def test_a_capped_field_the_chart_does_not_count_by_still_fails(monkeypatch):
    """Colouring a scatterplot by a 198-value field is the wrong field, not a
    question a list of it would answer."""
    scatter, params = _tool("_grouped_scatter_by_color")
    _stub_model(
        monkeypatch,
        (
            scatter,
            {
                params["E"]: "Medical Therapy",
                params["F1"]: "dose",
                params["F2"]: "day",
                params["F3"]: "chemotherapy_agents",
            },
        ),
    )

    out = vg._execute_generate(skill=None, context=_context())

    assert out["generation_failed"]["reason"] == FALLBACK_VALIDATION_FAILED
    assert "unique values" in out["generation_failed"]["errors"][0]


@pytest.fixture()
def client():
    with patch.object(UDIAgent, "__init__", lambda self, **kwargs: None):
        import udiagent.server.app as server_app

        mock_agent = UDIAgent.__new__(UDIAgent)
        mock_agent.gpt_model = MagicMock(name="default_gpt_model")
        server_app.agent = mock_agent
        server_app.orchestrator.agent = mock_agent

        from starlette.testclient import TestClient

        yield TestClient(server_app.app)


def test_the_value_list_can_be_rebound_to_another_high_cardinality_field(client):
    table, params = _tool(VALUE_COUNTS_TOOL_SUFFIX)
    response = client.post(
        "/v1/yac/vis_instantiate",
        json={
            "tool": table,
            "toolArgs": {params["E"]: "Medical Therapy", params["F"]: "research_id"},
            "dataSchema": _SCHEMA,
        },
        headers={"Authorization": "Bearer dev"},
    )
    assert response.status_code == 200, response.text
