"""Tests for opt-in LangFuse configuration on UDIAgent."""

import sys
from unittest.mock import MagicMock, patch

import pytest

from udiagent._compat import get_openai_class
from udiagent.agent import UDIAgent


class TestGetOpenaiClass:
    def test_default_returns_plain_openai(self):
        from openai import OpenAI as PlainOpenAI

        cls = get_openai_class()
        assert cls is PlainOpenAI

    def test_use_langfuse_returns_langfuse_openai(self):
        from langfuse.openai import OpenAI as LangfuseOpenAI

        cls = get_openai_class(use_langfuse=True)
        assert cls is LangfuseOpenAI

    def test_missing_langfuse_raises_with_install_hint(self):
        original = sys.modules.pop("langfuse.openai", None)
        sys.modules["langfuse.openai"] = None  # forces ImportError on import
        try:
            with pytest.raises(ImportError, match="udiagent\\[langfuse\\]"):
                get_openai_class(use_langfuse=True)
        finally:
            if original is not None:
                sys.modules["langfuse.openai"] = original
            else:
                sys.modules.pop("langfuse.openai", None)


class TestUDIAgentLangfuseOptIn:
    def test_default_uses_plain_openai(self):
        from openai import OpenAI as PlainOpenAI

        agent = UDIAgent(
            gpt_model_name="gpt-4.1",
            openai_api_key="sk-test",
        )
        assert agent._openai_class is PlainOpenAI

    def test_langfuse_kwargs_activate_langfuse_path(self):
        from langfuse.openai import OpenAI as LangfuseOpenAI

        with patch("langfuse.Langfuse") as mock_langfuse:
            agent = UDIAgent(
                gpt_model_name="gpt-4.1",
                openai_api_key="sk-test",
                langfuse_public_key="pk-lf-test",
                langfuse_secret_key="sk-lf-test",
                langfuse_host="https://lf.example.com",
                langfuse_environment="staging",
            )

        assert agent._openai_class is LangfuseOpenAI
        mock_langfuse.assert_called_once_with(
            public_key="pk-lf-test",
            secret_key="sk-lf-test",
            host="https://lf.example.com",
            environment="staging",
        )

    def test_partial_langfuse_kwargs_still_activate_path(self):
        """Any one of the three kwargs is enough to opt in."""
        from langfuse.openai import OpenAI as LangfuseOpenAI

        with patch("langfuse.Langfuse") as mock_langfuse:
            agent = UDIAgent(
                gpt_model_name="gpt-4.1",
                openai_api_key="sk-test",
                langfuse_host="https://lf.example.com",
            )

        assert agent._openai_class is LangfuseOpenAI
        mock_langfuse.assert_called_once_with(
            public_key=None,
            secret_key=None,
            host="https://lf.example.com",
            environment=None,
        )


class TestServerConfigForwardsLangfuse:
    def test_from_env_reads_langfuse_vars(self, monkeypatch):
        from udiagent.server.config import ServerConfig

        monkeypatch.setenv("LANGFUSE_PUBLIC_KEY", "pk-lf-env")
        monkeypatch.setenv("LANGFUSE_SECRET_KEY", "sk-lf-env")
        monkeypatch.setenv("LANGFUSE_HOST", "https://env.example.com")

        cfg = ServerConfig.from_env()
        assert cfg.langfuse_public_key == "pk-lf-env"
        assert cfg.langfuse_secret_key == "sk-lf-env"
        assert cfg.langfuse_host == "https://env.example.com"

    def test_from_env_unset_yields_none(self, monkeypatch):
        from udiagent.server.config import ServerConfig

        monkeypatch.delenv("LANGFUSE_PUBLIC_KEY", raising=False)
        monkeypatch.delenv("LANGFUSE_SECRET_KEY", raising=False)
        monkeypatch.delenv("LANGFUSE_HOST", raising=False)

        cfg = ServerConfig.from_env()
        assert cfg.langfuse_public_key is None
        assert cfg.langfuse_secret_key is None
        assert cfg.langfuse_host is None
