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
