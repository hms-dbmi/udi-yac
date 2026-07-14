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


class YACQueryRequest(BaseModel):
    """Stateless batched query: every visible viz spec + the current
    selection state, in one request. Mirrors the toolkit's
    createRemoteBackend wire contract (packages/grammar/queryBackend.ts)."""

    package: str | None = None
    selections: dict[str, dict] = {}
    queries: list[YACQueryItem]
