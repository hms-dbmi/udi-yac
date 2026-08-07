"""A stratified survival curve must agree with the unstratified one.

The bug these pin: the stratifier is an *event-level* column, so grouping by
``[subject, stratifier]`` makes each (subject, value) pair its own row. A pair with
a start event and no end event reads as censored; a pair with an end and no start
is dropped by the null filter. A subject whose value changed between the two
events is therefore counted as neither, and its death disappears — the symptom
being every stratum sitting *above* the pooled curve, which no weighted average
can do. On the pcx event log that lost 24 of 34 deaths.

Two readings of a time-varying stratifier ship as separate templates, and they are
pinned by opposite invariants: the baseline reading must reconcile with the pooled
curve, the "ever recorded" reading must not.

Runs the real templates through the real SQL compiler against DuckDB. No LLM.
"""

import json

import pytest

from udiagent.query import DuckDBConnector, QueryEngine
from udiagent.schema import parse_schema_from_dict
from udiagent.vis_generate import (
    _load_generated_tools,
    instantiate_template,
    validate_bindings,
)

# One row per event. Every subject earns its place:
#   s1  stratifier FLIPS between start and death — the bug. Baseline arm A.
#   s2  concordant death, the control.
#   s3  censored: a start and a later visit, no death.
#   s4  no stratifier value at baseline, and dies. Its only value ('C') lives on
#       the death row, so it is also the miniature of pcx's "Unavailable" stratum:
#       a group whose every member is dead by construction.
#   s5  two values across its timeline, censored — the overlap case for "ever".
#   s6  a death with no start event at all: must be dropped by both readings.
_EVENTS = """subject,event,day,arm
s1,start,0,A
s1,death,10,B
s2,start,0,A
s2,visit,5,A
s2,death,20,A
s3,start,0,B
s3,visit,30,B
s4,start,0,
s4,death,40,C
s5,start,0,B
s5,visit,7,A
s6,death,15,A
"""

_ARGS = {
    "entity": "events",
    "field1": "subject",
    "field2": "event",
    "field3": "day",
    "value1": "start",
    "value2": "death",
}


@pytest.fixture()
def survival(tmp_path):
    """Run a survival template against the synthetic log, in DuckDB."""
    csv = tmp_path / "events.csv"
    csv.write_text(_EVENTS)

    schema = parse_schema_from_dict(
        {
            "udi:path": "",
            "resources": [
                {
                    "name": "events",
                    "path": str(csv),
                    "udi:row_count": 12,
                    "schema": {
                        "fields": [
                            {"name": "subject", "udi:data_type": "nominal"},
                            {"name": "event", "udi:data_type": "nominal"},
                            {"name": "day", "udi:data_type": "quantitative"},
                            {"name": "arm", "udi:data_type": "nominal"},
                        ]
                    },
                }
            ],
        }
    )
    generated = _load_generated_tools()
    assert generated is not None
    _defs, dispatch, templates, _tags = generated
    engine = QueryEngine(
        DuckDBConnector(views={"events": str(csv)}), table_map={"events": "events"}
    )

    def run(suffix, stratify=True):
        # By name suffix, not index: inserting a template renumbers every later one.
        tool = next(n for n in dispatch if n.endswith(suffix))
        idx, param_map = dispatch[tool]
        args = dict(_ARGS)
        if stratify:
            args["field4"] = "arm"
        bindings = {param_map[k]: v for k, v in args.items() if k in param_map}
        spec = instantiate_template(templates[idx], bindings, schema)
        result = engine.run_query(
            source=spec["source"], transformation=spec["transformation"]
        )
        return result["displayData"]

    return run


def _cohorts(rows, stratum):
    """{stratum value: (subjects, deaths)} — both are per-group constants."""
    out = {}
    for row in rows:
        out.setdefault(row[stratum], (row["subjects"], row["deaths"]))
    return out


def test_baseline_stratification_reconciles_with_the_pooled_curve(survival):
    pooled = survival("_line_survival", stratify=False)[0]
    # s6 has no start event and is excluded; s4 has no stratifier value but is
    # still part of the whole cohort.
    assert (pooled["subjects"], pooled["deaths"]) == (5, 3)

    cohorts = _cohorts(survival("_line_survival_baseline"), "arm")

    # The assertion that fails on the per-event pipeline: it credited arm A with
    # only one death, because s1's death landed on a row (s1, B) that had no start
    # event and was dropped.
    assert cohorts == {"A": (2, 2), "B": (2, 0)}

    # Every subject is placed once, so the groups partition the cohort — minus
    # only s4, which has no value at baseline and cannot be placed anywhere.
    assert sum(n for n, _ in cohorts.values()) == pooled["subjects"] - 1
    assert sum(d for _, d in cohorts.values()) == pooled["deaths"] - 1

    # And the naive form is false here, deliberately. "Strata sum to the pooled
    # total" holds only when every subject has a baseline value — true of pcx, not
    # true in general — so asserting it would encode a coincidence.
    assert sum(d for _, d in cohorts.values()) != pooled["deaths"]


@pytest.mark.parametrize(
    "suffix", ["_line_survival_baseline", "_line_survival_ever"]
)
def test_a_missing_value_is_excluded_rather_than_made_into_a_stratum(survival, suffix):
    """Neither reading may turn "no value recorded" into a category.

    Under the baseline reading s4 leaves the cohort entirely (it has nothing to be
    placed by). Under "ever" it stays, in group C only — dropping its null-valued
    row must not also drop the start event that row carried, which is why that
    filter sits after the span is broadcast rather than before.
    """
    cohorts = _cohorts(survival(suffix), "arm")
    assert None not in cohorts
    if suffix.endswith("_baseline"):
        # s4's only value lives on its death row and must not leak in from there.
        assert "C" not in cohorts
    else:
        assert cohorts["C"] == (1, 1)


def test_a_stratum_with_no_deaths_stays_flat_and_unlabelled(survival):
    rows = [r for r in survival("_line_survival_baseline") if r["arm"] == "B"]
    assert rows, "arm B should render"
    assert all(r["final percentage"] == 100 for r in rows)
    # No final value to report, so the rule and its label are suppressed.
    assert all(r["label year"] is None for r in rows)


def test_ever_recorded_stratification_overlaps_and_must_not_reconcile(survival):
    pooled = survival("_line_survival", stratify=False)[0]
    cohorts = _cohorts(survival("_line_survival_ever"), "arm")

    # s1 -> A and B; s2 -> A; s4 -> C; s5 -> A and B; s3 -> B.
    assert cohorts == {"A": (3, 2), "B": (3, 1), "C": (1, 1)}

    # The opposite invariant to the baseline reading, asserted so that nobody
    # "fixes" it: membership overlaps, so a subject is counted in several groups
    # and s1's single death is attributed twice.
    assert sum(n for n, _ in cohorts.values()) > pooled["subjects"]
    assert sum(d for _, d in cohorts.values()) > pooled["deaths"]


def test_ever_recorded_stratification_keeps_its_immortal_time_artefact(survival):
    """Pinned deliberately: this is a property of the definition, not a defect.

    Arm C exists only on a death row, so membership in it implies death and the
    curve is flat at 0% by construction. It is documented in the template's design
    considerations; if it ever silently disappears, that documentation is wrong.
    """
    rows = [r for r in survival("_line_survival_ever") if r["arm"] == "C"]
    assert rows
    assert all(r["final percentage"] == 0 for r in rows)


def _survival_spec(suffix, stratifier="tumor_locations"):
    """Instantiate a survival template without executing it."""
    generated = _load_generated_tools()
    assert generated is not None
    _defs, dispatch, templates, _tags = generated
    tool = next(n for n in dispatch if n.endswith(suffix))
    idx, param_map = dispatch[tool]
    schema = parse_schema_from_dict(
        {
            "udi:path": "",
            "resources": [
                {
                    "name": "events",
                    "path": "events.csv",
                    "udi:row_count": 10,
                    "schema": {
                        "fields": [
                            {"name": "subject", "udi:data_type": "nominal"},
                            {"name": "event", "udi:data_type": "nominal"},
                            {"name": "day", "udi:data_type": "quantitative"},
                            {"name": stratifier, "udi:data_type": "nominal"},
                        ]
                    },
                }
            ],
        }
    )
    args = {**_ARGS, "field4": stratifier}
    bindings = {param_map[k]: v for k, v in args.items() if k in param_map}
    return instantiate_template(templates[idx], bindings, schema)


def _transform_index(spec, kind):
    return next(i for i, t in enumerate(spec["transformation"]) if kind in t)


@pytest.mark.parametrize(
    "suffix, unnest_before_rollup",
    [
        # Baseline expands the rollup's own output: one row per subject already,
        # nothing counted yet, so it multiplies nothing — and the values come from
        # the start event alone, which is what "at baseline" means.
        ("_line_survival_baseline_multivalue", False),
        # "Ever" expands the event rows, so membership is read from every event.
        ("_line_survival_ever_multivalue", True),
    ],
)
def test_multi_value_unnest_sits_on_the_right_side_of_the_rollup(
    suffix, unnest_before_rollup
):
    """The SQL backend rejects `unnest`, so this is asserted structurally.

    Which side of the rollup the expansion happens on *is* the difference between
    the two readings, so it is the one thing that must not drift.
    """
    spec = _survival_spec(suffix)
    unnest = _transform_index(spec, "unnest")
    rollup = _transform_index(spec, "rollup")
    assert (unnest < rollup) is unnest_before_rollup

    config = next(t for t in spec["transformation"] if "unnest" in t)["unnest"]
    assert config["field"] == "tumor_locations"
    assert config["separator"] == ";"


@pytest.mark.parametrize(
    "suffix",
    ["_line_survival_baseline", "_line_survival_baseline_multivalue"],
)
def test_the_baseline_stratifier_is_aggregated_but_only_ever_drawn_as_a_category(
    suffix,
):
    """Carrying a nominal column through a rollup is new, so pin it positively.

    The template aggregates it with `max` over a derived column, which puts it out
    of reach of the syntactic guard in test_template_type_constraints.py (that only
    inspects a rollup whose `field` is a bare placeholder). This asserts what that
    guard would have: the column is a category, never a quantity.
    """
    spec = _survival_spec(suffix)
    rollup = next(t for t in spec["transformation"] if "rollup" in t)["rollup"]
    assert rollup["tumor_locations"] == {"op": "max", "field": "baseline stratum"}

    channels = {
        mapping["encoding"]
        for layer in spec["representation"]
        for mapping in layer["mapping"]
        if mapping.get("field") == "tumor_locations"
    }
    assert channels == {"color"}


def test_survival_tool_names_distinguish_the_two_readings():
    """Names come from an explicit hint, not from keywords in the description.

    Derived names would collide here — all five descriptions share the same
    vocabulary — and a description that mentions its sibling ("prefer the baseline
    variant when...") would inherit that sibling's suffix.
    """
    generated = _load_generated_tools()
    assert generated is not None
    _defs, dispatch, _templates, _tags = generated
    suffixes = {n.split("_line_", 1)[1] for n in dispatch if "survival" in n}
    assert suffixes == {
        "survival",
        "survival_baseline",
        "survival_baseline_multivalue",
        "survival_ever",
        "survival_ever_multivalue",
        "survival_related",
    }


def test_every_stratified_survival_template_names_its_reading():
    """The prose has to say which question the chart answers.

    Two templates whose numbers legitimately differ are only safe if the model and
    the reviewer can tell which is which, so this pins that the distinguishing
    words survive an edit to the descriptions.
    """
    path = (
        __import__("pathlib")
        .Path(__file__)
        .parents[1]
        / "src/udiagent/data/skills/template_visualizations.json"
    )
    templates = json.loads(path.read_text())
    by_hint = {t["name_hint"]: t for t in templates if t.get("name_hint")}

    for hint in ("survival_baseline", "survival_baseline_multivalue"):
        text = by_hint[hint]["description"].lower()
        assert "start event" in text
        # "ever recorded", not the bare word: "every value it listed" is fine.
        assert "ever recorded" not in text, "the baseline variant must not claim the other"

    for hint in ("survival_ever", "survival_ever_multivalue"):
        assert "ever recorded" in by_hint[hint]["description"].lower()

    # Every reading that defines membership from events after the clock starts —
    # including the cross-table one, where a protocol may begin after diagnosis —
    # must say that the cohorts overlap and name the bias it introduces.
    for hint in ("survival_ever", "survival_ever_multivalue", "survival_related"):
        template = by_hint[hint]
        assert "overlap" in template["description"].lower()
        assert "immortal-time" in template["design_considerations"].lower()


@pytest.mark.parametrize(
    "suffix",
    [
        "_line_survival",
        "_line_survival_baseline",
        "_line_survival_baseline_multivalue",
        "_line_survival_ever",
        "_line_survival_ever_multivalue",
        "_line_survival_related",
    ],
)
def test_survival_curves_are_drawn_as_steps_on_a_year_axis(suffix):
    """Both are corrections to how the curve reads, not to what it computes.

    A survival curve is a step function — the fraction alive holds constant between
    deaths — so a sloped segment draws a decline nobody observed and invites the eye
    to read off a value at a time when none was measured. Steps also make the curve
    visibly non-increasing, which is the property a reader checks it against.

    And the axis is years: an event log stores a day offset, but nobody converts
    "548 days" in their head, and a day axis over a multi-year cohort labels every
    200th day.
    """
    spec = _survival_spec(suffix) if "related" not in suffix else _related_spec()

    curve = next(
        layer
        for layer in spec["representation"]
        if any(m.get("field") == "survival years" for m in layer["mapping"])
    )
    assert curve["interpolate"] == "step-after"

    # Nothing is still positioned in days, and every axis says so.
    x_fields = {
        m["field"]
        for layer in spec["representation"]
        for m in layer["mapping"]
        if m["encoding"] == "x"
    }
    assert not any(f.endswith("day") for f in x_fields), x_fields
    titles = {
        m.get("title")
        for layer in spec["representation"]
        for m in layer["mapping"]
        if m["encoding"] == "x"
    }
    assert titles == {"survival years"}


def _related_spec():
    """The cross-table variant, bound against a two-table schema."""
    generated = _load_generated_tools()
    assert generated is not None
    _defs, dispatch, templates, _tags = generated
    tool = next(n for n in dispatch if n.endswith("_line_survival_related"))
    idx, param_map = dispatch[tool]

    def table(name, fields):
        return {
            "name": name,
            "path": f"{name}.csv",
            "udi:row_count": 10,
            "schema": {
                "fields": [
                    {"name": f, "udi:data_type": t} for f, t in fields
                ]
            },
        }

    schema = parse_schema_from_dict(
        {
            "udi:path": "",
            "resources": [
                table(
                    "events",
                    [
                        ("subject", "nominal"),
                        ("event", "nominal"),
                        ("day", "quantitative"),
                    ],
                ),
                table("therapy", [("subject", "nominal"), ("protocol", "nominal")]),
            ],
        }
    )
    args = {
        "entity1": "events",
        "entity2": "therapy",
        "entity1_field1": "subject",
        "entity1_field2": "event",
        "entity1_field3": "day",
        "entity2_field1": "subject",
        "entity2_field": "protocol",
        "value1": "start",
        "value2": "death",
    }
    bindings = {param_map[k]: v for k, v in args.items() if k in param_map}
    assert validate_bindings(templates[idx], bindings, schema) == []
    return instantiate_template(templates[idx], bindings, schema)


def test_cross_table_stratifier_joins_on_the_keys_it_binds():
    """Sibling tables have no relationship to follow, so the template names the keys.

    The tables a stratifier lives in are usually siblings of the event log — both
    hang off a patient table — so there is no direct relationship between them. What
    they do share is the subject identifier, which is all the join needs, and taking
    it as a binding keeps the template usable on any such pair.
    """
    spec = _related_spec()
    assert [src["name"] for src in spec["source"]] == ["events", "therapy"]

    join = next(t for t in spec["transformation"] if "join" in t)
    assert join["join"]["on"] == ["subject", "subject"]
    assert join["in"] == ["events", "therapy"]

    # The stratifier comes from the joined table and is drawn as a category.
    channels = {
        m["encoding"]
        for layer in spec["representation"]
        for m in layer["mapping"]
        if m.get("field") == "protocol"
    }
    assert channels == {"color"}

    # The join must precede the per-subject rollup, or the stratifier isn't there
    # to group by.
    assert _transform_index(spec, "join") < _transform_index(spec, "rollup")


def test_cross_table_survival_reads_membership_and_overlaps(tmp_path):
    """One subject, two protocols: it joins both groups and its death counts twice."""
    events = tmp_path / "events.csv"
    events.write_text(
        "subject,event,day\ns1,start,0\ns1,death,365\ns2,start,0\ns2,death,730\n"
    )
    therapy = tmp_path / "therapy.csv"
    # s1 is on two protocols; s2 on one; s3 has no events at all.
    therapy.write_text(
        "subject,protocol\ns1,A\ns1,B\ns2,A\ns3,C\n"
    )
    generated = _load_generated_tools()
    _defs, dispatch, templates, _tags = generated
    tool = next(n for n in dispatch if n.endswith("_line_survival_related"))
    idx, param_map = dispatch[tool]
    schema = parse_schema_from_dict(
        {
            "udi:path": "",
            "resources": [
                {
                    "name": "events",
                    "path": str(events),
                    "udi:row_count": 4,
                    "schema": {
                        "fields": [
                            {"name": "subject", "udi:data_type": "nominal"},
                            {"name": "event", "udi:data_type": "nominal"},
                            {"name": "day", "udi:data_type": "quantitative"},
                        ]
                    },
                },
                {
                    "name": "therapy",
                    "path": str(therapy),
                    "udi:row_count": 4,
                    "schema": {
                        "fields": [
                            {"name": "subject", "udi:data_type": "nominal"},
                            {"name": "protocol", "udi:data_type": "nominal"},
                        ]
                    },
                },
            ],
        }
    )
    args = {
        "entity1": "events",
        "entity2": "therapy",
        "entity1_field1": "subject",
        "entity1_field2": "event",
        "entity1_field3": "day",
        "entity2_field1": "subject",
        "entity2_field": "protocol",
        "value1": "start",
        "value2": "death",
    }
    bindings = {param_map[k]: v for k, v in args.items() if k in param_map}
    spec = instantiate_template(templates[idx], bindings, schema)
    engine = QueryEngine(
        DuckDBConnector(views={"events": str(events), "therapy": str(therapy)}),
        table_map={"events": "events", "therapy": "therapy"},
    )
    rows = engine.run_query(
        source=spec["source"], transformation=spec["transformation"]
    )["displayData"]
    cohorts = _cohorts(rows, "protocol")

    # A: s1 and s2. B: s1 alone. C: s3 has no events, so it never reaches the curve.
    assert cohorts == {"A": (2, 2), "B": (1, 1)}
    # s1's single death is attributed to both of its protocols — the overlap this
    # reading is built on, and the reason it cannot reconcile with a pooled curve.
    assert sum(d for _, d in cohorts.values()) == 3

    # The join duplicates event rows per related record; the spans must survive it.
    years = {r["protocol"]: r["survival years"] for r in rows if r["died"] == 1}
    assert round(years["B"], 2) == round(365 / 365.25, 2)


@pytest.mark.parametrize("subset", [None, ("s1",), ("s2",), ("s3",), ("s4",), ("s6",)])
def test_a_survival_curve_never_rises_however_the_data_is_filtered(tmp_path, subset):
    """Survival cannot increase — and a filter must not be able to make it look so.

    Reported from YAC: curves appearing to slope upward when a filter was applied.
    A filter reaches these templates as a row subset prepended to the pipeline, and
    the cumulative-deaths construction is monotone for *any* subset, so this pins
    that property directly rather than trusting the arithmetic to stay that way.

    The rendering is what actually reaches a reader, so `step-after` is the other
    half of the answer: a staircase can only go right or down, which is why the
    curve now says so structurally instead of relying on the numbers alone.
    """
    csv = tmp_path / "events.csv"
    csv.write_text(_EVENTS)
    schema = parse_schema_from_dict(
        {
            "udi:path": "",
            "resources": [
                {
                    "name": "events",
                    "path": str(csv),
                    "udi:row_count": 12,
                    "schema": {
                        "fields": [
                            {"name": "subject", "udi:data_type": "nominal"},
                            {"name": "event", "udi:data_type": "nominal"},
                            {"name": "day", "udi:data_type": "quantitative"},
                            {"name": "arm", "udi:data_type": "nominal"},
                        ]
                    },
                }
            ],
        }
    )
    generated = _load_generated_tools()
    _defs, dispatch, templates, _tags = generated
    engine = QueryEngine(
        DuckDBConnector(views={"events": str(csv)}), table_map={"events": "events"}
    )

    for suffix in ("_line_survival", "_line_survival_baseline", "_line_survival_ever"):
        tool = next(n for n in dispatch if n.endswith(suffix))
        idx, param_map = dispatch[tool]
        args = dict(_ARGS)
        if suffix != "_line_survival":
            args["field4"] = "arm"
        bindings = {param_map[k]: v for k, v in args.items() if k in param_map}
        spec = instantiate_template(templates[idx], bindings, schema)

        pipeline = list(spec["transformation"])
        if subset is not None:
            # How a cross-card selection reaches the chart: a row filter, prepended
            # ahead of the whole pipeline, so every count is recomputed on the
            # subset. One `==` per case — the SQL backend has no `or`, and a
            # single-subject cohort is the harshest case for the construction
            # anyway (n=1 means every step is the whole axis).
            pipeline = [
                {
                    "filter": {
                        "op": "==",
                        "left": {"field": "subject"},
                        "right": {"literal": subset[0]},
                    }
                }
            ] + pipeline

        rows = engine.run_query(source=spec["source"], transformation=pipeline)[
            "displayData"
        ]
        by_group = {}
        for row in rows:
            key = row.get("arm")
            by_group.setdefault(key, []).append(
                (row["survival years"], row["survival percentage"])
            )
        for key, points in by_group.items():
            ordered = sorted(set(points))
            for (_, before), (_, after) in zip(ordered, ordered[1:]):
                assert after <= before + 1e-9, (
                    f"{suffix} group {key!r} rises: {before} -> {after}"
                )

