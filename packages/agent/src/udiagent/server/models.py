"""Pydantic request/response models for the server."""

from pydantic import BaseModel


class YACCompletionRequest(BaseModel):
    messages: list[dict]
    dataSchema: str
    dataDomains: str


class YACBenchmarkCompletionRequest(BaseModel):
    messages: list[dict]
    dataSchema: str
    dataDomains: str
    orchestrator_choice: str | None = None


class YACQueryItem(BaseModel):
    vizId: str
    source: list[dict] | dict
    transformation: list[dict] | None = None
    displayDataOnly: bool | None = None
    #: Row offset for paging row-level results past the cap ("load more").
    offset: int | None = None


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

    tool: str
    toolArgs: dict[str, str]
    dataSchema: str


class YACVisParam(BaseModel):
    """One re-bindable template parameter, as offered to a UI."""

    param: str
    placeholder: str
    entity: str | None = None
    #: Field type the template requires, or null when unconstrained.
    type: str | None = None
    encodings: list[str] = []
    label: str
    value: str


class YACVisInstantiateResponse(BaseModel):
    #: Parsed spec, not a JSON string — no LLM in this path needs one.
    spec: dict
    #: The accepted bindings, pruned to parameters this template actually has,
    #: so a client can send them straight back for the next tweak.
    toolArgs: dict[str, str]
    params: list[YACVisParam]

