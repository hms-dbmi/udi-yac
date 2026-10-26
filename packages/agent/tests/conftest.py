import os
import sys
from unittest.mock import MagicMock

import pytest

# Add src directory to path so tests can import modules directly
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))

# Enable insecure dev mode so JWT verification is skipped in tests
os.environ["INSECURE_DEV_MODE"] = "1"
os.environ["OPENAI_API_KEY"] = "test-default-key"

# Mock langfuse.openai before any test imports udiagent.
# langfuse uses pydantic.v1 which is incompatible with Python 3.14.
# We provide a fake OpenAI class that records its init kwargs.
_langfuse_openai = MagicMock()


class _FakeOpenAI:
    """Lightweight stand-in for langfuse.openai.OpenAI."""

    def __init__(self, **kwargs):
        self._init_kwargs = kwargs


_langfuse_openai.OpenAI = _FakeOpenAI
sys.modules.setdefault("langfuse", MagicMock())
sys.modules["langfuse.openai"] = _langfuse_openai


@pytest.fixture(autouse=True)
def _no_developer_observability_env(monkeypatch):
    """Keep a developer's LangFuse and webhook settings out of every test.

    Importing the server app loads ``packages/agent/.env`` into the process
    environment, and ``ServerConfig`` reads it. A local LangFuse setup would
    otherwise complete the partial configs some tests build on purpose, and a
    webhook URL without LangFuse fails startup validation.
    """
    for name in (
        "LANGFUSE_PUBLIC_KEY",
        "LANGFUSE_SECRET_KEY",
        "LANGFUSE_HOST",
        "LANGFUSE_BASE_URL",
        "UDI_ISSUE_REPORT_WEBHOOK_URL",
    ):
        monkeypatch.delenv(name, raising=False)
