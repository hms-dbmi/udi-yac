"""The filter state a completion request carries, and how the prompt states it."""

import json
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest

from udiagent.agent import UDIAgent
from udiagent.benchmark.runner import check_rubric
from udiagent.filters import (
    APPLY_FILTER_OPERATIONS,
    MAX_FILTER_ATTEMPTS,
    describe_filters,
    filter_summary,
    normalize_filters,
    operation_tool_calls,
    validate_operations,
)
from udiagent.orchestrator import Orchestrator, OrchestratorResult, Usage
from udiagent.schema import parse_schema_from_dict
from udiagent.skills import load_skills

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
    assert (
        "Event.cns_integrated_diagnosis is one of: 'Medulloblastoma, Group 3'" in text
    )
    assert "scope: Patient with any Event rows matching" in text
    assert "- id: udi_1_1 (a chart brush, read-only)" in text
    assert "Patient.age between 2 and 10" in text
    assert "scope: rows" in text


def test_describe_no_filters():
    assert describe_filters([]) == "No filters are active."


def test_describe_cleared_interval():
    entry = {k: v for k, v in BRUSH.items() if k != "intervalRange"}
    assert "no range set" in describe_filters([entry])


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

    orch.run([{"role": "user", "content": "hi"}], "{}", "[]", filters=[GROUP3, BRUSH])

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


# ---------------------------------------------------------------------------
# Filter operations: validation, shaping, the retry loop
# ---------------------------------------------------------------------------

RAW_SCHEMA = {
    "resources": [
        {
            "name": "Patient",
            "schema": {
                "fields": [
                    {"name": "id", "udi:data_type": "nominal"},
                    {"name": "age", "udi:data_type": "quantitative"},
                ]
            },
        },
        {
            "name": "Event",
            "schema": {
                "fields": [
                    {"name": "patient_id", "udi:data_type": "nominal"},
                    {"name": "cns_integrated_diagnosis", "udi:data_type": "nominal"},
                ],
                "foreignKeys": [
                    {
                        "fields": ["patient_id"],
                        "reference": {"resource": "Patient", "fields": ["id"]},
                    }
                ],
            },
        },
        {
            "name": "Site",
            "schema": {"fields": [{"name": "name", "udi:data_type": "nominal"}]},
        },
    ]
}
SCHEMA = parse_schema_from_dict(RAW_SCHEMA)
DOMAINS = json.dumps(
    [
        {
            "entity": "Event",
            "field": "cns_integrated_diagnosis",
            "type": "point",
            "domain": {"values": ["Medulloblastoma, Group 3", "Medulloblastoma, SHH"]},
        },
        {
            "entity": "Patient",
            "field": "age",
            "type": "interval",
            "domain": {"min": 0, "max": 30},
        },
    ]
)
CURRENT = [GROUP3, BRUSH]
ADD_GROUP3 = {
    "op": "add",
    "title": "Diagnosis",
    "entity": "Event",
    "field": "cns_integrated_diagnosis",
    "filterType": "point",
    "pointValues": ["Medulloblastoma, Group 3"],
}


def _errors(*ops):
    return validate_operations(list(ops), SCHEMA, DOMAINS, CURRENT)


def test_valid_operations_pass():
    assert (
        _errors(
            ADD_GROUP3,
            {
                **ADD_GROUP3,
                "op": "modify",
                "id": GROUP3["id"],
                "scope": {"entity": "Patient", "match": "none"},
            },
            {
                "op": "add",
                "entity": "Patient",
                "field": "age",
                "filterType": "interval",
                "intervalRange": {"min": 2, "max": 9},
            },
            {"op": "clear"},
        )
        == []
    )
    assert _errors({"op": "remove", "id": GROUP3["id"]}) == []


def test_add_may_leave_values_for_the_user_to_pick():
    assert _errors({**ADD_GROUP3, "pointValues": []}) == []
    assert (
        _errors({**ADD_GROUP3, "op": "modify", "id": GROUP3["id"], "pointValues": []})
        != []
    )


@pytest.mark.parametrize(
    "op, expected",
    [
        ({**ADD_GROUP3, "entity": "Visit"}, "Table 'Visit' does not exist"),
        (
            {**ADD_GROUP3, "field": "diagnosis"},
            "Column 'diagnosis' does not exist on 'Event'",
        ),
        (
            {**ADD_GROUP3, "pointValues": ["medulloblastoma, group 3"]},
            "'Medulloblastoma, Group 3' is",
        ),
        ({**ADD_GROUP3, "pointValues": ["Ependymoma"]}, "would match no rows"),
        (
            {
                **ADD_GROUP3,
                "filterType": "interval",
                "intervalRange": {"min": 1, "max": 2},
            },
            "is categorical",
        ),
        (
            {
                "op": "add",
                "entity": "Patient",
                "field": "age",
                "filterType": "interval",
                "intervalRange": {"min": 9, "max": 2},
            },
            "min (9) is above max (2)",
        ),
        (
            {
                "op": "add",
                "entity": "Patient",
                "field": "age",
                "filterType": "interval",
                "intervalRange": {"min": "2", "max": 9},
            },
            "numeric intervalRange",
        ),
        (
            {"op": "remove", "id": "message-filter-9-9"},
            "No filter has id 'message-filter-9-9'",
        ),
        ({"op": "remove", "id": BRUSH["id"]}, "is read-only (a chart brush"),
        ({**ADD_GROUP3, "op": "modify", "id": BRUSH["id"]}, "is read-only"),
        (
            {**ADD_GROUP3, "scope": {"entity": "Site", "match": "any"}},
            "no foreign key to or from 'Site'",
        ),
        (
            {**ADD_GROUP3, "scope": {"entity": "Event", "match": "any"}},
            "the filtered table itself",
        ),
        (
            {**ADD_GROUP3, "scope": {"entity": "Patient", "match": "some"}},
            "scope.match must be",
        ),
        ({"op": "rename"}, "op must be one of"),
    ],
)
def test_invalid_operations_are_named(op, expected):
    errors = _errors(op)
    assert len(errors) >= 1
    assert expected in errors[0]
    assert errors[0].startswith("Operation 1")


def test_a_filter_changed_twice_is_rejected():
    errors = _errors(
        {"op": "remove", "id": GROUP3["id"]}, {"op": "remove", "id": GROUP3["id"]}
    )
    assert errors == [
        f"Operation 2 (remove): Filter '{GROUP3['id']}' is changed twice. Change it once."
    ]


def test_a_shortened_value_list_does_not_reject_unseen_values():
    domains = json.dumps(
        [
            {
                "entity": "Event",
                "field": "cns_integrated_diagnosis",
                "type": "point",
                "domain": {"values": ["Medulloblastoma, SHH"], "distinct": 40},
            }
        ]
    )
    assert validate_operations([ADD_GROUP3], SCHEMA, domains, CURRENT) == []


def test_operations_become_filter_data_calls():
    calls = operation_tool_calls(
        [
            ADD_GROUP3,
            {
                **ADD_GROUP3,
                "op": "modify",
                "id": GROUP3["id"],
                "scope": {"entity": "Patient", "match": "any"},
            },
            {"op": "remove", "id": GROUP3["id"]},
            {"op": "clear"},
        ],
        CURRENT,
    )
    assert [c["name"] for c in calls] == ["FilterData"] * 4
    add, modify, remove, clear = (c["arguments"] for c in calls)
    # An add keeps the shape every FilterData call had before operations.
    assert add == {
        "title": "Diagnosis",
        "entity": "Event",
        "field": "cns_integrated_diagnosis",
        "filter": {
            "filterType": "point",
            "intervalRange": {"min": 0, "max": 0},
            "pointValues": ["Medulloblastoma, Group 3"],
        },
    }
    assert modify["op"] == "modify" and modify["id"] == GROUP3["id"]
    assert modify["scope"] == {"entity": "Patient", "match": "any"}
    assert remove == {"op": "remove", "id": GROUP3["id"], "title": "Diagnosis"}
    assert clear == {"op": "clear"}


def _tool_call(name, arguments, call_id="call_1"):
    return SimpleNamespace(
        id=call_id, function=SimpleNamespace(name=name, arguments=json.dumps(arguments))
    )


def _filter_orchestrator(responses):
    agent = UDIAgent.__new__(UDIAgent)
    agent.gpt_model = MagicMock()
    agent.gpt_model_name = "gpt-test"
    agent.temperature = agent.reasoning_effort = agent.max_completion_tokens = None
    agent.openai_api = "chat"
    orch = Orchestrator.__new__(Orchestrator)
    orch.agent = agent
    orch.skills = load_skills()
    orch.tools = []
    orch.grammar = {}
    create = agent.gpt_model.chat.completions.create
    create.side_effect = [_fake_completion([call]) for call in responses]
    return orch, create


def _run_filter_step(responses):
    orch, create = _filter_orchestrator(responses)
    result = orch._handle_filter_data(
        {"request": "only patients who ever had Group 3"},
        [{"role": "user", "content": "only patients who ever had Group 3"}],
        json.dumps(RAW_SCHEMA),
        DOMAINS,
        Usage(),
        current_filters=CURRENT,
    )
    return result, create


def test_filter_step_retries_with_the_errors_then_succeeds():
    bad = {"operations": [{**ADD_GROUP3, "pointValues": ["group 3"]}]}
    good = {"operations": [ADD_GROUP3]}
    result, create = _run_filter_step(
        [
            _tool_call(APPLY_FILTER_OPERATIONS, bad),
            _tool_call(APPLY_FILTER_OPERATIONS, good),
        ]
    )

    assert [c["arguments"]["entity"] for c in result] == ["Event"]
    assert create.call_count == 2
    first, retry = (call.kwargs["messages"] for call in create.call_args_list)
    assert (
        "Current filters" in first[0]["content"] and GROUP3["id"] in first[0]["content"]
    )
    rejection = retry[-2]
    assert rejection["role"] == "tool" and "'group 3' is not in" in rejection["content"]
    assert retry[-3]["tool_calls"][0]["function"]["arguments"] == json.dumps(bad)


def test_filter_step_gives_up_with_a_clear_message():
    bad = {"operations": [{"op": "remove", "id": BRUSH["id"]}]}
    result, create = _run_filter_step(
        [_tool_call(APPLY_FILTER_OPERATIONS, bad)] * MAX_FILTER_ATTEMPTS
    )

    assert create.call_count == MAX_FILTER_ATTEMPTS
    assert result["name"] == "FreeTextExplain"
    text = result["arguments"]["text"]
    assert text[0].startswith("I could not make that filter change")
    assert any("is read-only" in line for line in text)


def test_follow_up_modifies_the_existing_filter_instead_of_adding_one():
    """ "Only patients who ever had Group 3", after a row-level Group 3 filter,
    re-scopes that filter: one modify, same id, no second filter."""
    routed = _tool_call(
        "FilterData",
        {
            "request": f"Re-scope filter {GROUP3['id']} to patients with any Group 3 event"
        },
    )
    rescoped = _tool_call(
        APPLY_FILTER_OPERATIONS,
        {
            "operations": [
                {
                    **ADD_GROUP3,
                    "op": "modify",
                    "id": GROUP3["id"],
                    "scope": {"entity": "Patient", "match": "any"},
                }
            ]
        },
    )
    orch, create = _filter_orchestrator([routed, rescoped])
    result = orch.run(
        [{"role": "user", "content": "only patients who ever had Group 3"}],
        json.dumps(RAW_SCHEMA),
        DOMAINS,
        filters=CURRENT,
    )

    assert result.orchestrator_choice == "get-subset-of-data"
    (call,) = result.tool_calls
    assert call["name"] == "FilterData"
    assert call["arguments"]["op"] == "modify"
    assert call["arguments"]["id"] == GROUP3["id"]
    assert call["arguments"]["scope"] == {"entity": "Patient", "match": "any"}
    # The filter step was offered only the operations tool.
    filter_call = create.call_args_list[1].kwargs
    assert [t["function"]["name"] for t in filter_call["tools"]] == [
        APPLY_FILTER_OPERATIONS
    ]


def test_rubric_scores_the_filter_a_modify_defines():
    expected = {
        "orchestrator_choice": "get-subset-of-data",
        "tool_calls": operation_tool_calls([ADD_GROUP3], []),
    }
    output = {
        "orchestrator_choice": "get-subset-of-data",
        "tool_calls": operation_tool_calls(
            [
                {"op": "remove", "id": GROUP3["id"]},
                {**ADD_GROUP3, "op": "modify", "id": GROUP3["id"]},
            ],
            CURRENT,
        ),
    }
    rubric = check_rubric(expected, output, json.loads(DOMAINS))
    assert all(item["pass"] for item in rubric.values()), rubric
    assert "filter_point_value" in rubric


def test_explain_answers_from_the_current_filters_not_the_history():
    """Asked "which filters are on?" after the user edited one in the UI, the
    explain call must see the edit: its history still holds the original call."""
    edited = {**GROUP3, "pointValues": ["Medulloblastoma, SHH"]}
    history = [
        {"role": "user", "content": "filter to group 3"},
        {
            "role": "assistant",
            "content": "",
            "tool_calls": operation_tool_calls([ADD_GROUP3], []),
        },
        {"role": "user", "content": "what filters are on?"},
    ]
    routed = _tool_call(
        "FreeTextExplain",
        {"user_request": "what filters are on?", "response_type": "general"},
    )
    orch, create = _filter_orchestrator([routed])
    answer = SimpleNamespace(
        choices=[
            SimpleNamespace(
                message=SimpleNamespace(tool_calls=None, content="One filter: SHH.")
            )
        ],
        usage=None,
    )
    create.side_effect = [_fake_completion([routed]), answer]

    result = orch.run(history, json.dumps(RAW_SCHEMA), DOMAINS, filters=[edited])

    assert result.tool_calls[0]["name"] == "FreeTextExplain"
    explain_prompt = create.call_args_list[1].kwargs["messages"][0]["content"]
    assert "'Medulloblastoma, SHH'" in explain_prompt
    assert GROUP3["id"] in explain_prompt


def test_filter_summary_logs_shapes_not_fields_or_values():
    summary = filter_summary(
        [
            {**GROUP3, "scope": {"entity": "Patient", "match": "any"}},
            BRUSH,
            {**BRUSH, "intervalRange": None},
        ]
    )
    assert summary == (
        "3 [message-filter-1-0(chat,point:1,any), udi_1_1(chart,interval,rows), "
        "udi_1_1(chart,interval:unset,rows)]"
    )
    assert (
        "Medulloblastoma" not in summary and "cns_integrated_diagnosis" not in summary
    )
    assert filter_summary([]) == "0"


def test_past_filter_calls_point_at_the_current_state():
    """A past FilterData call is answered in the history with a reply that says
    it may be stale, not a bare OK the model reads as "this filter is on"."""
    from udiagent.messages import FILTER_CALL_REPLY, normalize_tool_calls

    msgs = normalize_tool_calls(
        [
            {"role": "user", "content": "filter to group 3"},
            {
                "role": "assistant",
                "content": "",
                "tool_calls": operation_tool_calls([ADD_GROUP3], [])
                + [{"name": "FreeTextExplain", "arguments": {"text": ["hi"]}}],
            },
        ]
    )
    replies = [m["content"] for m in msgs if m["role"] == "tool"]
    assert replies == [FILTER_CALL_REPLY, "OK"]
    assert "Current filters" in FILTER_CALL_REPLY
