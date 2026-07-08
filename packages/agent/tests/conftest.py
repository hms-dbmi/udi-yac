import os
import sys
from unittest.mock import MagicMock

# Add src directory to path so tests can import modules directly
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))

# Enable insecure dev mode so JWT verification is skipped in tests
os.environ["INSECURE_DEV_MODE"] = "1"
os.environ["OPENAI_API_KEY"] = "test-default-key"
os.environ["UDI_MODEL_NAME"] = "test-model"

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
