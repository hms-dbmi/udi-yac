"""The filter state a completion request carries, and how the prompt states it."""

from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest

from udiagent.agent import UDIAgent
from udiagent.filters import describe_filters, normalize_filters
from udiagent.orchestrator import Orchestrator, OrchestratorResult, Usage

GROUP3 = {
    "id": "message-filter-1-0",
    "origin": "chat",
    "title": "Diagnosis",
    "entity": "Event",
    "field": "cns_integrated_diagnosis",
    "filterType": "point",
    "pointValues": ["Medulloblastoma, Group 3"],
}
BRUSH = {
    "id": "udi_1_1",
    "origin": "chart",
    "entity": "Patient",
    "field": "age",
    "filterType": "interval",
    "intervalRange": {"min": 2, "max": 10},
}


def test_normalize_drops_unusable_entries_and_defaults_origin():
    raw = [
        GROUP3,
        {**BRUSH, "origin": "somewhere"},
        {"id": "x", "entity": "Event"},  # no field
        {**GROUP3, "filterType": "regex"},
        "not a filter",
    ]
    assert normalize_filters(raw) == [GROUP3, {**BRUSH, "origin": "chat"}]
    assert normalize_filters(None) == []


def test_describe_states_ids_origins_values_and_scope():
    text = describe_filters(
        [{**GROUP3, "scope": {"entity": "Patient", "match": "any"}}, BRUSH]
    )
    assert "- id: message-filter-1-0 (made by you, editable)" in text
    assert "Event.cns_integrated_diagnosis is one of: 'Medulloblastoma, Group 3'" in text
    assert "scope: Patient with any Event rows matching" in text
    assert "- id: udi_1_1 (a chart brush, read-only)" in text
    assert "Patient.age between 2 and 10" in text
    assert "scope: rows" in text


def test_describe_no_filters():
    assert describe_filters([]) == "No filters are active."


def test_describe_point_filter_awaiting_values():
    text = describe_filters([{**GROUP3, "pointValues": [""]}])
    assert "no values picked yet" in text


def _fake_completion(tool_calls):
    message = SimpleNamespace(tool_calls=tool_calls, content=None)
    return SimpleNamespace(choices=[SimpleNamespace(message=message)], usage=None)


def test_orchestrator_prompt_carries_the_current_filters():
    agent = UDIAgent.__new__(UDIAgent)
    agent.gpt_model = MagicMock()
    agent.gpt_model_name = "gpt-test"
    agent.temperature = agent.reasoning_effort = agent.max_completion_tokens = None
    agent.openai_api = "chat"
    orch = Orchestrator.__new__(Orchestrator)
    orch.agent = agent
    orch.skills = {"orchestrate": SimpleNamespace(instructions="{{current_filters}}")}
    orch.tools = []
    orch.grammar = {}
    create = agent.gpt_model.chat.completions.create
    create.return_value = _fake_completion(None)

    orch.run(
        [{"role": "user", "content": "hi"}], "{}", "[]", filters=[GROUP3, BRUSH]
    )

    system = create.call_args.kwargs["messages"][0]
    assert system["role"] == "system"
    assert system["content"] == describe_filters([GROUP3, BRUSH])


class TestServerForwardsFilters:
    @pytest.fixture(autouse=True)
    def setup_app(self):
        with patch.object(UDIAgent, "__init__", lambda self, **kwargs: None):
            import udiagent.server.app as server_app

            mock_agent = UDIAgent.__new__(UDIAgent)
            mock_agent.gpt_model = MagicMock()
            mock_agent.gpt_model_name = "gpt-test"
            server_app.agent = mock_agent
            server_app.orchestrator.agent = mock_agent
            server_app.app.state.budget_check = None

            from starlette.testclient import TestClient

            self.client = TestClient(server_app.app)
            self.server_app = server_app
            yield

    def _post(self, **extra):
        body = {
            "messages": [{"role": "user", "content": "hi"}],
            "dataSchema": "{}",
            "dataDomains": "[]",
            **extra,
        }
        result = OrchestratorResult(tool_calls=[], usage=Usage())
        with patch.object(
            self.server_app.orchestrator, "run", return_value=result
        ) as run:
            resp = self.client.post(
                "/v1/yac/completions",
                json=body,
                headers={"Authorization": "Bearer test"},
            )
        assert resp.status_code == 200, resp.text
        return run.call_args.kwargs

    def test_filters_reach_the_orchestrator(self):
        assert self._post(filters=[GROUP3])["filters"] == [GROUP3]

    def test_older_clients_send_none(self):
        assert self._post()["filters"] == []

