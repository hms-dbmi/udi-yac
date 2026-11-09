"""The dashboard state a completion request carries, and how the prompts state it.

The history echoes every chart the agent ever made, closed ones included, so
the client also sends which charts are open and which sit in the memory bank,
keyed by where each chart's call sits in the history it sent.
"""

import json
from types import SimpleNamespace
from unittest.mock import MagicMock

from udiagent.agent import UDIAgent
from udiagent.dashboard import describe_dashboard, normalize_dashboard
from udiagent.messages import chart_keys, split_tool_calls, visualization_calls
from udiagent.orchestrator import Orchestrator
from udiagent.skills import load_skills


def _chart(n):
    return {"function": {"name": "RenderVisualization", "arguments": {"spec": f"spec {n}"}}}


FILTER = {"function": {"name": "FilterData", "arguments": {"entity": "Donor"}}}

#: Three charts, keyed "1-1", "3-0" and "3-1" by the client: a FilterData call
#: shares the first message, and the last message holds two charts.
HISTORY = [
    {"role": "user", "content": "filter and chart"},
    {"role": "assistant", "content": "", "tool_calls": [FILTER, _chart(1)]},
    {"role": "user", "content": "two more"},
    {"role": "assistant", "content": "", "tool_calls": [_chart(2), _chart(3)]},
    {"role": "user", "content": "what is on my dashboard?"},
]


def test_chart_keys_follow_the_client_positions_and_the_model_numbering():
    keys = chart_keys(HISTORY)
    assert keys == {"1-1": "chart_1", "3-0": "chart_2", "3-1": "chart_3"}
    # The orchestrator numbers charts after splitting; the ids must agree.
    split_ids = [cid for cid, _ in visualization_calls(split_tool_calls(HISTORY))]
    assert list(keys.values()) == split_ids


def test_normalize_maps_keys_and_drops_what_it_cannot_place():
    raw = {
        "open": [
            {"key": "3-1", "tableView": True},
            {"key": "-1-0"},  # a Data Overview card: no chart in the history
            "1-1",  # malformed
            {"key": "1-1", "sortByTotal": True},
        ],
        "closed": ["3-0", "9-9", 4],
    }
    assert normalize_dashboard(raw, HISTORY) == {
        "open": [
            {"chart_id": "chart_3", "key": "3-1", "table_view": True, "sort_by_total": False},
            {"chart_id": "chart_1", "key": "1-1", "table_view": False, "sort_by_total": True},
        ],
        "closed": [{"chart_id": "chart_2", "key": "3-0"}],
    }
    assert normalize_dashboard(None, HISTORY) is None
    assert normalize_dashboard({"open": "x"}, HISTORY) == {"open": [], "closed": []}


def test_describe_lists_open_charts_in_order_then_closed_ones():
    dashboard = normalize_dashboard(
        {"open": [{"key": "3-1", "tableView": True}, {"key": "1-1"}], "closed": ["3-0"]},
        HISTORY,
    )
    assert describe_dashboard(dashboard) == "\n".join(
        [
            "Open, in dashboard order (left to right, top to bottom):",
            "- chart_3 (shown as a table)",
            "- chart_1",
            "Closed — in the memory bank, not visible until restored:",
            "- chart_2",
        ]
    )
    assert describe_dashboard({"open": [], "closed": []}) == "No charts are open."
    assert "every chart" in describe_dashboard(None)


def _orchestrator():
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
    return orch, agent.gpt_model.chat.completions.create


def _completion(tool_calls=None, content=None):
    message = SimpleNamespace(tool_calls=tool_calls, content=content)
    return SimpleNamespace(choices=[SimpleNamespace(message=message)], usage=None)


def _tool_call(name, arguments):
    return SimpleNamespace(
        id="call_1", function=SimpleNamespace(name=name, arguments=json.dumps(arguments))
    )


def test_orchestrate_and_explain_prompts_carry_the_dashboard():
    """Asked "what is on my dashboard?" after closing a chart, both the routing
    call and the explain call see it closed, though the history still holds it."""
    orch, create = _orchestrator()
    routed = _tool_call(
        "FreeTextExplain", {"user_request": "what is on my dashboard?", "response_type": "general"}
    )
    create.side_effect = [_completion([routed]), _completion(content="Two charts.")]
    raw = {"open": [{"key": "3-1"}, {"key": "1-1"}], "closed": ["3-0"]}

    orch.run(HISTORY, "{}", "[]", dashboard=raw)

    expected = describe_dashboard(normalize_dashboard(raw, HISTORY))
    orchestrate_prompt = create.call_args_list[0].kwargs["messages"][0]["content"]
    explain_prompt = create.call_args_list[1].kwargs["messages"][0]["content"]
    assert expected in orchestrate_prompt
    assert expected in explain_prompt
    assert "{{current_dashboard}}" not in orchestrate_prompt + explain_prompt


def test_every_chart_in_the_history_shows_its_id_and_may_be_stale():
    orch, create = _orchestrator()
    create.return_value = _completion(None)

    orch.run(HISTORY, "{}", "[]")

    sent = create.call_args.kwargs["messages"]
    shown = [
        json.loads(tc["function"]["arguments"])
        for m in sent
        for tc in m.get("tool_calls") or []
        if tc["function"]["name"] == "RenderVisualization"
    ]
    assert [s["chart_id"] for s in shown] == ["chart_1", "chart_2", "chart_3"]
    replies = {m["content"] for m in sent if m["role"] == "tool"}
    assert any("Current dashboard" in r for r in replies)


# ---------------------------------------------------------------------------
# UI actions: closing, restoring and replacing charts, and starting over
# ---------------------------------------------------------------------------

#: chart_3 and chart_1 open, chart_2 closed.
DASHBOARD = {"open": [{"key": "3-1"}, {"key": "1-1"}], "closed": ["3-0"]}


def _act(*calls, dashboard=DASHBOARD):
    orch, create = _orchestrator()
    create.return_value = _completion([_tool_call(name, args) for name, args in calls])
    return orch.run(HISTORY, "{}", "[]", dashboard=dashboard)


def test_update_dashboard_names_charts_by_the_clients_keys():
    result = _act(
        ("UpdateDashboard", {"message": "Done.", "close": ["chart_3"], "restore": ["chart_2"]})
    )
    assert result.tool_calls == [
        {
            "name": "UpdateDashboard",
            "arguments": {
                "message": "Done.",
                "close": [{"chart_id": "chart_3", "key": "3-1"}],
                "restore": [{"chart_id": "chart_2", "key": "3-0"}],
            },
        }
    ]
    assert result.orchestrator_choice == "ui-action"


def test_update_dashboard_drops_ids_it_cannot_act_on():
    """Closing a closed chart, restoring an open one or naming one that does not
    exist does nothing, and the message says so rather than claiming it did."""
    result = _act(
        (
            "UpdateDashboard",
            {"message": "Closed it.", "close": ["chart_2", "chart_9"], "restore": ["chart_1"]},
        )
    )
    [call] = result.tool_calls
    assert call["arguments"]["close"] == call["arguments"]["restore"] == []
    assert call["arguments"]["message"] != "Closed it."


def test_reset_conversation_passes_its_message_through():
    result = _act(("ResetConversation", {"message": "Start over?"}))
    assert result.tool_calls == [
        {"name": "ResetConversation", "arguments": {"message": "Start over?"}}
    ]


def test_a_replacing_chart_names_the_open_chart_it_replaces(monkeypatch):
    rendered = {"name": "RenderVisualization", "arguments": {"spec": "{}"}, "meta": {"tool_used": "t"}}
    monkeypatch.setattr(
        "udiagent.orchestrator.function_call_render_visualization",
        lambda *a, **kw: json.loads(json.dumps(rendered)),
    )

    [replacing] = _act(("CreateVisualization", {"description": "pie", "replaces": "chart_1"})).tool_calls
    assert replacing["meta"] == {"tool_used": "t", "replaces": "1-1"}

    # A closed chart has no place to take, and a missing one is no chart at all.
    for target in ("chart_2", "chart_9"):
        [added] = _act(("CreateVisualization", {"description": "pie", "replaces": target})).tool_calls
        assert "replaces" not in added["meta"]
