"""Server configuration — the single source of truth for every env var.

This model is what `.env.template` and the README's env-var table are generated
from (`scripts/gen_env_docs.py`), so a `Field(description=...)` here is the one
place a variable is described. CI fails if the generated docs drift from it.

Cross-field rules live in `_check_consistency` below rather than at the point of
use, so a misconfigured deployment reports *every* problem at once, at startup,
instead of one at a time — or worse, silently (a lone `LANGFUSE_HOST` used to
build a credential-less client whose traces simply never arrived).

Validate an env file against this model without booting the server::

    python -c "from udiagent.server.config import ServerConfig; ServerConfig()"
"""

from pathlib import Path

from pydantic import Field, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


# Signature algorithms python-jose can actually verify, canonical spelling
# keyed by uppercase form so a lowercased env value still resolves to the
# spelling jose matches the token header against. It has no PS* or EdDSA
# backend, so nothing else belongs here.
_SIGNATURE_ALGORITHMS = {
    alg.upper(): alg
    for alg in (
        "HS256", "HS384", "HS512",
        "RS256", "RS384", "RS512",
        "ES256", "ES384", "ES512",
    )
}
# What JWKS mode accepts: the asymmetric subset. `none` is absent by
# construction, so an unsigned token can't be configured into existence.
_ASYMMETRIC_ALGORITHMS = frozenset(
    alg for alg in _SIGNATURE_ALGORITHMS.values() if not alg.startswith("HS")
)


class ServerConfig(BaseSettings):
    """Configuration for the UDIAgent FastAPI server.

    Every field is populated from the upper-cased env var of the same name.
    """

    model_config = SettingsConfigDict(
        case_sensitive=False,
        extra="ignore",
    )

    # --- Authentication ---
    jwt_secret_key: str = Field(
        default="",
        json_schema_extra={"group": "Authentication"},
        examples=['<paste output of: openssl rand -hex 32>'],
        description=(
            "JWT signing key for self-issued tokens. Required unless "
            "`INSECURE_DEV_MODE=1` or `JWT_JWKS_URL` is set."
        ),
    )
    jwt_algorithm: str = Field(
        default="HS256",
        description=(
            "JWT algorithm. Set to the identity provider's (e.g. `RS256`) "
            "when using `JWT_JWKS_URL`."
        ),
    )
    jwt_jwks_url: str = Field(
        default="",
        examples=['https://idp.example/realms/udi/protocol/openid-connect/certs'],
        description=(
            "Verify externally issued tokens against an identity provider's "
            "JWKS endpoint instead of `JWT_SECRET_KEY`. Mutually exclusive "
            "with it."
        ),
    )
    jwt_issuer: str = Field(
        default="",
        examples=['https://idp.example/realms/udi'],
        description="Expected `iss` claim; validated only when set.",
    )
    jwt_audience: str = Field(
        default="",
        examples=['udi-yac'],
        description="Expected `aud` claim. Required with `JWT_JWKS_URL`.",
    )
    insecure_dev_mode: bool = Field(
        default=False,
        json_schema_extra={"template": "1"},
        description=(
            "Skip JWT verification entirely. Development only — never set "
            "this in production."
        ),
    )

    # --- Model backend ---
    gpt_model_name: str = Field(
        default="gpt-5.4",
        json_schema_extra={"group": "Model backend"},
        description=(
            "Model for orchestration; with a custom base URL, that backend's "
            "model id. Callers may override it per-request only by supplying "
            "their own `X-OpenAI-Key`."
        ),
    )
    openai_api_key: str | None = Field(
        default=None,
        json_schema_extra={"template": ""},
        description=(
            "OpenAI API key. If unset, callers must supply one per-request "
            "via the `X-OpenAI-Key` header."
        ),
    )
    openai_base_url: str | None = Field(
        default=None,
        examples=['https://openrouter.ai/api/v1'],
        description=(
            "Root of any OpenAI-compatible backend (Azure AI Foundry, "
            "Bedrock, OpenRouter, Ollama, vLLM). Must support function "
            "calling and JSON-schema structured outputs."
        ),
    )

    # --- Observability (all-or-nothing) ---
    langfuse_public_key: str | None = Field(
        default=None,
        json_schema_extra={"group": "Observability (all three or none)"},
        examples=['pk-your-key-goes-here'],
        description="LangFuse public key. Tracing is off unless all three are set.",
    )
    langfuse_secret_key: str | None = Field(
        default=None,
        examples=['sk-your-key-goes-here'],
        description="LangFuse secret key. Tracing is off unless all three are set.",
    )
    langfuse_host: str | None = Field(
        default=None,
        examples=['https://cloud.langfuse.com'],
        description="LangFuse instance URL, e.g. `https://cloud.langfuse.com`.",
    )
    langfuse_environment: str | None = Field(
        default=None,
        examples=['production'],
        description=(
            "Tags traces with an environment label (e.g. `production`). "
            "Does not by itself enable tracing."
        ),
    )

    # --- Server-side query backends ---
    udi_query_backends: str | None = Field(
        default=None,
        json_schema_extra={"group": "Server-side query backends"},
        examples=['duckdb-backends.json'],
        description=(
            "Path to a JSON file mapping package names to StarRocks/DuckDB "
            "connections, served via `/v1/yac/query` and `/v1/yac/metadata`. "
            "Written by the seed scripts — see `dev/duckdb/README.md`."
        ),
    )
    udi_metadata_ttl_seconds: float = Field(
        default=3600.0,
        description="TTL for the introspected-metadata cache.",
    )

    # --- Paths (override when installed from a wheel) ---
    udi_log_dir: str | None = Field(
        default=None,
        json_schema_extra={"group": "Paths (override when installed from a wheel)"},
        examples=['/var/log/udiagent'],
        description=(
            "Where the rotating log file goes. Defaults to `<package "
            "root>/logs`; file logging is skipped if unwritable."
        ),
    )
    udi_data_dir: str | None = Field(
        default=None,
        examples=['/srv/udiagent/data'],
        description=(
            "Repo-level dev data for `/v1/yac/examples`. Defaults to "
            "`<package root>/data`; set this when installed from a wheel."
        ),
    )

    @field_validator("jwt_algorithm", mode="after")
    @classmethod
    def _normalize_algorithm(cls, value: str) -> str:
        """Strip padding and accept a lowercased spelling.

        An unrecognized value passes through as-is (stripped) so that
        `_check_consistency` can report it by name rather than silently
        substituting something that happens to parse.
        """
        value = value.strip()
        return _SIGNATURE_ALGORITHMS.get(value.upper(), value)

    @field_validator("*", mode="before")
    @classmethod
    def _blank_is_unset(cls, value, info):
        """Treat a blank/whitespace env value as absent, for every field.

        CI and deploy templates routinely interpolate "" for an unset variable
        (`${{ vars.FOO }}`), which would otherwise defeat the defaults here —
        and `INSECURE_DEV_MODE=` or `UDI_METADATA_TTL_SECONDS=` would raise a
        parse error rather than falling back.
        """
        if isinstance(value, str) and not value.strip():
            return cls.model_fields[info.field_name].default
        return value

    @model_validator(mode="after")
    def _check_consistency(self):
        """Report every cross-field problem at once, at startup."""
        errors: list[str] = []

        if not self.insecure_dev_mode:
            if self.jwt_secret_key and self.jwt_jwks_url:
                errors.append(
                    "JWT_SECRET_KEY and JWT_JWKS_URL are mutually exclusive. "
                    "Set the secret for self-issued tokens, or the JWKS URL "
                    "for tokens issued by an external identity provider."
                )
            if not self.jwt_secret_key and not self.jwt_jwks_url:
                errors.append(
                    "JWT_SECRET_KEY or JWT_JWKS_URL must be set unless "
                    "INSECURE_DEV_MODE=1. Refusing to start without a way to "
                    "verify JWTs."
                )
            if not self.jwt_jwks_url and self.jwt_algorithm.lower() == "none":
                # jose already refuses `none`, but a signature-less algorithm
                # is worth turning away at startup rather than per-request.
                # In JWKS mode the allowlist below already covers it.
                errors.append(
                    "JWT_ALGORITHM must not be 'none' — that would accept "
                    "unsigned tokens. Set it to the algorithm your tokens are "
                    "actually signed with."
                )
            if self.jwt_jwks_url:
                if self.jwt_algorithm not in _ASYMMETRIC_ALGORITHMS:
                    errors.append(
                        f"JWT_JWKS_URL requires an asymmetric algorithm — one "
                        f"of {', '.join(sorted(_ASYMMETRIC_ALGORITHMS))} — got "
                        f"{self.jwt_algorithm!r}. Set JWT_ALGORITHM to the one "
                        f"your identity provider signs with (e.g. RS256)."
                    )
                if not self.jwt_audience:
                    # Without an audience, any token the IdP minted for any of
                    # its clients would be accepted here.
                    errors.append(
                        "JWT_AUDIENCE must be set when using JWT_JWKS_URL, so "
                        "that tokens issued for other clients of the same "
                        "identity provider are rejected."
                    )

        # Partial LangFuse config used to construct a client with None
        # credentials — traces then silently never arrive.
        langfuse = {
            "LANGFUSE_PUBLIC_KEY": self.langfuse_public_key,
            "LANGFUSE_SECRET_KEY": self.langfuse_secret_key,
            "LANGFUSE_HOST": self.langfuse_host,
        }
        missing = [name for name, value in langfuse.items() if not value]
        if missing and len(missing) < len(langfuse):
            errors.append(
                "LangFuse is configured but incomplete: "
                f"{', '.join(sorted(missing))} missing. Set all three to "
                "enable tracing, or none to disable it."
            )

        # A bad path used to raise an uncaught FileNotFoundError at import,
        # from inside a module-level call with no config context.
        if self.udi_query_backends and not Path(self.udi_query_backends).is_file():
            errors.append(
                f"UDI_QUERY_BACKENDS points at {self.udi_query_backends!r}, "
                "which is not a readable file. Seed one with "
                "packages/agent/scripts/seed_duckdb.py, or unset it to run in "
                "browser mode."
            )

        if errors:
            raise ValueError("\n  - ".join(["invalid server configuration:"] + errors))
        return self

    @classmethod
    def from_env(cls) -> "ServerConfig":
        """Backwards-compatible alias — `BaseSettings` reads the environment."""
        return cls()
