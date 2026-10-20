"""A caller-supplied model is honored only alongside a caller-supplied key.

Whoever pays for the tokens picks the model: with an ``X-OpenAI-Key`` the
request runs on the requested model, without one it falls back to the server's
``GPT_MODEL_NAME`` and the request body's ``model`` is ignored.
"""

from unittest.mock import MagicMock, patch

import httpx2 as httpx
import pytest
from openai import NotFoundError
from starlette.testclient import TestClient

from udiagent.agent import UDIAgent
from udiagent.orchestrator import OrchestratorResult, Usage


BODY = {
    "messages": [{"role": "user", "content": "chart it"}],
    "dataSchema": "{}",
    "dataDomains": "[]",
    "model": "caller-picked-model",
}


@pytest.fixture
def client_and_calls():
    """TestClient over the real app, with orchestrator.run captured."""
    with patch.object(UDIAgent, "__init__", lambda self, **kwargs: None):
        import udiagent.server.app as server_app

        mock_agent = UDIAgent.__new__(UDIAgent)
        mock_agent.gpt_model = MagicMock()
        mock_agent.gpt_model_name = "server-default-model"
        server_app.agent = mock_agent
        server_app.orchestrator.agent = mock_agent

        calls = []

        def fake_run(**kwargs):
            calls.append(kwargs)
            return OrchestratorResult(
                tool_calls=[], orchestrator_choice="explain", usage=Usage()
            )

        with patch.object(server_app.orchestrator, "run", fake_run):
            yield TestClient(server_app.app), calls


def test_model_is_honored_with_a_caller_supplied_key(client_and_calls):
    client, calls = client_and_calls
    response = client.post(
        "/v1/yac/completions",
        json=BODY,
        headers={"Authorization": "Bearer dev", "X-OpenAI-Key": "sk-caller"},
    )

    assert response.status_code == 200
    assert calls[0]["model"] == "caller-picked-model"
    assert response.headers["X-Usage-Model"] == "caller-picked-model"


def test_model_is_ignored_without_a_caller_supplied_key(client_and_calls):
    client, calls = client_and_calls
    response = client.post(
        "/v1/yac/completions",
        json=BODY,
        headers={"Authorization": "Bearer dev"},
    )

    assert response.status_code == 200
    assert calls[0]["model"] is None, "server's key -> server picks the model"
    assert response.headers["X-Usage-Model"] == "server-default-model"


def test_omitted_model_falls_back_to_the_server_default(client_and_calls):
    client, calls = client_and_calls
    response = client.post(
        "/v1/yac/completions",
        json={k: v for k, v in BODY.items() if k != "model"},
        headers={"Authorization": "Bearer dev", "X-OpenAI-Key": "sk-caller"},
    )

    assert response.status_code == 200
    assert calls[0]["model"] is None
    assert response.headers["X-Usage-Model"] == "server-default-model"


def test_unusable_model_is_an_error_the_browser_can_read(client_and_calls):
    """An API error must not escape as a bare 500: that response skips
    CORSMiddleware, so a cross-origin browser sees only "NetworkError"."""
    import udiagent.server.app as server_app

    client, _ = client_and_calls
    error = NotFoundError(
        "The model `caller-picked-model` does not exist",
        response=httpx.Response(404, request=httpx.Request("POST", "https://x")),
        body=None,
    )
    headers = {"Authorization": "Bearer dev", "Origin": "https://example.org"}

    with patch.object(server_app.orchestrator, "run", side_effect=error):
        byok = client.post(
            "/v1/yac/completions",
            json=BODY,
            headers={**headers, "X-OpenAI-Key": "sk-caller"},
        )
        server_key = client.post("/v1/yac/completions", json=BODY, headers=headers)

    assert byok.status_code == 502
    assert byok.headers["access-control-allow-origin"] == "https://example.org"
    assert "does not exist" in byok.json()["error"]
    # On the server's credential the provider's message stays in the log.
    assert server_key.status_code == 502
    assert "does not exist" not in server_key.json()["error"]
