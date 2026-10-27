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

What stays with the host is what only it knows: authentication, who may use
the server's OpenAI key, the budget, and which query backends exist.
"""

import json
import logging
import urllib.request
from collections.abc import Callable

from openai import APIError, AuthenticationError, OpenAIError
from pydantic import BaseModel, ValidationError

from udiagent.filters import filter_summary
from udiagent.models import (
    YACCompletionRequest,
    YACIssueReportRequest,
    YACQueryRequest,
    YACVisInstantiateRequest,
    YACVisInstantiateResponse,
)
from udiagent.orchestrator import (
    BudgetExceededError,
    Orchestrator,
    Usage,
    build_rebuff_toolcall,
)
from udiagent.query import DatabaseAuthError, MetadataCache, QueryEngine, use_db_token
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

    ``code`` is machine-readable. The chat acts on ``unknown_template``: it
    drops a chart's tweak controls.
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


def _bad_request(exc: ValidationError, message: str) -> EndpointError:
    """A 422 ``bad_request`` naming every bad field."""
    errors = [
        f"{'.'.join(map(str, e['loc'])) or 'body'}: {e['msg']}"
        for e in exc.errors(include_url=False)
    ]
    return EndpointError(422, "bad_request", message, errors)


def _validate[M: BaseModel](model: type[M], body, message: str) -> M:
    try:
        return model.model_validate(body)
    except ValidationError as exc:
        raise _bad_request(exc, message) from exc


def _usage_headers(usage: Usage, model: str) -> dict[str, str]:
    """A turn's token use as the ``X-Usage-*`` response headers the chat reads."""
    return {
        "X-Usage-Prompt-Tokens": str(usage.prompt_tokens),
        "X-Usage-Completion-Tokens": str(usage.completion_tokens),
        "X-Usage-Total-Tokens": str(usage.total_tokens),
        "X-Usage-Cached-Prompt-Tokens": str(usage.cached_prompt_tokens),
        "X-Usage-Cache-Write-Tokens": str(usage.cache_write_tokens),
        "X-Usage-Reasoning-Tokens": str(usage.reasoning_tokens),
        "X-Usage-Model": model,
    }


def _check_key(agent, openai_api_key: str | None) -> None:
    """Refuse a request the agent cannot serve, before any prompt goes out."""
    if openai_api_key and agent.use_bedrock:
        # Honoring it would send the prompt, with the data schema and domains,
        # to api.openai.com. Deployments choose Bedrock to keep data inside
        # their own AWS account, so this fails closed. The agent refuses too;
        # this is the actionable 403 instead of its 500.
        logger.warning(
            "Refused a per-request OpenAI key: this agent routes inference "
            "through Amazon Bedrock."
        )
        raise EndpointError(
            403,
            "openai_key_refused",
            "This server routes all inference through Amazon Bedrock and does "
            "not accept per-request OpenAI keys, because using one would send "
            "your prompt and data schema to api.openai.com. Remove the "
            "X-OpenAI-Key header to continue.",
        )
    # A base URL (self-hosted backends take no key) or Bedrock (signed with
    # the IAM role) also gives the agent a client of its own.
    if not openai_api_key and agent.gpt_model is None:
        raise EndpointError(
            401,
            "no_openai_key",
            "No OpenAI API key. Set OPENAI_API_KEY (or UDI_BEDROCK) in the "
            "agent's .env, or send a key via the X-OpenAI-Key header.",
        )


def _llm_error(exc: OpenAIError, *, caller_key: bool, bedrock: bool) -> EndpointError:
    """A failed LLM call as the error the chat can show, instead of a bare 500."""
    if isinstance(exc, AuthenticationError):
        logger.warning("OpenAI authentication failed: %s", exc)
        return EndpointError(
            401, "openai_key_rejected", "OpenAI rejected the API key (invalid or unauthorized)."
        )
    if isinstance(exc, APIError):
        # A model the key cannot use, a rate limit, a timeout. The provider's
        # message describes the caller's own key, so only they see it. On the
        # server's credential it can name the operator's account (a Bedrock
        # access denial carries the role ARN), so it goes to the log.
        logger.warning("LLM API call failed: %s", exc)
        if caller_key:
            detail = f"The LLM API call failed: {exc.message}"
        else:
            detail = "The LLM API call failed. Please try again or contact the administrator."
        return EndpointError(502, "llm_call_failed", detail)
    # The SDK raises a plain OpenAIError for client and credential problems,
    # at request time: typically Bedrock signing with no AWS credentials. The
    # response stays terse (an end user cannot act on it); the checklist goes
    # to the log, where the operator is looking.
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
    return EndpointError(503, "llm_backend_misconfigured", detail)


def completions(
    orchestrator: Orchestrator,
    body: dict | YACCompletionRequest,
    *,
    openai_api_key: str | None = None,
    session_id: str | None = None,
    budget_check: Callable[[Usage], str | None] | None = None,
) -> tuple[list[dict], dict[str, str]]:
    """Run one conversation turn.

    The logic of ``POST /v1/yac/completions``.

    The reference server's policy is built in: a requested ``model`` is
    honored only with a caller's own key (whoever pays for the tokens picks
    the model), and the budget is checked only on the server's key. A quota
    refusal is a ``Rebuff`` in a 200, which the chat shows like any other.

    Args:
        orchestrator: The orchestrator to run. A host that serves members on
            its own key and everyone else on theirs can keep one for each.
        body: The request body (see ``YACCompletionRequest``).
        openai_api_key: The caller's own OpenAI key (the ``X-OpenAI-Key``
            header), or ``None`` to run on the agent's.
        session_id: Groups the conversation's turns into one LangFuse session
            (the ``X-Conversation-Id`` header).
        budget_check: Called with the turn's ``Usage`` before each LLM call;
            returns a message to refuse with, or ``None`` (see
            ``Orchestrator.run``). Skipped for a caller's own key.

    Returns:
        ``(tool_calls, headers)``: the response body, and the ``X-Usage-*``
        headers to send with it.

    Raises:
        EndpointError: ``bad_request`` (422), ``no_openai_key`` (401),
            ``openai_key_refused`` (403, a caller's key on Bedrock),
            ``openai_key_rejected`` (401), ``llm_call_failed`` (502) or
            ``llm_backend_misconfigured`` (503).
    """
    request = _validate(YACCompletionRequest, body, "Invalid request body.")
    agent = orchestrator.agent
    logger.info(
        "Received /v1/yac/completions request "
        "(message_count=%d, schema_char_count=%d, domain_char_count=%d, "
        "has_conversation_id=%s, filters=%s)",
        len(request.messages),
        len(request.dataSchema),
        len(request.dataDomains),
        session_id is not None,
        filter_summary(request.filters),
    )
    _check_key(agent, openai_api_key)

    # ponytail: key ownership is the permission check here. If deployments ever
    # need to grant model choice independently of who pays, that becomes a
    # parameter — see the agent README.
    model = request.model if openai_api_key else None
    if request.model and not openai_api_key:
        logger.info("ignoring requested model %r: no caller-supplied key", request.model)

    try:
        result = orchestrator.run(
            messages=request.messages,
            data_schema=request.dataSchema,
            data_domains=request.dataDomains,
            openai_api_key=openai_api_key,
            model=model,
            budget_check=None if openai_api_key else budget_check,
            session_id=session_id,
            filters=request.filters,
            issue_reporting=request.issueReporting and agent.langfuse_enabled,
        )
    except BudgetExceededError as exc:
        rebuff = build_rebuff_toolcall(exc.message, reason="budget_exceeded")
        return [rebuff], _usage_headers(exc.usage, agent.gpt_model_name)
    except OpenAIError as exc:
        raise _llm_error(
            exc, caller_key=bool(openai_api_key), bedrock=agent.use_bedrock
        ) from exc

    logger.info("orchestrator_choice: %s", result.orchestrator_choice)
    logger.info("usage: %s", result.usage)
    logger.info(
        "tool_calls: count=%d names=%s",
        len(result.tool_calls),
        [tool_call.get("name", "unknown") for tool_call in result.tool_calls],
    )
    return result.tool_calls, _usage_headers(result.usage, model or agent.gpt_model_name)


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
    request = _validate(YACVisInstantiateRequest, body, "Invalid request body.")

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


# --- Server-side data: /v1/yac/metadata and /v1/yac/query -------------------
# A host keeps its own registry of package name -> QueryEngine (the key
# "default" serves a package with no engine of its own) and passes it in.


def _engine(engines: dict[str, QueryEngine], package: str | None):
    engine = engines.get(package) or engines.get("default")
    if engine is not None:
        return engine
    if not engines:
        message = (
            f"no query backend configured for package {package!r}: the server has "
            "no query backends loaded. Set UDI_QUERY_BACKENDS to a seeded config "
            "(seed one with packages/agent/scripts/seed_duckdb.py, or run the "
            "'Data: Use penguins (remote/DuckDB)' VS Code task) and restart the agent."
        )
    else:
        message = (
            f"no query backend configured for package {package!r}. Configured packages: "
            f"{sorted(engines)}. Point VITE_UDI_REMOTE_PACKAGE at one of these, or seed "
            f"{package!r} and restart the agent."
        )
    raise EndpointError(404, "no_backend", message)


def _forbidden(exc: DatabaseAuthError) -> EndpointError:
    # The message is fixed: the driver's error names the principal and the
    # host, neither of which belongs in a client response.
    logger.warning("database rejected forwarded identity: %s", exc)
    return EndpointError(
        403, "database_forbidden", "The database rejected your credentials for this dataset."
    )


# ponytail: a fixed bound on per-user caches, which would otherwise leak slowly
# in a long-lived process. A parameter if a deployment ever needs more users.
_MAX_METADATA_CACHES = 32


def metadata(
    engines: dict[str, QueryEngine],
    caches: dict,
    package: str | None = None,
    *,
    refresh: bool = False,
    token: str | None = None,
    principal: str | None = None,
    ttl_seconds: float = 3600,
) -> dict:
    """A package's schema and column values, introspected from its database.

    The logic of ``GET /v1/yac/metadata``: the remote-mode replacement for the
    browser computing them from CSVs. Cached for ``ttl_seconds``.

    Args:
        engines: The host's query backends, by package name.
        caches: Where the metadata caches live between requests: an empty
            dict the host keeps, bounded to the 32 most recently used.
        package: The package to describe.
        refresh: Re-introspect now instead of serving the cache.
        token: The caller's raw JWT, for a backend that forwards it to the
            database (``jwtPassthrough``).
        principal: Who the caller is (e.g. the token's ``sub``). A
            passthrough backend keeps a cache per principal, because the
            column values are the user's own rows.

    Returns:
        ``{package, interactive, dataSchema, dataDomains}`` (see
        ``MetadataResponse``).

    Raises:
        EndpointError: ``no_backend`` (404) or ``database_forbidden`` (403).
    """
    engine = _engine(engines, package)
    key = package if package in engines else "default"
    cache_key = (key, principal if engine.connector.jwt_passthrough else None)
    if cache_key in caches:
        caches[cache_key] = caches.pop(cache_key)  # re-insert = move to newest
    else:
        caches[cache_key] = MetadataCache(engine, package or key, ttl_seconds=ttl_seconds)
        while len(caches) > _MAX_METADATA_CACHES:
            del caches[next(iter(caches))]  # oldest insertion = LRU

    try:
        with use_db_token(token):
            cache = caches[cache_key]
            result = cache.refresh() if refresh else cache.get()
    except DatabaseAuthError as exc:
        raise _forbidden(exc) from exc
    return {"package": package or key, "interactive": False, **result}


def query(
    engines: dict[str, QueryEngine],
    body: dict | YACQueryRequest,
    *,
    token: str | None = None,
) -> dict:
    """Run every visible chart's transformation pipeline as SQL, in one batch.

    The logic of ``POST /v1/yac/query``: the server-side counterpart of the
    toolkit's in-browser executor. A query that fails carries ``{error}`` in
    its result; the others still succeed.

    Args:
        engines: The host's query backends, by package name.
        body: The request body (see ``YACQueryRequest``).
        token: The caller's raw JWT, for a backend that forwards it to the
            database (``jwtPassthrough``).

    Returns:
        ``{results}``, one per query, keyed by ``vizId`` (see ``QueryResponse``).

    Raises:
        EndpointError: ``bad_request`` (422), ``no_backend`` (404) or
            ``database_forbidden`` (403).
    """
    request = _validate(YACQueryRequest, body, "Invalid request body.")
    engine = _engine(engines, request.package)
    try:
        with use_db_token(token):
            results = engine.run_batch(
                [q.model_dump() for q in request.queries], request.selections
            )
    except DatabaseAuthError as exc:
        raise _forbidden(exc) from exc
    return {"results": results}


# --- /v1/yac/issue_report -----------------------------------------------------

# ponytail: checked after the body is buffered, so it caps what reaches
# LangFuse, not what the process reads. A streaming cap (or a proxy limit) if
# oversized uploads ever become a problem.
MAX_ISSUE_REPORT_BYTES = 10 * 1024 * 1024


def _slack_escape(text: str) -> str:
    # The note is the user's text: escaped, it cannot @channel or forge links.
    return text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def _notify_issue_report(
    agent,
    url: str,
    report: YACIssueReportRequest,
    trace_id: str | None,
    session_id: str | None,
):
    """POST a summary of a recorded report to the webhook.

    A failure is only logged: the report is already in LangFuse. The session
    stays there, behind its access control; only the note, contact and links
    go out — to the conversation the report is about (its LangFuse session)
    and to the report itself.
    """
    trace_url = session_url = None
    if trace_id:
        try:
            trace_url, session_url = agent.langfuse_urls(trace_id, session_id)
        except Exception as exc:  # noqa: BLE001 - the links are optional
            logger.warning("could not build the LangFuse URLs: %s", type(exc).__name__)

    where = {"menu": "Session menu", "chat": "chat", "crash": "crash screen"}[report.source]
    lines = [f"*Issue report* from the {where}"]
    lines += [f">{_slack_escape(line)}" for line in report.description.splitlines()]
    if report.contact:
        lines.append(f"Contact: {_slack_escape(report.contact)}")
    links = []
    if session_url:
        links.append(f"<{session_url}|Open the conversation in LangFuse>")
    if trace_url:
        links.append(f"<{trace_url}|Open the report>")
    if links:
        lines.append(" · ".join(links))
    payload = {
        "text": "\n".join(lines),
        "report": {
            "description": report.description,
            "contact": report.contact,
            "source": report.source,
            "traceId": trace_id,
            "traceUrl": trace_url,
            "sessionId": session_id,
            "sessionUrl": session_url,
        },
    }
    request = urllib.request.Request(
        url,
        data=json.dumps(payload).encode(),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=10) as response:
            logger.info("issue report webhook delivered (status=%d)", response.status)
    except Exception as exc:  # noqa: BLE001 - logged, never raised
        # Never log the URL: Slack's and Teams' embed their credentials.
        logger.warning(
            "issue report webhook failed: %s %s",
            type(exc).__name__,
            getattr(exc, "code", ""),
        )


def issue_report(
    agent,
    raw: bytes | str,
    *,
    session_id: str | None = None,
    webhook_url: str | None = None,
    defer: Callable[..., object] | None = None,
) -> dict:
    """Record a user's issue report, with their session export, in LangFuse.

    The logic of ``POST /v1/yac/issue_report``. The report is filed under the
    conversation's LangFuse session, next to the traces of the turns being
    reported. Without LangFuse there is nowhere to put it, so it is refused
    rather than accepted and dropped.

    Args:
        agent: The ``UDIAgent`` whose LangFuse records the report.
        raw: The request body as received, so its size is checked before it
            is parsed (see ``YACIssueReportRequest``).
        session_id: The conversation's ID (the ``X-Conversation-Id`` header).
        webhook_url: Where to post a summary (a Slack or Teams incoming
            webhook), or ``None`` for no post.
        defer: Called as ``defer(fn, *args)`` to post the summary after the
            response is sent (FastAPI: ``BackgroundTasks.add_task``). ``None``
            posts it before returning, which can take up to 10 s.

    Returns:
        ``{traceId}`` (see ``IssueReportResponse``).

    Raises:
        EndpointError: ``issue_reports_unavailable`` (503, no LangFuse),
            ``too_large`` (413) or ``bad_request`` (422).
    """
    if not agent.langfuse_enabled:
        raise EndpointError(
            503,
            "issue_reports_unavailable",
            "Issue reporting needs LangFuse, which this server has not configured.",
        )
    size = len(raw.encode() if isinstance(raw, str) else raw)
    if size > MAX_ISSUE_REPORT_BYTES:
        raise EndpointError(
            413,
            "too_large",
            f"Issue report is too large ({size} bytes; limit {MAX_ISSUE_REPORT_BYTES}).",
        )
    try:
        report = YACIssueReportRequest.model_validate_json(raw)
    except ValidationError as exc:
        raise _bad_request(exc, "Invalid issue report.") from exc

    # Sizes only: the note, contact and session are the user's words and data.
    logger.info(
        "Received /v1/yac/issue_report (source=%s, byte_count=%d, "
        "has_contact=%s, has_conversation_id=%s)",
        report.source,
        size,
        report.contact is not None,
        session_id is not None,
    )
    trace_id = agent.record_issue_report(
        description=report.description,
        contact=report.contact,
        source=report.source,
        session=report.session,
        session_id=session_id,
    )
    if webhook_url:
        run = defer or (lambda fn, *args: fn(*args))
        run(_notify_issue_report, agent, webhook_url, report, trace_id, session_id)
    return {"traceId": trace_id}
