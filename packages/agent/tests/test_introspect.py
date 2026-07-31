"""Tests for backend metadata introspection + TTL cache + endpoint."""

from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

from udiagent.agent import UDIAgent
from udiagent.query import DuckDBConnector, MetadataCache, QueryEngine, introspect

_REPO_ROOT = Path(__file__).resolve().parents[3]
_SAMPLE = _REPO_ROOT / "sample-data"


@pytest.fixture(scope="module")
def engine():
    connector = DuckDBConnector(
        views={
            "penguins": str(_SAMPLE / "penguins.csv"),
            "donors": str(_SAMPLE / "donors.csv"),
        }
    )
    return QueryEngine(connector, table_map={"penguins": "penguins", "donors": "donors"})


def test_introspect_shapes(engine):
    meta = introspect(engine, "test_pkg")
    schema = meta["dataSchema"]
    assert schema["name"] == "test_pkg"
    assert {r["name"] for r in schema["resources"]} == {"penguins", "donors"}

    penguins = next(r for r in schema["resources"] if r["name"] == "penguins")
    assert penguins["udi:row_count"] == 344
    assert penguins["udi:column_count"] == 7
    by_name = {f["name"]: f for f in penguins["schema"]["fields"]}
    assert by_name["species"]["udi:data_type"] == "nominal"
    assert by_name["species"]["udi:cardinality"] == 3
    assert by_name["body_mass_g"]["udi:data_type"] == "quantitative"
    assert by_name["body_mass_g"]["type"] in ("number", "integer")

    donors = next(r for r in schema["resources"] if r["name"] == "donors")
    donor_fields = {f["name"]: f for f in donors["schema"]["fields"]}
    # hubmap_id is a unique key: cardinality == row_count
    assert donor_fields["hubmap_id"]["udi:unique"] is True


def test_introspect_domains(engine):
    domains = introspect(engine, "p")["dataDomains"]
    by_key = {(d["entity"], d["field"]): d for d in domains}

    species = by_key[("penguins", "species")]
    assert species["type"] == "point"
    assert sorted(species["domain"]["values"]) == ["Adelie", "Chinstrap", "Gentoo"]

    mass = by_key[("penguins", "body_mass_g")]
    assert mass["type"] == "interval"
    assert mass["domain"]["min"] == 2700
    assert mass["domain"]["max"] == 6300

    # High-cardinality categoricals are dropped (removeLongDomains parity).
    assert ("donors", "hubmap_id") not in by_key


def test_entity_schemas_merged_into_resources():
    """primaryKey/foreignKeys can't be introspected from the database; they
    come from the engine's configured entity_schemas — the chat's
    cross-entity filtering (getEntityRelationship) depends on them."""
    connector = DuckDBConnector(views={"penguins": str(_SAMPLE / "penguins.csv")})
    fk = [
        {
            "fields": ["species"],
            "reference": {"resource": "taxa", "fields": ["name"]},
        }
    ]
    engine = QueryEngine(
        connector,
        table_map={"penguins": "penguins"},
        entity_schemas={"penguins": {"primaryKey": ["species"], "foreignKeys": fk}},
    )
    resource = introspect(engine, "p")["dataSchema"]["resources"][0]
    assert resource["schema"]["foreignKeys"] == fk
    assert resource["schema"]["primaryKey"] == ["species"]
    # Introspected fields remain intact alongside the merge.
    assert any(f["name"] == "body_mass_g" for f in resource["schema"]["fields"])


def test_metadata_cache_ttl(engine):
    cache = MetadataCache(engine, "p", ttl_seconds=10_000)
    first = cache.get()
    assert cache.get() is first, "within TTL: cached object served"
    assert cache.refresh() is not first, "refresh forces re-introspection"

    expired = MetadataCache(engine, "p", ttl_seconds=0)
    a = expired.get()
    assert expired.get() is not a, "expired TTL re-introspects"


def test_metadata_endpoint():
    with patch.object(UDIAgent, "__init__", lambda self, **kwargs: None):
        import udiagent.server.app as server_app

        mock_agent = UDIAgent.__new__(UDIAgent)
        mock_agent.gpt_model = MagicMock()
        mock_agent.gpt_model_name = "test-model"
        server_app.agent = mock_agent
        server_app.orchestrator.agent = mock_agent

        engine = QueryEngine(
            DuckDBConnector(views={"penguins": str(_SAMPLE / "penguins.csv")}),
            table_map={"penguins": "penguins"},
        )
        server_app.app.state.query_engines = {"pkg": engine}
        server_app.app.state.metadata_caches = {}

        from starlette.testclient import TestClient

        client = TestClient(server_app.app)
        headers = {"Authorization": "Bearer dev"}

        response = client.get("/v1/yac/metadata?package=pkg", headers=headers)
        assert response.status_code == 200
        body = response.json()
        assert body["package"] == "pkg"
        assert body["interactive"] is False
        assert body["dataSchema"]["resources"][0]["name"] == "penguins"
        assert any(d["field"] == "species" for d in body["dataDomains"])

        missing = client.get("/v1/yac/metadata?package=nope", headers=headers)
        assert missing.status_code == 404

        server_app.app.state.query_engines = {}
        server_app.app.state.metadata_caches = {}
