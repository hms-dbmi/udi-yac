"""Tests for token usage accumulation and budget-check rebuff behavior."""

from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest
import openai

from udiagent.agent import UDIAgent
from udiagent.orchestrator import (
    BudgetExceededError,
    Orchestrator,
    Usage,
    build_rebuff_toolcall,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _fake_completion(
    *, tool_calls=None, content=None, prompt=10, completion=5, total=15
):
    """Build an object that quacks like an OpenAI ChatCompletion response."""
    message = SimpleNamespace(
        tool_calls=tool_calls,
        content=content,
    )
    return SimpleNamespace(
        choices=[SimpleNamespace(message=message)],
        usage=SimpleNamespace(
            prompt_tokens=prompt,
            completion_tokens=completion,
            total_tokens=total,
        ),
    )


def _fake_tool_call(name: str, arguments: str):
    """Build an object that quacks like an OpenAI tool_call."""
    return SimpleNamespace(
        function=SimpleNamespace(name=name, arguments=arguments),
    )


def _make_orchestrator():
    agent = UDIAgent.__new__(UDIAgent)
    agent.gpt_model = MagicMock(name="default_gpt_model")
    agent.gpt_model_name = "gpt-test"
    # Bypass skills/grammar loading — the tests stub the full LLM call chain.
    orch = Orchestrator.__new__(Orchestrator)
    orch.agent = agent
    orch.skills = {"orchestrate": SimpleNamespace(instructions="{{data_domains}}")}
    orch.tools = [
        {
            "type": "function",
            "function": {"name": "Rebuff", "description": "refuse"},
        },
        {
            "type": "function",
            "function": {"name": "CreateVisualization", "description": "viz"},
        },
    ]
    orch.grammar = {}
    return orch, agent


# ---------------------------------------------------------------------------
# Usage dataclass
# ---------------------------------------------------------------------------


class TestUsage:
    def test_add_accumulates(self):
        u = Usage()
        u.add(
            "orchestrate",
            SimpleNamespace(prompt_tokens=3, completion_tokens=4, total_tokens=7),
        )
        u.add(
            "rebuff",
            SimpleNamespace(prompt_tokens=1, completion_tokens=2, total_tokens=3),
        )
        assert u.prompt_tokens == 4
        assert u.completion_tokens == 6
        assert u.total_tokens == 10
        assert [op["op"] for op in u.operations] == ["orchestrate", "rebuff"]

    def test_add_handles_none(self):
        u = Usage()
        u.add("orchestrate", None)
        assert u.total_tokens == 0
        assert u.operations == []

    def test_add_handles_partial_usage(self):
        """Missing total_tokens should be derived from prompt + completion."""
        u = Usage()
        u.add(
            "orchestrate",
            SimpleNamespace(prompt_tokens=3, completion_tokens=4),  # no total_tokens
        )
        assert u.total_tokens == 7


# ---------------------------------------------------------------------------
# build_rebuff_toolcall
# ---------------------------------------------------------------------------


class TestBuildRebuffToolcall:
    def test_default_omits_reason_key(self):
        """Ordinary rebuffs should not emit ``reason`` at all (not even as
        ``None``) so existing consumers keep seeing an unchanged payload."""
        tc = build_rebuff_toolcall("no can do")
        assert tc == {
            "name": "Rebuff",
            "arguments": {"message": "no can do", "suggestions": []},
        }
        assert "reason" not in tc["arguments"]

    def test_reason_kwarg_included(self):
        tc = build_rebuff_toolcall("out of quota", reason="budget_exceeded")
        assert tc["arguments"]["reason"] == "budget_exceeded"
        assert tc["arguments"]["message"] == "out of quota"

    def test_reason_is_keyword_only(self):
        """Defensive — positional use would silently land in ``suggestions``."""
        with pytest.raises(TypeError):
            build_rebuff_toolcall("msg", None, "budget_exceeded")  # type: ignore[misc]


# ---------------------------------------------------------------------------
# Budget check — short-circuit paths
# ---------------------------------------------------------------------------


class TestBudgetCheck:
    def test_preflight_rebuff_makes_no_llm_calls(self):
        orch, agent = _make_orchestrator()
        create_mock = MagicMock()
        agent.gpt_model.chat.completions.create = create_mock

        result = orch.run(
            messages=[{"role": "user", "content": "hi"}],
            data_schema="{}",
            data_domains="{}",
            budget_check=lambda u: "Out of quota.",
        )

        assert create_mock.call_count == 0
        assert result.orchestrator_choice == "rebuff"
        assert len(result.tool_calls) == 1
        assert result.tool_calls[0]["name"] == "Rebuff"
        assert result.tool_calls[0]["arguments"]["message"] == "Out of quota."
        assert result.usage.total_tokens == 0

    def test_post_orchestrate_rebuff_fires_once(self):
        """First budget_check returns None, second returns a message."""
        orch, agent = _make_orchestrator()
        tc = _fake_tool_call(
            "CreateVisualization", '{"description": "bar chart"}'
        )
        create_mock = MagicMock(
            return_value=_fake_completion(
                tool_calls=[tc], prompt=20, completion=10, total=30
            )
        )
        agent.gpt_model.chat.completions.create = create_mock

        calls = []

        def check(usage):
            calls.append(usage.total_tokens)
            return None if len(calls) == 1 else "Used up after orchestrate."

        result = orch.run(
            messages=[{"role": "user", "content": "hi"}],
            data_schema="{}",
            data_domains="{}",
            budget_check=check,
        )

        assert create_mock.call_count == 1  # only orchestrate, no viz dispatch
        assert result.orchestrator_choice == "rebuff"
        assert result.tool_calls == [build_rebuff_toolcall("Used up after orchestrate.")]
        assert result.usage.total_tokens == 30  # orchestrate usage preserved
        assert calls == [0, 30]


# ---------------------------------------------------------------------------
# Rate-limit → BudgetExceededError
# ---------------------------------------------------------------------------


def _make_rate_limit_error():
    """openai.RateLimitError requires a Response-like object in newer SDKs."""
    try:
        return openai.RateLimitError(
            message="rate limited",
            response=SimpleNamespace(
                request=SimpleNamespace(), status_code=429, headers={}
            ),
            body=None,
        )
    except TypeError:
        # Older SDK signature
        return openai.RateLimitError("rate limited")


class TestRateLimit:
    def test_rate_limit_with_budget_check_returns_rebuff(self):
        orch, agent = _make_orchestrator()
        agent.gpt_model.chat.completions.create = MagicMock(
            side_effect=_make_rate_limit_error()
        )

        result = orch.run(
            messages=[{"role": "user", "content": "hi"}],
            data_schema="{}",
            data_domains="{}",
            budget_check=lambda u: None,  # passes pre-flight
        )

        assert result.orchestrator_choice == "rebuff"
        assert result.tool_calls[0]["name"] == "Rebuff"

    def test_rate_limit_without_budget_check_propagates(self):
        orch, agent = _make_orchestrator()
        agent.gpt_model.chat.completions.create = MagicMock(
            side_effect=_make_rate_limit_error()
        )

        with pytest.raises(BudgetExceededError):
            orch.run(
                messages=[{"role": "user", "content": "hi"}],
                data_schema="{}",
                data_domains="{}",
            )


# ---------------------------------------------------------------------------
# Server endpoint integration
# ---------------------------------------------------------------------------


class TestServerUsage:
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
            server_app.app.state.budget_check = None

    def _body(self):
        return {
            "messages": [{"role": "user", "content": "hi"}],
            "dataSchema": "{}",
            "dataDomains": "{}",
        }

    def test_completions_emits_usage_headers(self):
        from udiagent.orchestrator import OrchestratorResult

        usage = Usage(prompt_tokens=11, completion_tokens=22, total_tokens=33)
        with patch.object(
            self.server_app.orchestrator,
            "run",
            return_value=OrchestratorResult(
                tool_calls=[{"name": "RenderVisualization", "arguments": {"spec": {}}}],
                orchestrator_choice="render-visualization",
                usage=usage,
            ),
        ):
            resp = self.client.post(
                "/v1/yac/completions",
                json=self._body(),
                headers={"Authorization": "Bearer test"},
            )
        assert resp.status_code == 200
        assert resp.headers["X-Usage-Prompt-Tokens"] == "11"
        assert resp.headers["X-Usage-Completion-Tokens"] == "22"
        assert resp.headers["X-Usage-Total-Tokens"] == "33"
        assert resp.headers["X-Usage-Model"] == "gpt-test"
        # Body shape unchanged: bare list of tool_calls.
        body = resp.json()
        assert isinstance(body, list)
        assert body[0]["name"] == "RenderVisualization"

    def test_completions_budget_rebuff_returns_200(self):
        """Hooking app.state.budget_check produces a Rebuff body + usage headers."""
        self.server_app.app.state.budget_check = lambda u: "Quota exceeded."

        # Stub orchestrator.run to honor the budget_check passed in.
        def fake_run(**kwargs):
            msg = kwargs["budget_check"](Usage()) if kwargs.get("budget_check") else None
            from udiagent.orchestrator import OrchestratorResult

            if msg:
                return OrchestratorResult(
                    tool_calls=[build_rebuff_toolcall(msg)],
                    orchestrator_choice="rebuff",
                    usage=Usage(),
                )
            return OrchestratorResult(tool_calls=[], usage=Usage())

        with patch.object(self.server_app.orchestrator, "run", side_effect=fake_run):
            resp = self.client.post(
                "/v1/yac/completions",
                json=self._body(),
                headers={"Authorization": "Bearer test"},
            )

        assert resp.status_code == 200
        body = resp.json()
        assert body == [build_rebuff_toolcall("Quota exceeded.")]
        assert resp.headers["X-Usage-Total-Tokens"] == "0"

    def test_completions_budget_skipped_when_user_brings_key(self):
        """When X-OpenAI-Key is present, budget_check is not passed."""
        self.server_app.app.state.budget_check = lambda u: "should not fire"

        with patch.object(
            self.server_app.orchestrator,
            "run",
            return_value=MagicMock(
                tool_calls=[], orchestrator_choice="render-visualization", usage=Usage()
            ),
        ) as mock_run:
            self.client.post(
                "/v1/yac/completions",
                json=self._body(),
                headers={
                    "Authorization": "Bearer test",
                    "X-OpenAI-Key": "sk-user-key",
                },
            )
        assert mock_run.call_args.kwargs.get("budget_check") is None

    def test_budget_exceeded_handler_returns_rebuff(self):
        """A raised BudgetExceededError is mapped to HTTP 200 + Rebuff body
        tagged with ``reason="budget_exceeded"`` so the frontend can prompt
        the user for their own API key."""
        err_usage = Usage(prompt_tokens=5, completion_tokens=0, total_tokens=5)
        self.server_app.app.state.budget_check = None

        with patch.object(
            self.server_app.orchestrator,
            "run",
            side_effect=BudgetExceededError("Out of tokens.", err_usage),
        ):
            resp = self.client.post(
                "/v1/yac/completions",
                json=self._body(),
                headers={"Authorization": "Bearer test"},
            )

        assert resp.status_code == 200
        assert resp.json() == [
            build_rebuff_toolcall("Out of tokens.", reason="budget_exceeded")
        ]
        assert resp.json()[0]["arguments"]["reason"] == "budget_exceeded"
        assert resp.headers["X-Usage-Total-Tokens"] == "5"

    def test_benchmark_includes_usage_in_body(self):
        from udiagent.orchestrator import OrchestratorResult

        usage = Usage(prompt_tokens=1, completion_tokens=2, total_tokens=3)
        usage.operations.append(
            {"op": "orchestrate", "prompt_tokens": 1, "completion_tokens": 2, "total_tokens": 3}
        )
        with patch.object(
            self.server_app.orchestrator,
            "run",
            return_value=OrchestratorResult(
                tool_calls=[],
                orchestrator_choice="render-visualization",
                usage=usage,
            ),
        ):
            resp = self.client.post(
                "/v1/yac/benchmark",
                json=self._body(),
                headers={"Authorization": "Bearer test"},
            )
        assert resp.status_code == 200
        body = resp.json()
        assert body["usage"]["total_tokens"] == 3
        assert body["usage"]["operations"][0]["op"] == "orchestrate"
