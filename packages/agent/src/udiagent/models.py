"""Pydantic request/response models for the HTTP API.

In the core package, not the `[server]` extra, so a host serving the chat from
its own web framework validates requests exactly as the reference server does
(see `udiagent.api`).
"""

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class YACCompletionRequest(BaseModel):
    messages: list[dict] = Field(
        description="The conversation in OpenAI chat format, including the tool "
        "calls of earlier turns as the client applied them."
    )
    dataSchema: str = Field(
        description="The data package descriptor (Frictionless datapackage.json), "
        "as a JSON string."
    )
    dataDomains: str = Field(
        description="Each column's values or range, as a JSON string. The client "
        "may shorten high-cardinality columns."
    )
    model: str | None = Field(
        default=None,
        description="Optional model override. Honored only alongside an "
        "`X-OpenAI-Key` header: on the server's own key, model choice stays the "
        "operator's.",
    )
    # Optional so older clients keep working; they get "no active filters".
    filters: list[dict] = Field(
        default=[],
        description="The active filters as the client holds them: chat, host and "
        "chart brush, with the user's edits (see `udiagent.filters`).",
    )
    issueReporting: bool = Field(
        default=False,
        description="The client can send issue reports, so the agent may offer "
        "one. Honored only when the server records them (LangFuse configured).",
    )


class YACIssueReportRequest(BaseModel):
    description: str = Field(
        min_length=1, max_length=5000, description="The user's note."
    )
    contact: str | None = Field(
        default=None, max_length=200, description="How to reach the user, if given."
    )
    source: Literal["menu", "chat", "crash"] = Field(
        description="Where the report was filed from: the Session menu, an agent "
        "offer in the chat, or the crash screen."
    )
    session: dict = Field(
        description="The client's session export (on the crash screen, plus an "
        "`error` block)."
    )


class YACBenchmarkCompletionRequest(BaseModel):
    messages: list[dict]
    dataSchema: str
    dataDomains: str
    orchestrator_choice: str | None = None
    model: str | None = None


class YACQueryItem(BaseModel):
    vizId: str
    source: list[dict] | dict
    transformation: list[dict] | None = None
    displayDataOnly: bool | None = None
    offset: int | None = Field(
        default=None,
        description='Row offset for paging row-level results past the cap ("load more").',
    )


class YACQueryRequest(BaseModel):
    """Stateless batched query: every visible viz spec + the current
    selection state, in one request. Mirrors the toolkit's
    createRemoteBackend wire contract (packages/grammar/queryBackend.ts)."""

    package: str | None = None
    selections: dict[str, dict] = {}
    queries: list[YACQueryItem]


class YACVisInstantiateRequest(BaseModel):
    """Re-render a template-generated visualization with a binding changed.

    Stateless, like ``YACQueryRequest``: the caller sends back the provenance it
    received in the render's ``meta`` (``tool_used`` / ``tool_args``) together
    with the same ``dataSchema``, and gets a freshly instantiated spec. Nothing
    is stored server-side, so any client that kept the provenance can re-bind —
    including one restoring a saved conversation.
    """

    tool: str = Field(description="The template tool, from the render's `meta.tool_used`.")
    # A grouping is an object because the model fills it as typed fields rather
    # than as JSON inside a string, and a client re-binding one sends the same
    # shape straight back.
    toolArgs: dict[str, str | list[str] | dict] = Field(
        description="The bindings, from the render's `meta.tool_args`, with the "
        "changed one replaced. Values are column names and literal values, "
        "except a stratifier `grouping`, which is an object. A list is a "
        "`<V*:list>` literal: several values, any of which matches (a survival "
        "curve's end events)."
    )
    dataSchema: str = Field(description="The same data package descriptor as the render's request.")


class YACVisParam(BaseModel):
    """One re-bindable template parameter, as offered to a UI.

    Two kinds. A ``field`` parameter swaps which column a channel is bound to,
    and its ``value`` is that column's name. A ``grouping`` parameter re-cuts a
    stratifier into named strata, and its ``value`` is the grouping object (or
    ``""`` for the ungrouped default) — a client renders it from ``field`` and
    ``fieldType``, which say what is being cut and therefore which control fits.
    A ``choice`` picks one of a fixed set of computations, listed in ``choices``.
    """

    # Defaulted rather than required so an older client, and any caller
    # constructing one positionally, still validates.
    kind: str = Field(default="field", description="`field`, `grouping` or `choice`.")
    param: str
    placeholder: str
    entity: str | None = None
    type: str | None = Field(
        default=None,
        description="Field type the template requires, or null when unconstrained.",
    )
    encodings: list[str] = []
    label: str
    value: str | dict = Field(
        description='A column name for a `field`; the grouping object (or "") for '
        "a `grouping`; the chosen option for a `choice`."
    )
    field: str | None = Field(
        default=None, description="Grouping parameters only: the stratifier field."
    )
    fieldType: str | None = Field(
        default=None,
        description="Grouping parameters only: the stratifier's type in the schema.",
    )
    choices: list[dict[str, str]] | None = Field(
        default=None,
        description="Choice parameters only: the options a UI lists, "
        "`{value, label}` each. A `choice` picks how something is computed (a "
        "survival estimator).",
    )


class YACVisInstantiateResponse(BaseModel):
    # Parsed, not a JSON string: no LLM in this path needs one.
    spec: dict = Field(description="The instantiated UDI grammar spec.")
    toolArgs: dict[str, str | list[str] | dict] = Field(
        description="The accepted bindings, pruned to parameters this template "
        "actually has, so a client can send them straight back for the next "
        "tweak. A stratifier `grouping` rides here as an object, like it does on "
        "the way in, and a list-valued literal as a list."
    )
    params: list[YACVisParam] = Field(description="The re-bindable parameters, for a UI.")


# --- Response shapes for the OpenAPI spec -----------------------------------
# Documentation only: the routes return dicts or JSONResponse, and declare these
# with `responses=`, which never filters or validates what goes out.


class ToolCall(BaseModel):
    """One outcome of a turn. A turn returns them in the order to apply them."""

    model_config = ConfigDict(extra="allow")

    name: str = Field(
        description="`RenderVisualization`, `FilterData`, `FreeTextExplain`, "
        "`ClarifyVariable`, `Rebuff` or `OfferIssueReport`."
    )
    arguments: dict = Field(description="The payload; its shape depends on `name`.")
    meta: dict | None = Field(
        default=None,
        description="On a chart: its provenance (`tool_used`, `tool_args`, "
        "`tweakable_params`, ...), which `/v1/yac/vis_instantiate` takes back.",
    )


class ErrorResponse(BaseModel):
    """An error body. Authentication failures carry FastAPI's ``detail``
    instead of ``error``."""

    error: str | None = Field(default=None, description="A message for the user.")
    code: str | None = Field(
        default=None, description="A machine-readable reason (`/v1/yac/vis_instantiate`)."
    )
    errors: list[str] | None = Field(
        default=None, description="Every problem found, when there are several."
    )
    detail: str | list[dict] | None = Field(
        default=None,
        description="An authentication failure's message, or a validation "
        "failure's per-field errors.",
    )


class MetadataResponse(BaseModel):
    package: str
    interactive: bool = Field(
        default=False,
        description="Always false: the package is queried on the server, not in the browser.",
    )
    dataSchema: dict = Field(
        description="The data package descriptor, introspected from the database."
    )
    dataDomains: list[dict] = Field(description="Each column's values or range.")


class QueryResponse(BaseModel):
    results: dict[str, dict] = Field(
        description="One result per query, keyed by `vizId`. A query that fails "
        "carries `{error}` instead of rows; the others still succeed."
    )


class IssueReportResponse(BaseModel):
    traceId: str | None = Field(description="The report's LangFuse trace.")

