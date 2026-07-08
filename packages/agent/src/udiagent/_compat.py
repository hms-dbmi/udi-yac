"""Optional dependency handling."""

import logging

logger = logging.getLogger(__name__)


def get_openai_class(use_langfuse: bool = False):
    """Return the OpenAI client class.

    When ``use_langfuse`` is True, returns ``langfuse.openai.OpenAI`` so that
    requests are traced. Raises ``ImportError`` with an install hint if the
    ``langfuse`` package is not available. When False, returns the plain
    ``openai.OpenAI`` class.
    """
    if use_langfuse:
        try:
            from langfuse.openai import OpenAI
        except ImportError as e:
            raise ImportError(
                "LangFuse configuration was provided but the 'langfuse' package "
                "is not installed. Install with: pip install udiagent[langfuse]"
            ) from e
        return OpenAI

    from openai import OpenAI

    return OpenAI
