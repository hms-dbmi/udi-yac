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
)

# ---------------------------------------------------------------------------
# Bootstrap
# ---------------------------------------------------------------------------

load_dotenv()

# --- Logging setup ---
_log_dir = Path(__file__).resolve().parent.parent.parent.parent / "logs"
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
        "Received /v1/yac/completions request (conversation=%s): %s",
        x_conversation_id,
        request,
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
    logger.info("tool_calls: %s", result.tool_calls)
    return JSONResponse(
        content=result.tool_calls,
        headers=_usage_headers(result.usage),
    )


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
    examples_path = "./data/example_prompts.json"
    if not os.path.exists(examples_path):
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
