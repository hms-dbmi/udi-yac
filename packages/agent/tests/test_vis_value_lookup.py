"""Vis generation may look up a column's values before choosing a chart.

The chart-template call writes a grouping's values and `<V*>` literals, but its
prompt shows only a sample of each column. With `ListFieldValues` it can search
for the protocol arm a user named instead of guessing its spelling.
"""

import json
from types import SimpleNamespace
from unittest.mock import MagicMock

from udiagent.agent import UDIAgent
from udiagent.orchestrator import MAX_VALUE_LOOKUPS
from udiagent.vis_generate import _call_llm_with_tools

TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "survival_stratified",
            "description": "a stratified survival chart",
            "parameters": {"type": "object", "properties": {}},
        },
    }
]

DOMAINS = [
    {
        "entity": "Medical Therapy",
        "field": "protocol_name_and_arm",
        "type": "point",
        "domain": {"values": ["ACNS0334: Regimen A", "ACNS0334: Regimen B", "Other"]},
    }
]


def _response(*calls):
    tool_calls = [
        SimpleNamespace(
            id=f"call_{i}",
            function=SimpleNamespace(name=name, arguments=json.dumps(args)),
        )
        for i, (name, args) in enumerate(calls)
    ]
    message = SimpleNamespace(tool_calls=tool_calls, content=None)
    return SimpleNamespace(choices=[SimpleNamespace(message=message, finish_reason="tool_calls")])


def _agent(responses):
    agent = UDIAgent.__new__(UDIAgent)
    agent.gpt_model_name = "m"
    client = MagicMock()
    client.chat.completions.create.side_effect = responses
    agent._get_gpt_client = lambda key: client
    return agent, client


def test_a_lookup_is_answered_before_the_chart_is_chosen():
    lookup = (
        "ListFieldValues",
        {"entity": "Medical Therapy", "field": "protocol_name_and_arm", "contains": "ACNS0334"},
    )
    chart = ("survival_stratified", {"grouping": "{}"})
    agent, client = _agent([_response(lookup), _response(chart)])

    result = _call_llm_with_tools(
        agent, [{"role": "user", "content": "km by arm"}], TOOLS, None, data_domains=DOMAINS
    )

    assert result == ("survival_stratified", {"grouping": "{}"})
    first, second = client.chat.completions.create.call_args_list
    assert "ListFieldValues" in [t["function"]["name"] for t in first.kwargs["tools"]]
    answer = second.kwargs["messages"][-1]
    assert answer["role"] == "tool"
    assert "ACNS0334: Regimen B" in answer["content"]
    assert "Other" not in answer["content"]


def test_without_domains_no_lookup_is_offered():
    agent, client = _agent([_response(("survival_stratified", {}))])
    _call_llm_with_tools(agent, [], TOOLS, None)
    offered = client.chat.completions.create.call_args.kwargs["tools"]
    assert [t["function"]["name"] for t in offered] == ["survival_stratified"]


def test_lookups_are_bounded_and_the_last_round_offers_only_charts():
    lookup = ("ListFieldValues", {"entity": "Medical Therapy", "field": "protocol_name_and_arm"})
    chart = ("survival_stratified", {})
    agent, client = _agent([_response(lookup)] * MAX_VALUE_LOOKUPS + [_response(chart)])

    result = _call_llm_with_tools(agent, [], TOOLS, None, data_domains=DOMAINS)

    assert result == ("survival_stratified", {})
    last = client.chat.completions.create.call_args_list[-1]
    assert [t["function"]["name"] for t in last.kwargs["tools"]] == ["survival_stratified"]
