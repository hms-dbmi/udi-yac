"""Row-percentage heatmap (#81): each cell is the share of the row's distinct
subjects having that column value, the question the experiment log asked of a
unique-patient heatmap. Cells and row totals are each reduced to distinct
subjects and joined on the row field. The model's own attempt joined the raw
table to itself for the totals, which collided every non-key column and
surfaced as "Invalid column reference"."""

import csv
import json
from collections import defaultdict
from pathlib import Path

import pytest

from udiagent.generated_vis_tools import TEMPLATES, TOOL_DISPATCH
from udiagent.query import DuckDBConnector, QueryEngine
from udiagent.schema import parse_schema_from_dict
from udiagent.vis_generate import instantiate_template, validate_bindings

_PCX = Path(__file__).resolve().parents[3] / "sample-data" / "pcx"
_EVENTS = _PCX / "pcx_30_event_level_deid.csv"


def _rows(tool):
    """Organization by metastasis per patient, run through DuckDB."""
    index, param_map = TOOL_DISPATCH[tool]
    args = {
        "entity": "Event",
        "field1": "organization_name",
        "field2": "metastasis",
        "field3": "research_id",
    }
    bindings = {param_map[k]: v for k, v in args.items()}
    schema = parse_schema_from_dict(json.loads((_PCX / "datapackage.json").read_text()))
    assert validate_bindings(TEMPLATES[index], bindings, schema) == []
    spec = instantiate_template(TEMPLATES[index], bindings, schema)
    engine = QueryEngine(
        DuckDBConnector(views={"event": str(_EVENTS)}), table_map={"Event": "event"}
    )
    return engine.run_query(source=spec["source"], transformation=spec["transformation"])[
        "displayData"
    ]


def test_cells_are_shares_of_the_rows_distinct_subjects():
    cell, row = defaultdict(set), defaultdict(set)
    with _EVENTS.open() as f:
        for event in csv.DictReader(f):
            org, patient = event["organization_name"], event["research_id"]
            cell[org, event["metastasis"]].add(patient)
            row[org].add(patient)
    expected = {key: 100 * len(ids) / len(row[key[0]]) for key, ids in cell.items()}
    rows = _rows("vis_084_heatmap_row_percentage")
    got = {(r["organization_name"], r["metastasis"]): r["% of row"] for r in rows}
    assert got == pytest.approx(expected)
    # 57 of Seattle's 132 patients have a metastatic event; counting events
    # instead would give 112 of 259.
    assert got["Seattle Children's Hospital", "Yes"] == pytest.approx(100 * 57 / 132)


def test_count_heatmap_counts_each_subject_once_per_cell():
    rows = _rows("vis_085_heatmap_count_subjects")
    got = {(r["organization_name"], r["metastasis"]): r["subjects"] for r in rows}
    assert got["Seattle Children's Hospital", "Yes"] == 57
