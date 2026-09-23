"""UDIAgent — OpenAI client wrapper."""

import json
import logging
from contextlib import contextmanager, nullcontext
from functools import lru_cache

from udiagent._compat import get_openai_class, make_bedrock_provider

logger = logging.getLogger(__name__)


@lru_cache(maxsize=128)
def _make_openai_client(api_key: str, openai_class):
    """Cached OpenAI client factory — preserves httpx connection pooling across requests."""
    return openai_class(api_key=api_key)


class UDIAgent:
    """UDIAgent for requesting UDI grammar via OpenAI.

    Any OpenAI-compatible backend works: point ``openai_base_url`` at its
    chat-completions root (Azure AI Foundry, Amazon Bedrock, OpenRouter,
    vLLM, Ollama, LiteLLM, …) and set ``gpt_model_name`` to that backend's
    model id. The backend must support function calling and JSON-schema
    structured outputs — both are load-bearing for spec generation.

    ``openai_base_url`` applies to the default (server-configured) client
    only; per-request keys still resolve the SDK default, unless the
    ``OPENAI_BASE_URL`` environment variable is set, which the OpenAI SDK
    applies to every client it builds.

    Amazon Bedrock with an IAM role: pass ``bedrock=True`` (optionally
    ``bedrock_region``) instead of ``openai_api_key``. Requests are signed with
    SigV4 using the default AWS credential chain — an EC2 instance profile or
    ECS task role — and the endpoint is derived from the region, so no key is
    held by the process. Requires ``pip install udiagent[bedrock]``. Mutually
    exclusive with ``openai_api_key`` and ``openai_base_url``; for a static
    Bedrock API key use those instead. Per-request (bring-your-own) keys are
    **refused** in this mode rather than served from api.openai.com — see
    ``_get_gpt_client``.

    LangFuse observability is opt-in: pass any of ``langfuse_public_key``,
    ``langfuse_secret_key``, or ``langfuse_host`` to route requests through
    ``langfuse.openai.OpenAI``. When none are provided, the plain ``openai``
    client is used and no traces are emitted (even if the ``langfuse``
    package is installed).
    """

    def __init__(
        self,
        gpt_model_name: str,
        openai_api_key: str | None = None,
        *,
        openai_base_url: str | None = None,
        bedrock: bool = False,
        bedrock_region: str | None = None,
        langfuse_public_key: str | None = None,
        langfuse_secret_key: str | None = None,
        langfuse_host: str | None = None,
        langfuse_environment: str | None = None,
    ):
        self.gpt_model_name = gpt_model_name
        self.openai_base_url = openai_base_url
        # Either param opts in, matching the LangFuse convention below — a
        # bedrock_region= that silently did nothing would be a trap.
        self.use_bedrock = any([bedrock, bedrock_region])
        if self.use_bedrock and (openai_api_key or openai_base_url):
            raise ValueError(
                "Bedrock SigV4 authentication cannot be combined with "
                "openai_api_key or openai_base_url — the OpenAI SDK refuses "
                "`provider=` alongside either. Use bedrock=True for an IAM "
                "role, or openai_api_key + openai_base_url for a static "
                "Bedrock API key. To reach a private Bedrock endpoint, set "
                "AWS_BEDROCK_BASE_URL."
            )
        # Built before the LangFuse client so a missing udiagent[bedrock] fails
        # without first spawning LangFuse's background flusher thread.
        self._bedrock_provider = (
            make_bedrock_provider(region=bedrock_region) if self.use_bedrock else None
        )
        use_langfuse = any(
            [langfuse_public_key, langfuse_secret_key, langfuse_host]
        )
        self._langfuse_client = None
        if use_langfuse:
            from langfuse import Langfuse

            self._langfuse_client = Langfuse(
                public_key=langfuse_public_key,
                secret_key=langfuse_secret_key,
                host=langfuse_host,
                environment=langfuse_environment,
            )
        self._openai_class = get_openai_class(use_langfuse=use_langfuse)
        self._init_server_model_connection(openai_api_key)

    @contextmanager
    def trace(self, *, session_id: str | None = None, name: str = "orchestrator-run"):
        """Group every OpenAI call made within this block under one trace.

        When LangFuse is enabled, opens an enclosing span so the ``langfuse.openai``
        integration nests all generations (orchestration, vis generation, etc.) of
        a single turn into one trace instead of emitting a separate trace per call.
        ``session_id`` (the frontend's per-conversation ID) groups successive turns
        into one LangFuse session. When LangFuse is disabled this is a no-op.
        """
        client = getattr(self, "_langfuse_client", None)
        if client is None:
            yield
            return
        from langfuse import propagate_attributes

        with client.start_as_current_observation(name=name):
            with (
                propagate_attributes(session_id=session_id)
                if session_id
                else nullcontext()
            ):
                yield

    def _init_server_model_connection(self, openai_api_key: str | None = None):
        """Instantiate the OpenAI client for GPT-based features.

        Uses the explicitly provided *openai_api_key* if given.
        """
        if self._bedrock_provider is not None:
            logger.info(
                "Bedrock SigV4 enabled; GPT-based features authenticate via the "
                "default AWS credential chain (no API key held)."
            )
            # provider= is mutually exclusive with api_key/base_url, so this is a
            # separate construction, not an extra kwarg on the call below.
            self.gpt_model = self._openai_class(provider=self._bedrock_provider)
            return
        if openai_api_key is None and self.openai_base_url:
            # ponytail: self-hosted backends (Ollama, vLLM, …) take no key, but
            # the SDK refuses to build a client without one. Placeholder beats a
            # second "this backend needs no auth" flag.
            openai_api_key = "unused"
        if openai_api_key is None:
            logger.info(
                "No OpenAI API key provided; GPT-based features will require per-request keys."
            )
            self.gpt_model = None
        else:
            logger.info(
                "API key provided; GPT-based features will use this key by default (base_url=%s).",
                self.openai_base_url or "default",
            )
            self.gpt_model = self._openai_class(
                api_key=openai_api_key, base_url=self.openai_base_url
            )

    def _get_gpt_client(self, openai_api_key: str | None = None):
        """Return a per-request OpenAI client if a custom key is provided, otherwise the default.

        Bring-your-own-key is refused in Bedrock mode. Honoring it would build a
        client against api.openai.com and send the prompt — including the data
        schema and domains — to a third party, defeating the point of routing
        inference through Bedrock. Deployments choose Bedrock precisely to keep
        data inside their AWS account, so this fails closed rather than silently
        falling back to the public API.
        """
        if openai_api_key and self.use_bedrock:
            raise ValueError(
                "This agent is configured for Amazon Bedrock; per-request "
                "OpenAI keys are refused because serving one would send the "
                "prompt and data schema to api.openai.com. Omit the key to use "
                "the Bedrock backend."
            )
        if openai_api_key:
            return _make_openai_client(openai_api_key, self._openai_class)
        if self.gpt_model is None:
            raise RuntimeError(
                "No OpenAI API key available. Provide openai_api_key to UDIAgent() "
                "or pass a per-request key."
            )
        return self.gpt_model

    def gpt_completions_guided_json(
        self,
        messages: list[dict],
        json_schema: str,
        n=1,
        openai_api_key: str | None = None,
        model: str | None = None,
    ):
        # Normalize schema to dict
        if isinstance(json_schema, str):
            try:
                schema_obj = json.loads(json_schema)
            except json.JSONDecodeError as e:
                raise ValueError(f"json_schema must be a valid JSON string: {e}")
        else:
            schema_obj = json_schema

        # Wrap for Structured Outputs (required shape)
        schema_wrapper = {
            "name": "GuidedJSON",
            "schema": schema_obj,
            "strict": True,
        }

        client = self._get_gpt_client(openai_api_key)
        resp = client.chat.completions.create(
            model=model or self.gpt_model_name,
            messages=messages,
            response_format={
                "type": "json_schema",
                "json_schema": schema_wrapper,
            },
            n=n,
            temperature=0.0,
            max_completion_tokens=16_384,
        )

        outputs = [json.loads(choice.message.content) for choice in resp.choices]
        return outputs, getattr(resp, "usage", None)
