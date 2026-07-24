"""Integration guard for the DuckDB seeder: seeds a tiny CSV package into a
temp .duckdb file and confirms it round-trips through the same QueryEngine the
server uses — cleaned types, FK carry-through, and a working config."""

import json
import sys
from pathlib import Path

import pytest

_SCRIPTS = Path(__file__).resolve().parents[1] / "scripts"
sys.path.insert(0, str(_SCRIPTS))

import seed_duckdb  # noqa: E402
from udiagent.query import DuckDBConnector, QueryEngine, introspect  # noqa: E402


def _make_package(tmp: Path) -> Path:
    (tmp / "patient.csv").write_text("research_id,age\nP1,10\nP2,20\n")
    # `visit_day` mixes numbers with a sentinel -> must type numeric with NULL,
    # not text. `kind` keeps its sentinel-looking value as a real category.
    (tmp / "visit.csv").write_text(
        "research_id,visit_day,kind\n"
        "P1,5,initial\n"
        "P2,Not Reported,Unavailable\n"
    )
    (tmp / "datapackage.json").write_text(
        json.dumps(
            {
                "name": "mini",
                "udi:name": "mini",
                "udi:path": "./data/mini/",
                "resources": [
                    {
                        "name": "Patient",
                        "path": "patient.csv",
                        "udi:row_count": 2,
                        "schema": {
                            "fields": [
                                {"name": "research_id", "udi:data_type": "nominal"},
                                {"name": "age", "udi:data_type": "quantitative"},
                            ],
                            "primaryKey": ["research_id"],
                        },
                    },
                    {
                        "name": "Visit",
                        "path": "visit.csv",
                        "udi:row_count": 2,
                        "schema": {
                            "fields": [
                                {"name": "research_id", "udi:data_type": "nominal"},
                                {"name": "visit_day", "udi:data_type": "quantitative"},
                                {"name": "kind", "udi:data_type": "nominal"},
                            ],
                            "foreignKeys": [
                                {
                                    "fields": ["research_id"],
                                    "reference": {
                                        "resource": "Patient",
                                        "fields": ["research_id"],
                                    },
                                }
                            ],
                        },
                    },
                ],
            }
        )
    )
    return tmp


def test_seed_duckdb_round_trips(tmp_path):
    mini = tmp_path / "mini"
    mini.mkdir()
    data_dir = _make_package(mini)
    db_path = tmp_path / "mini.duckdb"
    config_out = tmp_path / "duckdb-backends.json"

    entries = seed_duckdb.seed(data_dir, "mini", db_path, config_out=config_out)
    assert {e["entity"]: e["loaded"] for e in entries} == {"Patient": 2, "Visit": 2}
    assert db_path.exists()

    # Config written in the shape _engine_from_config consumes.
    cfg = json.loads(config_out.read_text())["mini"]
    assert cfg["type"] == "duckdb"
    assert cfg["tables"] == {"Patient": "patient", "Visit": "visit"}
    assert cfg["schemas"]["Visit"]["foreignKeys"][0]["reference"]["resource"] == "Patient"

    # Open the seeded file the way the server does and introspect.
    engine = QueryEngine(
        DuckDBConnector(database=str(db_path)),
        table_map=cfg["tables"],
        entity_schemas=cfg["schemas"],
    )
    meta = introspect(engine, "mini")
    visit = next(r for r in meta["dataSchema"]["resources"] if r["name"] == "Visit")
    types = {f["name"]: f["udi:data_type"] for f in visit["schema"]["fields"]}
    # Sentinel-in-numeric-column -> quantitative (brushable); categorical kept.
    assert types["visit_day"] == "quantitative"
    assert types["kind"] == "nominal"
    assert visit["schema"]["foreignKeys"][0]["reference"]["resource"] == "Patient"

    # "Unavailable" survives as a real category, not nulled away.
    rows = engine.run_query(source={"name": "Visit", "source": "visit"})["displayData"]
    assert {r["kind"] for r in rows} == {"initial", "Unavailable"}
    # The sentinel cell in the numeric column became NULL.
    assert any(r["visit_day"] is None for r in rows)
