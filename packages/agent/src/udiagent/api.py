"""The HTTP endpoints' logic, for any web framework.

A host that serves the chat from its own backend (Flask, Django, ...) calls
these instead of porting the reference server's handlers: each takes the parsed
JSON request body, returns the JSON response body, and raises ``EndpointError``
for a failure the client acts on. ``udiagent.server.app`` is a thin FastAPI
layer over the same functions, so a host and the reference server cannot drift.

A Flask route, for example::

    from udiagent.api import EndpointError, vis_instantiate

    @app.post('/v1/yac/vis_instantiate')
    def yac_vis_instantiate():
        try:
            return jsonify(vis_instantiate(request.get_json(silent=True) or {}))
        except EndpointError as e:
            return jsonify(e.body()), e.status

``error_response`` answers the other failures the chat tells apart (a quota
refusal, a rejected OpenAI key, a failed LLM call), and ``usage_headers`` adds
the token counts the chat shows.
"""

import logging

from openai import APIError, AuthenticationError, OpenAIError
from pydantic import ValidationError

from udiagent.models import YACVisInstantiateRequest, YACVisInstantiateResponse
from udiagent.orchestrator import BudgetExceededError, Usage, build_rebuff_toolcall
from udiagent.query import DatabaseAuthError
from udiagent.vis_generate import (
    _load_generated_tools,
    _parse_request_schema,
    instantiate_template,
    shared_entities_for,
    template_tweakable_params,
    unbound_placeholders,
    validate_bindings,
)

logger = logging.getLogger(__name__)


class EndpointError(Exception):
    """A failure to answer with ``status`` and ``body()``.

    ``code`` is what the chat acts on: on ``unknown_template`` it drops a
    chart's tweak controls.
    """

    def __init__(
        self, status: int, code: str, message: str, errors: list[str] | None = None
    ):
        super().__init__(message)
        self.status = status
        self.code = code
        self.errors = errors

    def body(self) -> dict:
        """The JSON error body: ``{code, error}``, plus ``errors`` when there are several."""
        body = {"code": self.code, "error": str(self)}
        if self.errors is not None:
            body["errors"] = self.errors
        return body


def vis_instantiate(body: dict | YACVisInstantiateRequest) -> dict:
    """Re-instantiate a template-generated chart with new bindings.

    The logic of ``POST /v1/yac/vis_instantiate``. No LLM call, so it needs no
    agent and no OpenAI key.

    Args:
        body: The request body: ``tool``, ``toolArgs`` and ``dataSchema``
            (see ``YACVisInstantiateRequest``).

    Returns:
        The response body, shaped as ``YACVisInstantiateResponse``.

    Raises:
        EndpointError: ``bad_request`` (422), ``bad_schema`` (400),
            ``unknown_template`` (404), ``missing_bindings`` or
            ``invalid_bindings`` (422), ``instantiate_failed`` (500) or
            ``templates_unavailable`` (503).
    """
    try:
        request = YACVisInstantiateRequest.model_validate(body)
    except ValidationError as exc:
        errors = [
            f"{'.'.join(map(str, e['loc'])) or 'body'}: {e['msg']}"
            for e in exc.errors(include_url=False)
        ]
        raise EndpointError(422, "bad_request", "Invalid request body.", errors) from exc

    generated = _load_generated_tools()
    if generated is None:
        raise EndpointError(
            503,
            "templates_unavailable",
            "This agent has no generated visualization templates.",
        )
    _tool_defs, tool_dispatch, templates, _tool_tags = generated

    entry = tool_dispatch.get(request.tool)
    if entry is None:
        raise EndpointError(
            404,
            "unknown_template",
            f"Unknown visualization template '{request.tool}'. The agent's "
            "templates may have changed since this chart was created.",
        )
    template_idx, param_map = entry
    spec_template = templates[template_idx]

    schema = _parse_request_schema(request.dataSchema)
    if not schema.get("entities"):
        # _parse_request_schema degrades to an empty schema by design, which
        # would validate nothing and instantiate an unusable spec.
        raise EndpointError(
            400,
            "bad_schema",
            "dataSchema has no entities; send the data package descriptor.",
        )

    bindings = {
        param_map[k]: v for k, v in request.toolArgs.items() if k in param_map
    }

    missing = unbound_placeholders(spec_template, param_map, bindings)
    if missing:
        raise EndpointError(
            422,
            "missing_bindings",
            "Missing bindings for this template: " + ", ".join(missing),
            missing,
        )

    errors = validate_bindings(
        spec_template, bindings, schema, shared_entities=shared_entities_for(request.tool)
    )
    if errors:
        # errors[0] is already reader-grade prose naming the valid alternatives.
        raise EndpointError(422, "invalid_bindings", errors[0], errors)

    try:
        spec = instantiate_template(spec_template, bindings, schema)
    except Exception as exc:  # noqa: BLE001 - reported, not swallowed
        logger.warning("vis_instantiate failed for %s: %s", request.tool, exc)
        raise EndpointError(
            500,
            "instantiate_failed",
            f"Could not build a spec from template '{request.tool}'.",
        ) from exc

    # Through the response model, as FastAPI's response_model does, so every
    # host sends the documented shape (a param's absent optionals as nulls).
    return YACVisInstantiateResponse(
        spec=spec,
        toolArgs={k: v for k, v in request.toolArgs.items() if k in param_map},
        params=template_tweakable_params(spec_template, param_map, bindings, schema),
    ).model_dump()


def usage_headers(usage: Usage | None, model: str | None = None) -> dict[str, str]:
    """A turn's token use as the ``X-Usage-*`` response headers the chat reads.

    Args:
        usage: ``OrchestratorResult.usage``; ``None`` counts as zero.
        model: The model the turn ran on. Omitted from the headers when
            ``None``.
    """
    usage = usage or Usage()
    headers = {
        "X-Usage-Prompt-Tokens": str(usage.prompt_tokens),
        "X-Usage-Completion-Tokens": str(usage.completion_tokens),
        "X-Usage-Total-Tokens": str(usage.total_tokens),
        "X-Usage-Cached-Prompt-Tokens": str(usage.cached_prompt_tokens),
        "X-Usage-Cache-Write-Tokens": str(usage.cache_write_tokens),
        "X-Usage-Reasoning-Tokens": str(usage.reasoning_tokens),
    }
    if model:
        headers["X-Usage-Model"] = model
    return headers


def error_response(
    exc: Exception,
    *,
    model: str | None = None,
    caller_key: bool = False,
    bedrock: bool = False,
) -> tuple[int, dict | list, dict[str, str]] | None:
    """The response for an exception the chat tells apart, or ``None``.

    Call it from the handler of any endpoint that runs the agent, and re-raise
    when it returns ``None``. Without it every one of these is a bare 500,
    which the chat can only report as a server error.

    - ``EndpointError``: its own status and body.
    - ``BudgetExceededError``: 200 with a ``Rebuff``, which the chat shows like
      any other refusal rather than as an error, plus the usage headers.
    - ``DatabaseAuthError``: 403. The message is fixed: the driver's error
      names the principal and the host.
    - ``openai.AuthenticationError``: 401, the OpenAI key was rejected.
    - ``openai.APIError``: 502, the LLM call failed (a model the key cannot
      use, a rate limit, a timeout).
    - Any other ``openai.OpenAIError``: 503, the LLM backend is misconfigured
      (e.g. Bedrock signing with no AWS credentials). The SDK raises these for
      client and credential problems, at request time.

    Args:
        exc: The exception the handler caught.
        model: The model the turn would have run on, for the usage headers.
        caller_key: Whether the caller sent their own OpenAI key. Only then
            does a 502 echo the provider's message: it describes that key. On
            the server's credential it can name the operator's account (a
            Bedrock access denial carries the role ARN), so it is only logged.
        bedrock: Whether the agent runs on Amazon Bedrock, which turns the
            503's log line into a credentials checklist for the operator.

    Returns:
        ``(status, body, headers)``.
    """
    if isinstance(exc, EndpointError):
        return exc.status, exc.body(), {}
    if isinstance(exc, BudgetExceededError):
        rebuff = build_rebuff_toolcall(exc.message, reason="budget_exceeded")
        return 200, [rebuff], usage_headers(exc.usage, model)
    if isinstance(exc, DatabaseAuthError):
        logger.warning("database rejected forwarded identity: %s", exc)
        return 403, {"error": "The database rejected your credentials for this dataset."}, {}
    if isinstance(exc, AuthenticationError):
        logger.warning("OpenAI authentication failed: %s", exc)
        return 401, {"error": "OpenAI rejected the API key (invalid or unauthorized)."}, {}
    if isinstance(exc, APIError):
        logger.warning("LLM API call failed: %s", exc)
        if caller_key:
            detail = f"The LLM API call failed: {exc.message}"
        else:
            detail = "The LLM API call failed. Please try again or contact the administrator."
        return 502, {"error": detail}, {}
    if isinstance(exc, OpenAIError):
        # The response stays terse (an end user cannot act on it); the
        # checklist goes to the log, where the operator is looking.
        if bedrock:
            logger.error(
                "Bedrock request failed — could not resolve AWS credentials: %s "
                "Check that the instance profile / task role is attached and grants "
                "bedrock:InvokeModel, that AWS_REGION is set, and — for a container "
                "on Docker's bridge network — that the IMDSv2 hop limit is at least "
                "2 (`aws ec2 modify-instance-metadata-options "
                "--http-put-response-hop-limit 2 --http-tokens required`).",
                exc,
            )
            detail = (
                "The server could not authenticate to its Amazon Bedrock backend. "
                "This is a server configuration problem, not a problem with your "
                "request — please contact the administrator."
            )
        else:
            logger.error("LLM backend is misconfigured: %s", exc)
            detail = (
                "The server's LLM backend is misconfigured. This is a server "
                "problem, not a problem with your request — please contact the "
                "administrator."
            )
        return 503, {"error": detail}, {}
    return None
