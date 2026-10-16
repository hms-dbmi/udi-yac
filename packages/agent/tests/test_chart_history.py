"""Earlier charts reach the model as the template call behind them, not the spec.

A client echoes every chart already on the dashboard back as a
`RenderVisualization` call whose arguments are the full instantiated spec. Sent
as-is, a follow-up ("EFS too") had to reverse-engineer the template call from a
long spec — and read its derived columns (`ci requested`, `ci lower`) as
settings to choose, hiding a confidence band nobody asked to hide. So a
template-made chart is shown as `chart_id` + `template_tool` + `template_args`,
marked as trimmed, and `GetVisualizationSpec` reads the full spec back.
"""

import contextlib
import copy
import json
from types import SimpleNamespace

from udiagent.messages import (
    compact_visualization_history,
    normalize_tool_calls,
    visualization_calls,
)
from udiagent.orchestrator import Orchestrator

_SPEC = json.dumps({"source": [{"name": "Event"}], "transformation": [{"derive": {"ci requested": {"literal": 1}}}]})
_TOOL_ARGS = {"entity1": "Event", "endpoint": "overall_survival"}


def _chart(spec=_SPEC, tool_used="vis_052_line_survival", flat=False):
    meta = {"tool_used": tool_used, "tool_args": dict(_TOOL_ARGS)} if tool_used else {}
    call = {"name": "RenderVisualization", "arguments": {"spec": spec}, "meta": meta}
    return call if flat else {"function": call}


def _history(*charts):
    messages = [{"role": "user", "content": "show os"}]
    for chart in charts:
        messages.append({"role": "assistant", "content": "", "tool_calls": [chart]})
    messages.append({"role": "user", "content": "efs too"})
    return messages


def _sent_arguments(messages):
    """The arguments the model is shown for each RenderVisualization call."""
    return [
        json.loads(tc["function"]["arguments"])
        for m in normalize_tool_calls(copy.deepcopy(messages))
        for tc in m.get("tool_calls") or []
    ]


def test_a_template_chart_is_shown_as_its_template_call():
    [shown] = _sent_arguments(_history(_chart()))
    assert shown["chart_id"] == "chart_1"
    assert shown["template_tool"] == "vis_052_line_survival"
    assert shown["template_args"] == _TOOL_ARGS
    # Trimmed, and says so — with the way to the rest.
    assert "ci requested" not in json.dumps(shown)
    assert "GetVisualizationSpec" in shown["spec"] and '"chart_1"' in shown["spec"]


def test_a_freehand_chart_keeps_its_spec():
    """No template behind it, so no shorter faithful description exists."""
    [shown] = _sent_arguments(_history(_chart(tool_used=None)))
    assert shown == {"spec": _SPEC}


def test_charts_are_numbered_in_order_across_messages_and_shapes():
    messages = _history(_chart(), _chart(tool_used=None), _chart(flat=True))
    assert [cid for cid, _ in visualization_calls(messages)] == ["chart_1", "chart_2", "chart_3"]
    shown = _sent_arguments(messages)
    assert shown[0]["chart_id"] == "chart_1"
    assert shown[2]["chart_id"] == "chart_3"  # the flat shape is compacted too


def test_a_revealed_chart_keeps_its_spec():
    chart = _chart()
    chart["function"]["meta"]["spec_revealed"] = True
    [shown] = _sent_arguments(_history(chart))
    assert shown == {"spec": _SPEC}


def test_compaction_can_be_turned_off_and_never_touches_the_callers_copy():
    messages = _history(_chart())
    original = copy.deepcopy(messages)
    shown = normalize_tool_calls(copy.deepcopy(messages), compact_charts=False)
    assert json.loads(shown[1]["tool_calls"][0]["function"]["arguments"]) == {"spec": _SPEC}
    compact_visualization_history(copy.deepcopy(messages))
    assert messages == original


def test_the_reveal_returns_the_spec_and_marks_the_chart():
    messages = _history(_chart())
    answer = Orchestrator.__new__(Orchestrator)._reveal_visualization_spec(
        {"chart_id": "chart_1"}, messages
    )
    assert answer == _SPEC
    assert messages[1]["tool_calls"][0]["function"]["meta"]["spec_revealed"] is True


def test_an_unknown_chart_id_names_the_ones_that_exist():
    answer = Orchestrator.__new__(Orchestrator)._reveal_visualization_spec(
        {"chart_id": "chart_9"}, _history(_chart(), _chart())
    )
    assert "No chart 'chart_9'" in answer and "chart_1, chart_2" in answer


# --- the orchestrator loop, with a scripted model --------------------------------


def _tool_call(call_id, name, arguments):
    return SimpleNamespace(
        id=call_id,
        type="function",
        function=SimpleNamespace(name=name, arguments=json.dumps(arguments)),
    )


def _response(tool_calls=None, content=None):
    message = SimpleNamespace(tool_calls=tool_calls, content=content)
    return SimpleNamespace(choices=[SimpleNamespace(message=message)], usage=None)


class _ScriptedClient:
    """Plays back one response per completion call and records what was sent."""

    def __init__(self, responses):
        self.responses = list(responses)
        self.calls = []
        self.chat = SimpleNamespace(completions=SimpleNamespace(create=self._create))

    def _create(self, **kwargs):
        self.calls.append(copy.deepcopy(kwargs["messages"]))
        return self.responses.pop(0)


def test_a_question_about_a_chart_reads_its_spec_and_answers_from_it():
    client = _ScriptedClient(
        [
            # The orchestrator asks for the spec first...
            _response([_tool_call("c1", "GetVisualizationSpec", {"chart_id": "chart_1"})]),
            # ...then decides to answer in prose.
            _response([_tool_call("c2", "FreeTextExplain", {"user_request": "how is it built?"})]),
            # The explanation itself.
            _response(content="It derives a band from Greenwood's variance."),
        ]
    )
    agent = SimpleNamespace(
        gpt_model_name="test-model",
        _get_gpt_client=lambda _key=None: client,
        trace=lambda **_kw: contextlib.nullcontext(),
    )
    messages = _history(_chart())
    messages[-1]["content"] = "how is that chart built?"
    original = copy.deepcopy(messages)

    result = Orchestrator(agent=agent).run(messages, json.dumps({"resources": []}), "[]")

    assert [c["name"] for c in result.tool_calls] == ["FreeTextExplain"]
    orchestrate_first, orchestrate_second, explain = client.calls
    # Compact until asked for...
    assert "ci requested" not in json.dumps(orchestrate_first)
    # ...then the full spec comes back as the tool's answer...
    assert any(m.get("role") == "tool" and "ci requested" in (m.get("content") or "") for m in orchestrate_second)
    # ...and the handler that answers the turn sees it in the history too.
    assert "ci requested" in json.dumps(explain)
    # The caller's messages are never marked.
    assert messages == original
