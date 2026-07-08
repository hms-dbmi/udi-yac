"""Tests for X-OpenAI-Key header propagation through the UDIAgent API."""

from unittest.mock import patch, MagicMock
import pytest

from udiagent.agent import UDIAgent, _make_openai_client
from udiagent.orchestrator import Usage


# ---------------------------------------------------------------------------
# Unit tests for _make_openai_client cache
# ---------------------------------------------------------------------------


class _StubOpenAI:
    def __init__(self, **kwargs):
        self._init_kwargs = kwargs


class TestMakeOpenaiClientCache:
    def setup_method(self):
        _make_openai_client.cache_clear()

    def test_same_key_returns_cached_client(self):
        client_a = _make_openai_client("sk-test-key-1", _StubOpenAI)
        client_b = _make_openai_client("sk-test-key-1", _StubOpenAI)
        assert client_a is client_b

    def test_different_keys_return_different_clients(self):
        client_a = _make_openai_client("sk-test-key-1", _StubOpenAI)
        client_b = _make_openai_client("sk-test-key-2", _StubOpenAI)
        assert client_a is not client_b

    def test_different_classes_return_different_clients(self):
        class _OtherOpenAI(_StubOpenAI):
            pass

        client_a = _make_openai_client("sk-test-key-1", _StubOpenAI)
        client_b = _make_openai_client("sk-test-key-1", _OtherOpenAI)
        assert client_a is not client_b


# ---------------------------------------------------------------------------
# Unit tests for UDIAgent._get_gpt_client
# ---------------------------------------------------------------------------


class TestGetGptClient:
    def setup_method(self):
        _make_openai_client.cache_clear()

    def _make_agent(self):
        """Create a UDIAgent without initializing model connections."""
        agent = UDIAgent.__new__(UDIAgent)
        agent.gpt_model = MagicMock(name="default_gpt_model")
        agent.gpt_model_name = "gpt-4.1"
        agent._openai_class = _StubOpenAI
        return agent

    def test_none_key_returns_default_client(self):
        agent = self._make_agent()
        client = agent._get_gpt_client(None)
        assert client is agent.gpt_model

    def test_custom_key_returns_different_client(self):
        agent = self._make_agent()
        client = agent._get_gpt_client("sk-custom-key")
        assert client is not agent.gpt_model


# ---------------------------------------------------------------------------
# Integration tests for API header extraction (new server app)
# ---------------------------------------------------------------------------


class TestApiHeaderExtraction:
    @pytest.fixture(autouse=True)
    def setup_app(self):
        """Patch UDIAgent to avoid real model initialization, then import the server app."""
        with patch.object(UDIAgent, "__init__", lambda self, **kwargs: None):
            import udiagent.server.app as server_app

            # Set required attributes on the agent
            mock_agent = UDIAgent.__new__(UDIAgent)
            mock_agent.gpt_model = MagicMock(name="default_gpt_model")
            mock_agent.gpt_model_name = "gpt-4.1"

            server_app.agent = mock_agent
            server_app.orchestrator.agent = mock_agent

            from starlette.testclient import TestClient

            self.client = TestClient(server_app.app)
            self.server_app = server_app
            yield

    def _make_request_body(self):
        return {
            "model": "gpt-4.1",
            "messages": [{"role": "user", "content": "show a bar chart"}],
            "dataSchema": "{}",
            "dataDomains": "{}",
        }

    def test_header_propagated_to_orchestrator(self):
        """When X-OpenAI-Key is sent, it should reach the orchestrator.run() call."""
        with patch.object(
            self.server_app.orchestrator,
            "run",
            return_value=MagicMock(
                tool_calls=[{"name": "RenderVisualization", "arguments": {"spec": {}}}],
                usage=Usage(),
            ),
        ) as mock_run:
            self.client.post(
                "/v1/yac/completions",
                json=self._make_request_body(),
                headers={
                    "Authorization": "Bearer test",
                    "X-OpenAI-Key": "sk-user-provided",
                },
            )
            mock_run.assert_called_once()
            assert mock_run.call_args.kwargs.get("openai_api_key") == "sk-user-provided"

    def test_no_header_passes_none(self):
        """When X-OpenAI-Key is absent, openai_api_key should be None."""
        with patch.object(
            self.server_app.orchestrator,
            "run",
            return_value=MagicMock(tool_calls=[], usage=Usage()),
        ) as mock_run:
            self.client.post(
                "/v1/yac/completions",
                json=self._make_request_body(),
                headers={"Authorization": "Bearer test"},
            )
            mock_run.assert_called_once()
            assert mock_run.call_args.kwargs.get("openai_api_key") is None
