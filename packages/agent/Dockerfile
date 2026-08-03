FROM python:3.13-slim AS base

COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/

# Non-root user created up front and owning /app, so no `chown -R` over the
# venv is needed after each code change (that cost ~2min per rebuild).
RUN addgroup --system app && adduser --system --ingroup app app

WORKDIR /app
RUN mkdir -p /app/packages/agent/logs && chown -R app:app /app
USER app

# The system user has no home dir, so uv's default cache path is unwritable.
ENV UV_CACHE_DIR=/tmp/uv-cache

# Build context is the REPO ROOT, not packages/agent: uv.lock is the workspace
# lockfile and lives there (see root pyproject.toml [tool.uv.workspace]).
# Both members' pyproject.toml are needed for --frozen to validate the lock.
COPY --chown=app:app pyproject.toml uv.lock ./
COPY --chown=app:app packages/agent/pyproject.toml packages/agent/
COPY --chown=app:app packages/grammar-py/pyproject.toml packages/grammar-py/
RUN uv sync --frozen --no-install-project --package udiagent --extra server --extra langfuse

# Copy application code and data
COPY --chown=app:app packages/agent/src/ ./packages/agent/src/
COPY --chown=app:app packages/agent/data/ ./packages/agent/data/
COPY --chown=app:app packages/agent/README.md ./packages/agent/

# Install the project itself
RUN uv sync --frozen --package udiagent --extra server --extra langfuse

WORKDIR /app/packages/agent

EXPOSE 80

CMD ["uv", "run", "--frozen", "--no-sync", "fastapi", "run", "src/udiagent/server/app.py", "--port", "80", "--host", "0.0.0.0"]
