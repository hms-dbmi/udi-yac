"""The grouping core: parsing, validation and the derived stratum expression."""

import pytest

from udiagent.stratify import (
    MAX_GROUPS,
    GroupingError,
    grouping_expr,
    grouping_labels,
    parse_grouping,
    quantitative_labels,
    validate_grouping,
)


# --- "no grouping" is not an error -----------------------------------------


@pytest.mark.parametrize("raw", [None, "", "   ", "null", "{}", "[]", {}])
def test_absent_grouping_parses_to_none(raw):
    """Every spelling of "no grouping" a caller or model might send.

    This is the common case — every stratified chart starts here — so it must
    never depend on which of these the model picked.
    """
    assert parse_grouping(raw) is None


def test_no_grouping_resolves_to_the_field_itself():
    """The identity, so an ungrouped chart still splits by raw value."""
    assert grouping_expr(None, "race") == {"field": "race"}


def test_malformed_json_names_the_shape_it_wanted():
    with pytest.raises(GroupingError) as exc:
        parse_grouping('{"type": "nominal", ')
    assert "valid JSON" in str(exc.value)
    assert "quantitative" in str(exc.value)


# --- nominal ----------------------------------------------------------------


def test_nominal_group_plus_other():
    """The motivating case: one named group, everything else pooled."""
    grouping = parse_grouping(
        '{"type": "nominal", "groups": [{"label": "White", "values": ["White"]}]}'
    )
    assert grouping_labels(grouping) == ["White", "Other"]
    assert grouping_expr(grouping, "race") == {
        "if": {"op": "==", "left": {"field": "race"}, "right": {"literal": "White"}},
        "then": {"literal": "White"},
        "else": {"literal": "Other"},
    }


def test_nominal_multiple_values_chain_with_or():
    grouping = {
        "type": "nominal",
        "groups": [{"label": "Non-white", "values": ["Black", "Asian"]}],
        "other": "White",
    }
    expr = grouping_expr(grouping, "race")
    assert expr["if"] == {
        "op": "||",
        "left": {"op": "==", "left": {"field": "race"}, "right": {"literal": "Black"}},
        "right": {"op": "==", "left": {"field": "race"}, "right": {"literal": "Asian"}},
    }
    assert expr["else"] == {"literal": "White"}


def test_nominal_groups_nest_in_declaration_order():
    """The first group is the outermost test, so it is drawn first."""
    grouping = {
        "type": "nominal",
        "groups": [
            {"label": "A", "values": ["a"]},
            {"label": "B", "values": ["b"]},
        ],
        "other": None,
    }
    expr = grouping_expr(grouping, "f")
    assert expr["then"] == {"literal": "A"}
    assert expr["else"]["then"] == {"literal": "B"}
    # Nothing claims the rest, and null is what the pipeline filters out.
    assert expr["else"]["else"] == {"literal": None}


def test_other_can_be_dropped_rather_than_pooled():
    grouping = {"type": "nominal", "groups": [{"label": "A", "values": ["a"]}], "other": None}
    assert grouping_labels(grouping) == ["A"]


def test_a_value_cannot_be_in_two_groups():
    """Overlapping groups are not a partition and the conditional cannot say so."""
    grouping = {
        "type": "nominal",
        "groups": [
            {"label": "A", "values": ["x"]},
            {"label": "B", "values": ["x"]},
        ],
    }
    assert "only one group" in validate_grouping(grouping)[0]


def test_duplicate_labels_are_refused():
    grouping = {
        "type": "nominal",
        "groups": [
            {"label": "A", "values": ["x"]},
            {"label": "A", "values": ["y"]},
        ],
    }
    assert "distinct" in validate_grouping(grouping)[0]


def test_empty_group_is_refused():
    grouping = {"type": "nominal", "groups": [{"label": "A", "values": []}]}
    assert "non-empty 'values'" in validate_grouping(grouping)[0]


# --- quantitative -----------------------------------------------------------


def test_single_cut_gives_two_buckets():
    """The "over/under 65" case."""
    grouping = parse_grouping('{"type": "quantitative", "cuts": [65]}')
    assert grouping_labels(grouping) == ["< 65", "≥ 65"]
    assert grouping_expr(grouping, "age") == {
        "if": {"op": "<", "left": {"field": "age"}, "right": {"literal": 65}},
        "then": {"literal": "< 65"},
        "else": {"literal": "≥ 65"},
    }


def test_buckets_are_half_open_on_the_right():
    """`50–65` holds 50 and excludes 65, which is what "over 65" means."""
    labels = quantitative_labels([50, 65])
    assert labels == ["< 50", "50–65", "≥ 65"]
    expr = grouping_expr({"type": "quantitative", "cuts": [50, 65]}, "age")
    assert expr["if"]["right"] == {"literal": 50}
    assert expr["else"]["if"]["right"] == {"literal": 65}
    assert expr["else"]["else"] == {"literal": "≥ 65"}


def test_integer_cuts_do_not_pick_up_a_decimal_point():
    assert quantitative_labels([65.0]) == ["< 65", "≥ 65"]


def test_cuts_must_ascend():
    assert "ascending" in validate_grouping({"type": "quantitative", "cuts": [65, 50]})[0]


def test_duplicate_cuts_are_refused():
    assert "duplicate" in validate_grouping({"type": "quantitative", "cuts": [65, 65]})[0]


def test_non_numeric_cut_is_refused():
    assert "not a number" in validate_grouping({"type": "quantitative", "cuts": ["old"]})[0]


def test_label_overrides_must_cover_every_bucket():
    grouping = {"type": "quantitative", "cuts": [50, 65], "labels": ["young", "old"]}
    assert "exactly 3 entries" in validate_grouping(grouping)[0]


# --- shared -----------------------------------------------------------------


def test_group_cap_is_enforced():
    grouping = {
        "type": "nominal",
        "groups": [{"label": f"g{i}", "values": [f"v{i}"]} for i in range(MAX_GROUPS + 1)],
        "other": None,
    }
    assert f"at most {MAX_GROUPS}" in validate_grouping(grouping)[0]


def test_cap_counts_the_other_bucket():
    """Other is a stratum like any other — it is drawn, so it counts."""
    grouping = {
        "type": "nominal",
        "groups": [{"label": f"g{i}", "values": [f"v{i}"]} for i in range(MAX_GROUPS)],
    }
    assert validate_grouping(grouping)  # MAX_GROUPS named + Other = MAX_GROUPS + 1
    grouping["other"] = None
    assert validate_grouping(grouping) == []


def test_kind_is_inferred_when_not_declared():
    assert grouping_labels({"cuts": [10]}) == ["< 10", "≥ 10"]
    assert grouping_labels({"groups": [{"label": "A", "values": ["a"]}], "other": None}) == ["A"]


def test_type_mismatch_against_the_schema_is_caught():
    """Comparing a string column against a number raises nowhere and silently
    puts every row in one bucket, so it has to be caught up front."""
    numeric = {"type": "quantitative", "cuts": [65]}
    assert "field is nominal" in validate_grouping(numeric, field_type="nominal")[0]

    named = {"type": "nominal", "groups": [{"label": "A", "values": ["a"]}]}
    assert "field is quantitative" in validate_grouping(named, field_type="quantitative")[0]


def test_valid_groupings_report_no_errors():
    assert validate_grouping({"type": "quantitative", "cuts": [65]}, "quantitative") == []
    assert (
        validate_grouping(
            {"type": "nominal", "groups": [{"label": "A", "values": ["a"]}]}, "nominal"
        )
        == []
    )
