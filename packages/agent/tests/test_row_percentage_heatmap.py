"""Row-percentage heatmap (#81): each cell is its share of the row, taken as a
group aggregate after grouping by the row field. The model's own attempt
self-joined the source table for the totals, which collided every non-key
column and surfaced as "Invalid column reference"."""

import json
from collections import defaultdict
from pathlib import Path

import pytest

from udiagent.generated_vis_tools import TEMPLATES, TOOL_DISPATCH
from udiagent.query import DuckDBConnector, QueryEngine
from udiagent.schema import parse_schema_from_dict
from udiagent.vis_generate import instantiate_template, validate_bindings

_PCX = Path(__file__).resolve().parents[3] / "sample-data" / "pcx"


def test_each_row_sums_to_one_hundred_percent():
    index, param_map = TOOL_DISPATCH["vis_084_heatmap_row_percentage"]
    args = {"entity": "Event", "field1": "organization_name", "field2": "metastasis"}
    bindings = {param_map[k]: v for k, v in args.items()}
    schema = parse_schema_from_dict(json.loads((_PCX / "datapackage.json").read_text()))
    assert validate_bindings(TEMPLATES[index], bindings, schema) == []
    spec = instantiate_template(TEMPLATES[index], bindings, schema)
    assert not any("join" in step for step in spec["transformation"])

    engine = QueryEngine(
        DuckDBConnector(views={"event": str(_PCX / "pcx_30_event_level_deid.csv")}),
        table_map={"Event": "event"},
    )
    rows = engine.run_query(source=spec["source"], transformation=spec["transformation"])[
        "displayData"
    ]
    totals = defaultdict(float)
    for row in rows:
        totals[row["organization_name"]] += row["% of row"]
    assert all(total == pytest.approx(100) for total in totals.values())
    seattle = {
        row["metastasis"]: row["% of row"]
        for row in rows
        if row["organization_name"] == "Seattle Children's Hospital"
    }
    # 112 of Seattle's 259 events are metastatic.
    assert seattle["Yes"] == pytest.approx(100 * 112 / 259)
