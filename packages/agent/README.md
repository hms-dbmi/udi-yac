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

# With Amazon Bedrock IAM-role (SigV4) authentication
pip install udiagent[bedrock]

# With benchmarking tools
pip install udiagent[benchmark]

# Everything
pip install udiagent[all]
```

For local development with `uv`:

```bash
uv sync --extra server --extra langfuse --extra test --extra bedrock   # server + dev
```

## Quick start

As a library:

```python
from udiagent import UDIAgent, Orchestrator

agent = UDIAgent(gpt_model_name="gpt-5.4", openai_api_key="sk-...")
result = Orchestrator(agent).run(
    messages=[{"role": "user", "content": "Show me a bar chart of donors by sex"}],
    data_schema='{"resources": [...]}',
    data_domains='[{"entity": "donors", "field": "sex", ...}]',
)
# result.tool_calls: the tool calls to apply (RenderVisualization, FilterData, ...)
```

As a server, for local development (from `packages/agent`):

```bash
INSECURE_DEV_MODE=1 uv run --extra server fastapi dev src/udiagent/server/app.py --port 8007
```

## Documentation

- [Library usage](docs/library.md): configuration, template sets, reasoning
  models, OpenAI-compatible backends, Amazon Bedrock, LangFuse.
- [Running the server](docs/server.md): environment variables, identity
  providers, server-side query backends, Docker.
- [Deployment guide](docs/deployment.md): standing the server up on a host.
- [How the agent works](docs/architecture.md): the request flow, chart
  templates, filters, and regenerating the generated template files.
- [Benchmarking](docs/benchmarking.md): measuring a server configuration.
- [Server-side data](src/udiagent/query/README.md): compiling the grammar to SQL.
- Reference: the [Python API](https://hms-dbmi.github.io/udi-yac/docs/backend/python-api/)
  and the server's OpenAPI spec (`/openapi.json` on a running server).

## License

MIT
