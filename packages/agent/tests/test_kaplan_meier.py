"""The survival curves are the Kaplan-Meier estimate.

Kaplan-Meier multiplies, at each event, the fraction of those still at risk who
did not have it; a censored subject leaves the risk set when its follow-up stops.
The templates compute that as exp(running sum of log(factor)), since the grammar
has no product aggregate. Each test below pins one property that distinguishes
the estimator from the cohort fraction the curves used to draw, run on DuckDB so
the SQL side of `log`/`exp` is exercised (the parity golden covers Arquero).
"""

import math

import pytest

from udiagent.query import DuckDBConnector, QueryEngine
from udiagent.schema import parse_schema_from_dict
from udiagent.vis_generate import (
    _load_generated_tools,
    instantiate_template,
    validate_bindings,
)


def _line_level(tmp_path, events_csv, patients_csv, estimator=None):
    events = tmp_path / "events.csv"
    events.write_text(events_csv)
    patients = tmp_path / "patients.csv"
    patients.write_text(patients_csv)
    schema = parse_schema_from_dict(
        {
            "udi:path": "",
            "resources": [
                {
                    "name": "events",
                    "path": str(events),
                    "udi:row_count": 10,
                    "schema": {
                        "fields": [
                            {"name": "subject", "udi:data_type": "nominal"},
                            {"name": "event", "udi:data_type": "nominal"},
                            {"name": "day", "udi:data_type": "quantitative"},
                        ]
                    },
                },
                {
                    "name": "patients",
                    "path": str(patients),
                    "udi:row_count": 10,
                    "schema": {
                        "fields": [
                            {"name": "subject", "udi:data_type": "nominal"},
                            {"name": "status", "udi:data_type": "nominal"},
                            {"name": "asof", "udi:data_type": "quantitative"},
                        ]
                    },
                },
            ],
        }
    )
    _defs, dispatch, templates, _tags = _load_generated_tools()
    tool = next(n for n in dispatch if n.endswith("_line_survival"))
    idx, param_map = dispatch[tool]
    args = {
        "entity1": "events",
        "entity1_field1": "subject",
        "entity1_field2": "event",
        "entity1_field3": "day",
        "entity2": "patients",
        "entity2_field1": "subject",
        "entity2_field2": "status",
        "entity2_field3": "asof",
        "value1": "start",
        "value2": ["death"],
        "value3": "alive",
    }
    if estimator is not None:
        args["estimator"] = estimator
    bindings = {param_map[k]: v for k, v in args.items() if k in param_map}
    assert validate_bindings(templates[idx], bindings, schema) == []
    spec = instantiate_template(templates[idx], bindings, schema)
    engine = QueryEngine(
        DuckDBConnector(views={"events": str(events), "patients": str(patients)}),
        table_map={"events": "events", "patients": "patients"},
    )
    rows = engine.run_query(source=spec["source"], transformation=spec["transformation"])[
        "displayData"
    ]
    return {r["subject"]: r["survival percentage"] for r in rows}


def _starts(*subjects):
    return "".join(f"{s},start,0\n" for s in subjects)


def test_a_censored_subject_leaves_the_risk_set(tmp_path):
    """a is censored at 10, before either death. Kaplan-Meier: at 20, 1 of the 3
    still at risk dies (2/3); at 30, 1 of 2 (1/3). Dividing by the whole cohort of
    four would give 75% then 50%."""
    curve = _line_level(
        tmp_path,
        "subject,event,day\n" + _starts("a", "b", "c", "d") + "b,death,20\nc,death,30\n",
        "subject,status,asof\na,alive,10\nb,deceased,20\nc,deceased,30\nd,alive,40\n",
    )
    assert curve["a"] == pytest.approx(100)
    assert curve["b"] == pytest.approx(200 / 3)
    assert curve["c"] == pytest.approx(100 / 3)
    assert curve["d"] == pytest.approx(100 / 3)  # a censoring changes nothing at its time


def test_events_count_before_censorings_at_the_same_time(tmp_path):
    """a is censored on day 20, the day b dies: a is still at risk for that
    death, so the drop is 1 of 3, not 1 of 2."""
    curve = _line_level(
        tmp_path,
        "subject,event,day\n" + _starts("a", "b", "c") + "b,death,20\n",
        "subject,status,asof\na,alive,20\nb,deceased,20\nc,alive,50\n",
    )
    assert curve["b"] == pytest.approx(200 / 3)


def test_the_last_subject_at_risk_dying_takes_the_curve_to_zero(tmp_path):
    """The factor there is 0, and log(0) is an error in SQL. The guard must give
    0%, not a failed query — and every later row must stay at 0."""
    curve = _line_level(
        tmp_path,
        "subject,event,day\n" + _starts("a", "b") + "b,death,20\n",
        "subject,status,asof\na,alive,10\nb,deceased,20\n",
    )
    assert curve["a"] == pytest.approx(100)
    assert curve["b"] == 0


def test_without_censoring_it_is_the_cohort_fraction(tmp_path):
    """Nobody leaves except by an event, so the product telescopes to
    1 - events/cohort — what the curves drew before, now as a special case.
    Tied deaths, stepped a row at a time, land on the same value."""
    curve = _line_level(
        tmp_path,
        "subject,event,day\n"
        + _starts("a", "b", "c", "d", "e")
        + "a,death,10\nb,death,10\nc,death,30\nd,death,40\ne,death,50\n",
        "subject,status,asof\n" + "".join(f"{s},deceased,0\n" for s in "abcde"),
    )
    after_both_ties = min(curve["a"], curve["b"])
    assert after_both_ties == pytest.approx(60)
    assert curve["c"] == pytest.approx(40)
    assert curve["d"] == pytest.approx(20)
    assert curve["e"] == 0


def test_a_cube_curve_is_kaplan_meier_a_time_point_at_a_time(tmp_path):
    """Time x status cells: at t=1, 2 events and 3 censored of 10; at t=2, 1
    event of the 5 left (the censorings at t=1 count as at risk there — the tie
    rule); at t=3, 2 events of 4. Kaplan-Meier: 0.8, 0.64, 0.32."""
    cube = tmp_path / "cube.csv"
    rows = [("1", "Event", 2), ("1", "Censored", 3), ("2", "Event", 1), ("3", "Event", 2),
            ("3", "Censored", 2)]
    cube.write_text("time,status,n\n" + "".join(f"{t},{s},{n}\n" for t, s, n in rows))
    schema = parse_schema_from_dict(
        {
            "udi:path": "",
            "resources": [
                {
                    "name": "cube",
                    "path": str(cube),
                    "udi:row_count": len(rows),
                    "udi:cube": True,
                    "udi:measures": ["n"],
                    "udi:dimensions": ["time", "status"],
                    "schema": {
                        "fields": [
                            {"name": "time", "udi:data_type": "quantitative"},
                            {"name": "status", "udi:data_type": "nominal"},
                            {"name": "n", "udi:data_type": "quantitative"},
                        ]
                    },
                }
            ],
        }
    )
    _defs, dispatch, templates, _tags = _load_generated_tools()
    tool = next(n for n in dispatch if n.endswith("_line_survival_cube"))
    idx, param_map = dispatch[tool]
    args = {
        "entity": "cube",
        "dimension1": "time",
        "dimension2": "status",
        "value1": "Event",
        "value2": "Censored",
    }
    bindings = {param_map[k]: v for k, v in args.items() if k in param_map}
    assert validate_bindings(templates[idx], bindings, schema) == []
    spec = instantiate_template(templates[idx], bindings, schema)
    engine = QueryEngine(DuckDBConnector(views={"cube": str(cube)}), table_map={"cube": "cube"})
    out = engine.run_query(source=spec["source"], transformation=spec["transformation"])[
        "displayData"
    ]
    curve = {r["time"]: r["survival percentage"] for r in out}
    assert curve == pytest.approx({1: 80.0, 2: 64.0, 3: 32.0})
    assert not any(math.isnan(r["survival percentage"]) for r in out)


_CENSORED_EARLY = (
    "subject,event,day\n" + _starts("a", "b", "c", "d") + "b,death,20\nc,death,30\n",
    "subject,status,asof\na,alive,10\nb,deceased,20\nc,deceased,30\nd,alive,40\n",
)


def test_the_basic_estimator_divides_by_the_whole_cohort(tmp_path):
    """The same data as the censoring test, drawn the other way: a stays in the
    denominator after it is censored, so the drops are 1/4 each, not 1/3 then
    1/2. Kaplan-Meier stays the default."""
    basic = _line_level(tmp_path, *_CENSORED_EARLY, estimator="basic")
    assert basic["b"] == pytest.approx(75)
    assert basic["c"] == pytest.approx(50)
    assert _line_level(tmp_path, *_CENSORED_EARLY) == _line_level(
        tmp_path, *_CENSORED_EARLY, estimator="kaplan_meier"
    )


def test_an_unknown_estimator_is_refused():
    from udiagent.vis_generate import validate_bindings

    _defs, dispatch, templates, _tags = _load_generated_tools()
    idx, _param_map = dispatch[next(n for n in dispatch if n.endswith("_line_survival"))]
    errors = validate_bindings(templates[idx], {"ESTIMATOR": "nelson_aalen"}, {"entities": {}})
    assert any("not a valid estimator" in e for e in errors), errors


def test_every_survival_tool_offers_the_estimator_as_an_optional_enum():
    defs, _dispatch, _templates, _tags = _load_generated_tools()
    survival = [d["function"] for d in defs if "_line_survival" in d["function"]["name"]]
    assert len(survival) == 13
    for tool in survival:
        parameters = tool["parameters"]
        assert parameters["properties"]["estimator"]["enum"] == ["kaplan_meier", "basic"]
        assert "estimator" not in parameters["required"], tool["name"]
