# UDIAgent

LLM-powered data visualization orchestration library for the Universal Discovery Interface (UDI).

UDIAgent orchestrates LLM calls to generate data visualization specs from natural language queries. It can be used as a **standalone Python library** or deployed as a **FastAPI microservice**.

## Installation

```bash
# Core library only
pip install udiagent

# With the reference FastAPI server
pip install udiagent[server]

# With LangFuse observability
pip install udiagent[langfuse]

# With benchmarking tools
pip install udiagent[benchmark]

# Everything
pip install udiagent[all]
```

For local development with `uv`:

```bash
uv sync --extra server --extra langfuse --extra test   # server + dev
```

## Library Usage

```python
from udiagent import UDIAgent, Orchestrator

# Initialize the agent with explicit configuration (no environment variables)
agent = UDIAgent(
    gpt_model_name="gpt-5.4",
    openai_api_key="sk-...",
)

# Create an orchestrator
orch = Orchestrator(agent)

# Run a query
result = orch.run(
    messages=[{"role": "user", "content": "Show me a bar chart of donors by sex"}],
    data_schema='{"resources": [...]}',
    data_domains='[{"entity": "donors", "field": "sex", ...}]',
)

# result.tool_calls — list of tool call dicts (e.g. RenderVisualization, FilterData)
# result.orchestrator_choice — "render-visualization", "both", "explain", etc.
```

### With LangFuse observability

LangFuse tracing is opt-in. Install the extra (`pip install udiagent[langfuse]`) and pass any of the three credentials to `UDIAgent`:

```python
agent = UDIAgent(
    gpt_model_name="gpt-5.4",
    openai_api_key="sk-...",
    langfuse_public_key="pk-lf-...",
    langfuse_secret_key="sk-lf-...",
    langfuse_host="https://cloud.langfuse.com",  # or your self-hosted URL
    langfuse_environment="production",            # optional; tags traces (e.g. "staging")
)
```

Tracing turns on when **any** of `langfuse_public_key`, `langfuse_secret_key`, or `langfuse_host` is set. `langfuse_environment` is purely a tag — it labels traces in the LangFuse UI but does not by itself enable tracing.

Installing `udiagent[langfuse]` alone does **not** enable tracing — credentials must be supplied explicitly. Library consumers who prefer environment-variable configuration should read the env vars themselves and pass the values to the constructor.

### Key Classes

| Class                | Description                                                                            |
| -------------------- | -------------------------------------------------------------------------------------- |
| `UDIAgent`           | OpenAI client wrapper                                                                  |
| `Orchestrator`       | Routes user requests to visualization, filter, explanation, and clarification handlers |
| `OrchestratorResult` | Dataclass with `tool_calls` and `orchestrator_choice`                                  |

### Utility Functions

| Function                   | Description                                                       |
| -------------------------- | ----------------------------------------------------------------- |
| `load_grammar()`           | Load the UDI Grammar JSON schema (bundled with the package)       |
| `load_skills()`            | Load skill prompt templates (bundled with the package)            |
| `render_template()`        | Substitute `{{key}}` placeholders in a skill instruction template |
| `generate_vis_spec()`      | Generate a visualization spec using the skills pipeline           |
| `simplify_data_domains()`  | Simplify data domains JSON into compact LLM-friendly text         |
| `parse_schema_from_dict()` | Parse a data schema dict into structured format                   |

## Server Usage

The `udiagent.server` subpackage provides a reference FastAPI application that wraps the library as a configurable microservice. It reads configuration from environment variables.

### Running the Server for Local Development

```bash
# Development
uv run fastapi dev src/udiagent/server/app.py --port 8007

# Production
uv run fastapi run src/udiagent/server/app.py --port 8007
```

### Server Environment Variables

| Variable              | Required | Default   | Description                                                                         |
| --------------------- | -------- | --------- | ----------------------------------------------------------------------------------- |
| `OPENAI_API_KEY`      | No       | —         | OpenAI API key. If not set, must be provided per-request via `X-OpenAI-Key` header. |
| `GPT_MODEL_NAME`      | No       | `gpt-5.4` | OpenAI model for orchestration                                                      |
| `JWT_SECRET_KEY`      | Yes\*    | —         | JWT signing key (\*not required if `INSECURE_DEV_MODE=1`)                           |
| `JWT_ALGORITHM`       | No       | `HS256`   | JWT algorithm                                                                       |
| `INSECURE_DEV_MODE`   | No       | `0`       | Set to `1` to skip JWT verification (development only)                              |
| `LANGFUSE_SECRET_KEY` | No       | —         | LangFuse observability secret key (opt-in; tracing is disabled when unset)          |
| `LANGFUSE_PUBLIC_KEY` | No       | —         | LangFuse observability public key (opt-in; tracing is disabled when unset)          |
| `LANGFUSE_HOST`       | No       | —         | LangFuse instance URL (e.g. `https://cloud.langfuse.com`)                           |
| `LANGFUSE_ENVIRONMENT`| No       | —         | Tags traces with an environment label (e.g. `production`); does not enable tracing  |

### Server Endpoints

| Endpoint                       | Method | Description                                           |
| ------------------------------ | ------ | ----------------------------------------------------- |
| `/`                            | GET    | API status and info                                   |
| `/v1/yac/completions`          | POST   | Main orchestrator — routes user requests to tools     |
| `/v1/yac/benchmark`            | POST   | Benchmark variant with optional orchestrator override |
| `/v1/yac/examples`             | GET    | Example prompts from `data/example_prompts.json`      |
| `/v1/yac/structured_functions` | GET    | Structured function registry                          |
| `/v1/yac/benchmark_analysis`   | GET    | Latest benchmark analysis results                     |

### Docker

```bash
docker build -t udiagent .
docker run -p 80:80 --env-file .env udiagent
```

## Architecture

### Orchestration Flow

```
User query
  → Orchestrator.run()
    → GPT with ORCHESTRATOR_TOOLS (5 tools: CreateVisualization, FilterData,
      FreeTextExplain, ClarifyVariable, Rebuff)
    → Dispatch each tool call to its handler
    → Return OrchestratorResult(tool_calls, orchestrator_choice)
```

### Visualization Generation

Executes a two-step markdown skill plan via `generate_vis_spec` (`vis_generate.py`):

1. **generate** — LLM produces a UDI Grammar spec from the request, schema, and few-shot examples
2. **validate** — JSON schema check with a bounded repair-retry loop

Skills live in `src/udiagent/data/skills/*.md` (YAML frontmatter + prompt body).

### Design Principles

- **Stateless** — All context travels in message history; no server-side session state
- **Skills as Markdown** — Prompt templates live in `.md` files with YAML frontmatter
- **Per-request key override** — Supports both default and per-request OpenAI API keys

## Regenerating Template Visualizations and Tool Definitions

The vis pipeline uses two generated artifacts:

- `src/udiagent/data/skills/template_visualizations.json` — template visualization specs
- `src/udiagent/generated_vis_tools.py` — typed OpenAI function-calling tool definitions

To regenerate both in one step:

```bash
uv pip install -e ".[codegen]"
uv run python scripts/regenerate_vis_tools.py
```

By default this uses `data/data_domains/hubmap_data_schema.json` as the schema. To use a different schema:

```bash
uv run python scripts/regenerate_vis_tools.py --schema data/data_domains/SenNet_domains.json
```

## Benchmarking

### Step 0: Start the API server

```bash
uv run fastapi dev src/udiagent/server/app.py --port 8007 &
```

### Step 1: Run tiny benchmark (1 example)

```bash
uv run python -m udiagent.benchmark.runner --no-orchestrator --path ./data/benchmark_dqvis/tiny.jsonl
```

### Step 2: Run small benchmark (100 examples)

```bash
uv run python -m udiagent.benchmark.runner --no-orchestrator --path ./data/benchmark_dqvis/small.jsonl --workers 5
```

Resume a failed run:

```bash
uv run python -m udiagent.benchmark.runner --path ./data/benchmark_dqvis/small.jsonl --workers 5 --resume ./out/<TIMESTAMP>/benchmark_results.json
```

## License

MIT
