"""FastAPI application for UDIAgent.

This is the reference server implementation that wraps the ``udiagent``
library as a configurable microservice.  Configuration is read from
environment variables (via ``ServerConfig.from_env()``).

Run with::

    uv run fastapi dev src/udiagent/server/app.py --port 8007
"""

import json
import logging
import os
from dataclasses import asdict
from logging.handlers import RotatingFileHandler
from pathlib import Path

from dotenv import load_dotenv
from openai import APIError, AuthenticationError, OpenAIError
from fastapi import FastAPI, Header, Depends, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from udiagent.agent import UDIAgent
from udiagent.orchestrator import (
    BudgetExceededError,
    Orchestrator,
    Usage,
    build_rebuff_toolcall,
)
from udiagent.structured_functions import export_registry_json
# Dependency-free (no duckdb/pymysql at module scope), unlike the connector
# imports further down, which stay lazy because the drivers are extras.
from udiagent.query import DatabaseAuthError, use_db_token
from udiagent.server.config import ServerConfig
from udiagent.server.auth import RAW_TOKEN_CLAIM, make_verify_jwt
from udiagent.server.models import (
    YACCompletionRequest,
    YACBenchmarkCompletionRequest,
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
    bedrock_region=config.aws_region,
    langfuse_public_key=config.langfuse_public_key,
    langfuse_secret_key=config.langfuse_secret_key,
    langfuse_host=config.langfuse_host,
    langfuse_environment=config.langfuse_environment,
)

orchestrator = Orchestrator(
    agent=agent,
)

# --- FastAPI app ---
app = FastAPI()

# Optional budget-check hook.  Downstream integrators should monkey-patch this
# (``server_app.app.state.budget_check = my_fn``) to consult their quota store.
# The callback receives the accumulated ``Usage`` and returns a non-empty
# message string to refuse the request, or ``None`` to proceed.
app.state.budget_check = None


def _usage_headers(usage: Usage | None, model: str | None = None) -> dict[str, str]:
    """Render a ``Usage`` as the ``X-Usage-*`` header bundle for metering.

    *model* is the model the request actually ran on; it differs from the
    server's default when a bring-your-own-key caller overrode it.
    """
    if usage is None:
        usage = Usage()
    return {
        "X-Usage-Prompt-Tokens": str(usage.prompt_tokens),
        "X-Usage-Completion-Tokens": str(usage.completion_tokens),
        "X-Usage-Total-Tokens": str(usage.total_tokens),
        "X-Usage-Cached-Prompt-Tokens": str(usage.cached_prompt_tokens),
        "X-Usage-Reasoning-Tokens": str(usage.reasoning_tokens),
        "X-Usage-Model": model or agent.gpt_model_name,
    }


@app.exception_handler(BudgetExceededError)
async def _budget_exceeded_handler(request, exc: BudgetExceededError):
    """Convert quota refusals into a normal Rebuff tool_call response.

    HTTP 200 (not 402/429) is deliberate: the frontend renders the payload
    through the same ``RebuffNotice`` component as any other orchestrator
    rebuff, so users see a graceful message instead of an error toast.
    """
    return JSONResponse(
        status_code=200,
        content=[build_rebuff_toolcall(exc.message, reason="budget_exceeded")],
        headers=_usage_headers(exc.usage),
    )


@app.exception_handler(DatabaseAuthError)
async def _db_auth_error_handler(request, exc: DatabaseAuthError):
    """Surface a database identity rejection as a 403.

    Raised when a JWT-passthrough backend cannot authenticate the caller to the
    database. The message is fixed: the underlying pymysql error names the
    principal and the host, neither of which belongs in a client response.
    """
    logger.warning("database rejected forwarded identity: %s", exc)
    return JSONResponse(
        status_code=403,
        content={"error": "The database rejected your credentials for this dataset."},
    )


@app.exception_handler(AuthenticationError)
async def _openai_auth_error_handler(request, exc: AuthenticationError):
    """Surface a rejected OpenAI key as a clean 401 instead of a bare 500.

    Fires when the caller's ``X-OpenAI-Key`` (or the server's configured key)
    is rejected by OpenAI, so the frontend can show an actionable message
    rather than a raw stack trace.
    """
    logger.warning("OpenAI authentication failed: %s", exc)
    return JSONResponse(
        status_code=401,
        content={"error": "OpenAI rejected the API key (invalid or unauthorized)."},
    )


@app.exception_handler(OpenAIError)
async def _openai_config_error_handler(request, exc: OpenAIError):
    """Surface an unusable LLM backend as a 503 instead of a bare 500.

    The OpenAI SDK raises a plain ``OpenAIError`` for client-construction and
    credential problems, and an ``APIError`` subclass for anything the API
    itself returned. Only the former is a server-configuration fault, so real
    API failures are re-raised and keep their existing handling.

    The common trigger is Bedrock SigV4 signing with no resolvable AWS
    credentials — the SDK resolves them per request, so this fails at request
    time rather than at startup. The response stays terse (an end user cannot
    act on it); the actionable checklist goes to the log, where the operator
    is looking.
    """
    if isinstance(exc, APIError):
        raise exc

    if config.udi_bedrock:
        logger.error(
            "Bedrock request failed — could not resolve AWS credentials: %s "
            "Check that the instance profile / task role is attached and grants "
            "bedrock:InvokeModel, that AWS_REGION is set (region=%s), and — for "
            "a container on Docker's bridge network — that the IMDSv2 hop limit "
            "is at least 2 (`aws ec2 modify-instance-metadata-options "
            "--http-put-response-hop-limit 2 --http-tokens required`).",
            exc,
            config.aws_region or "unset",
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

    return JSONResponse(status_code=503, content={"error": detail})


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


@app.get("/")
def read_root():
    return {
        "service": "UDIAgent API",
        "status": "running",
        "endpoints": [
            {"path": "/", "method": "GET", "description": "API status and info"},
        ],
    }


def _reject_byok_in_bedrock_mode(x_openai_key: str | None) -> JSONResponse | None:
    """Refuse a per-request OpenAI key when the server is backed by Bedrock.

    Honoring one would build a client against api.openai.com and send the
    prompt — including the data schema and domains — to a third party.
    Deployments choose Bedrock to keep data inside their own AWS account, so
    this fails closed rather than quietly falling back to the public API.

    ``UDIAgent._get_gpt_client`` enforces the same rule as a backstop; this
    exists so callers get an actionable 403 instead of a 500. Every endpoint
    that accepts ``X-OpenAI-Key`` must call it.
    """
    if not (x_openai_key and config.udi_bedrock):
        return None
    logger.warning(
        "Refused a per-request OpenAI key: this server routes inference "
        "through Amazon Bedrock."
    )
    return JSONResponse(
        status_code=403,
        content={
            "error": "This server routes all inference through Amazon Bedrock "
            "and does not accept per-request OpenAI keys, because using one "
            "would send your prompt and data schema to api.openai.com. Remove "
            "the X-OpenAI-Key header to continue."
        },
    )


@app.post("/v1/yac/completions")
def yac_completions(
    request: YACCompletionRequest,
    token_payload: dict = Depends(verify_jwt),
    x_openai_key: str | None = Header(None, alias="X-OpenAI-Key"),
    x_conversation_id: str | None = Header(None, alias="X-Conversation-Id"),
):
    logger.info(
        "Received /v1/yac/completions request "
        "(message_count=%d, schema_char_count=%d, domain_char_count=%d, "
        "has_conversation_id=%s)",
        len(request.messages),
        len(request.dataSchema),
        len(request.dataDomains),
        x_conversation_id is not None,
    )

    refusal = _reject_byok_in_bedrock_mode(x_openai_key)
    if refusal is not None:
        return refusal

    # No key from the caller and no server-side credential → actionable 401
    # instead of the RuntimeError the orchestrator would raise (a bare 500).
    # A configured OPENAI_BASE_URL counts as credentialed (self-hosted backends
    # take no key, and the agent builds a placeholder-key client for them), as
    # does UDI_BEDROCK (requests are signed with the instance's IAM role).
    if not x_openai_key and not config.has_server_credentials:
        return JSONResponse(
            status_code=401,
            content={
                "error": "No OpenAI API key. Set OPENAI_API_KEY (or UDI_BEDROCK) "
                "in the agent's .env, or send a key via the X-OpenAI-Key header."
            },
        )

    # Only enforce budget for users who don't bring their own key.
    budget_check = None if x_openai_key else app.state.budget_check

    # A caller-supplied model is honored only alongside a caller-supplied key:
    # whoever pays for the tokens picks the model. On the server's own key,
    # model choice (and its cost) stays the operator's.
    # ponytail: key ownership is the permission check here. If deployments ever
    # need to grant model choice independently of who pays, that becomes a
    # role/claim lookup on token_payload — see the agent README.
    requested_model = request.model if x_openai_key else None
    if request.model and not x_openai_key:
        logger.info(
            "ignoring requested model %r: no caller-supplied key", request.model
        )

    result = orchestrator.run(
        messages=request.messages,
        data_schema=request.dataSchema,
        data_domains=request.dataDomains,
        openai_api_key=x_openai_key,
        model=requested_model,
        budget_check=budget_check,
        session_id=x_conversation_id,
    )
    logger.info("orchestrator_choice: %s", result.orchestrator_choice)
    logger.info("usage: %s", result.usage)
    logger.info(
        "tool_calls: count=%d names=%s",
        len(result.tool_calls),
        [tool_call.get("name", "unknown") for tool_call in result.tool_calls],
    )
    return JSONResponse(
        content=result.tool_calls,
        headers=_usage_headers(result.usage, requested_model),
    )


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


def _no_backend_message(package, engines) -> str:
    """Actionable 404 text: what's configured (if anything) and how to fix it."""
    if not engines:
        return (
            f"no query backend configured for package {package!r}: the server has "
            "no query backends loaded. Set UDI_QUERY_BACKENDS to a seeded config "
            "(seed one with packages/agent/scripts/seed_duckdb.py, or run the "
            "'Data: Use penguins (remote/DuckDB)' VS Code task) and restart the agent."
        )
    return (
        f"no query backend configured for package {package!r}. Configured packages: "
        f"{sorted(engines)}. Point VITE_UDI_REMOTE_PACKAGE at one of these, or seed "
        f"{package!r} and restart the agent."
    )


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
# Bounded: unbounded per-user caches are a slow leak in a long-lived process.
# A plain dict, not an OrderedDict: dicts are insertion-ordered, LRU needs only
# re-insert and drop-first, and this stays a documented extension point that
# callers can assign a bare {} to.
_MAX_METADATA_CACHES = 32
app.state.metadata_caches = {}


@app.get("/v1/yac/metadata")
def yac_metadata(
    package: str | None = None,
    refresh: bool = False,
    token_payload: dict = Depends(verify_jwt),
):
    """Backend-introspected dataSchema/dataDomains for a package — the
    remote-mode replacement for browser-side CSV domain computation. Cached
    with a TTL; pass ?refresh=1 to force re-introspection."""
    engines = app.state.query_engines
    key = package if package in engines else "default"
    engine = engines.get(key)
    if engine is None:
        return JSONResponse(
            status_code=404,
            content={"error": _no_backend_message(package, engines)},
        )
    token = token_payload.get(RAW_TOKEN_CLAIM)
    principal = token_payload.get("sub") if engine.connector.jwt_passthrough else None
    caches = app.state.metadata_caches
    cache_key = (key, principal)
    if cache_key in caches:
        caches[cache_key] = caches.pop(cache_key)  # re-insert = move to newest
    else:
        from udiagent.query import MetadataCache

        caches[cache_key] = MetadataCache(
            engine, package or key, ttl_seconds=config.udi_metadata_ttl_seconds
        )
        while len(caches) > _MAX_METADATA_CACHES:
            del caches[next(iter(caches))]  # oldest insertion = LRU

    with use_db_token(token):
        cache = caches[cache_key]
        metadata = cache.refresh() if refresh else cache.get()
    return {
        "package": package or key,
        "interactive": False,
        **metadata,
    }


@app.post("/v1/yac/query")
def yac_query(
    request: YACQueryRequest,
    token_payload: dict = Depends(verify_jwt),
):
    engines = app.state.query_engines
    engine = engines.get(request.package) or engines.get("default")
    if engine is None:
        return JSONResponse(
            status_code=404,
            content={"error": _no_backend_message(request.package, engines)},
        )
    with use_db_token(token_payload.get(RAW_TOKEN_CLAIM)):
        results = engine.run_batch(
            [q.model_dump() for q in request.queries],
            request.selections,
        )
    return {"results": results}


@app.post("/v1/yac/vis_instantiate", response_model=YACVisInstantiateResponse)
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
    from udiagent.vis_generate import (
        _load_generated_tools,
        _parse_request_schema,
        instantiate_template,
        shared_entities_for,
        template_tweakable_params,
        unbound_placeholders,
        validate_bindings,
    )

    generated = _load_generated_tools()
    if generated is None:
        return JSONResponse(
            status_code=503,
            content={
                "code": "templates_unavailable",
                "error": "This agent has no generated visualization templates.",
            },
        )
    _tool_defs, tool_dispatch, templates, _tool_tags = generated

    entry = tool_dispatch.get(request.tool)
    if entry is None:
        return JSONResponse(
            status_code=404,
            content={
                "code": "unknown_template",
                "error": (
                    f"Unknown visualization template '{request.tool}'. The agent's "
                    "templates may have changed since this chart was created."
                ),
            },
        )
    template_idx, param_map = entry
    spec_template = templates[template_idx]

    schema = _parse_request_schema(request.dataSchema)
    if not schema.get("entities"):
        # _parse_request_schema degrades to an empty schema by design, which
        # would validate nothing and instantiate an unusable spec.
        return JSONResponse(
            status_code=400,
            content={
                "code": "bad_schema",
                "error": "dataSchema has no entities; send the data package descriptor.",
            },
        )

    bindings = {
        param_map[k]: v for k, v in request.toolArgs.items() if k in param_map
    }

    missing = unbound_placeholders(spec_template, param_map, bindings)
    if missing:
        return JSONResponse(
            status_code=422,
            content={
                "code": "missing_bindings",
                "error": (
                    "Missing bindings for this template: " + ", ".join(missing)
                ),
                "errors": missing,
            },
        )

    errors = validate_bindings(
        spec_template, bindings, schema, shared_entities=shared_entities_for(request.tool)
    )
    if errors:
        # errors[0] is already reader-grade prose naming the valid alternatives.
        return JSONResponse(
            status_code=422,
            content={"code": "invalid_bindings", "error": errors[0], "errors": errors},
        )

    try:
        spec = instantiate_template(spec_template, bindings, schema)
    except Exception as exc:  # noqa: BLE001 - reported, not swallowed
        logger.warning("vis_instantiate failed for %s: %s", request.tool, exc)
        return JSONResponse(
            status_code=500,
            content={
                "code": "instantiate_failed",
                "error": f"Could not build a spec from template '{request.tool}'.",
            },
        )

    return {
        "spec": spec,
        "toolArgs": {k: v for k, v in request.toolArgs.items() if k in param_map},
        "params": template_tweakable_params(
            spec_template, param_map, bindings, schema
        ),
    }


@app.post("/v1/yac/benchmark")
def yac_benchmark(
    request: YACBenchmarkCompletionRequest,
    token_payload: dict = Depends(verify_jwt),
    x_openai_key: str | None = Header(None, alias="X-OpenAI-Key"),
):
    refusal = _reject_byok_in_bedrock_mode(x_openai_key)
    if refusal is not None:
        return refusal

    result = orchestrator.run(
        messages=request.messages,
        data_schema=request.dataSchema,
        data_domains=request.dataDomains,
        openai_api_key=x_openai_key,
        model=request.model if x_openai_key else None,
    )

    return {
        "tool_calls": result.tool_calls,
        "orchestrator_choice": result.orchestrator_choice,
        "usage": asdict(result.usage),
    }


@app.get("/v1/yac/examples")
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


@app.get("/v1/yac/structured_functions")
def yac_structured_functions():
    """Return the structured function registry for frontend consumption."""
    return JSONResponse(content=export_registry_json())


@app.get("/v1/yac/benchmark_analysis")
def yac_benchmark_analysis():
    result_filename = "./out/benchmark_analysis.json"
    if not os.path.exists(result_filename):
        return JSONResponse(
            content={"error": f"File {result_filename} not found."}, status_code=404
        )

    with open(result_filename, "r") as f:
        data = json.load(f)

    return JSONResponse(content=data)
