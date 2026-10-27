"""GET /v1/yac/examples: a package's own prompts, else the global list."""

from unittest.mock import MagicMock, patch

import pytest

from udiagent.agent import UDIAgent


@pytest.fixture()
def client():
    with patch.object(UDIAgent, "__init__", lambda self, **kwargs: None):
        import udiagent.server.app as server_app

        mock_agent = UDIAgent.__new__(UDIAgent)
        mock_agent.gpt_model = MagicMock(name="default_gpt_model")
        server_app.agent = mock_agent
        server_app.orchestrator.agent = mock_agent
        saved = server_app.app.state.example_prompts
        server_app.app.state.example_prompts = {"pcx": ["Survival by cohort?"]}

        from starlette.testclient import TestClient

        yield TestClient(server_app.app)

        server_app.app.state.example_prompts = saved


def test_package_with_its_own_prompts_gets_them(client):
    assert client.get("/v1/yac/examples?package=pcx").json() == ["Survival by cohort?"]


def test_other_packages_fall_back_to_the_global_list(client):
    fallback = client.get("/v1/yac/examples").json()
    assert fallback and "Survival by cohort?" not in fallback
    assert client.get("/v1/yac/examples?package=penguins").json() == fallback
