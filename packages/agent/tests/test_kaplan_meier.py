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


def _line_rows(tmp_path, events_csv, patients_csv, **choices):
    """Run the single-curve event-log template on DuckDB; every output row.

    `choices` are optional tool arguments (estimator, time_horizon,
    confidence_band); absent means each choice's default."""
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
    args.update(choices)
    bindings = {param_map[k]: v for k, v in args.items() if k in param_map}
    assert validate_bindings(templates[idx], bindings, schema) == []
    spec = instantiate_template(templates[idx], bindings, schema)
    engine = QueryEngine(
        DuckDBConnector(views={"events": str(events), "patients": str(patients)}),
        table_map={"events": "events", "patients": "patients"},
    )
    return engine.run_query(source=spec["source"], transformation=spec["transformation"])[
        "displayData"
    ]


def _line_level(tmp_path, events_csv, patients_csv, **choices):
    rows = _line_rows(tmp_path, events_csv, patients_csv, **choices)
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


def _cube_rows(tmp_path, rows, **choices):
    """Run the single-curve cube template on DuckDB over (time, status, n) cells."""
    cube = tmp_path / "cube.csv"
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
        **choices,
    }
    bindings = {param_map[k]: v for k, v in args.items() if k in param_map}
    assert validate_bindings(templates[idx], bindings, schema) == []
    spec = instantiate_template(templates[idx], bindings, schema)
    engine = QueryEngine(DuckDBConnector(views={"cube": str(cube)}), table_map={"cube": "cube"})
    return engine.run_query(source=spec["source"], transformation=spec["transformation"])[
        "displayData"
    ]


def test_a_cube_curve_is_kaplan_meier_a_time_point_at_a_time(tmp_path):
    """Time x status cells: at t=1, 2 events and 3 censored of 10; at t=2, 1
    event of the 5 left (the censorings at t=1 count as at risk there — the tie
    rule); at t=3, 2 events of 4. Kaplan-Meier: 0.8, 0.64, 0.32."""
    rows = [("1", "Event", 2), ("1", "Censored", 3), ("2", "Event", 1), ("3", "Event", 2),
            ("3", "Censored", 2)]
    out = _cube_rows(tmp_path, rows)
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


# --- the 95% confidence band ------------------------------------------------

#: Eight subjects with a censoring before the tied deaths at day 200 and two
#: after. Reference values below are from lifelines (KaplanMeierFitter,
#: alpha=0.05), whose interval is the same log-log ("exponential Greenwood")
#: one the templates draw.
_GREENWOOD_COHORT = (
    "subject,event,day\n"
    + _starts(*"abcdefgh")
    + "a,death,100\nc,death,200\nd,death,200\nf,death,400\n",
    "subject,status,asof\n"
    "a,deceased,100\nb,alive,150\nc,deceased,200\nd,deceased,200\n"
    "e,alive,300\nf,deceased,400\ng,alive,500\nh,alive,600\n",
)


def _by_subject(rows):
    return {r["subject"]: r for r in rows}


def test_the_band_is_the_log_log_greenwood_interval(tmp_path):
    """Matches lifelines at every step, including across the tied deaths: the
    band after the second of them (d) is the band of one step of two."""
    rows = _by_subject(_line_rows(tmp_path, *_GREENWOOD_COHORT))
    expected = {
        "a": (87.5, 38.7000014032, 98.1392965879),
        "b": (87.5, 38.7000014032, 98.1392965879),  # a censoring moves nothing
        "d": (58.3333333333, 18.0188891013, 84.4068691657),
        "f": (38.8888888889, 6.3002811469, 72.4222755537),
        "h": (38.8888888889, 6.3002811469, 72.4222755537),
    }
    for subject, (survival, lower, upper) in expected.items():
        row = rows[subject]
        assert row["survival percentage"] == pytest.approx(survival), subject
        assert row["ci lower"] == pytest.approx(lower), subject
        assert row["ci upper"] == pytest.approx(upper), subject


def test_before_any_event_the_band_sits_on_the_curve(tmp_path):
    """log S is 0 at 100%, so log-log is undefined: no width, no NaN."""
    rows = _by_subject(
        _line_rows(
            tmp_path,
            "subject,event,day\n" + _starts("a", "b", "c") + "c,death,30\n",
            "subject,status,asof\na,alive,10\nb,alive,20\nc,deceased,30\n",
        )
    )
    assert rows["a"]["ci lower"] == rows["a"]["ci upper"] == pytest.approx(100)


def test_an_exhausted_risk_set_closes_the_band_at_zero(tmp_path):
    """The last subject at risk dying makes n = d: Greenwood's term would divide
    by zero, and log S is -Infinity. Both are guarded; the band is 0, not an
    error or NaN."""
    rows = _by_subject(
        _line_rows(
            tmp_path,
            "subject,event,day\n" + _starts("a", "b") + "a,death,10\nb,death,20\n",
            "subject,status,asof\na,deceased,10\nb,deceased,20\n",
        )
    )
    assert rows["b"]["survival percentage"] == 0
    assert rows["b"]["ci lower"] == rows["b"]["ci upper"] == 0
    assert 0 < rows["a"]["ci lower"] < 50 < rows["a"]["ci upper"] <= 100


@pytest.mark.parametrize(
    "choices", [{"confidence_band": "hide"}, {"estimator": "basic"}], ids=["hidden", "basic"]
)
def test_the_band_is_null_when_hidden_or_not_kaplan_meier(tmp_path, choices):
    """Greenwood describes the Kaplan-Meier curve, so under the basic estimator
    there is no band at all — not even where the two curves agree, as they do
    at a's 87.5% here."""
    rows = _line_rows(tmp_path, *_GREENWOOD_COHORT, **choices)
    assert all(r["ci lower"] is None and r["ci upper"] is None for r in rows)


# --- the time horizon -------------------------------------------------------

#: Followed for up to ~8 years, with one death after year 5 (d, day 2500).
_LONG_FOLLOW_UP = (
    "subject,event,day\n"
    + _starts(*"abcde")
    + "a,death,365\nc,death,1000\nd,death,2500\n",
    "subject,status,asof\n"
    "a,deceased,365\nb,alive,730\nc,deceased,1000\nd,deceased,2500\ne,alive,3000\n",
)


def test_the_default_horizon_cuts_at_five_years_without_moving_the_curve(tmp_path):
    full = _by_subject(_line_rows(tmp_path, *_LONG_FOLLOW_UP, time_horizon="full"))
    cut = _by_subject(_line_rows(tmp_path, *_LONG_FOLLOW_UP))
    assert sorted(cut) == ["a", "b", "c"]  # d and e are past year 5
    for subject in cut:
        for column in ("survival percentage", "ci lower", "ci upper"):
            assert cut[subject][column] == pytest.approx(full[subject][column])
    # The axis stops at the horizon (the label anchors 5% past it), and the label
    # reads the curve there, counting only the events inside the window.
    assert max(r["label year"] or 0 for r in cut.values()) == pytest.approx(5 * 1.05)
    label = cut["a"]["final label"]
    assert label.startswith("53") and label.endswith("% at 5y (n=5, 2 events)"), label


def test_full_follow_up_is_the_uncut_chart(tmp_path):
    rows = _by_subject(_line_rows(tmp_path, *_LONG_FOLLOW_UP, time_horizon="full"))
    assert sorted(rows) == list("abcde")
    assert rows["a"]["final label"].endswith("% (n=5, 3 events)")
    assert " at " not in rows["a"]["final label"]


def test_a_horizon_past_the_follow_up_is_not_reported_as_a_cut(tmp_path):
    """Ten years is longer than anyone was followed: nothing is removed, the axis
    ends at the cohort's own end, and the label does not claim a horizon."""
    rows = _by_subject(_line_rows(tmp_path, *_LONG_FOLLOW_UP, time_horizon="10"))
    assert sorted(rows) == list("abcde")
    assert " at " not in rows["a"]["final label"]
    assert max(r["label year"] or 0 for r in rows.values()) == pytest.approx(
        3000 / 365.25 * 1.05
    )


def test_a_cube_horizon_is_read_in_months(tmp_path):
    """A cube's time dimension is months: the 5-year default keeps time 60 and
    drops 72, and a 1-year horizon drops everything after 12."""
    cells = [("6", "Event", 1), ("12", "Censored", 1), ("60", "Event", 1),
             ("72", "Event", 1), ("80", "Censored", 1)]
    assert sorted(r["time"] for r in _cube_rows(tmp_path, cells)) == [6, 12, 60]
    assert sorted(r["time"] for r in _cube_rows(tmp_path, cells, time_horizon="1")) == [6, 12]
    assert len(_cube_rows(tmp_path, cells, time_horizon="full")) == 5


def test_an_unknown_horizon_is_refused():
    _defs, dispatch, templates, _tags = _load_generated_tools()
    idx, _param_map = dispatch[next(n for n in dispatch if n.endswith("_line_survival"))]
    errors = validate_bindings(templates[idx], {"HORIZON": "7"}, {"entities": {}})
    assert any("not a valid time_horizon" in e for e in errors), errors


def test_every_survival_tool_offers_the_horizon_and_band_as_optional_enums():
    defs, _dispatch, _templates, _tags = _load_generated_tools()
    survival = [d["function"] for d in defs if "_line_survival" in d["function"]["name"]]
    for tool in survival:
        properties = tool["parameters"]["properties"]
        required = tool["parameters"]["required"]
        assert properties["time_horizon"]["enum"] == ["1", "2", "3", "5", "10", "full"]
        assert properties["confidence_band"]["enum"] == ["show", "hide"]
        assert "time_horizon" not in required and "confidence_band" not in required
