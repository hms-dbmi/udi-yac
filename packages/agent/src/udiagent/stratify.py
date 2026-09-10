"""Dynamic stratification: turning a field into a small set of named strata.

A stratified chart splits its data by some field, and by default each distinct
value of that field becomes one stratum. That only works when the field's domain
is already the comparison a reader wants. Often it is not: a race column with
nine values draws nine unreadable survival curves when the question was "white
versus everyone else", and an age column is continuous, so splitting on its
values is meaningless.

A **grouping** is the answer: a small, explicit map from the field's values to
named strata. It arrives as JSON — written by the model from the user's request,
or by the tweak widget when a reader re-cuts the chart — and is resolved into a
`derive` expression that computes the stratum column.

Two kinds, because the two field types need different shapes:

``{"type": "nominal", "groups": [{"label": "White", "values": ["White"]}],
   "other": "Other"}``
    Each group lists the values that fall in it. Anything unlisted lands in the
    ``other`` bucket, or is dropped from the chart when ``other`` is null.

``{"type": "quantitative", "cuts": [50, 65]}``
    Ascending cut points. N cuts give N+1 buckets, each half-open on the right
    (``x < 50``, ``50 <= x < 65``, ``x >= 65``), which is the convention every
    clinical "over 65" cutoff means. Labels are derived from the bounds unless
    ``labels`` overrides them.

The expression this builds is a nested ternary of the same structured `Expr`
nodes the templates use everywhere else, so it compiles for both executors —
Arquero in the browser and SQL on the server. A raw Arquero string would be
rejected by the query compiler.
"""

import json

#: More strata than this stop being a comparison and start being a mess: the
#: curves overlap, the colour scale runs out of distinguishable hues, and the
#: legend is longer than the chart. Enforced rather than advised, because the
#: model will happily ask for thirty.
MAX_GROUPS = 10

#: Label for values no group claims, when the grouping does not name one.
DEFAULT_OTHER_LABEL = "Other"


class GroupingError(ValueError):
    """A grouping payload that cannot be turned into strata.

    Carries reader-grade prose: these messages go back to the model as a tool
    error and to the user as the tweak widget's failure text, so they say what
    was wrong and what would be right.
    """


def parse_grouping(raw):
    """Parse a grouping payload into a dict, or None when there is no grouping.

    Accepts the JSON string that arrives as a tool argument, an already-parsed
    dict, or any of the several ways a caller can spell "no grouping": None, the
    empty string, whitespace, and the JSON nulls/empties a model reaches for when
    a tool parameter is optional but it feels obliged to send something.

    Returning None for all of those is deliberate. "No grouping" is the common
    case — it is what every existing stratified chart wants — so it must never be
    an error, and it must not depend on the model choosing one spelling.
    """
    if raw is None:
        return None
    if isinstance(raw, dict):
        return raw or None
    if not isinstance(raw, str):
        raise GroupingError(
            f"grouping must be a JSON object or string, got {type(raw).__name__}."
        )

    text = raw.strip()
    if text in ("", "null", "none", "None", "{}", "[]"):
        return None
    try:
        parsed = json.loads(text)
    except json.JSONDecodeError as exc:
        raise GroupingError(
            f"grouping is not valid JSON ({exc.msg}). Expected an object like "
            '{"type": "nominal", "groups": [{"label": "White", "values": ["White"]}]} '
            'or {"type": "quantitative", "cuts": [65]}.'
        ) from None
    if parsed is None:
        return None
    if not isinstance(parsed, dict):
        raise GroupingError(
            "grouping must be a JSON object with a 'type' of 'nominal' or "
            f"'quantitative', got {type(parsed).__name__}."
        )
    return parsed or None


def grouping_kind(grouping):
    """``"nominal"`` / ``"quantitative"`` for a parsed grouping.

    Inferred when absent, so a model that sends only `cuts` or only `groups`
    still gets what it plainly meant rather than a type error.
    """
    declared = grouping.get("type") or grouping.get("kind")
    if isinstance(declared, str):
        declared = declared.strip().lower()
        if declared in ("nominal", "categorical", "ordinal"):
            return "nominal"
        if declared in ("quantitative", "numeric", "number", "continuous"):
            return "quantitative"
        raise GroupingError(
            f"grouping type '{declared}' is not recognised; use 'nominal' "
            "(named groups of values) or 'quantitative' (numeric cut points)."
        )
    if "cuts" in grouping:
        return "quantitative"
    if "groups" in grouping:
        return "nominal"
    raise GroupingError(
        "grouping needs a 'type' of 'nominal' or 'quantitative' (or a 'groups' / "
        "'cuts' key to infer it from)."
    )


def _nominal_groups(grouping):
    """The [(label, [values])] a nominal grouping declares, validated."""
    raw_groups = grouping.get("groups")
    if not isinstance(raw_groups, list) or not raw_groups:
        raise GroupingError(
            "a nominal grouping needs a non-empty 'groups' list, e.g. "
            '[{"label": "White", "values": ["White"]}].'
        )

    groups = []
    seen_labels = set()
    # One value may only land in one group: overlapping groups would put a
    # subject in two strata at once, which the nested conditional cannot express
    # and a reader would silently mis-read as a partition.
    claimed = {}
    for index, entry in enumerate(raw_groups):
        if not isinstance(entry, dict):
            raise GroupingError(
                f"group #{index + 1} must be an object with 'label' and 'values'."
            )
        label = entry.get("label")
        if not isinstance(label, str) or not label.strip():
            raise GroupingError(f"group #{index + 1} needs a non-empty 'label'.")
        label = label.strip()
        if label in seen_labels:
            raise GroupingError(
                f"two groups are both labelled '{label}'; labels name the strata, "
                "so they have to be distinct."
            )
        seen_labels.add(label)

        values = entry.get("values")
        if isinstance(values, str):
            values = [values]
        if not isinstance(values, list) or not values:
            raise GroupingError(
                f"group '{label}' needs a non-empty 'values' list naming the "
                "field values that fall in it."
            )
        cleaned = []
        for value in values:
            if value is None:
                raise GroupingError(
                    f"group '{label}' lists a null value; a missing value cannot "
                    "be assigned to a stratum."
                )
            text = str(value)
            if text in claimed and claimed[text] != label:
                raise GroupingError(
                    f"value '{text}' is in both '{claimed[text]}' and '{label}'; "
                    "each value may belong to only one group."
                )
            claimed[text] = label
            if text not in cleaned:
                cleaned.append(text)
        groups.append((label, cleaned))
    return groups


def _other_label(grouping):
    """The label for unclaimed values, or None to drop them from the chart.

    Absent means the default bucket; an explicit null/false means "drop", which
    is the "exclude unassigned values" option the widget offers.
    """
    if "other" not in grouping and "otherLabel" not in grouping:
        return DEFAULT_OTHER_LABEL
    raw = grouping.get("other", grouping.get("otherLabel"))
    if raw is None or raw is False:
        return None
    if not isinstance(raw, str) or not raw.strip():
        raise GroupingError(
            "'other' must be the label for unassigned values, or null to leave "
            "them out of the chart."
        )
    return raw.strip()


def _cuts(grouping):
    """The ascending numeric cut points a quantitative grouping declares."""
    raw_cuts = grouping.get("cuts")
    if isinstance(raw_cuts, (int, float)) and not isinstance(raw_cuts, bool):
        raw_cuts = [raw_cuts]
    if not isinstance(raw_cuts, list) or not raw_cuts:
        raise GroupingError(
            "a quantitative grouping needs a non-empty 'cuts' list of numbers, "
            'e.g. {"type": "quantitative", "cuts": [65]} to split at 65.'
        )

    cuts = []
    for cut in raw_cuts:
        if isinstance(cut, bool) or not isinstance(cut, (int, float, str)):
            raise GroupingError(f"cut point '{cut}' is not a number.")
        try:
            number = float(cut)
        except (TypeError, ValueError):
            raise GroupingError(f"cut point '{cut}' is not a number.") from None
        if number != number or number in (float("inf"), float("-inf")):
            raise GroupingError(f"cut point '{cut}' is not a finite number.")
        # Keep ints as ints so a label reads "< 65" rather than "< 65.0".
        cuts.append(int(number) if float(number).is_integer() else number)

    if len(set(cuts)) != len(cuts):
        raise GroupingError(
            f"cut points {cuts} contain a duplicate; each one starts a new "
            "bucket, so a repeat would make an empty one."
        )
    if cuts != sorted(cuts):
        raise GroupingError(
            f"cut points {cuts} must be in ascending order; they read left to "
            "right along the axis."
        )
    return cuts


def _number_text(value):
    """Render a bound for a label without a trailing ``.0``."""
    if isinstance(value, float) and value.is_integer():
        return str(int(value))
    return str(value)


def quantitative_labels(cuts, overrides=None):
    """Bucket labels for a set of cut points — N cuts give N+1 labels.

    Half-open on the right throughout (``< 50``, ``50–65``, ``>= 65``), matching
    how the buckets are actually computed. An explicit ``labels`` list overrides,
    but only at the right length: a short list would silently mislabel the tail,
    which is worse than refusing.
    """
    expected = len(cuts) + 1
    if overrides is not None:
        if not isinstance(overrides, list) or len(overrides) != expected:
            raise GroupingError(
                f"'labels' must have exactly {expected} entries for "
                f"{len(cuts)} cut point(s), one per bucket."
            )
        labels = []
        for index, label in enumerate(overrides):
            if not isinstance(label, str) or not label.strip():
                raise GroupingError(f"bucket label #{index + 1} is empty.")
            labels.append(label.strip())
        if len(set(labels)) != len(labels):
            raise GroupingError("bucket labels must be distinct; they name the strata.")
        return labels

    labels = [f"< {_number_text(cuts[0])}"]
    for low, high in zip(cuts, cuts[1:]):
        labels.append(f"{_number_text(low)}–{_number_text(high)}")
    labels.append(f"≥ {_number_text(cuts[-1])}")
    return labels


def _check_group_count(count):
    if count > MAX_GROUPS:
        raise GroupingError(
            f"a grouping may define at most {MAX_GROUPS} strata, and this one "
            f"defines {count}. Merge some together — beyond {MAX_GROUPS} the "
            "curves overlap and the colours stop being distinguishable."
        )


def grouping_labels(grouping):
    """The stratum labels a parsed grouping produces, in drawing order.

    Separate from the expression builder because callers need the labels without
    a resolved field name — the tweak widget lists them, and validation counts
    them against the cap before anything is resolved.
    """
    kind = grouping_kind(grouping)
    if kind == "nominal":
        labels = [label for label, _ in _nominal_groups(grouping)]
        other = _other_label(grouping)
        if other is not None:
            labels.append(other)
    else:
        cuts = _cuts(grouping)
        labels = quantitative_labels(cuts, grouping.get("labels"))
    _check_group_count(len(labels))
    return labels


def validate_grouping(grouping, field_type=None):
    """Check a parsed grouping, returning a list of error strings (empty = ok).

    Mirrors `validate_bindings`' contract — errors as prose, not exceptions — so
    a bad grouping is reported alongside a bad field binding in the same list.

    `field_type` is the bound field's type from the schema, when known. A
    quantitative grouping of a nominal column (or the reverse) is the mistake
    worth catching here: it resolves to an expression that compares a string
    against a number, which does not raise anywhere and simply puts every row in
    one bucket.
    """
    try:
        kind = grouping_kind(grouping)
        grouping_labels(grouping)
    except GroupingError as exc:
        return [str(exc)]

    if field_type:
        if kind == "quantitative" and field_type not in ("quantitative",):
            return [
                f"this grouping cuts the field at numeric thresholds, but the "
                f"field is {field_type}. Use a nominal grouping that names the "
                "values to combine."
            ]
        if kind == "nominal" and field_type == "quantitative":
            return [
                "this grouping names values to combine, but the field is "
                "quantitative. Use a quantitative grouping with numeric cut "
                'points, e.g. {"type": "quantitative", "cuts": [65]}.'
            ]
    return []


def grouping_expr(grouping, field_name):
    """The `derive` expression computing the stratum column for `field_name`.

    A nested ternary, innermost-last, of the structured Expr nodes the grammar
    understands. `None` for the grouping gives the identity — the field itself —
    which is what keeps an ungrouped stratified chart splitting by raw value.
    """
    if grouping is None:
        return {"field": field_name}

    kind = grouping_kind(grouping)
    if kind == "nominal":
        groups = _nominal_groups(grouping)
        other = _other_label(grouping)
        _check_group_count(len(groups) + (1 if other is not None else 0))
        # Unclaimed values become the Other label, or null — and a null stratum
        # is filtered out downstream, which is how "drop them" is expressed.
        expr = {"literal": other}
        # Built from the last group backwards, so the first group ends up as the
        # outermost test and therefore wins any tie the value checks leave.
        for label, values in reversed(groups):
            test = None
            for value in values:
                clause = {
                    "op": "==",
                    "left": {"field": field_name},
                    "right": {"literal": value},
                }
                test = clause if test is None else {"op": "||", "left": test, "right": clause}
            expr = {"if": test, "then": {"literal": label}, "else": expr}
        return expr

    cuts = _cuts(grouping)
    labels = quantitative_labels(cuts, grouping.get("labels"))
    _check_group_count(len(labels))
    # Same shape, built from the top bucket down: `x < cut` tested in ascending
    # order means the first passing test is the right bucket, and the final else
    # is everything at or above the last cut.
    expr = {"literal": labels[-1]}
    for cut, label in reversed(list(zip(cuts, labels[:-1]))):
        expr = {
            "if": {
                "op": "<",
                "left": {"field": field_name},
                "right": {"literal": cut},
            },
            "then": {"literal": label},
            "else": expr,
        }
    return expr


# ---------------------------------------------------------------------------
# Membership of a value set: grouping a stratifier a subject has SEVERAL of
# ---------------------------------------------------------------------------

#: Column the membership pipeline reduces each subject's rows into. Holds the
#: index of the first group that subject matched, as a string, or null.
MEMBERSHIP_TAG = "membership tag"


def _membership_groups(grouping):
    """The nominal groups, checked and capped for a membership grouping.

    The cap does more work here than elsewhere. Group index is carried through a
    rollup as a *string* digit and recovered with `min`, which orders by
    codepoint — so "10" would sort before "2" and the eleventh group would
    outrank the third. Ten named groups is the most that stays sound, and
    `_check_group_count` already refuses more.
    """
    groups = _nominal_groups(grouping)
    other = _other_label(grouping)
    _check_group_count(len(groups) + (1 if other is not None else 0))
    if len(groups) > 10:
        raise GroupingError(
            "a membership grouping may name at most 10 groups, because the group "
            "index travels as a single digit through the per-subject rollup."
        )
    return groups, other


def membership_tag_expr(grouping, field_name):
    """Per row: which group this row's value falls in, as a priority index.

    A digit string rather than the label, because the next step reduces it with
    `min` over the subject's rows and the *order* is what picks the winner.
    Null where the row matches nothing, so `min` skips it — a subject is tagged
    by its best-matching row and by nothing else.
    """
    groups, _other = _membership_groups(grouping)
    expr = {"literal": None}
    # Built from the last group backwards so the first-declared group ends up
    # the outermost test, which is also the lowest index and therefore the one
    # `min` keeps.
    for index, (_label, values) in reversed(list(enumerate(groups))):
        test = None
        for value in values:
            clause = {
                "op": "==",
                "left": {"field": field_name},
                "right": {"literal": value},
            }
            test = clause if test is None else {"op": "||", "left": test, "right": clause}
        expr = {"if": test, "then": {"literal": str(index)}, "else": expr}
    return expr


def membership_label_expr(grouping, tag_column=MEMBERSHIP_TAG):
    """Per subject: the reduced tag turned into the label the chart draws.

    The null branch carries both cases that mean "none of these": a subject with
    rows in the table that matched no group, and a subject with no rows at all,
    which the left join leaves null. Both belong in the same comparison line.
    """
    groups, other = _membership_groups(grouping)
    expr = {"literal": other}
    for index, (label, _values) in reversed(list(enumerate(groups))):
        expr = {
            "if": {
                "op": "==",
                "left": {"field": tag_column},
                "right": {"literal": str(index)},
            },
            "then": {"literal": label},
            "else": expr,
        }
    return expr
