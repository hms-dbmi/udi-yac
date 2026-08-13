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
from openai import AuthenticationError
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
from udiagent.server.config import ServerConfig
from udiagent.server.auth import make_verify_jwt
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
_DATA_DIR = _PACKAGE_ROOT / "data"

# --- Logging setup ---
_log_dir = _PACKAGE_ROOT / "logs"
_log_dir.mkdir(exist_ok=True)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    handlers=[
        RotatingFileHandler(
            _log_dir / "udi_agent.log", maxBytes=5_000_000, backupCount=3
        ),
        logging.StreamHandler(),
    ],
)

# uvicorn's --reload watcher passes watch_filter=None, so watchfiles logs EVERY
# raw change at INFO. Our file handler is on the root logger and writes inside
# the watched tree, so that log line is itself a change -> endless feedback
# loop. uvicorn still logs its own "Detected changes ... Reloading" at WARNING.
logging.getLogger("watchfiles").setLevel(logging.WARNING)

logger = logging.getLogger(__name__)

# --- Config ---
config = ServerConfig.from_env()

# --- Agent & Orchestrator ---
agent = UDIAgent(
    gpt_model_name=config.gpt_model_name,
    openai_api_key=config.openai_api_key,
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


def _usage_headers(usage: Usage | None) -> dict[str, str]:
    """Render a ``Usage`` as the ``X-Usage-*`` header bundle for metering."""
    if usage is None:
        usage = Usage()
    return {
        "X-Usage-Prompt-Tokens": str(usage.prompt_tokens),
        "X-Usage-Completion-Tokens": str(usage.completion_tokens),
        "X-Usage-Total-Tokens": str(usage.total_tokens),
        "X-Usage-Cached-Prompt-Tokens": str(usage.cached_prompt_tokens),
        "X-Usage-Reasoning-Tokens": str(usage.reasoning_tokens),
        "X-Usage-Model": agent.gpt_model_name,
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


app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
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

    # No key from the caller and none configured server-side → actionable 401
    # instead of the RuntimeError the orchestrator would raise (a bare 500).
    if not x_openai_key and not config.openai_api_key:
        return JSONResponse(
            status_code=401,
            content={
                "error": "No OpenAI API key. Set OPENAI_API_KEY in the agent's "
                ".env or send one via the X-OpenAI-Key header."
            },
        )

    # Only enforce budget for users who don't bring their own key.
    budget_check = None if x_openai_key else app.state.budget_check

    result = orchestrator.run(
        messages=request.messages,
        data_schema=request.dataSchema,
        data_domains=request.dataDomains,
        openai_api_key=x_openai_key,
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
        headers=_usage_headers(result.usage),
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
    if backend_type == "duckdb":
        connector = DuckDBConnector(
            database=spec.get("database", ":memory:"),
            views=spec.get("views"),
        )
    elif backend_type == "starrocks":
        connector = StarRocksConnector(**spec.get("connection", {}))
    else:
        raise ValueError(f"unknown query backend type: {backend_type!r}")
    return QueryEngine(
        connector,
        table_map=spec.get("tables", {}),
        row_cap=spec.get("rowCap", 5000),
        entity_schemas=spec.get("schemas"),
    )


def _load_query_engines() -> dict:
    raw = os.getenv("UDI_QUERY_BACKENDS")
    if not raw:
        return {}
    # A relative value also gets tried against the package root, for the same
    # reason load_dotenv above takes an explicit path: `pnpm dev:agent` and the
    # VS Code tasks launch from the REPO ROOT, while the seed scripts write their
    # config next to themselves in packages/agent — so the documented
    # `UDI_QUERY_BACKENDS=starrocks-backends.json` resolved to nothing and the
    # server died on a bare FileNotFoundError. CWD is still tried first, so a
    # path that already worked keeps working.
    path = Path(raw)
    if not path.is_absolute() and not path.exists():
        from_package = _PACKAGE_ROOT / path
        if from_package.exists():
            path = from_package
    if not path.exists():
        raise FileNotFoundError(
            f"UDI_QUERY_BACKENDS={raw!r} not found. Looked in {Path(raw).resolve()}"
            + (f" and {_PACKAGE_ROOT / raw}" if not Path(raw).is_absolute() else "")
            + ". Seed a backend first: packages/agent/scripts/seed_starrocks.py "
            "(or seed_duckdb.py) writes this file into packages/agent/."
        )
    engines = {}
    for package, spec in json.loads(path.read_text()).items():
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


app.state.query_engines = _load_query_engines()
# package name -> MetadataCache (created lazily per configured engine)
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
    caches = app.state.metadata_caches
    if key not in caches:
        from udiagent.query import MetadataCache

        ttl = float(os.getenv("UDI_METADATA_TTL_SECONDS", "3600"))
        caches[key] = MetadataCache(engine, package or key, ttl_seconds=ttl)
    metadata = caches[key].refresh() if refresh else caches[key].get()
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

    errors = validate_bindings(spec_template, bindings, schema)
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
    result = orchestrator.run(
        messages=request.messages,
        data_schema=request.dataSchema,
        data_domains=request.dataDomains,
        openai_api_key=x_openai_key,
    )

    return {
        "tool_calls": result.tool_calls,
        "orchestrator_choice": result.orchestrator_choice,
        "usage": asdict(result.usage),
    }


@app.get("/v1/yac/examples")
def yac_examples():
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
