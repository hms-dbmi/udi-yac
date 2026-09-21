"""What happens when no template can be bound.

The bug this file exists for: `_execute_generate` used to abandon the template
path through five silent `break`s and then generate a spec freehand. Its prompt
carries every template's spec verbatim, so what came back was a convincing
imitation of the survival pipeline — right column names, wrong mechanics — and
it reached the reader as a chart rather than as a failure. Nothing was logged,
and `tool_used: None` meant both "freehand" and "this deployment has no
templates", so the two could not be told apart afterwards.

So: a template-capable request that cannot be bound must produce an explanation,
a reason code, and a log line — never a spec.
"""

import json
import logging

import pytest

import udiagent.vis_generate as vg
from udiagent.tools import function_call_render_visualization
from udiagent.vis_generate import (
    FALLBACK_NO_TOOL_CALL,
    FALLBACK_UNKNOWN_TOOL,
    FALLBACK_VALIDATION_FAILED,
    _retry_turns,
    _select_tools,
)

_SCHEMA = json.dumps(
    {
        "name": "tiny",
        "udi:path": "./data/tiny/",
        "resources": [
            {
                "name": "penguins",
                "type": "table",
                "path": "penguins.csv",
                "udi:row_count": 344,
                "schema": {
                    "fields": [
                        {"name": "species", "udi:data_type": "nominal"},
                        {"name": "island", "udi:data_type": "nominal"},
                        {"name": "body_mass_g", "udi:data_type": "quantitative"},
                    ]
                },
            }
        ],
    }
)


def _context(messages=None):
    return {
        "agent": object(),
        "grammar": {},
        "config": {},
        "data_schema": _SCHEMA,
        "messages": messages or [{"role": "user", "content": "a survival curve"}],
        "openai_api_key": None,
        "usage": None,
        "req_id": "testreq1",
    }


def _stub_tool_call(monkeypatch, responses):
    """Feed `_call_llm_with_tools` a scripted sequence of results."""
    remaining = list(responses)
    seen = []

    def fake_call(agent, messages, tools, config, **kwargs):
        seen.append(messages)
        return remaining.pop(0) if remaining else None

    monkeypatch.setattr(vg, "_call_llm_with_tools", fake_call)
    return seen


# --- the model never picks a tool -------------------------------------------


def test_no_tool_call_produces_no_spec_and_says_why(monkeypatch, caplog):
    _stub_tool_call(monkeypatch, [None])
    with caplog.at_level(logging.WARNING, logger="udiagent.vis_generate"):
        out = vg._execute_generate(skill=None, context=_context())

    assert out["generation_failed"]["reason"] == FALLBACK_NO_TOOL_CALL
    assert out["fallback_reason"] == FALLBACK_NO_TOOL_CALL
    assert out["spec_str"] == "{}"
    assert out["tool_used"] is None
    # The line that used to not exist.
    assert any("no visualization built" in r.message for r in caplog.records)
    # And no freehand generation happened.
    assert not any("FALLBACK: freehand" in r.getMessage() for r in caplog.records)


def test_a_hallucinated_tool_name_is_named_in_the_log(monkeypatch, caplog):
    _stub_tool_call(monkeypatch, [("vis_999_not_a_tool", {})])
    with caplog.at_level(logging.WARNING, logger="udiagent.vis_generate"):
        out = vg._execute_generate(skill=None, context=_context())

    assert out["generation_failed"]["reason"] == FALLBACK_UNKNOWN_TOOL
    assert any("vis_999_not_a_tool" in r.getMessage() for r in caplog.records)


# --- bindings that never validate -------------------------------------------


def _first_line_item_tool():
    _defs, dispatch, _templates, tags = vg._load_generated_tools()
    return next(n for n in dispatch if "line_item" in tags.get(n, []))


def test_validation_failure_retries_twice_then_gives_up(monkeypatch, caplog):
    """Three attempts, not two. A rejected binding is usually one argument out of
    fifteen and the error says which, so the extra correction is cheap next to
    what used to follow the third failure."""
    tool = _first_line_item_tool()
    bad = {"entity": "no_such_table"}
    seen = _stub_tool_call(monkeypatch, [(tool, bad), (tool, bad), (tool, bad)])

    with caplog.at_level(logging.INFO, logger="udiagent.vis_generate"):
        out = vg._execute_generate(skill=None, context=_context())

    assert len(seen) == 3
    assert out["generation_failed"]["reason"] == FALLBACK_VALIDATION_FAILED
    assert out["generation_failed"]["errors"], "the reason the reader is shown"
    assert out["generation_failed"]["tool"] == tool
    # Every rejection is logged, so a systematic template bug shows up as the
    # same string repeating across requests.
    assert sum("binding validation failed" in r.getMessage() for r in caplog.records) == 3


def test_the_retry_replays_the_call_as_a_real_tool_turn():
    """Not a prose recap. The model can correct one argument among fifteen when
    it sees them as arguments; a paraphrase reads as a fresh instruction."""
    turns = _retry_turns([("vis_001_bar", {"entity": "penguins"}, ["boom"])])

    assistant, tool_result, instruction = turns
    assert assistant["role"] == "assistant"
    assert assistant["content"] is None
    call = assistant["tool_calls"][0]
    assert call["function"]["name"] == "vis_001_bar"
    assert json.loads(call["function"]["arguments"]) == {"entity": "penguins"}

    assert tool_result["role"] == "tool"
    assert tool_result["tool_call_id"] == call["id"]
    assert "boom" in tool_result["content"]
    assert instruction["role"] == "user"


def test_the_retry_replays_every_rejection_not_just_the_newest():
    """The cycle this breaks, straight from a real session: the model chose
    `related`, was told it was wrong, chose `baseline`, was told that was wrong,
    and — with only the newest error in view — went back to `related`. Both
    failures have to stay on the table for it to look for a third option."""
    turns = _retry_turns(
        [
            ("vis_057_related", {"entity2_field": "research_id"}, ["too many values"]),
            ("vis_053_baseline", {"entity1_field4": "gender"}, ["not found on Event"]),
        ]
    )

    called = [
        t["tool_calls"][0]["function"]["name"] for t in turns if t["role"] == "assistant"
    ]
    assert called == ["vis_057_related", "vis_053_baseline"]
    said = " ".join(t["content"] for t in turns if t["role"] == "tool")
    assert "too many values" in said and "not found on Event" in said
    # And it is told not to go round again.
    assert "already been rejected" in turns[-1]["content"]


# --- what the reader gets ----------------------------------------------------


def test_a_failure_becomes_an_explanation_not_an_empty_chart(monkeypatch):
    monkeypatch.setattr(
        vg,
        "generate_vis_spec",
        lambda **kw: {
            "spec": "{}",
            "valid": False,
            "errors": [],
            "corrections": 0,
            "failure": {
                "reason": FALLBACK_VALIDATION_FAILED,
                "tool": "vis_052_line_survival",
                "errors": ["Value 'Alive' does not appear in column 'vital_status'."],
            },
            "meta": {"fallback_reason": FALLBACK_VALIDATION_FAILED},
        },
    )
    call = function_call_render_visualization(
        agent=object(), messages=[], data_schema=_SCHEMA, grammar={}
    )

    assert call["name"] == "FreeTextExplain"
    text = "\n".join(call["arguments"]["text"])
    assert "could not build" in text
    # The validation errors are already written for a reader — they name the
    # column and its valid values — so they are passed through, not summarised.
    assert "vital_status" in text
    assert call["meta"]["fallback_reason"] == FALLBACK_VALIDATION_FAILED


def test_a_success_still_renders(monkeypatch):
    monkeypatch.setattr(
        vg,
        "generate_vis_spec",
        lambda **kw: {
            "spec": '{"source": []}',
            "valid": True,
            "errors": [],
            "corrections": 0,
            "failure": None,
            "meta": {"fallback_reason": None},
        },
    )
    call = function_call_render_visualization(
        agent=object(), messages=[], data_schema=_SCHEMA, grammar={}
    )
    assert call["name"] == "RenderVisualization"


# --- selection ---------------------------------------------------------------


def test_a_template_needing_more_tables_than_exist_is_not_offered():
    """Not a guess at relevance: a three-table join cannot bind a one-table
    package under any arguments, so offering it is only a way to go wrong."""
    defs, _dispatch, _templates, tags = vg._load_generated_tools()
    one_table = {"entities": {"penguins": {}}}

    offered = _select_tools(defs, tags, {"line_item"}, one_table)
    names = {d["function"]["name"] for d in offered}

    assert names, "something must still be offered"
    assert all(vg._tool_entity_arity(d) <= 1 for d in offered)
    # The survival templates all join at least a censoring table.
    assert not any("survival" in n for n in names)

    # With three tables they come back.
    three = {"entities": {"Event": {}, "Demographics": {}, "Patient": {}}}
    wider = {d["function"]["name"] for d in _select_tools(defs, tags, {"line_item"}, three)}
    assert any("survival" in n for n in wider)


def test_selection_never_returns_nothing():
    """A schema that excludes everything must fall back to offering the set
    rather than leaving the model with no tools at all."""
    defs, _dispatch, _templates, tags = vg._load_generated_tools()
    assert _select_tools(defs, tags, {"line_item"}, {"entities": {}})
    assert _select_tools(defs, tags, set(), None)


# --- the happy path stays quiet ---------------------------------------------


def test_a_successful_binding_logs_no_warning(monkeypatch, caplog):
    _defs, dispatch, _templates, tags = vg._load_generated_tools()
    tool = next(
        n
        for n, (_i, pm) in dispatch.items()
        if "line_item" in tags.get(n, []) and set(pm) == {"entity", "field"}
    )
    _stub_tool_call(monkeypatch, [(tool, {"entity": "penguins", "field": "species"})])

    with caplog.at_level(logging.INFO, logger="udiagent.vis_generate"):
        out = vg._execute_generate(skill=None, context=_context())

    assert out["tool_used"] == tool
    assert out.get("generation_failed") is None
    assert out.get("fallback_reason") is None
    assert not [r for r in caplog.records if r.levelno >= logging.WARNING]
    # Three INFO lines: tools offered, tool chosen, template instantiated.
    assert len([r for r in caplog.records if r.levelno == logging.INFO]) == 3
    assert all("[vis testreq1]" in r.getMessage() for r in caplog.records)


def test_a_broken_agent_returns_a_failure_rather_than_raising(caplog):
    """The whole public API over an agent that cannot make a call at all.

    Three things at once, and all three used to be absent: the traceback is
    logged rather than swallowed, no exception escapes to the orchestrator, and
    `meta` carries both the reason and a `vis_req_id` that greps straight to
    these log lines.
    """
    from udiagent.vis_generate import generate_vis_spec

    with caplog.at_level(logging.INFO, logger="udiagent.vis_generate"):
        result = generate_vis_spec(
            agent=None, messages=[], data_schema=_SCHEMA, grammar={}
        )

    assert result["failure"]["reason"] == FALLBACK_NO_TOOL_CALL
    req_id = result["meta"]["vis_req_id"]
    assert req_id and len(req_id) == 8
    assert result["meta"]["fallback_reason"] == FALLBACK_NO_TOOL_CALL

    # The swallowed traceback, now visible, and tied to this request.
    failed = [r for r in caplog.records if r.levelno >= logging.ERROR]
    assert failed and failed[0].exc_info, "the exception must reach the log"
    assert all(f"[vis {req_id}]" in r.getMessage() for r in caplog.records)


def test_the_prompt_steers_a_named_value_toward_a_grouping_tool(monkeypatch):
    """Asked to split by "whether the patient received methotrexate", the model
    reached for a presence tool — which, for a table holding one row per drug
    given, answers "had any chemotherapy". The rule points at the `grouping`
    argument rather than at a tool name, so it survives templates being added
    and renamed; this pins that it reaches the prompt at all.
    """
    seen = _stub_tool_call(monkeypatch, [None])
    vg._execute_generate(skill=None, context=_context())

    system = seen[0][0]["content"]
    assert "Naming particular values" in system
    assert "`grouping` argument" in system
    # And it says what goes wrong, not just what to do.
    assert "had any treatment" in system
