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


def make_bedrock_provider(*, region: str | None = None):
    """Return an OpenAI ``provider`` handle for Amazon Bedrock SigV4 auth.

    Credentials come from the default AWS credential chain (EC2 instance
    profile, ECS task role, ``AWS_PROFILE``, ``~/.aws/credentials``, SSO), so
    no key is held by the process. Raises ``ImportError`` with an install hint
    when the optional AWS dependencies are missing.

    When *region* is None the SDK falls back to ``AWS_REGION`` /
    ``AWS_DEFAULT_REGION`` / ``~/.aws/config``, and raises ``OpenAIError`` if
    none of those resolve. The endpoint is derived from the region; set
    ``AWS_BEDROCK_BASE_URL`` to reach a PrivateLink/VPC endpoint instead.
    """
    try:
        from openai.providers import bedrock  # openai >= 2.44

        # ponytail: imported eagerly on purpose. The SDK defers its own botocore
        # import to the first signed request whenever a region is configured, so
        # a missing dependency would surface as a 500 mid-conversation instead of
        # a refusal to start.
        import botocore.auth  # noqa: F401
    except ImportError as e:
        raise ImportError(
            "Bedrock authentication was requested but its optional AWS "
            "dependencies are not installed. Install with: "
            "pip install udiagent[bedrock]"
        ) from e

    # api_key=None (explicit, not omitted) is load-bearing: it sets the SDK's
    # `skip_environment_bearer`, so a stray AWS_BEARER_TOKEN_BEDROCK in the
    # environment can't silently swap SigV4 for bearer auth.
    return bedrock(region=region, api_key=None)
