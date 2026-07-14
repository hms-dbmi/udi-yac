"""Integration tests for POST /v1/yac/query (batched, stateless)."""

import json
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

from udiagent.agent import UDIAgent
from udiagent.query import DuckDBConnector, QueryEngine

_REPO_ROOT = Path(__file__).resolve().parents[3]
_PENGUINS = str(_REPO_ROOT / "sample-data" / "penguins.csv")


@pytest.fixture()
def client():
    with patch.object(UDIAgent, "__init__", lambda self, **kwargs: None):
        import udiagent.server.app as server_app

        mock_agent = UDIAgent.__new__(UDIAgent)
        mock_agent.gpt_model = MagicMock(name="default_gpt_model")
        mock_agent.gpt_model_name = "test-model"
        server_app.agent = mock_agent
        server_app.orchestrator.agent = mock_agent

        engine = QueryEngine(
            DuckDBConnector(views={"penguins": _PENGUINS}),
            table_map={"penguins": "penguins"},
        )
        server_app.app.state.query_engines = {"test_pkg": engine}

        from starlette.testclient import TestClient

        yield TestClient(server_app.app)

        server_app.app.state.query_engines = {}


_HEADERS = {"Authorization": "Bearer dev"}


def test_batched_query_roundtrip(client):
    body = {
        "package": "test_pkg",
        "selections": {
            "brush1": {
                "dataSourceKey": "penguins",
                "selection": {"body_mass_g": [4000, 5000]},
                "type": "interval",
            }
        },
        "queries": [
            {
                "vizId": "q1",
                "source": {"name": "penguins", "source": "penguins.csv"},
                "transformation": [
                    {"filter": {"name": "brush1", "source": "penguins"}},
                    {"groupby": "species"},
                    {"rollup": {"n": {"op": "count"}}},
                ],
            },
            {
                "vizId": "q2",
                "source": {"name": "penguins", "source": "penguins.csv"},
                "transformation": [
                    {"groupby": "island"},
                    {"rollup": {"n": {"op": "count"}}},
                ],
            },
        ],
    }
    response = client.post("/v1/yac/query", json=body, headers=_HEADERS)
    assert response.status_code == 200
    results = response.json()["results"]

    assert results["q1"]["isSubset"] is True
    assert results["q1"]["aggregated"] is True
    filtered_total = sum(r["n"] for r in results["q1"]["displayData"])
    assert 0 < filtered_total < 344  # penguins.csv row count

    assert results["q2"]["isSubset"] is False
    assert len(results["q2"]["displayData"]) == 3


def test_unknown_package_404(client):
    response = client.post(
        "/v1/yac/query",
        json={"package": "nope", "selections": {}, "queries": []},
        headers=_HEADERS,
    )
    assert response.status_code == 404
    assert "no query backend" in response.json()["error"]


def test_per_viz_error_isolation(client):
    body = {
        "package": "test_pkg",
        "selections": {},
        "queries": [
            {
                "vizId": "bad",
                "source": {"name": "penguins", "source": "penguins.csv"},
                # Legacy raw string — must be rejected per-viz, not crash.
                "transformation": [{"filter": "d['sex'] != null"}],
            },
            {
                "vizId": "ok",
                "source": {"name": "penguins", "source": "penguins.csv"},
                "transformation": [
                    {"groupby": "sex"},
                    {"rollup": {"n": {"op": "count"}}},
                ],
            },
        ],
    }
    response = client.post("/v1/yac/query", json=body, headers=_HEADERS)
    assert response.status_code == 200
    results = response.json()["results"]
    assert "error" in results["bad"]
    assert "displayData" in results["ok"]
