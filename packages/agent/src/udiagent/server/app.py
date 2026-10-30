"""FastAPI application for UDIAgent.

This is the reference server implementation that wraps the ``udiagent``
library as a configurable microservice.  Configuration is read from
environment variables (via ``ServerConfig.from_env()``).

Run with::

    uv run fastapi dev src/udiagent/server/app.py --port 8007
"""

import functools
import importlib.metadata
import json
import logging
from dataclasses import asdict
from logging.handlers import RotatingFileHandler
from pathlib import Path

from dotenv import load_dotenv
from openai import OpenAIError
from fastapi import BackgroundTasks, FastAPI, Header, Depends, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.routing import APIRoute

from udiagent.agent import UDIAgent
from udiagent.api import (
    MAX_ISSUE_REPORT_BYTES,
    EndpointError,
    completions,
    issue_report,
    metadata,
    query,
    vis_instantiate,
)
# Internal: the benchmark is not an endpoint hosts serve, so these stay private.
from udiagent.api import _check_key, _llm_error
from udiagent.orchestrator import Orchestrator
from udiagent.structured_functions import export_registry_json
from udiagent.server.config import ServerConfig
from udiagent.server.auth import RAW_TOKEN_CLAIM, make_verify_jwt
from udiagent.models import (
    ErrorResponse,
    IssueReportResponse,
    MetadataResponse,
    QueryResponse,
    ToolCall,
    YACCompletionRequest,
    YACBenchmarkCompletionRequest,
    YACIssueReportRequest,
    YACQueryRequest,
    YACVisInstantiateRequest,
    YACVisInstantiateResponse,
)

# ---------------------------------------------------------------------------
# Bootstrap
# ---------------------------------------------------------------------------

# Package root (packages/agent) — resolve bundled dev data relative to the
# source tree, not the process CWD, so endpoints work no matter where the
# server is launched from (repo root, packages/agent, or the Docker image).
_PACKAGE_ROOT = Path(__file__).resolve().parents[3]

# Load packages/agent/.env by explicit path, NOT via CWD discovery: the dev
# tasks and `pnpm dev:agent` launch from the repo root, where bare
# load_dotenv() finds nothing — so UDI_QUERY_BACKENDS / OPENAI_API_KEY silently
# wouldn't load. override=False keeps real env vars (Docker, shell) winning.
load_dotenv(_PACKAGE_ROOT / ".env")
# Installed from a wheel there is no packages/agent/.env above site-packages, so
# also read one from the working directory. Passed explicitly because bare
# load_dotenv() searches upward from THIS file (site-packages), not the CWD.
# override=False keeps the path above (and real env vars) winning where both exist.
load_dotenv(Path.cwd() / ".env")

# --- Config ---
# Built before logging so a misconfiguration is reported immediately, and so
# every env var in the process flows through one validated model.
config = ServerConfig.from_env()

# When installed from a wheel, _PACKAGE_ROOT lands inside site-packages, which
# has no data/ (only src/udiagent/data is packaged) and is often read-only —
# hence the overrides. See the deployment guide in the package README.
_DATA_DIR = Path(config.udi_data_dir or _PACKAGE_ROOT / "data")
# Where the benchmark runner writes when run from the package directory.
_OUTPUT_DIR = _PACKAGE_ROOT / "out"

# --- Logging setup ---
_log_dir = Path(config.udi_log_dir or _PACKAGE_ROOT / "logs")

_handlers: list[logging.Handler] = [logging.StreamHandler()]
try:
    _log_dir.mkdir(parents=True, exist_ok=True)
    _handlers.append(
        RotatingFileHandler(
            _log_dir / "udi_agent.log", maxBytes=5_000_000, backupCount=3
        )
    )
except OSError as exc:
    # A read-only install must still boot — stream logs only. Set UDI_LOG_DIR
    # to a writable path to get the rotating file back.
    print(f"udiagent: file logging disabled ({_log_dir}: {exc})")

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    handlers=_handlers,
)

# uvicorn's --reload watcher passes watch_filter=None, so watchfiles logs EVERY
# raw change at INFO. Our file handler is on the root logger and writes inside
# the watched tree, so that log line is itself a change -> endless feedback
# loop. uvicorn still logs its own "Detected changes ... Reloading" at WARNING.
logging.getLogger("watchfiles").setLevel(logging.WARNING)

logger = logging.getLogger(__name__)

# --- Agent & Orchestrator ---
agent = UDIAgent(
    gpt_model_name=config.gpt_model_name,
    openai_api_key=config.openai_api_key,
    openai_base_url=config.openai_base_url,
    bedrock=config.udi_bedrock,
    # Gated: bedrock_region alone opts in, and ECS injects AWS_REGION into every
    # task, so passing it unconditionally put every ECS deploy on Bedrock.
    bedrock_region=config.aws_region if config.udi_bedrock else None,
    langfuse_public_key=config.langfuse_public_key,
    langfuse_secret_key=config.langfuse_secret_key,
    langfuse_host=config.langfuse_host,
    langfuse_environment=config.langfuse_environment,
    openai_api=config.udi_openai_api,
    reasoning_effort=config.udi_reasoning_effort,
    temperature=None if config.udi_temperature == "omit" else config.udi_temperature,
    max_completion_tokens=config.udi_max_completion_tokens,
    vis_tool_choice=config.udi_vis_tool_choice,
)

orchestrator = Orchestrator(
    agent=agent,
)

# --- FastAPI app ---
# The title, description and tags feed the OpenAPI spec, which
# scripts/gen_openapi.py writes to packages/agent/openapi.json for the docs site.
app = FastAPI(
    title="UDIAgent API",
    # operationIds name the handler (`yac_completions`), not FastAPI's default
    # handler + path + method, so the reference pages get short URLs.
    generate_unique_id_function=lambda route: route.name,
    version=importlib.metadata.version("udiagent"),
    description=(
        "The reference server for the YAC chat: it turns a conversation about a "
        "data package into charts, filters and answers, and optionally serves the "
        "package's data from a database. Every endpoint is stateless: the client "
        "sends the conversation, the data package descriptor and the active "
        "filters with each request. [How the agent works]"
        "(https://hms-dbmi.github.io/udi-yac/docs/backend/architecture/) follows "
        "a request through it."
    ),
    openapi_tags=[
        {"name": "chat", "description": "Conversation turns and prompt suggestions."},
        {"name": "charts", "description": "Re-binding a chart made from a template."},
        {
            "name": "data",
            "description": "Server-side data: a package's schema and query results "
            "from a database instead of CSVs in the browser.",
        },
        {"name": "issues", "description": "User issue reports, recorded in LangFuse."},
        {"name": "status", "description": "Health check."},
    ],
)

# Optional budget-check hook.  Downstream integrators should monkey-patch this
# (``server_app.app.state.budget_check = my_fn``) to consult their quota store.
# The callback receives the caller's decoded token (``verify_jwt``'s payload,
# so a quota can key on ``sub`` or a role) and the turn's accumulated ``Usage``,
# and returns a non-empty message string to refuse the request, or ``None`` to
# proceed.
app.state.budget_check = None


def _budget_check(token_payload: dict):
    """``app.state.budget_check`` bound to this request's token, or ``None``."""
    check = app.state.budget_check
    return functools.partial(check, token_payload) if check else None


@app.exception_handler(EndpointError)
async def _endpoint_error_handler(request, exc: EndpointError):
    """Every failure a ``udiagent.api`` function reports.

    Here rather than as Starlette's default 500, which is built outside
    CORSMiddleware: without CORS headers a cross-origin browser reports only
    "NetworkError", and the status and the reason never reach the chat.
    """
    return JSONResponse(status_code=exc.status, content=exc.body())


app.add_middleware(
    CORSMiddleware,
    # Defaults to ["*"] — any origin. Set UDI_CORS_ORIGINS to name the hosts
    # that embed the chat once you know them; with the wildcard, Starlette
    # echoes back whatever Origin asked, so any site can call this server with
    # a user's credentials.
    allow_origins=config.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    # Custom response headers must be allow-listed for cross-origin JS to read
    # them; the frontend surfaces these as the per-session token counter.
    # Must enumerate (not "*"), which is invalid alongside allow_credentials.
    expose_headers=[
        "X-Usage-Prompt-Tokens",
        "X-Usage-Completion-Tokens",
        "X-Usage-Total-Tokens",
        "X-Usage-Cached-Prompt-Tokens",
        "X-Usage-Cache-Write-Tokens",
        "X-Usage-Reasoning-Tokens",
        "X-Usage-Model",
    ],
)

verify_jwt = make_verify_jwt(
    config.jwt_secret_key,
    config.jwt_algorithm,
    config.insecure_dev_mode,
    jwks_url=config.jwt_jwks_url,
    issuer=config.jwt_issuer,
    audience=config.jwt_audience,
)

# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


def _errors(descriptions: dict[int, str]) -> dict:
    """OpenAPI entries for the error responses a route returns. Docs only."""
    return {
        status: {"model": ErrorResponse, "description": text}
        for status, text in descriptions.items()
    }


_UNAUTHORIZED = "Missing, invalid or expired token (`detail`)."
_IDP_UNREACHABLE = "The identity provider's keys could not be fetched (`JWT_JWKS_URL`)."
_DB_FORBIDDEN = "`database_forbidden`: the database rejected the caller's forwarded identity (JWT passthrough)."
_NO_BACKEND = "`no_backend`: no query backend is configured for the package."

_USAGE_HEADERS = {
    name: {"description": description, "schema": {"type": "string"}}
    for name, description in {
        "X-Usage-Prompt-Tokens": "Prompt tokens across every LLM call in the turn.",
        "X-Usage-Completion-Tokens": "Completion tokens, reasoning included.",
        "X-Usage-Total-Tokens": "Prompt plus completion tokens.",
        "X-Usage-Cached-Prompt-Tokens": "Prompt tokens served from the provider's cache.",
        "X-Usage-Cache-Write-Tokens": "Prompt tokens written to the provider's cache.",
        "X-Usage-Reasoning-Tokens": "Reasoning tokens, a subset of completion tokens.",
        "X-Usage-Model": "The model the turn ran on.",
    }.items()
}


@app.get("/", tags=["status"], summary="Health check")
def read_root():
    """The server's version, the commit it was built from (`git_sha`, null
    outside the Docker image) and its endpoints. `openapi` links the full spec.
    """
    return {
        "service": app.title,
        "status": "running",
        "version": app.version,
        "git_sha": config.udi_git_sha or None,
        "openapi": app.openapi_url,
        "docs": app.docs_url,
        # Built per request: this route is declared before the others. Only the
        # routes the spec publishes, so the benchmark tooling stays unlisted.
        "endpoints": [
            {"path": route.path, "method": method, "description": route.summary}
            for route in app.routes
            if isinstance(route, APIRoute) and route.include_in_schema
            for method in sorted(route.methods)
        ],
    }


@app.post(
    "/v1/yac/completions",
    summary="Run a conversation turn",
    tags=["chat"],
    responses={
        200: {
            "model": list[ToolCall],
            "description": "The turn's outcomes, in the order to apply them. A "
            "quota refusal is a `Rebuff` here too, not an error status.",
            "headers": _USAGE_HEADERS,
        },
        **_errors(
            {
                401: f"{_UNAUTHORIZED} Or `no_openai_key`: the server has none and "
                "the request sent no `X-OpenAI-Key`. Or `openai_key_rejected`: "
                "OpenAI rejected the key.",
                403: "`openai_key_refused`: the server routes inference through "
                "Amazon Bedrock and refuses per-request `X-OpenAI-Key` headers.",
                502: "`llm_call_failed`: the LLM API call failed (a model the key "
                "cannot use, a rate limit, a timeout).",
                503: "`llm_backend_misconfigured`: the server's LLM backend is "
                f"misconfigured. Or: {_IDP_UNREACHABLE}",
            }
        ),
    },
)
def yac_completions(
    request: YACCompletionRequest,
    token_payload: dict = Depends(verify_jwt),
    x_openai_key: str | None = Header(
        None,
        alias="X-OpenAI-Key",
        description="The caller's own OpenAI key. Bypasses the server's quota, "
        "and lets `model` take effect.",
    ),
    x_conversation_id: str | None = Header(
        None,
        alias="X-Conversation-Id",
        description="Groups the turns of one conversation into a LangFuse session.",
    ),
):
    """Run one conversation turn.

    The agent routes the latest message to tools (a chart, a filter change, an
    answer, a clarifying question or a refusal) and returns one tool call per
    outcome. Token use comes back in the `X-Usage-*` headers.
    """
    tool_calls, headers = completions(
        orchestrator,
        request,
        openai_api_key=x_openai_key,
        session_id=x_conversation_id,
        budget_check=_budget_check(token_payload),
    )
    return JSONResponse(content=tool_calls, headers=headers)


# ---------------------------------------------------------------------------
# Query backends (/v1/yac/query)
# ---------------------------------------------------------------------------
# Registry of package name -> QueryEngine. Configure programmatically
# (``app.state.query_engines[pkg] = engine``) or via UDI_QUERY_BACKENDS, a
# path to a JSON file: {"<package>": {"type": "duckdb"|"starrocks", ...}}.
# The key "default" (or null package) serves requests without a package match.


def _engine_from_config(spec: dict):
    # Lazy imports: duckdb / pymysql are optional extras.
    from udiagent.query import DuckDBConnector, QueryEngine, StarRocksConnector

    backend_type = spec.get("type")
    passthrough = bool(spec.get("jwtPassthrough"))
    if backend_type == "duckdb":
        if passthrough:
            raise ValueError("jwtPassthrough is not supported on duckdb (no user auth)")
        connector = DuckDBConnector(
            database=spec.get("database", ":memory:"),
            views=spec.get("views"),
        )
    elif backend_type == "starrocks":
        connection = spec.get("connection", {})
        if passthrough and config.insecure_dev_mode and not connection.get("user"):
            # Dev mode issues no real token, so passthrough has nothing to
            # forward. Fail at startup rather than letting every query 403 —
            # and never silently fall back to a shared credential, which is the
            # exact behaviour passthrough exists to remove.
            raise ValueError(
                "jwtPassthrough backend needs a fallback connection.user under "
                "INSECURE_DEV_MODE"
            )
        connector = StarRocksConnector(
            **connection,
            jwt_passthrough=passthrough,
            principal_field=spec.get("principalField", "sub"),
        )
    else:
        raise ValueError(f"unknown query backend type: {backend_type!r}")
    return QueryEngine(
        connector,
        table_map=spec.get("tables", {}),
        row_cap=spec.get("rowCap", 5000),
        entity_schemas=spec.get("schemas"),
        package_extras=spec.get("package"),
    )


def _load_query_engines() -> dict:
    # A relative path has already been tried against the package root by
    # ServerConfig, which is also what reports an unreadable one at startup.
    path = config.udi_query_backends
    if not path:
        return {}
    engines = {}
    for package, spec in json.loads(Path(path).read_text()).items():
        try:
            engines[package] = _engine_from_config(spec)
        except Exception as exc:
            # A single locked/missing/misconfigured backend (e.g. a DuckDB file
            # held open by another process) must not sink the whole server —
            # skip it so the other packages still load. DuckDB allows only one
            # read-write handle per file (see dev/duckdb/README.md).
            logger.warning("skipping query backend %r: %s", package, exc)
    logger.info("query backends configured: %s", sorted(engines))
    return engines


def _load_example_prompts() -> dict[str, list[str]]:
    """Per-package "Try an example" prompts: each backend spec's optional
    `examplePrompts`, which the seeders fill from `example_prompts.json`."""
    path = config.udi_query_backends
    if not path:
        return {}
    return {
        package: spec["examplePrompts"]
        for package, spec in json.loads(Path(path).read_text()).items()
        if isinstance(spec.get("examplePrompts"), list)
    }


app.state.query_engines = _load_query_engines()
app.state.example_prompts = _load_example_prompts()
# (package name, principal) -> MetadataCache, created lazily. Keyed by
# principal because dataDomains holds the actual distinct VALUES of each column
# (introspect.py), so under per-user row policies a shared cache would serve one
# user's data to the next. principal is None whenever the backend is not doing
# passthrough, which collapses this back to one entry per package.
# Bounded in udiagent.api.metadata. A plain dict, not an OrderedDict: dicts are
# insertion-ordered, LRU needs only re-insert and drop-first, and this stays a
# documented extension point that callers can assign a bare {} to.
app.state.metadata_caches = {}


@app.get(
    "/v1/yac/metadata",
    summary="Get a package's schema and column values",
    tags=["data"],
    responses={
        200: {"model": MetadataResponse},
        **_errors(
            {
                401: _UNAUTHORIZED,
                403: _DB_FORBIDDEN,
                404: _NO_BACKEND,
                503: _IDP_UNREACHABLE,
            }
        ),
    },
)
def yac_metadata(
    package: str | None = None,
    refresh: bool = False,
    token_payload: dict = Depends(verify_jwt),
):
    """Backend-introspected dataSchema/dataDomains for a package — the
    remote-mode replacement for browser-side CSV domain computation. Cached
    with a TTL; pass ?refresh=1 to force re-introspection."""
    return metadata(
        app.state.query_engines,
        app.state.metadata_caches,
        package,
        refresh=refresh,
        token=token_payload.get(RAW_TOKEN_CLAIM),
        principal=token_payload.get("sub"),
        ttl_seconds=config.udi_metadata_ttl_seconds,
    )


@app.post(
    "/v1/yac/query",
    summary="Run chart queries",
    tags=["data"],
    responses={
        200: {"model": QueryResponse},
        **_errors(
            {
                401: _UNAUTHORIZED,
                403: _DB_FORBIDDEN,
                404: _NO_BACKEND,
                503: _IDP_UNREACHABLE,
            }
        ),
    },
)
def yac_query(
    request: YACQueryRequest,
    token_payload: dict = Depends(verify_jwt),
):
    """Run every visible chart's transformation pipeline as SQL, in one batch.

    The server-side counterpart of the toolkit's in-browser executor: each query
    is compiled to SQL against the package's backend, with the current
    selections applied.
    """
    return query(
        app.state.query_engines, request, token=token_payload.get(RAW_TOKEN_CLAIM)
    )


@app.post(
    "/v1/yac/vis_instantiate",
    response_model=YACVisInstantiateResponse,
    summary="Re-bind a chart made from a template",
    tags=["charts"],
    responses=_errors(
        {
            400: "`bad_schema`: `dataSchema` has no entities.",
            401: _UNAUTHORIZED,
            404: "`unknown_template`: the template no longer exists.",
            422: "`missing_bindings` or `invalid_bindings`: the bindings do not "
            "fit the template or the schema; `errors` lists them.",
            500: "`instantiate_failed`: a template bug.",
            503: "`templates_unavailable`: this agent has no generated templates. "
            f"Or: {_IDP_UNREACHABLE}",
        }
    ),
)
def yac_vis_instantiate(
    request: YACVisInstantiateRequest,
    token_payload: dict = Depends(verify_jwt),
):
    """Re-instantiate a template-generated visualization with new bindings.

    This is what lets a client change *which field* a generated chart splits by
    without rewriting the finished spec. Rewriting is the tempting approach and
    it does not hold: a template's bindings can appear in transformations the
    renamer has to know about one by one (a groupby entry, a derive expression,
    a heading), so every new grammar feature silently falls outside it. Resolving
    the template again is exact by construction, and placeholder resolution lives
    in exactly one place (``udiagent.vis_generate``).

    No LLM call, so — unlike /v1/yac/completions — no OpenAI key is required and
    nothing is metered.
    """
    return vis_instantiate(request)


@app.post(
    "/v1/yac/issue_report",
    summary="Record an issue report",
    tags=["issues"],
    # The handler reads the raw body itself (to cap its size before parsing),
    # so the body has to be declared here for the spec to show it.
    openapi_extra={
        "requestBody": {
            "required": True,
            "content": {
                "application/json": {"schema": YACIssueReportRequest.model_json_schema()}
            },
        }
    },
    responses={
        200: {"model": IssueReportResponse},
        **_errors(
            {
                401: _UNAUTHORIZED,
                413: f"`too_large`: the report is larger than {MAX_ISSUE_REPORT_BYTES // 2**20} MiB.",
                422: "`bad_request`: the report is invalid; `errors` lists every bad field.",
                503: "`issue_reports_unavailable`: LangFuse is not configured, so reports "
                f"cannot be recorded. Or: {_IDP_UNREACHABLE}",
            }
        ),
    },
)
async def yac_issue_report(
    request: Request,
    background_tasks: BackgroundTasks,
    token_payload: dict = Depends(verify_jwt),
    x_conversation_id: str | None = Header(None, alias="X-Conversation-Id"),
):
    """Record a user's issue report, with their session export, in LangFuse.

    Filed under the conversation's LangFuse session, next to the traces of the
    turns being reported. Needs LangFuse: without it there is nowhere to put a
    report, so the endpoint says so instead of accepting and dropping it.
    """
    return issue_report(
        agent,
        await request.body(),
        session_id=x_conversation_id,
        webhook_url=config.udi_issue_report_webhook_url,
        defer=background_tasks.add_task,
    )


# Benchmark tooling, left out of the published spec (see docs/benchmarking.md).
@app.post("/v1/yac/benchmark", include_in_schema=False)
def yac_benchmark(
    request: YACBenchmarkCompletionRequest,
    token_payload: dict = Depends(verify_jwt),
    x_openai_key: str | None = Header(None, alias="X-OpenAI-Key"),
):
    _check_key(agent, x_openai_key)

    model = request.model if x_openai_key else None
    # The runner's --no-orchestrator sends the expected choice. Only a chart
    # can be produced without the routing call; anything else is refused
    # rather than silently routed, which would mislabel the run.
    if request.orchestrator_choice is None:
        run = orchestrator.run
    elif request.orchestrator_choice == "render-visualization":
        run = orchestrator.run_visualization
    else:
        return JSONResponse(
            status_code=422,
            content={
                "error": "Skipping the routing call is only supported for "
                "orchestrator_choice 'render-visualization'."
            },
        )
    # Spends tokens like a completion, so it is held to the same budget.
    try:
        result = run(
            messages=request.messages,
            data_schema=request.dataSchema,
            data_domains=request.dataDomains,
            openai_api_key=x_openai_key,
            model=model,
            budget_check=None if x_openai_key else _budget_check(token_payload),
        )
    except OpenAIError as exc:
        raise _llm_error(
            exc, caller_key=bool(x_openai_key), bedrock=agent.use_bedrock
        ) from exc

    return {
        "tool_calls": result.tool_calls,
        "orchestrator_choice": result.orchestrator_choice,
        "usage": asdict(result.usage),
        # What actually ran, so a benchmark run is labelled by the server that
        # served it rather than by whatever the runner was told.
        "model": model or agent.gpt_model_name,
        "llm_settings": {
            "openai_api": agent.openai_api,
            "reasoning_effort": agent.reasoning_effort,
            "temperature": agent.temperature,
            "max_completion_tokens": agent.max_completion_tokens,
            "vis_tool_choice": agent.vis_tool_choice,
        },
    }


@app.get(
    "/v1/yac/examples",
    summary="List example prompts",
    tags=["chat"],
    responses={
        200: {"model": list[str]},
        **_errors({404: "No example prompts for the package, and no global list."}),
    },
)
def yac_examples(package: str | None = None):
    """Example prompts for the chat. A package with its own `examplePrompts` in
    the backends config gets those — prompts are about a dataset, and the
    global list below is written for HuBMAP."""
    own = app.state.example_prompts.get(package) if package else None
    if own:
        return JSONResponse(content=own)
    examples_path = _DATA_DIR / "example_prompts.json"
    if not examples_path.exists():
        return JSONResponse(
            content={"error": f"File {examples_path} not found."}, status_code=404
        )
    with open(examples_path, "r") as f:
        data = json.load(f)
    prompts = [item["input"]["messages"][0]["content"] for item in data]
    return JSONResponse(content=prompts)


@app.get(
    "/v1/yac/structured_functions",
    summary="List the structured text functions",
    tags=["chat"],
)
def yac_structured_functions():
    """Return the structured function registry for frontend consumption."""
    return JSONResponse(content=export_registry_json())


@app.get("/v1/yac/benchmark_analysis", include_in_schema=False)
def yac_benchmark_analysis(token_payload: dict = Depends(verify_jwt)):
    """The most recently written benchmark analysis under the package's out/.

    Behind auth like the benchmark itself: an analysis carries every prompt,
    schema, domain and generated output of the run.
    """
    latest = max(
        _OUTPUT_DIR.glob("**/benchmark_analysis.json"),
        key=lambda path: path.stat().st_mtime,
        default=None,
    )
    if latest is None:
        return JSONResponse(
            content={"error": "No benchmark analysis found."}, status_code=404
        )
    with latest.open() as f:
        return JSONResponse(content=json.load(f))
