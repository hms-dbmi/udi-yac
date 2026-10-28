"""GET /: the server's build and the endpoints it publishes."""

import importlib.metadata
from unittest.mock import MagicMock, patch

import pytest

from udiagent.agent import UDIAgent


@pytest.fixture()
def server_app():
    with patch.object(UDIAgent, "__init__", lambda self, **kwargs: None):
        import udiagent.server.app as server_app

        mock_agent = UDIAgent.__new__(UDIAgent)
        mock_agent.gpt_model = MagicMock(name="default_gpt_model")
        server_app.agent = mock_agent
        server_app.orchestrator.agent = mock_agent
        yield server_app


def test_root_reports_the_build_and_every_published_endpoint(server_app, monkeypatch):
    from starlette.testclient import TestClient

    monkeypatch.setattr(server_app.config, "udi_git_sha", "abc123")
    body = TestClient(server_app.app).get("/").json()

    assert body["version"] == importlib.metadata.version("udiagent")
    assert body["git_sha"] == "abc123"
    assert body["openapi"] == "/openapi.json"
    listed = {(e["path"], e["method"].lower()) for e in body["endpoints"]}
    published = {
        (path, method)
        for path, operations in server_app.app.openapi()["paths"].items()
        for method in operations
    }
    assert listed == published
