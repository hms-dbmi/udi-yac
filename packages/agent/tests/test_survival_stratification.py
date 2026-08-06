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
from udiagent.vis_generate import _load_generated_tools, instantiate_template

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
    assert all(r["label day"] is None for r in rows)


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
        template = by_hint[hint]
        assert "ever recorded" in template["description"].lower()
        # Overlap is the property a reader is most likely to get wrong.
        assert "overlap" in template["description"].lower()
        considerations = template["design_considerations"].lower()
        assert "immortal-time" in considerations
