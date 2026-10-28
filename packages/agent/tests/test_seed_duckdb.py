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
    (tmp / "example_prompts.json").write_text('["Ages by visit kind?", "  "]')
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
                        "title": "Patients",
                        "path": "patient.csv",
                        "description": "One row per patient.",
                        "udi:row_count": 2,
                        "schema": {
                            "fields": [
                                {"name": "research_id", "udi:data_type": "nominal"},
                                {
                                    "name": "age",
                                    "title": "Age (days)",
                                    "udi:data_type": "quantitative",
                                    "description": "Age in days.",
                                },
                            ],
                            "primaryKey": ["research_id"],
                        },
                    },
                    {
                        "name": "Visit",
                        "path": "visit.csv",
                        "udi:row_count": 2,
                        "udi:hide_count": True,
                        "schema": {
                            "fields": [
                                {"name": "research_id", "udi:data_type": "nominal"},
                                # A date format with no description must still
                                # reach the config: it's what the chat formats by.
                                {
                                    "name": "visit_day",
                                    "udi:data_type": "quantitative",
                                    "udi:time_format": "epoch_ms",
                                },
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
    # The package's own example prompts ride along; blanks are dropped.
    assert cfg["examplePrompts"] == ["Ages by visit kind?"]

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
    # So do date formats, and only on the fields that declare one.
    formats = {f["name"]: f.get("udi:time_format") for f in visit["schema"]["fields"]}
    assert formats == {"research_id": None, "visit_day": "epoch_ms", "kind": None}
    # Descriptions live only in the package, so they must survive the config.
    patient = next(r for r in meta["dataSchema"]["resources"] if r["name"] == "Patient")
    assert patient["description"] == "One row per patient."
    ages = {f["name"]: f["description"] for f in patient["schema"]["fields"]}
    assert ages == {"research_id": "", "age": "Age in days."}
    # So do titles, the labels the chat shows for the table and its columns.
    assert patient["title"] == "Patients" and "title" not in visit
    titles = {f["name"]: f.get("title") for f in patient["schema"]["fields"]}
    assert titles == {"research_id": None, "age": "Age (days)"}
    # As does hiding a table's count, on the resource rather than its schema.
    assert visit.get("udi:hide_count") is True and "udi:hide_count" not in visit["schema"]
    assert "udi:hide_count" not in patient

    # "Unavailable" survives as a real category, not nulled away.
    rows = engine.run_query(source={"name": "Visit", "source": "visit"})["displayData"]
    assert {r["kind"] for r in rows} == {"initial", "Unavailable"}
    # The sentinel cell in the numeric column became NULL.
    assert any(r["visit_day"] is None for r in rows)


def test_mixed_package_settings_survive_remote_mode(tmp_path):
    """A package's `udi:prefer` and a cube's `udi:linked_dimensions` exist only
    in datapackage.json. Seeding carries them into the backends config, and
    the server serves them with the introspected schema, so remote mode gets
    the same defaults and linked filtering as the CSV path."""
    mixed = tmp_path / "mixed"
    mixed.mkdir()
    (mixed / "summary.csv").write_text("research_id,order\nP1,chemo_first\nP2,rt_first\n")
    (mixed / "efs.csv").write_text("order,cnt\n,2\nchemo_first,1\nrt_first,1\n")
    link = {"entity": "Summary", "field": "order", "values": {"chemo_first": ["chemo_first"]}}
    (mixed / "datapackage.json").write_text(
        json.dumps(
            {
                "name": "mixed",
                "udi:path": "./data/mixed/",
                "udi:prefer": "line_level",
                "resources": [
                    {
                        "name": "Summary",
                        "path": "summary.csv",
                        "schema": {
                            "fields": [
                                {"name": "research_id", "udi:data_type": "nominal"},
                                {"name": "order", "udi:data_type": "nominal"},
                            ]
                        },
                    },
                    {
                        "name": "Efs",
                        "path": "efs.csv",
                        "udi:cube": True,
                        "udi:dimensions": ["order"],
                        "udi:measures": ["cnt"],
                        "udi:linked_dimensions": {"order": link},
                        "schema": {
                            "fields": [
                                {"name": "order", "udi:data_type": "nominal"},
                                {"name": "cnt", "udi:data_type": "quantitative"},
                            ]
                        },
                    },
                ],
            }
        )
    )
    config_out = tmp_path / "duckdb-backends.json"
    seed_duckdb.seed(mixed, "mixed", tmp_path / "mixed.duckdb", config_out=config_out)

    cfg = json.loads(config_out.read_text())["mixed"]
    assert cfg["package"] == {"udi:prefer": "line_level"}
    assert cfg["schemas"]["Efs"]["udi:linked_dimensions"] == {"order": link}

    # Built the way the server builds it, from the config alone.
    from udiagent.server.app import _engine_from_config

    meta = introspect(_engine_from_config(cfg), "mixed")["dataSchema"]
    assert meta["udi:prefer"] == "line_level"
    efs = next(r for r in meta["resources"] if r["name"] == "Efs")
    # Resource-level, where the chat reads cube roles.
    assert efs["udi:linked_dimensions"] == {"order": link}
    assert "udi:linked_dimensions" not in efs["schema"]

    # And the agent reads the preference off what the chat sends it.
    from udiagent.vis_generate import _parse_request_schema

    assert _parse_request_schema(meta)["prefer"] == "line_level"
