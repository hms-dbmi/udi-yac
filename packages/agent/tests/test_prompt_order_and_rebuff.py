"""Per-call prompts end with the per-request parts (#164), and a rebuff is a
short plain-text message (#43).

OpenAI reuses a cached prompt prefix only when it is shared exactly, so the
request, the reason and the current filters go after everything that stays
the same between calls on one dataset.
"""

from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest

from udiagent.orchestrator import Orchestrator, Usage
from udiagent.skills import load_skills, render_template

SKILLS = load_skills()

# skill -> (per-call placeholders, in the order they must close the prompt)
TAILS = {
    "rebuff": ["reason", "user_request"],
    "free_text_explain": ["current_filters", "response_type", "user_request"],
    "filter": ["current_filters", "request"],
}


@pytest.mark.parametrize("name", TAILS)
def test_per_request_parts_close_the_prompt(name):
    instructions = SKILLS[name].instructions
    tail = TAILS[name]
    placeholders = [
        m for m in instructions.split("{{")[1:] if m.split("}}")[0] in tail
    ]
    assert [p.split("}}")[0] for p in placeholders] == tail
    # Nothing but headings between them and after the last one.
    rendered = render_template(
        instructions,
        {k: f"<{k}>" for k in tail}
        | {"data_schema": "S", "data_domains": "D", "available_tools": "T"},
    )
    after_first = rendered[rendered.index(f"<{tail[0]}>") :]
    assert all(
        line.startswith("## ") or line.startswith("<") or not line.strip()
        for line in after_first.splitlines()
    ), after_first
    assert rendered.rstrip().endswith(f"<{tail[-1]}>")


def _orchestrator(content):
    orch = Orchestrator.__new__(Orchestrator)
    orch.skills = SKILLS
    orch.tools = [{"function": {"name": "CreateVisualization", "description": "viz"}}]
    orch.agent = MagicMock(gpt_model_name="gpt-test")
    orch.agent.create_completion.return_value = SimpleNamespace(
        choices=[SimpleNamespace(message=SimpleNamespace(content=content))],
        usage=None,
    )
    return orch


@pytest.mark.parametrize(
    "content, message",
    [
        ("  Maps aren't supported.  ", "Maps aren't supported."),
        (None, "Sorry, I cannot fulfill this request. no maps"),
        ("", "Sorry, I cannot fulfill this request. no maps"),
    ],
)
def test_rebuff_is_the_reply_text(content, message):
    orch = _orchestrator(content)
    tc = orch._handle_rebuff(
        {"user_request": "draw a map", "reason": "no maps"}, [], "{}", "{}", Usage()
    )
    assert tc == {
        "name": "Rebuff",
        "arguments": {"message": message, "suggestions": []},
    }
