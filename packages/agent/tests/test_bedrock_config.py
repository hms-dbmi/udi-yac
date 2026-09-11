"""Tests for opt-in Amazon Bedrock (SigV4) configuration on UDIAgent.

Note: ``conftest.py`` sets ``OPENAI_API_KEY=test-default-key`` process-wide, so
every ``ServerConfig.from_env()`` test that enables Bedrock must delete it first
or ``__post_init__``'s mutual-exclusion check fires.
"""

import sys
from unittest.mock import patch

import pytest

from udiagent._compat import make_bedrock_provider
from udiagent.agent import UDIAgent, _make_openai_client
from pydantic import ValidationError

from udiagent.server.config import ServerConfig


class _StubOpenAI:
    def __init__(self, **kwargs):
        self._init_kwargs = kwargs


_SENTINEL = object()


def _config(**overrides):
    """Build a ServerConfig with every relevant field passed explicitly.

    ServerConfig is a BaseSettings, so a bare ``ServerConfig()`` reads the
    ambient environment — including the ``OPENAI_API_KEY`` conftest sets
    process-wide. Passing a base keeps these assertions about the arguments
    under test rather than about the developer's shell.
    """
    base = dict(
        insecure_dev_mode=True,
        openai_api_key=None,
        openai_base_url=None,
        udi_bedrock=False,
        aws_region=None,
    )
    return ServerConfig(**{**base, **overrides})


def _make_agent(**kwargs):
    """Build an agent with both the client class and the provider factory stubbed."""
    with (
        patch("udiagent.agent.get_openai_class", return_value=_StubOpenAI),
        patch(
            "udiagent.agent.make_bedrock_provider", return_value=_SENTINEL
        ) as mock_factory,
    ):
        agent = UDIAgent(gpt_model_name="openai.gpt-oss-120b-1:0", **kwargs)
    return agent, mock_factory


class TestMakeBedrockProvider:
    def test_returns_a_provider_handle(self):
        provider = make_bedrock_provider(region="us-east-1")
        assert provider is not None

    def test_missing_aws_deps_raise_with_install_hint(self):
        original = sys.modules.pop("botocore.auth", None)
        sys.modules["botocore.auth"] = None  # forces ImportError on import
        try:
            with pytest.raises(ImportError, match="udiagent\\[bedrock\\]"):
                make_bedrock_provider(region="us-east-1")
        finally:
            if original is not None:
                sys.modules["botocore.auth"] = original
            else:
                sys.modules.pop("botocore.auth", None)


class TestUDIAgentBedrockOptIn:
    def test_default_builds_no_provider(self):
        agent, mock_factory = _make_agent(openai_api_key="sk-test")
        assert agent.use_bedrock is False
        assert agent._bedrock_provider is None
        mock_factory.assert_not_called()

    def test_flag_builds_provider_only_client(self):
        agent, mock_factory = _make_agent(bedrock=True)
        assert agent.use_bedrock is True
        # provider= is mutually exclusive with api_key/base_url in the SDK.
        assert agent.gpt_model._init_kwargs == {"provider": _SENTINEL}
        mock_factory.assert_called_once_with(region=None)

    def test_region_alone_activates(self):
        agent, mock_factory = _make_agent(bedrock_region="us-west-2")
        assert agent.use_bedrock is True
        assert agent.gpt_model._init_kwargs == {"provider": _SENTINEL}
        mock_factory.assert_called_once_with(region="us-west-2")

    def test_bedrock_with_api_key_raises(self):
        with pytest.raises(ValueError, match="cannot be combined"):
            _make_agent(bedrock=True, openai_api_key="sk-test")

    def test_bedrock_with_base_url_raises(self):
        with pytest.raises(ValueError, match="cannot be combined"):
            _make_agent(bedrock=True, openai_base_url="http://localhost:11434/v1")

    def test_byok_is_refused(self):
        """Serving a per-request key would send the prompt to api.openai.com."""
        _make_openai_client.cache_clear()
        agent, _ = _make_agent(bedrock=True)
        with pytest.raises(ValueError, match="per-request OpenAI keys are refused"):
            agent._get_gpt_client("sk-user-provided")

    def test_keyless_requests_use_the_bedrock_client(self):
        agent, _ = _make_agent(bedrock=True)
        assert agent._get_gpt_client(None) is agent.gpt_model

    def test_langfuse_class_also_receives_provider(self):
        from langfuse.openai import OpenAI as LangfuseOpenAI

        with (
            patch("langfuse.Langfuse"),
            patch("udiagent.agent.make_bedrock_provider", return_value=_SENTINEL),
        ):
            agent = UDIAgent(
                gpt_model_name="openai.gpt-oss-120b-1:0",
                bedrock=True,
                langfuse_public_key="pk-lf-test",
            )
        assert agent._openai_class is LangfuseOpenAI
        assert agent.gpt_model._init_kwargs == {"provider": _SENTINEL}


class TestRealOpenAIClientAcceptsProvider:
    """Locks the upstream SDK contract this design rests on. No network."""

    def test_provider_only_client_constructs(self):
        from openai import OpenAI

        client = OpenAI(provider=make_bedrock_provider(region="us-east-1"))
        assert str(client.base_url).startswith(
            "https://bedrock-mantle.us-east-1.api.aws"
        )
        # SigV4 signs per-request; there is no key on the client.
        assert client.api_key == ""

    def test_provider_plus_api_key_raises(self):
        from openai import OpenAI, OpenAIError

        with pytest.raises(OpenAIError):
            OpenAI(
                provider=make_bedrock_provider(region="us-east-1"), api_key="sk-test"
            )

    @staticmethod
    def _auth_header_for(provider) -> str:
        """Return the Authorization header the SDK sends for *provider*.

        Uses a mock transport, so nothing leaves the process.
        """
        import httpx
        from openai import OpenAI

        captured = {}

        def handler(request: httpx.Request) -> httpx.Response:
            captured["auth"] = request.headers.get("authorization", "")
            return httpx.Response(
                200,
                json={
                    "id": "x",
                    "object": "chat.completion",
                    "created": 0,
                    "model": "m",
                    "choices": [
                        {
                            "index": 0,
                            "message": {"role": "assistant", "content": "hi"},
                            "finish_reason": "stop",
                        }
                    ],
                },
            )

        client = OpenAI(
            provider=provider,
            http_client=httpx.Client(transport=httpx.MockTransport(handler)),
        )
        client.chat.completions.create(
            model="m", messages=[{"role": "user", "content": "hi"}]
        )
        return captured["auth"]

    @pytest.fixture
    def fake_aws_env(self, monkeypatch):
        """Static credentials so SigV4 can sign without hitting IMDS."""
        monkeypatch.setenv("AWS_ACCESS_KEY_ID", "AKIAFAKE")
        monkeypatch.setenv("AWS_SECRET_ACCESS_KEY", "fake-secret")
        monkeypatch.delenv("AWS_PROFILE", raising=False)

    def test_environment_bearer_token_is_ignored(self, monkeypatch, fake_aws_env):
        """Guards the explicit api_key=None in make_bedrock_provider.

        Without it the SDK silently swaps SigV4 for bearer auth whenever
        AWS_BEARER_TOKEN_BEDROCK happens to be set in the environment.
        """
        monkeypatch.setenv("AWS_BEARER_TOKEN_BEDROCK", "leaked-bearer-token")
        auth = self._auth_header_for(make_bedrock_provider(region="us-east-1"))
        assert auth.startswith("AWS4-HMAC-SHA256")
        assert "leaked-bearer-token" not in auth

    def test_bearer_env_var_would_otherwise_win(self, monkeypatch, fake_aws_env):
        """Negative control: proves the assertion above actually discriminates."""
        from openai.providers import bedrock

        monkeypatch.setenv("AWS_BEARER_TOKEN_BEDROCK", "leaked-bearer-token")
        # Same call, but without our api_key=None suppression.
        auth = self._auth_header_for(bedrock(region="us-east-1"))
        assert auth == "Bearer leaked-bearer-token"


class TestServerConfigBedrock:
    @pytest.fixture(autouse=True)
    def clear_openai_env(self, monkeypatch):
        """conftest sets OPENAI_API_KEY globally; Bedrock mode rejects it."""
        monkeypatch.delenv("OPENAI_API_KEY", raising=False)
        monkeypatch.delenv("OPENAI_BASE_URL", raising=False)
        monkeypatch.delenv("AWS_REGION", raising=False)
        monkeypatch.delenv("AWS_DEFAULT_REGION", raising=False)

    def test_unset_yields_disabled(self, monkeypatch):
        monkeypatch.delenv("UDI_BEDROCK", raising=False)
        config = ServerConfig.from_env()
        assert config.udi_bedrock is False
        assert config.aws_region is None

    @pytest.mark.parametrize("value", ["1", "true", "TRUE", "yes", "on"])
    def test_truthy_spellings_enable(self, monkeypatch, value):
        monkeypatch.setenv("UDI_BEDROCK", value)
        assert ServerConfig.from_env().udi_bedrock is True

    @pytest.mark.parametrize("value", ["0", "false", "no", "", "  "])
    def test_falsy_spellings_stay_disabled(self, monkeypatch, value):
        monkeypatch.setenv("UDI_BEDROCK", value)
        assert ServerConfig.from_env().udi_bedrock is False

    def test_reads_aws_region(self, monkeypatch):
        monkeypatch.setenv("UDI_BEDROCK", "1")
        monkeypatch.setenv("AWS_REGION", "us-east-1")
        assert ServerConfig.from_env().aws_region == "us-east-1"

    def test_falls_back_to_aws_default_region(self, monkeypatch):
        monkeypatch.setenv("UDI_BEDROCK", "1")
        monkeypatch.setenv("AWS_DEFAULT_REGION", "eu-west-1")
        assert ServerConfig.from_env().aws_region == "eu-west-1"

    def test_bedrock_with_openai_api_key_raises(self, monkeypatch):
        monkeypatch.setenv("UDI_BEDROCK", "1")
        monkeypatch.setenv("OPENAI_API_KEY", "sk-test")
        with pytest.raises(ValidationError, match="mutually exclusive"):
            ServerConfig.from_env()

    def test_bedrock_with_openai_base_url_raises(self, monkeypatch):
        monkeypatch.setenv("UDI_BEDROCK", "1")
        monkeypatch.setenv("OPENAI_BASE_URL", "http://localhost:11434/v1")
        with pytest.raises(ValidationError, match="mutually exclusive"):
            ServerConfig.from_env()

    @pytest.mark.parametrize(
        "kwargs,expected",
        [
            ({}, False),
            ({"openai_api_key": "sk-test"}, True),
            ({"openai_base_url": "http://localhost:11434/v1"}, True),
            ({"udi_bedrock": True}, True),
        ],
    )
    def test_has_server_credentials(self, kwargs, expected):
        assert _config(**kwargs).has_server_credentials is expected


class TestCredentialFailureResponse:
    """The LLM backend being unusable must not surface as a bare 500.

    AWS credentials are resolved per request, so a missing instance profile or
    an unreachable IMDS fails at request time rather than at startup.
    """

    @pytest.fixture(autouse=True)
    def setup_app(self):
        with patch.object(UDIAgent, "__init__", lambda self, **kwargs: None):
            import udiagent.server.app as server_app

            mock_agent = UDIAgent.__new__(UDIAgent)
            mock_agent.gpt_model = None
            mock_agent.gpt_model_name = "openai.gpt-oss-120b-1:0"
            server_app.agent = mock_agent
            server_app.orchestrator.agent = mock_agent
            self.server_app = server_app
            yield

    def _client(self, raise_server_exceptions=True):
        from starlette.testclient import TestClient

        return TestClient(
            self.server_app.app, raise_server_exceptions=raise_server_exceptions
        )

    def _post(self, client):
        return client.post(
            "/v1/yac/completions",
            json={
                "model": "openai.gpt-oss-120b-1:0",
                "messages": [{"role": "user", "content": "show a bar chart"}],
                "dataSchema": "{}",
                "dataDomains": "{}",
            },
            headers={"Authorization": "Bearer test"},
        )

    def _raising(self, exc):
        return patch.object(self.server_app.orchestrator, "run", side_effect=exc)

    def test_missing_aws_credentials_returns_503(self, caplog):
        from openai import OpenAIError

        config = _config(udi_bedrock=True, aws_region="us-east-1")
        with patch.object(self.server_app, "config", config):
            with self._raising(
                OpenAIError("Could not find credentials for Bedrock.")
            ):
                with caplog.at_level("ERROR"):
                    response = self._post(self._client())

        assert response.status_code == 503
        assert "administrator" in response.json()["error"]
        # The operator-facing hint belongs in the log, not the response body.
        assert "hop limit" in caplog.text
        assert "bedrock:InvokeModel" in caplog.text
        assert "hop limit" not in response.json()["error"]

    def test_non_bedrock_backend_error_returns_generic_503(self):
        from openai import OpenAIError

        with patch.object(self.server_app, "config", _config(openai_api_key="sk")):
            with self._raising(OpenAIError("some client construction problem")):
                response = self._post(self._client())

        assert response.status_code == 503
        assert "misconfigured" in response.json()["error"]

    def test_real_api_errors_are_not_masked_as_503(self):
        """APIError subclasses are upstream failures, not config faults."""
        import httpx
        from openai import APIConnectionError

        exc = APIConnectionError(request=httpx.Request("POST", "https://example.com"))
        with patch.object(self.server_app, "config", _config(openai_api_key="sk")):
            with self._raising(exc):
                response = self._post(self._client(raise_server_exceptions=False))

        assert response.status_code == 500

    def test_authentication_error_still_maps_to_401(self):
        """Registering a handler on the base class must not steal subclasses."""
        import httpx
        from openai import AuthenticationError

        exc = AuthenticationError(
            "bad key",
            response=httpx.Response(
                401, request=httpx.Request("POST", "https://example.com")
            ),
            body=None,
        )
        with patch.object(self.server_app, "config", _config(openai_api_key="sk")):
            with self._raising(exc):
                response = self._post(self._client())

        assert response.status_code == 401
        assert "rejected the API key" in response.json()["error"]
