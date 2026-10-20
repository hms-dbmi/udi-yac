"""Tests for request shaping: API path, reasoning effort, temperature, output cap."""

import json
from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest

from udiagent.agent import UDIAgent
from udiagent.orchestrator import Usage, _call_with_budget_guard


def _agent(**settings):
    """A UDIAgent with no model connection, carrying the given request settings."""
    agent = UDIAgent.__new__(UDIAgent)
    for name, value in settings.items():
        setattr(agent, name, value)
    return agent


TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "CreateVisualization",
            "description": "make a chart",
            "parameters": {"type": "object", "properties": {}},
        },
    }
]

# System, user, an assistant turn that called a tool, and that tool's result:
# every message shape the orchestrator and the vis retries send.
MESSAGES = [
    {"role": "system", "content": "be helpful"},
    {"role": "user", "content": "show donors"},
    {
        "role": "assistant",
        "content": None,
        "tool_calls": [
            {
                "id": "call_retry_0_ab12cd",
                "type": "function",
                "function": {"name": "LookupFieldValues", "arguments": '{"field": "sex"}'},
            }
        ],
    },
    {"role": "tool", "tool_call_id": "call_retry_0_ab12cd", "content": "male, female"},
]


def _responses_result(*, output, output_text="", incomplete=None, usage=None):
    """Something that quacks like an openai ``Response``."""
    return SimpleNamespace(
        model="gpt-6.1-sol",
        output=output,
        output_text=output_text,
        incomplete_details=SimpleNamespace(reason=incomplete) if incomplete else None,
        usage=usage,
    )


class TestChatCompletionsPath:
    def test_defaults_send_what_earlier_releases_sent(self):
        client = MagicMock()
        _agent().create_completion(
            client, model="m", messages=MESSAGES, max_completion_tokens=1024
        )
        assert client.chat.completions.create.call_args.kwargs == {
            "model": "m",
            "messages": MESSAGES,
            "max_completion_tokens": 1024,
            "temperature": 0.0,
        }
        client.responses.create.assert_not_called()

    def test_settings_are_applied(self):
        client = MagicMock()
        _agent(
            temperature=None, reasoning_effort="low", max_completion_tokens=16384
        ).create_completion(client, model="m", messages=[], max_completion_tokens=1024)
        kwargs = client.chat.completions.create.call_args.kwargs
        assert "temperature" not in kwargs
        assert kwargs["reasoning_effort"] == "low"
        assert kwargs["max_completion_tokens"] == 16384

    def test_output_cap_hit_is_logged(self, caplog):
        client = MagicMock()
        client.chat.completions.create.return_value = SimpleNamespace(
            choices=[SimpleNamespace(finish_reason="length")]
        )
        _agent().create_completion(
            client, model="m", messages=[], max_completion_tokens=1024
        )
        assert "output-token cap" in caplog.text


class TestResponsesPath:
    def test_request_is_translated(self):
        client = MagicMock()
        client.responses.create.return_value = _responses_result(output=[])
        _agent(
            openai_api="responses",
            temperature=None,
            reasoning_effort="low",
            max_completion_tokens=16384,
        ).create_completion(
            client,
            model="gpt-6.1-sol",
            messages=MESSAGES,
            tools=TOOLS,
            tool_choice="required",
            max_completion_tokens=1024,
        )
        client.chat.completions.create.assert_not_called()
        assert client.responses.create.call_args.kwargs == {
            "model": "gpt-6.1-sol",
            "input": [
                {"role": "system", "content": "be helpful"},
                {"role": "user", "content": "show donors"},
                {
                    "type": "function_call",
                    "call_id": "call_retry_0_ab12cd",
                    "name": "LookupFieldValues",
                    "arguments": '{"field": "sex"}',
                },
                {
                    "type": "function_call_output",
                    "call_id": "call_retry_0_ab12cd",
                    "output": "male, female",
                },
            ],
            "tools": [
                {
                    "type": "function",
                    "strict": False,
                    "name": "CreateVisualization",
                    "description": "make a chart",
                    "parameters": {"type": "object", "properties": {}},
                }
            ],
            "tool_choice": "required",
            "max_output_tokens": 16384,
            "reasoning": {"effort": "low"},
            "store": False,
        }

    def test_structured_output_is_translated(self):
        client = MagicMock()
        client.responses.create.return_value = _responses_result(
            output=[], output_text='{"a": 1}'
        )
        schema = {"name": "GuidedJSON", "schema": {"type": "object"}, "strict": True}
        resp = _agent(openai_api="responses").create_completion(
            client,
            model="m",
            messages=[{"role": "user", "content": "x"}],
            response_format={"type": "json_schema", "json_schema": schema},
            n=1,
            max_completion_tokens=16384,
        )
        kwargs = client.responses.create.call_args.kwargs
        assert kwargs["text"] == {"format": {"type": "json_schema", **schema}}
        assert kwargs["temperature"] == 0.0
        assert "n" not in kwargs and "response_format" not in kwargs
        assert json.loads(resp.choices[0].message.content) == {"a": 1}

    def test_several_completions_are_refused(self):
        with pytest.raises(ValueError, match="n > 1"):
            _agent(openai_api="responses").create_completion(
                MagicMock(), model="m", messages=[], n=2
            )

    def test_reply_reads_like_a_chat_completion(self):
        client = MagicMock()
        client.responses.create.return_value = _responses_result(
            output=[
                SimpleNamespace(type="reasoning"),
                SimpleNamespace(
                    type="function_call",
                    call_id="call_1",
                    name="CreateVisualization",
                    arguments="{}",
                ),
            ],
            usage=SimpleNamespace(
                input_tokens=2000,
                output_tokens=300,
                total_tokens=2300,
                input_tokens_details=SimpleNamespace(
                    cached_tokens=1024, cache_write_tokens=512
                ),
                output_tokens_details=SimpleNamespace(reasoning_tokens=250),
            ),
        )
        agent = _agent(openai_api="responses")
        usage = Usage()
        resp = _call_with_budget_guard(
            agent.create_completion, usage, client, model="m", messages=[]
        )
        usage.add("orchestrate", resp.usage)

        choice = resp.choices[0]
        assert choice.finish_reason == "tool_calls"
        assert choice.message.content is None
        (call,) = choice.message.tool_calls
        assert (call.id, call.function.name, call.function.arguments) == (
            "call_1",
            "CreateVisualization",
            "{}",
        )
        assert (usage.prompt_tokens, usage.completion_tokens, usage.total_tokens) == (
            2000,
            300,
            2300,
        )
        assert usage.cached_prompt_tokens == 1024
        assert usage.cache_write_tokens == 512
        assert usage.reasoning_tokens == 250
        assert usage.operations[0]["cache_write_tokens"] == 512

    def test_truncated_reply_reports_length(self):
        client = MagicMock()
        client.responses.create.return_value = _responses_result(
            output=[], incomplete="max_output_tokens"
        )
        resp = _agent(openai_api="responses").create_completion(
            client, model="m", messages=[]
        )
        assert resp.choices[0].finish_reason == "length"
        assert resp.choices[0].message.tool_calls is None


class TestConstructor:
    def test_unknown_api_is_refused(self):
        with pytest.raises(ValueError, match="openai_api"):
            UDIAgent(gpt_model_name="m", openai_api="bogus")

    def test_non_positive_cap_is_refused(self):
        with pytest.raises(ValueError, match="max_completion_tokens"):
            UDIAgent(gpt_model_name="m", max_completion_tokens=0)


class TestServerConfig:
    @pytest.fixture(autouse=True)
    def _env(self, monkeypatch):
        monkeypatch.setenv("INSECURE_DEV_MODE", "1")
        for name in (
            "UDI_OPENAI_API",
            "UDI_REASONING_EFFORT",
            "UDI_TEMPERATURE",
            "UDI_MAX_COMPLETION_TOKENS",
        ):
            monkeypatch.delenv(name, raising=False)

    def _config(self):
        from udiagent.server.config import ServerConfig

        return ServerConfig()

    def test_defaults(self):
        cfg = self._config()
        assert cfg.udi_openai_api == "chat_completions"
        assert cfg.udi_reasoning_effort is None
        assert cfg.udi_temperature == 0.0
        assert cfg.udi_max_completion_tokens is None

    @pytest.mark.parametrize(
        ("raw", "parsed"), [("omit", "omit"), ("0.3", 0.3), ("", 0.0), ("  ", 0.0)]
    )
    def test_temperature(self, monkeypatch, raw, parsed):
        monkeypatch.setenv("UDI_TEMPERATURE", raw)
        assert self._config().udi_temperature == parsed

    def test_settings_are_read(self, monkeypatch):
        monkeypatch.setenv("UDI_OPENAI_API", "responses")
        monkeypatch.setenv("UDI_REASONING_EFFORT", "max")
        monkeypatch.setenv("UDI_MAX_COMPLETION_TOKENS", "16384")
        cfg = self._config()
        assert cfg.udi_openai_api == "responses"
        assert cfg.udi_reasoning_effort == "max"
        assert cfg.udi_max_completion_tokens == 16384

    @pytest.mark.parametrize(
        ("name", "value"),
        [
            ("UDI_OPENAI_API", "bogus"),
            ("UDI_MAX_COMPLETION_TOKENS", "0"),
            ("UDI_TEMPERATURE", "warm"),
        ],
    )
    def test_bad_values_are_refused(self, monkeypatch, name, value):
        from pydantic import ValidationError

        monkeypatch.setenv(name, value)
        with pytest.raises(ValidationError):
            self._config()
