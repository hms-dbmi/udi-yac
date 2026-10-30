# Running the server

The `udiagent.server` subpackage provides a reference FastAPI application that wraps the library as a configurable microservice. It reads configuration from environment variables.

## Running the Server for Local Development

Pass `--extra server` on every `uv run` (it provides the `fastapi` CLI). `uv
run` prunes any extra you don't name, so a bare `uv run fastapi` errors with
`Failed to spawn: fastapi`. Add the backend driver extra too when using
server-side data (`--extra duckdb` and/or `--extra starrocks`).

```bash
# Development
uv run --extra server fastapi dev src/udiagent/server/app.py --port 8007

# Production
uv run --extra server fastapi run src/udiagent/server/app.py --port 8007
```

## Server Environment Variables

<!-- BEGIN generated: env vars (scripts/gen_env_docs.py) -->

| Variable                       | Default            | Description                                                                                                                                                                                                                                                                                                                                                                                           |
| ------------------------------ | ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `JWT_SECRET_KEY`               | —                  | JWT signing key for self-issued tokens. Required unless `INSECURE_DEV_MODE=1` or `JWT_JWKS_URL` is set.                                                                                                                                                                                                                                                                                               |
| `JWT_ALGORITHM`                | `HS256`            | JWT algorithm. Set to the identity provider's (e.g. `RS256`) when using `JWT_JWKS_URL`.                                                                                                                                                                                                                                                                                                               |
| `JWT_JWKS_URL`                 | —                  | Verify externally issued tokens against an identity provider's JWKS endpoint instead of `JWT_SECRET_KEY`. Mutually exclusive with it.                                                                                                                                                                                                                                                                 |
| `JWT_ISSUER`                   | —                  | Expected `iss` claim; validated only when set.                                                                                                                                                                                                                                                                                                                                                        |
| `JWT_AUDIENCE`                 | —                  | Expected `aud` claim. Required with `JWT_JWKS_URL`.                                                                                                                                                                                                                                                                                                                                                   |
| `INSECURE_DEV_MODE`            | `0`                | Skip JWT verification entirely. Development only — never set this in production.                                                                                                                                                                                                                                                                                                                      |
| `UDI_CORS_ORIGINS`             | `*`                | Comma-separated list of browser origins allowed to call this server. Defaults to `*` (any origin). Note that credentialed requests are always permitted, so with `*` any site can call this server with a user's cookies — name your origins explicitly in production.                                                                                                                                |
| `GPT_MODEL_NAME`               | `gpt-5.4`          | Model for orchestration; with a custom base URL, that backend's model id. Callers may override it per-request only by supplying their own `X-OpenAI-Key`.                                                                                                                                                                                                                                             |
| `OPENAI_API_KEY`               | —                  | OpenAI API key. If unset, callers must supply one per-request via the `X-OpenAI-Key` header.                                                                                                                                                                                                                                                                                                          |
| `OPENAI_BASE_URL`              | —                  | Root of any OpenAI-compatible backend (Azure AI Foundry, Bedrock, OpenRouter, Ollama, vLLM). Must support function calling and JSON-schema structured outputs. For Bedrock this is the static-API-key path; see `UDI_BEDROCK` for an IAM role.                                                                                                                                                        |
| `UDI_BEDROCK`                  | `0`                | Authenticate to Amazon Bedrock with SigV4 from the default AWS credential chain (EC2 instance profile, ECS task role, `AWS_PROFILE`, `~/.aws/credentials`), so no key is stored. Mutually exclusive with `OPENAI_API_KEY` and `OPENAI_BASE_URL`. Per-request `X-OpenAI-Key` headers are refused with a 403 in this mode, so no prompt reaches api.openai.com. Requires the `udiagent[bedrock]` extra. |
| `AWS_REGION`                   | —                  | AWS region for Bedrock; also determines the endpoint. Required with `UDI_BEDROCK`, though the AWS SDK will also accept `AWS_DEFAULT_REGION` or `~/.aws/config` — there is no instance metadata fallback. Set `AWS_BEDROCK_BASE_URL` instead to reach a PrivateLink endpoint.                                                                                                                          |
| `UDI_OPENAI_API`               | `chat_completions` | Which OpenAI-compatible endpoint to call: `chat_completions` or `responses`. Some OpenAI models (e.g. `gpt-6.1-sol`) only call tools through `responses`; self-hosted backends (vLLM, Ollama) generally want the default.                                                                                                                                                                             |
| `UDI_REASONING_EFFORT`         | —                  | Reasoning effort sent with every request (`none`, `low`, `medium`, …), passed through as-is so new provider values work without a release. Unset sends nothing, leaving the model's default.                                                                                                                                                                                                          |
| `UDI_TEMPERATURE`              | `0`                | Sampling temperature sent with every request, or `omit` to send none. OpenAI rejects a temperature whenever `UDI_REASONING_EFFORT` is anything but `none`, so set `omit` with reasoning models there.                                                                                                                                                                                                 |
| `UDI_MAX_COMPLETION_TOKENS`    | —                  | Output-token cap for every request, replacing the built-in ones (1024 for tool calls, 16384 for structured JSON). Reasoning tokens count against it, so raise it when reasoning is on.                                                                                                                                                                                                                |
| `UDI_VIS_TOOL_CHOICE`          | `auto`             | Whether the chart-template call may answer without picking a template (`auto`, which then replies that no template fits) or must pick one (`required`). Some models (e.g. `gpt-6.1-sol`) reply in prose to many chart requests unless this is `required`.                                                                                                                                             |
| `LANGFUSE_PUBLIC_KEY`          | —                  | LangFuse public key. Tracing is off unless all three are set.                                                                                                                                                                                                                                                                                                                                         |
| `LANGFUSE_SECRET_KEY`          | —                  | LangFuse secret key. Tracing is off unless all three are set.                                                                                                                                                                                                                                                                                                                                         |
| `LANGFUSE_HOST`                | —                  | LangFuse instance URL, e.g. `https://cloud.langfuse.com`. `LANGFUSE_BASE_URL` is accepted too.                                                                                                                                                                                                                                                                                                        |
| `LANGFUSE_ENVIRONMENT`         | —                  | Tags traces with an environment label (e.g. `production`). Does not by itself enable tracing.                                                                                                                                                                                                                                                                                                         |
| `UDI_ISSUE_REPORT_WEBHOOK_URL` | —                  | Notified of every issue report (`POST /v1/yac/issue_report`): a JSON POST with a Slack-style `text` summary plus the report's note, source, contact and LangFuse trace link — never the session. Works as-is with Slack and Teams incoming webhooks; route it through Zapier or Power Automate for email. Needs LangFuse, since reports are refused without it.                                       |
| `UDI_QUERY_BACKENDS`           | —                  | Path to a JSON file mapping package names to StarRocks/DuckDB connections, served via `/v1/yac/query` and `/v1/yac/metadata`. Written by the seed scripts — see `dev/duckdb/README.md`. A relative path is tried against the working directory first, then against `packages/agent`, where the seed scripts write it.                                                                                 |
| `UDI_METADATA_TTL_SECONDS`     | `3600`             | TTL for the introspected-metadata cache.                                                                                                                                                                                                                                                                                                                                                              |
| `UDI_LOG_DIR`                  | —                  | Where the rotating log file goes. Defaults to `<package root>/logs`; file logging is skipped if unwritable.                                                                                                                                                                                                                                                                                           |
| `UDI_DATA_DIR`                 | —                  | Repo-level dev data for `/v1/yac/examples`. Defaults to `<package root>/data`; set this when installed from a wheel.                                                                                                                                                                                                                                                                                  |
| `UDI_GIT_SHA`                  | —                  | Commit the server was built from, reported by `GET /`. The Docker image build sets it; leave unset.                                                                                                                                                                                                                                                                                                   |

<!-- END generated: env vars -->

## External identity providers

When the chat is embedded in a portal that already authenticates its users, the
server can verify the portal's own tokens instead of issuing its own. Point
`JWT_JWKS_URL` at the identity provider's JWKS endpoint (Keycloak, Globus,
Auth0, Entra — anything publishing JWKS) and set `JWT_ALGORITHM` to the
algorithm it signs with:

```ini
JWT_JWKS_URL=https://idp.example/realms/udi/protocol/openid-connect/certs
JWT_ALGORITHM=RS256
JWT_AUDIENCE=udi-yac
JWT_ISSUER=https://idp.example/realms/udi   # optional
```

`JWT_AUDIENCE` is required in this mode: without it, any token the provider
minted for _any_ of its clients would be accepted here. `JWT_ISSUER` is checked
only when set.

`JWT_JWKS_URL` and `JWT_SECRET_KEY` are mutually exclusive — setting both
refuses startup, as does a JWKS URL with a symmetric `JWT_ALGORITHM` or without
`JWT_AUDIENCE`.

Keys are fetched on the first authenticated request and cached for 5 minutes. A
token whose `kid` isn't in the cached set triggers an early refresh, so a
provider that rotates without pre-publishing its new key doesn't cause an outage
until the cache expires; those early refreshes are throttled to one every 10
seconds. While the provider is unreachable, requests return `503`.

Note that udi-yac does not run an identity provider of its own — for a
standalone deployment with no portal in front, use `JWT_SECRET_KEY`.

### Getting the token from the portal to here

The server only ever sees an `Authorization: Bearer` header; it does not care
how that header was produced. Two topologies produce it, and which one applies
depends on where the host portal keeps its token.

**The host page holds the token.** It passes it to the chat as `authToken` (see
`UDIChatConfig`) and the browser calls this server directly. `UDI_CORS_ORIGINS`
must name the portal's origin, since those are cross-origin requests.

**The host's backend holds the token.** Portals that keep the IdP token
server-side — never in a cookie or local storage the page can read — have
nothing to hand the chat. Instead the portal proxies our endpoints from its own
backend and attaches the header there:

```
browser → https://portal.example/api/yac/*  (portal backend attaches the
                                             Authorization header)
        → https://agent.internal/v1/yac/*
```

Point the chat's `apiBaseUrl` at that path (`/api/yac`) and leave `authToken`
unset — the chat then sends no `Authorization` header of its own, and the proxy
supplies it. The browser never talks to this server, so `UDI_CORS_ORIGINS` is
irrelevant to the request path and the agent can stay on a private network.
That is the arrangement for the Radiant portal (see
[#118](https://github.com/hms-dbmi/udi-yac/issues/118)).

The proxy route must forward the request body, the `X-Conversation-Id` and
`X-OpenAI-Key` request headers, and the `X-Usage-*` response headers.

Either way, a verified token means the user is allowed to _use_ this server.
By default it does not scope query results: server-side query backends connect
with the service credentials in `UDI_QUERY_BACKENDS`. A StarRocks backend with
`jwtPassthrough` is the exception — it forwards the caller's own token to the
database, which then applies that user's grants (see
[`query/README.md`](../src/udiagent/query/README.md)). That needs a real token, so
it rules out the proxy topology above unless the proxy attaches a token the
database can verify too.

### Future: role-based model permissions

Today, permission to choose a model is tied to who pays for it: `/v1/yac/completions`
honors a request's `model` only when the caller also supplies an `X-OpenAI-Key`.
Otherwise the server's `GPT_MODEL_NAME` applies and the requested model is
ignored (and logged).

That's a proxy for the real question, which is whether _this user_ is allowed to
pick a model. Deployments that already authenticate users through an identity
provider have a better signal available: `verify_jwt` returns the decoded token,
so a claim on it (`realm_access.roles`, a group, a scope) could authorize model
selection independently of key ownership — letting a trusted role pick a model on
the server's key, while everyone else stays on the default. That would replace
the `if x_openai_key` gate in `yac_completions`; nothing else in the request path
would change.

## Server Endpoints

Every endpoint, with its request and response schemas, is in the
[HTTP API reference](https://hms-dbmi.github.io/udi-yac/docs/backend/http-api/).
It is rendered from [`openapi.json`](../openapi.json), which
`scripts/gen_openapi.py` generates from the FastAPI app; CI fails when the two
drift apart. A running server also serves its spec at `/openapi.json` and
interactive docs at `/docs`.

The benchmark endpoints (`/v1/yac/benchmark`, `/v1/yac/benchmark_analysis`)
are left out of the reference; see [Benchmarking](benchmarking.md).

## Server-side query backends

`/v1/yac/query` and `/v1/yac/metadata` let data stay on the server: the agent
compiles UDI grammar transformation pipelines to SQL and runs them against a
configured database (StarRocks, DuckDB) instead of the browser loading CSVs.
Configure backends via `UDI_QUERY_BACKENDS` (a package→backend JSON map) and
point the chat at a package with `VITE_UDI_REMOTE_PACKAGE`.

**Full architecture + integration guide:
[`src/udiagent/query/README.md`](../src/udiagent/query/README.md).**
Local dev instance: [`dev/starrocks/README.md`](../../../dev/starrocks/README.md).

## Docker

**Build from the repo root**, not from `packages/agent`: `uv.lock` is the uv
workspace lockfile and lives at the root (see root `pyproject.toml`
`[tool.uv.workspace]`). The `.dockerignore` at the root keeps the JS half of the
monorepo out of the build context.

```bash
docker build -f packages/agent/Dockerfile -t udiagent .   # from the repo root
docker run -p 8007:80 --env-file packages/agent/.env udiagent
```

The image installs the `server` + `langfuse` + `bedrock` extras. Add
`--extra duckdb` / `--extra starrocks` to both `uv sync` lines if the deployment
serves [server-side query backends](#server-side-query-backends).
