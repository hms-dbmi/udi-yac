# Deployment guide

Step-by-step for standing the agent up as a server on a fresh host. There are
two supported ways to get the code onto the host — pick one, then follow the
shared steps:

|                     | **Path A** — container from source                                | **Path B** — `udiagent[server]` from PyPI                           |
| ------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------- |
| Use when            | deploying a branch or unreleased code; want the exact pinned deps | deploying a released version; no repo checkout; own process manager |
| Host needs          | Docker + a clone of this repo                                     | Python ≥ 3.12 and `pip`/`uv`                                        |
| Dependency versions | exact, from the workspace `uv.lock`                               | resolved at install time from `pyproject.toml` ranges               |
| Process supervision | `--restart unless-stopped`                                        | yours (systemd unit below)                                          |
| Dev-data endpoints  | work out of the box                                               | need `UDI_DATA_DIR` (step 3B)                                       |

Steps 1–2 and 4–5 apply to both, step 3 splits, and step 6 is client-side.

## 1. Get the code on the host

**Path A — clone the repo:**

```bash
git clone https://github.com/hms-dbmi/udi-yac.git
cd udi-yac
git checkout <tag or branch>   # e.g. a release tag, udiagent-vX.Y.Z
```

Only the Python workspace matters for the agent image — no `pnpm install`, no
`uv sync` on the host. The build installs dependencies inside the image.

**Path B — install the published distribution:**

```bash
python -m venv /opt/udiagent/venv          # or: uv venv /opt/udiagent/venv
/opt/udiagent/venv/bin/pip install "udiagent[server]"
```

The PyPI distribution is named **`udiagent`** (`udi-yac` is the npm chat
package). Add extras as needed — `"udiagent[server,langfuse]"`, plus `duckdb` /
`starrocks` for [server-side query backends](server.md#server-side-query-backends).

## 2. Write the production env file

Copy the template and fill it in. Environment variables are the server's entire
configuration surface — there is no config file format beyond this.

```bash
# Path A passes it to `docker run --env-file`; Path B finds it in the service's
# working directory, so keep it there.
mkdir -p /opt/udiagent
cp packages/agent/.env.template /opt/udiagent/.env
chmod 600 /opt/udiagent/.env
```

Path B has no repo checkout, so grab the template from
[GitHub](https://github.com/hms-dbmi/udi-yac/blob/main/packages/agent/.env.template)
or just write the values below by hand.

Minimum production values:

```ini
# Auth — REQUIRED. The server refuses to start with an empty signing key
# unless INSECURE_DEV_MODE=1. Never set INSECURE_DEV_MODE in production.
INSECURE_DEV_MODE=0
JWT_SECRET_KEY=<paste output of: openssl rand -hex 32>

# LLM backend — either a server-held key, or leave blank to require callers
# to send their own via the X-OpenAI-Key header.
OPENAI_API_KEY=sk-...
GPT_MODEL_NAME=gpt-5.4
```

Full variable list: [Server Environment Variables](server.md#server-environment-variables).

Where the values come from, in precedence order: real environment variables
(Docker `--env-file`, systemd `EnvironmentFile`, shell exports) win, then
`<package root>/.env` (the repo checkout), then `./.env` from the process
working directory. On Path B the first and third are the usable ones.

### (Optional) point at a third-party OpenAI-compatible backend

To serve from Azure AI Foundry, Bedrock, OpenRouter, or a self-hosted
Ollama/vLLM, add the backend root and its model id:

```ini
OPENAI_BASE_URL=https://openrouter.ai/api/v1
GPT_MODEL_NAME=openai/gpt-oss-120b
OPENAI_API_KEY=<that backend's key>      # may be blank for Ollama/vLLM
```

Two deployment consequences worth deciding on deliberately:

- **`OPENAI_BASE_URL` is global.** The OpenAI SDK reads that env var for every
  client it builds, so requests that bring their own `X-OpenAI-Key` are routed
  to this backend too — a user's personal OpenAI key would be sent to it. If
  you host a bring-your-own-key deployment, leave `OPENAI_BASE_URL` unset.
- **Capability floor.** The backend must support function calling and
  JSON-schema structured outputs (`strict: true`); the orchestrator also uses
  `tool_choice: "required"`. Backends missing these degrade to fallback paths
  instead of failing loudly, so run step 4's visualization request after
  switching backends. Details: [Third-party backends](library.md#third-party-openai-compatible-backends).

### (Optional) Amazon Bedrock with the instance's IAM role

To drop the static key entirely and authenticate with the EC2 instance profile
or ECS task role:

```ini
UDI_BEDROCK=1
AWS_REGION=us-east-1
GPT_MODEL_NAME=openai.gpt-oss-120b-1:0
# Leave OPENAI_API_KEY and OPENAI_BASE_URL unset — the server refuses to start
# if either is set alongside UDI_BEDROCK.
```

Callers cannot opt out of Bedrock: a request carrying `X-OpenAI-Key` is
rejected with a 403 rather than served from api.openai.com, so no prompt or
data schema leaves your AWS account. Pair this with
`VITE_UDI_REQUIRE_API_KEY=false` in the chat frontend.

Behavior and constraints: [Bedrock with an IAM
role](library.md#amazon-bedrock-with-an-iam-role-sigv4). Three infrastructure
preconditions have to hold, and none of them fail loudly in an obvious way:

1. **The role needs Bedrock permissions.** Grant the instance profile or task
   role `bedrock:InvokeModel` and `bedrock:InvokeModelWithResponseStream`.
   Models reachable only through a
   cross-region inference profile also need the action on the profile ARN and
   on the underlying foundation-model ARNs in every region the profile spans.
2. **On EC2, a bridged container needs an IMDS hop limit of at least 2.** With
   the AWS default `HttpPutResponseHopLimit: 1`, Docker's bridge network adds a
   hop, the IMDSv2 token response never reaches the container, and credential
   resolution fails. Set `HttpPutResponseHopLimit: 2` in the launch template's
   `MetadataOptions` (it affects only **newly launched** instances) or fix a
   running instance in place:

   ```bash
   aws ec2 modify-instance-metadata-options --instance-id <id> \
     --http-put-response-hop-limit 2 --http-tokens required
   ```

   ECS tasks are not affected: they get the task role's credentials from the
   ECS credentials endpoint, not from IMDS.

3. **`AWS_REGION` must be in the env file.** There is no instance-metadata
   fallback for the region. Put it in the env file rather than passing
   `-e AWS_REGION=...` to `docker run` — Docker applies `-e` after
   `--env-file` regardless of order, so a flag would override the file and
   remove the operator's ability to invoke cross-region.

If any of the three is wrong, requests return **503** with a generic message
and the server log carries the specific cause at `ERROR` — start there rather
than from the client response.

A local run with `AWS_PROFILE` set exercises the identical code path (same
default credential chain), so the setup can be validated before deploying.

## 3A. Path A — build and run the container

```bash
docker build -f packages/agent/Dockerfile -t udi-agent .     # from repo root

docker stop udi-agent 2>/dev/null; docker rm udi-agent 2>/dev/null
docker run -d \
  --name udi-agent \
  --restart unless-stopped \
  -p 80:8000 \
  --env-file /opt/udiagent/.env \
  udi-agent
```

The container listens on port 8000 as a non-root user — an unprivileged port,
so it binds on runtimes that don't let non-root processes take ports below 1024.
Map it wherever your reverse proxy expects it (`-p 8007:8000`
for a local-only port). Logs go to
`docker logs udi-agent` plus a rotating file at
`/app/packages/agent/logs/udi_agent.log` inside the container.

## 3B. Path B — run the installed distribution

Serve the app module with `uvicorn` (installed by the `server` extra). The
`fastapi run` command used for local development takes a **file path** into the
source tree, which an installed wheel doesn't have; `uvicorn` takes the import
path instead:

```bash
cd /opt/udiagent                             # .env and relative paths resolve here
UDI_LOG_DIR=/var/log/udiagent \
  ./venv/bin/uvicorn udiagent.server.app:app --host 0.0.0.0 --port 8007
```

Two path-related settings matter only on this path, because `_PACKAGE_ROOT`
resolves into `site-packages` when the code is installed rather than checked out:

- **`UDI_LOG_DIR`** — without it the rotating log file is written next to
  `site-packages`. If that location isn't writable (a system-wide install run by
  a non-root service user), file logging is skipped with a one-line notice on
  stdout and the server still boots.
- **`UDI_DATA_DIR`** — only the `udiagent` package's own data (skills, grammar
  schema) ships in the wheel; the repo's `packages/agent/data/` does not. Without
  this variable `/v1/yac/examples` returns `404`, which the chat UI tolerates by
  showing no example-prompt suggestions. Point it at a copy of that directory if
  you want them (it is ~2 MB, mostly benchmark fixtures).
  `/v1/yac/benchmark_analysis` likewise serves the newest
  `out/**/benchmark_analysis.json` under the package directory, which a wheel
  install doesn't have; it is a benchmarking-only endpoint.

A minimal systemd unit:

```ini
[Unit]
Description=UDIAgent server
After=network.target

[Service]
User=udiagent
WorkingDirectory=/opt/udiagent
EnvironmentFile=/opt/udiagent/.env
Environment=UDI_LOG_DIR=/var/log/udiagent
ExecStart=/opt/udiagent/venv/bin/uvicorn udiagent.server.app:app --host 0.0.0.0 --port 8007
Restart=always

[Install]
WantedBy=multi-user.target
```

`EnvironmentFile` does not do shell quoting or `${VAR}` expansion — keep values
plain (`JWT_SECRET_KEY=abc123`, no surrounding quotes).

To upgrade: `pip install -U "udiagent[server]"` then restart the unit. Pin the
version (`udiagent[server]==X.Y.Z`) if you want reproducible redeploys, since
this path resolves dependency ranges fresh at install time rather than using the
repo's lockfile.

## 4. Verify

Substitute your port (`80` for the container as run above, `8007` for the
systemd unit):

```bash
curl -fsS http://localhost/                          # {"service":"UDIAgent API","status":"running","version":...,"git_sha":...}
curl -fsS http://localhost/v1/yac/structured_functions   # 200 — bundled package data loaded
```

Then exercise the LLM path end to end, which is the only check that catches a
bad key, wrong model id, or a backend that can't do structured outputs:

```bash
curl -fsS -X POST http://localhost/v1/yac/completions \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "messages": [{"role": "user", "content": "bar chart of penguins by species"}],
    "dataSchema": "{\"resources\":[{\"name\":\"penguins\",\"schema\":{\"fields\":[{\"name\":\"species\",\"type\":\"string\"},{\"name\":\"body_mass_g\",\"type\":\"number\"}]}}]}",
    "dataDomains": "[]"
  }'
```

A healthy response is a JSON list of one or more tool calls. `$TOKEN` is a
JWT signed with `JWT_SECRET_KEY` (`HS256` by default) — mint one with the
`python-jose` that the `server` extra already installed:

```bash
# Path A (inside the container)
TOKEN=$(docker exec udi-agent uv run --frozen --no-sync python -c \
  "import os; from jose import jwt; print(jwt.encode({'sub':'smoke-test'}, os.environ['JWT_SECRET_KEY'], algorithm='HS256'))")

# Path B (in the venv, with JWT_SECRET_KEY exported)
TOKEN=$(/opt/udiagent/venv/bin/python -c \
  "import os; from jose import jwt; print(jwt.encode({'sub':'smoke-test'}, os.environ['JWT_SECRET_KEY'], algorithm='HS256'))")
```

Two different failures both return `401`; tell them apart by the body —
`{"detail":"Invalid or expired token"}` is a JWT problem, whereas
`{"error":"No OpenAI API key..."}` means auth passed and the LLM credential is
the thing that's missing.

Logs: `docker logs udi-agent` (Path A) or `journalctl -u udiagent` (Path B),
plus the rotating file described in step 3.

## 5. Terminate TLS in front of it

The server speaks plain HTTP on both paths. The chat frontend is served over
HTTPS (GitHub Pages at `/udi-yac/`), and browsers block HTTPS pages from calling
an `http://` API — so an HTTP-only agent is unreachable from the deployed chat,
not merely insecure. Put nginx/Caddy/an ALB in front with a certificate and
proxy to the port from step 3.

CORS allows any origin by default, with the `X-Usage-*` headers exposed. In
production, set `UDI_CORS_ORIGINS` to the origins that embed the chat (see
[Server Environment Variables](server.md#server-environment-variables)).

## 6. Point the chat at it

In `packages/chat/.env.local` (or the Pages build environment):

```ini
VITE_UDI_API_BASE_URL=https://agent.example.org
VITE_UDI_REQUIRE_API_KEY=false     # true = users supply their own OpenAI key
```

Set `VITE_UDI_REQUIRE_API_KEY=true` when the server has no `OPENAI_API_KEY` and
expects per-request `X-OpenAI-Key` headers. The chat's full variable list lives
in [`packages/chat/.env.example`](../../chat/.env.example) (generated from
`packages/chat/src/app/envVars.ts`).
