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

    def _make_agent(self, use_bedrock: bool = False):
        """Create a UDIAgent without initializing model connections."""
        agent = UDIAgent.__new__(UDIAgent)
        agent.gpt_model = MagicMock(name="default_gpt_model")
        agent.gpt_model_name = "gpt-4.1"
        agent._openai_class = _StubOpenAI
        # Set explicitly rather than defaulted via getattr in the production
        # code: a BYOK guard that no-ops on a missing attribute would fail open.
        agent.use_bedrock = use_bedrock
        return agent

    def test_none_key_returns_default_client(self):
        agent = self._make_agent()
        client = agent._get_gpt_client(None)
        assert client is agent.gpt_model

    def test_custom_key_returns_different_client(self):
        agent = self._make_agent()
        client = agent._get_gpt_client("sk-custom-key")
        assert client is not agent.gpt_model

    def test_custom_key_refused_in_bedrock_mode(self):
        """BYOK must not fall back to api.openai.com when Bedrock is configured."""
        agent = self._make_agent(use_bedrock=True)
        with pytest.raises(ValueError, match="per-request OpenAI keys are refused"):
            agent._get_gpt_client("sk-custom-key")

    def test_bedrock_mode_still_serves_keyless_requests(self):
        agent = self._make_agent(use_bedrock=True)
        assert agent._get_gpt_client(None) is agent.gpt_model


# ---------------------------------------------------------------------------
# OpenAI-compatible backends (openai_base_url)
# ---------------------------------------------------------------------------


class TestCustomBaseUrl:
    def setup_method(self):
        _make_openai_client.cache_clear()

    def _make_agent(self, **kwargs):
        with patch("udiagent.agent.get_openai_class", return_value=_StubOpenAI):
            return UDIAgent(gpt_model_name="local-model", **kwargs)

    def test_base_url_reaches_default_client(self):
        agent = self._make_agent(
            openai_api_key="sk-test", openai_base_url="http://localhost:11434/v1"
        )
        assert agent.gpt_model._init_kwargs == {
            "api_key": "sk-test",
            "base_url": "http://localhost:11434/v1",
        }

    def test_base_url_without_key_still_builds_a_client(self):
        """Self-hosted backends take no key; the agent must not degrade to
        per-request-keys-only, which the server surfaces as a 401."""
        agent = self._make_agent(openai_base_url="http://localhost:11434/v1")
        assert agent.gpt_model is not None
        assert agent.gpt_model._init_kwargs["api_key"]

    def test_no_base_url_keeps_sdk_default(self):
        agent = self._make_agent(openai_api_key="sk-test")
        assert agent.gpt_model._init_kwargs == {"api_key": "sk-test", "base_url": None}

    def test_no_key_and_no_base_url_requires_per_request_keys(self):
        agent = self._make_agent()
        assert agent.gpt_model is None


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


# ---------------------------------------------------------------------------
# Pre-flight credential check (the 401 that precedes orchestration)
# ---------------------------------------------------------------------------


class TestPreflightCredentialCheck:
    @pytest.fixture(autouse=True)
    def setup_app(self):
        with patch.object(UDIAgent, "__init__", lambda self, **kwargs: None):
            import udiagent.server.app as server_app

            mock_agent = UDIAgent.__new__(UDIAgent)
            mock_agent.gpt_model = MagicMock(name="default_gpt_model")
            mock_agent.gpt_model_name = "gpt-4.1"

            server_app.agent = mock_agent
            server_app.orchestrator.agent = mock_agent

            from starlette.testclient import TestClient

            self.client = TestClient(server_app.app)
            self.server_app = server_app
            yield

    def _post(self):
        return self.client.post(
            "/v1/yac/completions",
            json={
                "model": "gpt-4.1",
                "messages": [{"role": "user", "content": "show a bar chart"}],
                "dataSchema": "{}",
                "dataDomains": "{}",
            },
            headers={"Authorization": "Bearer test"},
        )

    def _with_config(self, config):
        """Swap the module-global config the endpoint reads at call time."""
        return patch.object(self.server_app, "config", config)

    def test_bedrock_counts_as_credentialed(self, monkeypatch):
        """UDI_BEDROCK signs with the instance's IAM role — no key needed."""
        from test_bedrock_config import _config

        with self._with_config(_config(udi_bedrock=True)):
            with patch.object(
                self.server_app.orchestrator,
                "run",
                return_value=MagicMock(tool_calls=[], usage=Usage()),
            ) as mock_run:
                response = self._post()
                assert response.status_code != 401
                mock_run.assert_called_once()

    def test_byok_refused_in_bedrock_mode(self):
        """A caller's key must not be served from api.openai.com."""
        from test_bedrock_config import _config

        with self._with_config(_config(udi_bedrock=True)):
            with patch.object(
                self.server_app.orchestrator,
                "run",
                return_value=MagicMock(tool_calls=[], usage=Usage()),
            ) as mock_run:
                response = self.client.post(
                    "/v1/yac/completions",
                    json={
                        "model": "openai.gpt-oss-120b-1:0",
                        "messages": [{"role": "user", "content": "show a bar chart"}],
                        "dataSchema": "{}",
                        "dataDomains": "{}",
                    },
                    headers={
                        "Authorization": "Bearer test",
                        "X-OpenAI-Key": "sk-user-provided",
                    },
                )
                assert response.status_code == 403
                assert "api.openai.com" in response.json()["error"]
                # The refusal must precede orchestration — no prompt goes out.
                mock_run.assert_not_called()

    def test_byok_refused_on_benchmark_endpoint_too(self):
        """Every endpoint taking X-OpenAI-Key must share the guard."""
        from test_bedrock_config import _config

        with self._with_config(_config(udi_bedrock=True)):
            with patch.object(
                self.server_app.orchestrator,
                "run",
                return_value=MagicMock(
                    tool_calls=[], orchestrator_choice=None, usage=Usage()
                ),
            ) as mock_run:
                response = self.client.post(
                    "/v1/yac/benchmark",
                    json={
                        "messages": [{"role": "user", "content": "show a bar chart"}],
                        "dataSchema": "{}",
                        "dataDomains": "{}",
                    },
                    headers={
                        "Authorization": "Bearer test",
                        "X-OpenAI-Key": "sk-user-provided",
                    },
                )
                assert response.status_code == 403
                mock_run.assert_not_called()

    def test_byok_allowed_when_bedrock_is_off(self):
        """Regression guard: BYOK is untouched outside Bedrock mode."""
        from test_bedrock_config import _config

        with self._with_config(_config()):
            with patch.object(
                self.server_app.orchestrator,
                "run",
                return_value=MagicMock(tool_calls=[], usage=Usage()),
            ) as mock_run:
                response = self.client.post(
                    "/v1/yac/completions",
                    json={
                        "model": "gpt-4.1",
                        "messages": [{"role": "user", "content": "show a bar chart"}],
                        "dataSchema": "{}",
                        "dataDomains": "{}",
                    },
                    headers={
                        "Authorization": "Bearer test",
                        "X-OpenAI-Key": "sk-user-provided",
                    },
                )
                assert response.status_code == 200
                mock_run.assert_called_once()

    def test_no_credentials_and_no_header_still_401(self):
        """Regression guard for the pre-existing behavior."""
        from test_bedrock_config import _config

        with self._with_config(_config()):
            with patch.object(
                self.server_app.orchestrator,
                "run",
                return_value=MagicMock(tool_calls=[], usage=Usage()),
            ) as mock_run:
                response = self._post()
                assert response.status_code == 401
                assert "UDI_BEDROCK" in response.json()["error"]
                mock_run.assert_not_called()
