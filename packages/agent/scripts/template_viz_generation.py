import json
import re
from enum import Enum
from pathlib import Path

import jsonschema
import pandas as pd
from udi_grammar_py import Chart, Expr, Op, rolling

# Shared AST fragment: legacy "d.rank == 1 ? 'yes' : 'no'". derive/filter carry
# the structured Expr AST (not raw Arquero strings) so the same templates run
# in the browser (Arquero) AND server-side (SQL) — raw strings are rejected by
# the SQL compiler (see packages/agent/src/udiagent/query/expr.py).
RANK_1_YES_NO = Expr.cond(
    Expr.binop("==", Expr.field("rank"), Expr.lit(1)),
    Expr.lit("yes"),
    Expr.lit("no"),
)

_REPO_ROOT = Path(__file__).resolve().parent.parent
_GRAMMAR = _REPO_ROOT / "src" / "udiagent" / "data" / "UDIGrammarSchema.json"


class ChartType(Enum):
    SCATTERPLOT = "scatterplot"
    BARCHART = "barchart"
    GROUPED_BAR = "stacked_bar"
    STACKED_BAR = "stacked_bar"
    NORMALIZED_BAR = "stacked_bar"
    CIRCULAR = "circular"
    TABLE = "table"
    LINE = "line"
    AREA = "area"
    GROUPED_LINE = "grouped_line"
    GROUPED_AREA = "grouped_area"
    GROUPED_SCATTER = "grouped_scatter"
    HEATMAP = "heatmap"
    HISTOGRAM = "histogram"
    DOT = "dot"
    GROUPED_DOT = "grouped_dot"


class TaskType(Enum):
    RETRIEVE_VALUE = "Retrieve_Value"
    FILTER = "Filter"
    COMPUTE_DERIVED_VALUE = "Compute_Derived_Value"
    FIND_EXTREMUM = "Find_Extremum"
    SORT = "Sort"
    DETERMINE_RANGE = "Determine_Range"
    CHARACTERIZE_DISTRIBUTION = "Characterize_Distribution"
    FIND_ANOMALIES = "Find_Anomalies"
    CLUSTER = "Cluster"
    CORRELATE = "Correlate"


class StratumReading(Enum):
    """How a stratifier that varies across a subject's events becomes one stratum.

    An event-level column is not a per-subject attribute: a subject's recorded
    value can differ between the event that starts the clock and the event that
    stops it. Two readings are defensible, they answer different questions, and
    they give different numbers — so they are separate templates rather than a
    flag on one, and each says which question it answers.
    """

    #: The value on the start event — a baseline covariate ("metastatic at
    #: diagnosis"). Each subject falls in exactly one group, so the groups
    #: partition the cohort and add back up to the unstratified curve.
    AT_START = "at_start"
    #: Any value recorded anywhere on the subject's timeline — membership ("ever
    #: metastatic"). Cohorts overlap and do not add up.
    EVER = "ever"
    #: A value from a *related* table, joined in on the subject key — "which
    #: protocol was this subject on". Membership like EVER, since a subject can
    #: have several related records, but the values live in another table.
    RELATED = "related"
    #: Whether the subject appears in another table at all — "did this patient
    #: receive radiation". The stratifier is not a column anywhere; it is
    #: membership of a table, so it is derived from a left join and always has
    #: exactly two values. Partitions the cohort.
    PRESENCE = "presence"
    #: Presence in *two* other tables, crossed: neither, one, the other, both.
    #: Also a partition, with up to four groups.
    PRESENCE_2X2 = "presence_2x2"


# Shared design note for data-cube templates: a cube is read by marginal
# filtering, and the marginal filter (<MARGINAL:...>) is expanded at runtime
# from the per-request schema's dimension list, so one template serves any cube.
# Event values used only to *preview* the survival templates in the studio. The
# templates themselves take <V1>/<V2> literal-value placeholders, which the model
# fills from the request's column domains, so they work with any event vocabulary.
PREVIEW_START_EVENT = "Initial CNS Tumor"
PREVIEW_END_EVENT = "Deceased"


_CUBE_MARGINAL_NOTE = (
    "Reads the cube marginal by filtering to rows where the chosen dimension(s) "
    "are present and every other dimension is empty; the measure is mapped "
    "directly with no re-aggregation. The marginal filter is expanded from the "
    "per-request schema's dimension list, so this template works for any cube."
)


def add_row(
    df,
    query_templates,
    spec,
    chart_type: ChartType,
    task_types: list[TaskType],
    description: str = "",
    design_considerations: str = "",
    tasks: str = "",
    shape: str = "line_item",
    review_hint: str = "",
    preview_bindings: dict | None = None,
    name_hint: str = "",
):
    spec_key_count = get_total_key_count(spec.to_dict())
    if spec_key_count <= 12:
        complexity = "simple"
    elif spec_key_count <= 24:
        complexity = "medium"
    elif spec_key_count <= 36:
        complexity = "complex"
    else:
        complexity = "extra complex"
    # Multi-axis tags: the data shape it targets ("line_item" tidy tables vs
    # "data_cube" pre-aggregated cubes) plus the chart type. `shape` drives
    # per-request template selection; the chart-type tag is extra metadata for
    # finer selection later.
    tags = [shape, chart_type.value]
    df.loc[len(df)] = {
        "query_templates": query_templates,
        "spec_template": spec.to_json(),
        "creation_method": "template",
        "chart_type": chart_type.value,
        "chart_complexity": complexity,
        "spec_key_count": spec_key_count,
        "task_types": task_types,
        "tags": tags,
        "description": description,
        "design_considerations": design_considerations,
        "tasks": tasks,
        # Static note from the template's author to a human reviewer (what to
        # look at, why it was written this way). Distinct from the mutable review
        # state in template_reviews.json, which the studio owns; this travels with
        # the template and is never rewritten by the review UI. Not sent to the
        # LLM — it exists only for the review loop.
        "review_hint": review_hint,
        # Optional binding the template studio should preview with. Only needed
        # when a template's meaning depends on particular *values* (an event
        # vocabulary, say), which the studio's type-directed field search cannot
        # infer. Ignored at runtime — the LLM still chooses its own bindings.
        "preview_bindings": preview_bindings,
        # Optional explicit tool-name suffix. The generator otherwise derives the
        # name from keywords found in `description`, which makes the name a side
        # effect of prose: two templates that differ in what they mean but not in
        # their vocabulary collide, and a description that has to mention the
        # other variant ("prefer the baseline template when...") picks up that
        # variant's keyword. Set this where the name has to be stable and
        # meaningful; leave it empty to keep the derived name.
        "name_hint": name_hint,
    }
    return df


def _json_default(value):
    """Serialize the numpy scalars pandas hands back from ``to_dict``."""
    item = getattr(value, "item", None)
    if callable(item):
        return item()
    raise TypeError(f"not JSON serializable: {type(value).__name__}")


def get_total_key_count(nested_dict):
    if isinstance(nested_dict, dict):
        return sum(get_total_key_count(value) for value in nested_dict.values())
    elif isinstance(nested_dict, list):
        return sum(get_total_key_count(item) for item in nested_dict)
    else:
        return 1


def validate_specs(df, grammar_path, strict=False):
    """Validate every template's spec against the UDI grammar schema.

    Reports non-conforming templates. Non-fatal by default (some pre-existing
    line-item templates use encodings not covered by the checked-in schema);
    pass ``strict=True`` to fail hard once templates + schema are reconciled.
    """
    schema = json.loads(Path(grammar_path).read_text())
    failures = []
    for i, spec_str in enumerate(df["spec_template"]):
        try:
            jsonschema.validate(instance=json.loads(spec_str), schema=schema)
        except jsonschema.ValidationError as e:
            failures.append((i, df["chart_type"][i], list(df["tags"][i]), e.message))

    if failures:
        print(f"\n⚠ {len(failures)}/{len(df)} template(s) do not conform to the grammar:")
        for i, chart_type, tags, message in failures:
            print(f"  #{i} [{chart_type}] tags={tags}: {message.splitlines()[0][:140]}")
        if strict:
            raise SystemExit("Grammar validation failed (--strict).")
    else:
        print(f"\nAll {len(df)} templates conform to the grammar.")
    return failures


# Dash pattern for the reference-line annotation on the survival curves.
_SURVIVAL_DASH = [6, 4]

# Prose shared by the stratified survival templates. Kept as constants because
# these caveats must read identically across all four variants — a reader
# comparing two cards should see the same wording for the same limitation, and a
# fix to one should not leave three copies stale.
_SURVIVAL_TIME_VARYING = (
    "An event-level column has no single value per subject: a subject's recorded value can "
    "differ between the event that starts the clock and the event that stops it. "
)
#: The presence readings' counterpart to `_SURVIVAL_TIME_VARYING`: there is no
#: event-level column to disagree with itself, but there is still a question of
#: *when* the fact was established, and the answer is "at any point".
_SURVIVAL_PRESENCE_WINDOW = (
    "Presence is read over the subject's whole history, not as of the start event: a single "
    "record at any time puts the subject in the 'yes' group, and no record at any time puts "
    "it in the 'no' group. There is no partial membership and no missing value — every "
    "subject in the event log gets an answer. "
)
_SURVIVAL_CENSORING = (
    "The same censoring caveat as the unstratified survival curve applies, and it bites "
    "harder here: subjects with no end event hold their stratum's curve up, so comparing "
    "groups whose follow-up differs is misleading. This is not a Kaplan-Meier estimate "
    "and carries no significance test. Strata are also unequal in size, and a small one "
    "steps coarsely (n=4 moves in quarters), so a dramatic-looking curve may rest on a "
    "handful of subjects. "
)
_SURVIVAL_ANCHORING = (
    "Every curve starts at (0, 100%): subjects who never reach the end event sit at day 0 "
    "and contribute no drop, and where a group has none of those, its flat opening segment "
    "and the drop into its first event are drawn explicitly. The dashed rule carries the "
    "final value out to the right edge, where a label repeats it as a number — so a group "
    "with no end events at all gets neither, having no final value to report."
)


def _placeholder_base(placeholder: str) -> str:
    """``"<F4:n>"`` -> ``"<F4>"`` — drop the type suffix but keep the brackets.

    Getting this wrong is silent and destructive: a bare ``"<F4"`` leaves the
    placeholder unterminated, so it matches nothing, survives resolution and
    leaves the spec unparseable.
    """
    return re.sub(r":[^>]+>", ">", placeholder)


#: The subject-id placeholder. Named once because both the pipeline head (which
#: groups by it) and the tail (which orders by it to break rank ties) must use the
#: same binding.
_SUBJECT_KEY = "<F1:n>"


def _survival_event_fields(reading):
    """The event-log placeholders, which move under a join.

    A cross-table stratifier makes the event log the *first* side of a join, so its
    columns are addressed as `<E1.F1>` rather than `<F1>`. Everything else about the
    pipeline is identical, so the names are computed once here rather than branched
    on at every use.
    """
    if reading in _JOINED_READINGS:
        return {"subject": "<E1.F1:n>", "event_type": "<E1.F2:n>", "time": "<E1.F3:q>"}
    return {"subject": _SUBJECT_KEY, "event_type": "<F2:n>", "time": "<F3:q>"}


#: Readings that stratify by membership of another table rather than by a field.
_PRESENCE_READINGS = (
    StratumReading.PRESENCE,
    StratumReading.PRESENCE_2X2,
)

#: Readings whose event log is the first side of a join, so its columns are
#: addressed as `<E1.*>`.
_JOINED_READINGS = (StratumReading.RELATED,) + _PRESENCE_READINGS

#: Column the presence readings stratify by. Derived, so it is named rather than
#: bound: "is this subject in that table" is not a column anywhere.
_PRESENCE_STRATUM = "group"

#: Intermediate column holding the stratifier's value on the start event only.
#: Aggregated away by the rollup, so it never reaches the chart.
_BASELINE_STRATUM = "baseline stratum"


#: Non-null markers left behind by the presence joins. A count is used because it
#: survives a left join as null when there was no match, which is what makes
#: absence detectable; the value itself is never read.
_MARKER_2 = "in second table"
_MARKER_3 = "in third table"


def _presence_join(reading: StratumReading):
    """Left-join the event log to one or two membership markers.

    "Did this subject receive radiation" is not a column anywhere: it is
    membership of a table. An inner join cannot answer it — it drops exactly the
    subjects whose answer is "no" — so each side is reduced to one row per subject
    and LEFT joined, leaving a null marker for the absent.
    """
    chart = Chart().source("<E1>", "<E1.url>").source("<E2>", "<E2.url>")
    if reading is StratumReading.PRESENCE_2X2:
        chart = chart.source("<E3>", "<E3.url>")

    # One row per subject in the second table, so the join cannot multiply events.
    # The grouping is named only on the rollup — a `groupby`'s own `out` is a
    # no-op in the SQL compiler, which carries the grouping forward to whatever
    # the next rollup names as its input, so putting `in`/`out` on the rollup is
    # the one shape both executors read the same way.
    chart = (
        chart.groupby("<E2.F1:n>", in_name="<E2>")
        .rollup({_MARKER_2: Op.count()}, in_name="<E2>", out_name="<E2>__by_subject")
        .join(
            in_name=["<E1>", "<E2>__by_subject"],
            on=["<E1.F1>", "<E2.F1>"],
            kind="left",
            out_name="<E1>__p",
        )
    )
    if reading is StratumReading.PRESENCE_2X2:
        chart = (
            chart.groupby("<E3.F1:n>", in_name="<E3>")
            .rollup(
                {_MARKER_3: Op.count()},
                in_name="<E3>",
                out_name="<E3>__by_subject",
            )
            .join(
                in_name=["<E1>__p", "<E3>__by_subject"],
                on=["<E1.F1>", "<E3.F1>"],
                kind="left",
                out_name="<E1>__p",
            )
        )
    return chart


def _survival_subject_rows(
    stratum: str | None,
    reading: StratumReading | None,
    multi_value: bool,
):
    """Event log -> one row per cohort member, carrying `start day` / `end day`.

    This is where the three readings of a stratifier differ; everything after it
    is identical. Unstratified gives one row per subject. `AT_START` gives one row
    per subject plus the value on its start event. `EVER` gives one row per
    (subject, value) the subject was ever recorded under, each carrying the
    subject's whole span.

    The distinction matters because an event-level column is not a per-subject
    attribute. Grouping by `[subject, column]` makes each (subject, value) pair
    its own row, so a span computed inside that group covers only *those* events:
    a pair with a start and no end reads as censored, and a pair with an end and
    no start is dropped by the null filter below. A subject whose value changed
    between the two events is then counted as neither, which loses its death
    entirely — the symptom is every stratum sitting above the unstratified curve.
    """
    if reading is StratumReading.RELATED:
        # The event log and the table the stratifier lives in, joined on the
        # relationship the schema already declares. The join multiplies event rows
        # by the subject's related records, which is harmless here precisely
        # because everything downstream reduces by min/max over a (subject,
        # stratum) group — both idempotent under duplication. Any template that
        # *counted* rows after this join would be wrong.
        chart = (
            Chart()
            .source("<E1>", "<E1.url>")
            .source("<E2>", "<E2.url>")
            .join(
                in_name=["<E1>", "<E2>"],
                # Joined on the subject id each side names, not on a declared
                # relationship. The tables that carry a stratifier are usually
                # *siblings* of the event log — both hang off a patient table —
                # so there is no direct relationship to follow, but they do share
                # the subject identifier, which is the only key this needs.
                on=["<E1.F1>", "<E2.F1:n>"],
                out_name="<E1>__<E2>",
            )
        )
    elif reading in _PRESENCE_READINGS:
        chart = _presence_join(reading)
    else:
        chart = Chart().source("<E>", "<E.url>")

    # `EVER` and `RELATED` both read membership off every row they see, so a
    # delimited column has to be expanded before the per-subject rollup — on the
    # event rows for `EVER`, on the joined rows for `RELATED`, which is the same
    # point in the pipeline. Expanding after the rollup instead reads the list off
    # whichever single row the rollup kept, which is the baseline reading.
    #
    # For `RELATED` this stacks two multiplications: the join already fanned each
    # event out per related record, and this fans each of those out per listed
    # value. Still harmless, for the same reason the join is — everything
    # downstream reduces by min/max over a (subject, value) group, and both are
    # idempotent under duplication.
    if multi_value and reading in (StratumReading.EVER, StratumReading.RELATED):
        chart = chart.unnest(stratum, separator=";")

    fields = _survival_event_fields(reading)
    event_type, time_field = fields["event_type"], fields["time"]
    subject_key = fields["subject"]
    derives = {
        "start day": Expr.cond(
            Expr.binop("==", Expr.field(event_type), Expr.lit("<V1>")),
            Expr.field(_placeholder_base(time_field)),
            Expr.lit(None),
        ),
        "end day": Expr.cond(
            Expr.binop("==", Expr.field(_placeholder_base(event_type)), Expr.lit("<V2>")),
            Expr.field(_placeholder_base(time_field)),
            Expr.lit(None),
        ),
    }
    if reading is StratumReading.AT_START:
        # Null everywhere but the start event, so the rollup's `max` below has
        # exactly one candidate per subject. This is also the only place in this
        # branch that type-constrains the binding, hence the `:n` suffix.
        derives[_BASELINE_STRATUM] = Expr.cond(
            Expr.binop("==", Expr.field(_placeholder_base(event_type)), Expr.lit("<V1>")),
            Expr.field(stratum),
            Expr.lit(None),
        )
    if reading in _PRESENCE_READINGS:
        # Turn "the marker survived the left join" into a readable label. Named
        # after the tables rather than yes/no, so a legend reads "Radiation" /
        # "No Radiation" instead of requiring the reader to remember which is
        # which. `<E2>` resolves to the table name, so this stays generic.
        present_2 = Expr.not_null(_MARKER_2)
        if reading is StratumReading.PRESENCE:
            derives[_PRESENCE_STRATUM] = Expr.cond(
                present_2, Expr.lit("<E2>"), Expr.lit("No <E2>")
            )
        else:
            # The 2x2: one label per cell, so the four groups are self-describing
            # and a reader never has to decode a pair of flags.
            present_3 = Expr.not_null(_MARKER_3)
            derives[_PRESENCE_STRATUM] = Expr.cond(
                present_2,
                Expr.cond(
                    present_3,
                    Expr.lit("<E2> + <E3>"),
                    Expr.lit("<E2> only"),
                ),
                Expr.cond(
                    present_3,
                    Expr.lit("<E3> only"),
                    Expr.lit("Neither"),
                ),
            )

    chart = chart.filter(Expr.not_null(time_field)).derive(derives)

    if reading in _PRESENCE_READINGS:
        # Presence is a per-subject fact, so this partitions: one row per subject
        # carrying its group, exactly like the baseline reading.
        return (
            chart.groupby(subject_key)
            .rollup(
                {
                    "start day": Op.min("start day"),
                    "end day": Op.max("end day"),
                    _PRESENCE_STRATUM: Op.max(_PRESENCE_STRATUM),
                }
            )
            .filter(Expr.not_null("start day"))
        )

    if reading is StratumReading.AT_START:
        chart = chart.groupby(subject_key).rollup(
            {
                "start day": Op.min("start day"),
                "end day": Op.max("end day"),
                # Named after the stratifier itself, so every downstream
                # reference — the colour mappings, the label, the heading, the
                # stratum groupby — needs no change. `max` over a nominal column
                # returns the string and skips nulls, identically in both the
                # Arquero and SQL executors; it sees one non-null value per
                # subject unless a subject has two start events carrying
                # different values, in which case it takes the later by codepoint
                # order.
                _placeholder_base(stratum): Op.max(_BASELINE_STRATUM),
            }
        )
        # The cohort is everyone with a start event, counted BEFORE anyone is
        # dropped for lacking an end event — that is what makes the curve level
        # off at the observed survival fraction instead of falling to zero.
        chart = chart.filter(Expr.not_null("start day"))
        # A subject with no value on its start event cannot be placed in any
        # group and leaves the cohort here, which is why these group sizes can
        # add to less than the unstratified curve's.
        chart = chart.filter(Expr.not_null(_placeholder_base(stratum)))
        if multi_value:
            # After the rollup, deliberately. The row being expanded is already
            # one-per-subject and nothing has been counted yet, so this
            # multiplies nothing; expanding first would instead read the
            # stratifier off every event, which is the other reading.
            chart = chart.unnest(_placeholder_base(stratum), separator=";")
        return chart

    if reading in (StratumReading.EVER, StratumReading.RELATED):
        chart = chart.groupby(subject_key)
        # Broadcast the subject's whole span onto each of its event rows, so
        # every group the subject joins inherits the same timeline.
        chart = chart.derive(
            {
                "subject start": Expr.agg("min", "start day"),
                "subject end": Expr.agg("max", "end day"),
            }
        )
        # A null is not a value anyone "ever recorded", so it must not become a
        # group of its own. This has to sit *after* the broadcast above and before
        # the grouping below: filtering earlier would take the subject's start
        # event with it whenever that event carried no value, silently dropping
        # the subject from every group instead of just this one.
        chart = chart.filter(Expr.not_null(stratum))
        chart = chart.groupby([_placeholder_base(subject_key), stratum])
        # min/max over columns already constant within the group: the rollup
        # needs an aggregate, not a reduction.
        chart = chart.rollup(
            {"start day": Op.min("subject start"), "end day": Op.max("subject end")}
        )
        return chart.filter(Expr.not_null("start day"))

    # One row per subject. min/max ignore the nulls the conditionals leave behind.
    chart = chart.groupby(subject_key).rollup(
        {"start day": Op.min("start day"), "end day": Op.max("end day")}
    )
    return chart.filter(Expr.not_null("start day"))


def _survival_chart(
    stratum: str | None = None,
    *,
    reading: StratumReading | None = None,
    multi_value: bool = False,
):
    """Build the shared survival pipeline.

    Survival time is not a column in an event log — it is the gap between two
    events for the same subject — so the whole pipeline exists to reconstruct it
    before anything can be plotted. Shared by the survival templates so they
    cannot drift apart.

    `stratum` is the placeholder to split by (None for a single curve). A
    stratified curve must say how it reads that stratifier (`reading`), because an
    event-level column has no single value per subject — see
    `_survival_subject_rows`. `multi_value` expands a delimited stratifier, and
    *where* it expands depends on the reading.
    """
    if reading in _PRESENCE_READINGS:
        # The stratifier is not a field the caller can name — it is membership of
        # a table, derived in the pipeline — so this fills it in rather than
        # asking for it.
        assert stratum is None, "a presence reading derives its own stratum column"
        assert not multi_value, "presence is boolean; there is nothing to expand"
        stratum = _PRESENCE_STRATUM
    elif stratum is None:
        assert reading is None and not multi_value, "reading/multi_value need a stratum"
    else:
        assert reading is not None, (
            "a stratified curve must state how it reads the stratifier; "
            "the two readings give different numbers"
        )

    chart = _survival_subject_rows(stratum, reading, multi_value)

    # Subjects with no end event sit at day 0 and contribute no drop. That is
    # what puts the curve's first point at (0, 100%) — the grammar cannot
    # synthesize a leading row, but these subjects legitimately belong there.
    # Row-wise, so this runs before any stratum grouping.
    chart = chart.derive(
        {
            "died": Expr.cond(
                Expr.binop("!=", Expr.field("end day"), Expr.lit(None)),
                Expr.lit(1),
                Expr.lit(0),
            ),
            "survival days": Expr.cond(
                Expr.binop("!=", Expr.field("end day"), Expr.lit(None)),
                Expr.binop("-", Expr.field("end day"), Expr.field("start day")),
                Expr.lit(0),
            ),
        }
    )
    chart = chart.filter(Expr.binop(">=", Expr.field("survival days"), Expr.lit(0)))

    # Plot years, not days. An event log records a day offset, but a survival curve
    # is read in years — "median survival 1.5 years", not "548 days" — and a day
    # axis on a multi-year cohort labels every 200th day, which no reader converts
    # in their head. Derived rather than relabelled so the tooltip, the axis and the
    # end-of-curve label all agree, and so both executors compute it the same way.
    # 365.25 rather than 365: over a 7-year cohort the leap days are a whole week.
    chart = chart.derive(
        {
            "survival years": Expr.binop(
                "/", Expr.field("survival days"), Expr.lit(365.25)
            )
        }
    )

    # Where the x axis ends, measured across the whole cohort rather than within
    # one stratum: every curve's dashed lead-out has to reach the same edge, not
    # just a little past its own last event. Taken here because a rollup leaves
    # the table ungrouped, so this aggregate is global; once the stratum grouping
    # below is applied, the same expression would give a per-curve maximum.
    chart = chart.derive({"cohort end": Expr.agg("max", "survival years")})

    if stratum:
        # Re-group so each curve is a fraction of its own cohort.
        chart = chart.groupby(_placeholder_base(stratum))
    chart = chart.derive(
        {"subjects": Expr.agg("count"), "deaths": Expr.agg("sum", "died")}
    )
    # Ordered by time, then by subject to break ties. The tiebreak is what makes
    # `rank()` a row number: a rank is shared by tied rows, and with dozens of
    # subjects sitting at year 0 a bare `orderby("survival years")` gives them all
    # rank 1 — so "the rank() == 1 row", which the annotations below borrow, would
    # be dozens of rows and rank 2 would not exist at all.
    chart = chart.orderby(
        ["survival years", _placeholder_base(_survival_event_fields(reading)["subject"])]
    )

    # Cumulative deaths over the ordered rows, as a percentage still surviving.
    # A rolling *sum of the death indicator* rather than a row count, because the
    # day-0 rows are subjects who have not died and must not count as events.
    chart = chart.derive(
        {
            "survival percentage": rolling(
                Expr.binop(
                    "*",
                    Expr.binop(
                        "-",
                        Expr.lit(1),
                        Expr.binop("/", Expr.agg("sum", "died"), Expr.field("subjects")),
                    ),
                    Expr.lit(100),
                )
            )
        }
    )

    # The curve only descends, so its minimum is its final value. `agg` respects
    # the current grouping, giving a per-stratum final when stratified.
    chart = chart.derive({"final percentage": Expr.agg("min", "survival percentage")})
    # Anchor for the end-of-line label, and the far end of the dashed lead-out.
    # It sits at the cohort-wide right edge — the same x for every curve — plus a
    # margin, so that even the longest curve (whose own last event *is* the
    # cohort end) gets a visible run of dashes. Being the largest x in the data,
    # it also sets where the axis stops.
    #
    # Null for a stratum in which nobody reached the end event: its "final" value
    # is just the 100% it started at, and a label saying so, stacked against the
    # axis at day 0, is noise.
    #
    # Held on one row per group — the same `rank() == 1` row the rule borrows. A
    # text mark draws once per row it receives, so leaving this on every row would
    # stack dozens of copies of the label on the same point: opaque, heavier than
    # the font it declares, and no way to see anything behind it.
    chart = chart.derive(
        {
            "label year": Expr.cond(
                Expr.binop("==", Expr.rank(), Expr.lit(1)),
                Expr.cond(
                    Expr.binop(">", Expr.field("deaths"), Expr.lit(0)),
                    Expr.binop("*", Expr.field("cohort end"), Expr.lit(1.05)),
                    Expr.lit(None),
                ),
                Expr.lit(None),
            )
        }
    )
    # The rule is a short dashed lead-out from the end of the curve to its label,
    # rather than a full-width line cutting back across the descending curve.
    #
    # Only one row ever holds the final value (the last event), and a line mark
    # needs two points — so the second endpoint is borrowed from an arbitrary
    # other row. That is sound because this layer maps y to `final percentage`,
    # which is constant across the group: any two rows give the same horizontal
    # line, and only their x matters. Every other row is nulled out and dropped
    # by vega-lite.
    # A group in which every subject reached the end event has nobody at day 0, so
    # its curve would begin at its first event partway across the chart. Draw the
    # missing flat segment at 100% explicitly: two borrowed rows again, using a
    # constant column for y so it lands in data units rather than pixels.
    chart = chart.derive({"full survival": Expr.lit(100)})
    chart = chart.derive({"first year": Expr.agg("min", "survival years")})
    # The curve only descends, so the group's *highest* survival percentage is
    # its value at that first day — where the flat 100% lead-in has to drop to,
    # or the two would be left joined by a vertical gap.
    chart = chart.derive({"first percentage": Expr.agg("max", "survival percentage")})
    chart = chart.derive(
        {
            "lead year": Expr.cond(
                Expr.binop("==", Expr.rank(), Expr.lit(1)),
                Expr.lit(0),
                Expr.cond(
                    Expr.binop("==", Expr.rank(), Expr.lit(2)),
                    Expr.field("first year"),
                    Expr.lit(None),
                ),
            ),
            # The drop itself: both points at the first event day, one at 100%
            # and one at the curve's opening value. Where the group already has
            # day-0 subjects the two collapse onto each other and nothing is
            # drawn, which is correct — there is no drop to bridge.
            "drop year": Expr.cond(
                Expr.binop("<=", Expr.rank(), Expr.lit(2)),
                Expr.field("first year"),
                Expr.lit(None),
            ),
            "drop percentage": Expr.cond(
                Expr.binop("==", Expr.rank(), Expr.lit(1)),
                Expr.field("full survival"),
                Expr.cond(
                    Expr.binop("==", Expr.rank(), Expr.lit(2)),
                    Expr.field("first percentage"),
                    Expr.lit(None),
                ),
            ),
        }
    )
    chart = chart.derive(
        {
            "rule year": Expr.cond(
                # No events, no final value to mark — see `label day`.
                Expr.binop("==", Expr.field("deaths"), Expr.lit(0)),
                Expr.lit(None),
                Expr.cond(
                    Expr.binop("==", Expr.rank(), Expr.lit(1)),
                    Expr.field("label year"),
                    Expr.cond(
                        Expr.binop(
                            "==",
                            Expr.field("survival percentage"),
                            Expr.field("final percentage"),
                        ),
                        Expr.field("survival years"),
                        Expr.lit(None),
                    ),
                ),
            )
        }
    )
    # No round() in the grammar: floor(x + 0.5) using the modulo operator, so the
    # label reads "48" rather than "47.692307692307686".
    chart = chart.derive(
        {"_label_offset": Expr.binop("+", Expr.field("final percentage"), Expr.lit(0.5))}
    )
    chart = chart.derive(
        {
            "final survival": Expr.binop(
                "-",
                Expr.field("_label_offset"),
                Expr.binop("%", Expr.field("_label_offset"), Expr.lit(1)),
            )
        }
    )
    # One text mark can only draw one field, so the label is assembled here. When
    # stratified it carries the category name too: the colour legend alone makes a
    # reader trace a hue back to a key, and these curves converge at the right
    # edge where that is hardest.
    # Survivors over cohort size — the numerator and denominator of the percentage
    # beside it, so a reader can see what the number is a fraction *of*. That is
    # what separates "36%" resting on 22 subjects from the same figure resting on
    # 400, and these strata differ by an order of magnitude in size.
    chart = chart.derive(
        {"survivors": Expr.binop("-", Expr.field("subjects"), Expr.field("deaths"))}
    )
    chart = chart.derive(
        {
            "final label": Expr.concat(
                ([Expr.field(_placeholder_base(stratum))] if stratum else [])
                + ([Expr.lit(" ")] if stratum else [])
                + [
                    Expr.lit("("),
                    Expr.field("survivors"),
                    Expr.lit("/"),
                    Expr.field("subjects"),
                    Expr.lit(") "),
                    Expr.field("final survival"),
                    Expr.lit("%"),
                ]
            )
        }
    )

    # --- layers: the curve, a dashed reference line at the final value, and its
    # numeric label just right of where the line ends.
    # Flat 100% lead-in, before the curve so the curve draws over it.
    chart = (
        chart.mark("line")
        .x(field="lead year", type="quantitative", title="survival years", domain={"min": 0})
        .y(field="full survival", type="quantitative", domain={"min": 0, "max": 100})
    )
    if stratum:
        chart = chart.color(
            field=_placeholder_base(stratum), type="nominal", omitLegend=True
        )

    # The vertical drop from that lead-in into the curve's first point.
    chart = (
        chart.mark("line")
        .x(field="drop year", type="quantitative", title="survival years", domain={"min": 0})
        .y(field="drop percentage", type="quantitative", domain={"min": 0, "max": 100})
    )
    if stratum:
        chart = chart.color(
            field=_placeholder_base(stratum), type="nominal", omitLegend=True
        )

    chart = (
        chart.mark("line")
        # A survival curve is a step function: the fraction alive holds constant
        # between deaths and drops at each one. A sloped segment would draw a
        # gradual decline nobody observed — and, read left to right, invites the
        # eye to interpolate a survival value at times where none was measured.
        # Steps also make the curve unambiguously non-increasing by construction.
        .interpolate("step-after")
        .x(field="survival years", type="quantitative", title="survival years", domain={"min": 0})
        .y(
            field="survival percentage",
            type="quantitative",
            domain={"min": 0, "max": 100},
            title="survival (%)",
        )
    )
    if stratum:
        chart = chart.color(field=_placeholder_base(stratum), type="nominal", omitLegend=True)

    chart = (
        chart.mark("line")
        .stroke_dash(_SURVIVAL_DASH)
        .x(field="rule year", type="quantitative", title="survival years", domain={"min": 0})
        .y(field="final percentage", type="quantitative", domain={"min": 0, "max": 100})
    )
    if stratum:
        chart = chart.color(field=_placeholder_base(stratum), type="nominal", omitLegend=True)

    chart = (
        chart.mark("text")
        # Right-aligned and lifted clear of the rule: a centred label would sit
        # across the dashes and read as a strikethrough, and a left-aligned one
        # would run off the plot. A white halo keeps it readable where it crosses
        # another stratum's curve.
        .place(align="right", dy=-9)
        .outline(color="white", width=3, opacity=0.7)
        # Two strata can end at the same percentage, which would stack their
        # labels on one another. 8 of the axis's 100 keeps them clearly apart at
        # the sizes these are drawn at, including in a small review card.
        .avoid_overlap(8)
        .x(field="label year", type="quantitative", title="survival years", domain={"min": 0})
        .y(field="final percentage", type="quantitative", domain={"min": 0, "max": 100})
        .text(field="final label", type="nominal")
    )
    if stratum:
        chart = chart.color(field=_placeholder_base(stratum), type="nominal", omitLegend=True)

    if stratum:
        # Right-aligned to sit over the series labels it names. The presence
        # readings name the tables instead of the derived column, since "group"
        # tells a reader nothing about what separates the curves.
        if reading is StratumReading.PRESENCE:
            heading = "<E2>"
        elif reading is StratumReading.PRESENCE_2X2:
            heading = "<E2> / <E3>"
        else:
            heading = _placeholder_base(stratum)
        chart = chart.title(heading, align="right")

    return chart


def generate():
    df = pd.DataFrame(
        columns=[
            "query_templates",
            "spec_template",
            "creation_method",
            "chart_type",
            "chart_complexity",
            "spec_key_count",
            "task_types",
            "tags",
            "description",
            "design_considerations",
            "tasks",
            "review_hint",
            "preview_bindings",
            "name_hint",
        ]
    )

    # ---------------------------------------------------------------
    # Bar charts — count by nominal field
    # ---------------------------------------------------------------

    # MERGED: vertical bar, <=4 categories (question + utterance)
    df = add_row(
        df,
        query_templates=[
            "How many <E> are there, grouped by <F:n>?",
            "Make a bar chart of <E> <F:n>.",
        ],
        spec=(
            Chart()
            .source("<E>", "<E.url>")
            .groupby("<F>")
            .rollup({"<E> count": Op.count()})
            .mark("bar")
            .x(field="<F>", type="nominal")
            .y(field="<E> count", type="quantitative")
        ),
        chart_type=ChartType.BARCHART,
        task_types=[
            TaskType.COMPUTE_DERIVED_VALUE,
            TaskType.DETERMINE_RANGE,
        ],
        description="Counts entities grouped by a nominal field, displayed as a vertical bar chart.",
        design_considerations="Vertical orientation chosen because category count is small (<=4), keeping x-axis labels readable.",
        tasks="Compare counts across categories; identify the most or least common category; assess the range of counts.",
    )

    # MERGED: horizontal bar, >4 categories (question + utterance)
    df = add_row(
        df,
        query_templates=[
            "How many <E> are there, grouped by <F:n>?",
            "Make a bar chart of <E> <F:n>.",
        ],
        spec=(
            Chart()
            .source("<E>", "<E.url>")
            .groupby("<F>")
            .rollup({"<E> count": Op.count()})
            .mark("bar")
            .x(field="<E> count", type="quantitative")
            .y(field="<F>", type="nominal")
        ),
        chart_type=ChartType.BARCHART,
        task_types=[
            TaskType.COMPUTE_DERIVED_VALUE,
            TaskType.DETERMINE_RANGE,
        ],
        description="Counts entities grouped by a nominal field, displayed as a horizontal bar chart.",
        design_considerations="Horizontal orientation chosen because category count is high (>4), allowing longer labels on the y-axis.",
        tasks="Compare counts across categories; identify the most or least common category; assess the range of counts.",
    )

    # Cross-entity bar, vertical, <=4 categories
    df = add_row(
        df,
        query_templates=[
            "How many <E1> are there, grouped by <E2.F:n>?",
        ],
        spec=(
            Chart()
            .source("<E1>", "<E1.url>")
            .source("<E2>", "<E2.url>")
            .join(
                in_name=["<E1>", "<E2>"],
                on=["<E1.r.E2.id.from>", "<E1.r.E2.id.to>"],
                out_name="<E1>__<E2>",
            )
            .groupby("<E2.F>")
            .rollup({"<E1> count": Op.count()})
            .mark("bar")
            .x(field="<E2.F>", type="nominal")
            .y(field="<E1> count", type="quantitative")
        ),
        chart_type=ChartType.BARCHART,
        task_types=[
            TaskType.COMPUTE_DERIVED_VALUE,
        ],
        description="Joins two entities and counts records grouped by a field from the related entity, displayed as a vertical bar chart.",
        design_considerations="Cross-entity join groups by a field not native to the counted entity. Vertical orientation for small category counts (<=4).",
        tasks="Compare counts across categories from a related entity; discover cross-entity frequency patterns.",
    )

    # Cross-entity bar, horizontal, >4 categories
    df = add_row(
        df,
        query_templates=[
            "How many <E1> are there, grouped by <E2.F:n>?",
        ],
        spec=(
            Chart()
            .source("<E1>", "<E1.url>")
            .source("<E2>", "<E2.url>")
            .join(
                in_name=["<E1>", "<E2>"],
                on=["<E1.r.E2.id.from>", "<E1.r.E2.id.to>"],
                out_name="<E1>__<E2>",
            )
            .groupby("<E2.F>")
            .rollup({"<E1> count": Op.count()})
            .mark("bar")
            .x(field="<E1> count", type="quantitative")
            .y(field="<E2.F>", type="nominal")
        ),
        chart_type=ChartType.BARCHART,
        task_types=[
            TaskType.COMPUTE_DERIVED_VALUE,
        ],
        description="Joins two entities and counts records grouped by a field from the related entity, displayed as a horizontal bar chart.",
        design_considerations="Cross-entity join with horizontal orientation for higher category counts (>4).",
        tasks="Compare counts across categories from a related entity; discover cross-entity frequency patterns.",
    )

    # DATA CUBE: bar of the measure by a single nominal dimension (its marginal)
    df = add_row(
        df,
        query_templates=[
            "How many are there by <dimension>?",
            "Make a bar chart of the measure by a categorical dimension.",
        ],
        spec=(
            Chart()
            .source("<E>", "<E.url>")
            .filter("<MARGINAL:D>")
            .mark("bar")
            .x(field="<D:n>", type="nominal")
            .y(field="<M>", type="quantitative")
        ),
        chart_type=ChartType.BARCHART,
        task_types=[TaskType.COMPUTE_DERIVED_VALUE, TaskType.DETERMINE_RANGE],
        description="Shows the pre-aggregated cube measure for each category of a nominal dimension as a bar chart.",
        design_considerations=_CUBE_MARGINAL_NOTE,
        tasks="Compare the measure across categories; identify the most or least common category.",
        shape="data_cube",
    )

    # DATA CUBE: bar of the measure across a quantitative dimension (its marginal)
    df = add_row(
        df,
        query_templates=["Make a bar chart of the measure across a quantitative dimension."],
        spec=(
            Chart()
            .source("<E>", "<E.url>")
            .filter("<MARGINAL:D>")
            .mark("bar")
            .x(field="<D:q>", type="quantitative")
            .y(field="<M>", type="quantitative")
        ),
        chart_type=ChartType.BARCHART,
        task_types=[TaskType.CHARACTERIZE_DISTRIBUTION, TaskType.DETERMINE_RANGE],
        description="Shows the pre-aggregated cube measure across the values of a quantitative dimension as a bar chart.",
        design_considerations=_CUBE_MARGINAL_NOTE,
        tasks="Assess how the measure is distributed across a numeric dimension.",
        shape="data_cube",
    )

    # ---------------------------------------------------------------
    # Stacked bar charts — two-field grouping
    # ---------------------------------------------------------------

    # Stacked vertical, cross-entity, <=4 categories
    df = add_row(
        df,
        query_templates=[
            "How many <E1> are there, grouped by <E1.F1:n> and <E2.F2:n>?",
        ],
        spec=(
            Chart()
            .source("<E1>", "<E1.url>")
            .source("<E2>", "<E2.url>")
            .join(
                in_name=["<E1>", "<E2>"],
                on=["<E1.r.E2.id.from>", "<E1.r.E2.id.to>"],
                out_name="<E1>__<E2>",
            )
            .groupby(["<E2.F2>", "<E1.F1>"])
            .rollup({"count <E1>": Op.count()})
            .mark("bar")
            .y(field="count <E1>", type="quantitative")
            .color(field="<E2.F2>", type="nominal")
            .x(field="<E1.F1>", type="nominal")
        ),
        chart_type=ChartType.STACKED_BAR,
        task_types=[
            TaskType.COMPUTE_DERIVED_VALUE,
        ],
        description="Joins two entities and produces a vertical stacked bar chart of counts grouped by two nominal fields.",
        design_considerations="Stacked bars show part-to-whole composition within each category. Vertical layout for small category counts (<=4). Color encodes the secondary grouping field from the related entity. Color is preferably mapped to the variable with fewer unique values for better discriminability.",
        tasks="Compare group compositions across categories; identify dominant sub-groups within each bar.",
    )

    # Stacked horizontal, cross-entity, >4 categories
    df = add_row(
        df,
        query_templates=[
            "How many <E1> are there, grouped by <E1.F1:n> and <E2.F2:n>?",
        ],
        spec=(
            Chart()
            .source("<E1>", "<E1.url>")
            .source("<E2>", "<E2.url>")
            .join(
                in_name=["<E1>", "<E2>"],
                on=["<E1.r.E2.id.from>", "<E1.r.E2.id.to>"],
                out_name="<E1>__<E2>",
            )
            .groupby(["<E2.F2>", "<E1.F1>"])
            .rollup({"count <E1>": Op.count()})
            .mark("bar")
            .x(field="count <E1>", type="quantitative")
            .color(field="<E1.F1>", type="nominal")
            .y(field="<E2.F2>", type="nominal")
        ),
        chart_type=ChartType.STACKED_BAR,
        task_types=[
            TaskType.COMPUTE_DERIVED_VALUE,
        ],
        description="Joins two entities and produces a horizontal stacked bar chart of counts grouped by two nominal fields.",
        design_considerations="Horizontal orientation for higher category counts (>4). Color encodes the primary grouping field. Cross-entity join required. Color is preferably mapped to the variable with fewer unique values for better discriminability.",
        tasks="Compare group compositions across categories; identify dominant sub-groups within each bar.",
    )

    # Stacked vertical, same entity, <=4 categories
    df = add_row(
        df,
        query_templates=[
            "How many <E> are there, grouped by <F1:n> and <F2:n>?",
        ],
        spec=(
            Chart()
            .source("<E>", "<E.url>")
            .groupby(["<F2>", "<F1>"])
            .rollup({"count <E>": Op.count()})
            .mark("bar")
            .y(field="count <E>", type="quantitative")
            .color(field="<F1>", type="nominal")
            .x(field="<F2>", type="nominal")
        ),
        chart_type=ChartType.STACKED_BAR,
        task_types=[
            TaskType.COMPUTE_DERIVED_VALUE,
        ],
        description="Counts entities grouped by two nominal fields, displayed as a vertical stacked bar chart.",
        design_considerations="Vertical stacked layout for small category counts (<=4). Color encodes the sub-group field; x-axis shows the primary grouping. Color is preferably mapped to the variable with fewer unique values for better discriminability.",
        tasks="Compare group compositions across categories; identify dominant sub-groups within each bar.",
    )

    # MERGED: Stacked horizontal, same entity, >4 categories (two question variants)
    df = add_row(
        df,
        query_templates=[
            "How many <E> are there, grouped by <F1:n> and <F2:n>?",
            "What is the count of <F1:n> for each <F2:n>?",
        ],
        spec=(
            Chart()
            .source("<E>", "<E.url>")
            .groupby(["<F1>", "<F2>"])
            .rollup({"count <E>": Op.count()})
            .mark("bar")
            .x(field="count <E>", type="quantitative")
            .color(field="<F1>", type="nominal")
            .y(field="<F2>", type="nominal")
        ),
        chart_type=ChartType.STACKED_BAR,
        task_types=[
            TaskType.COMPUTE_DERIVED_VALUE,
        ],
        description="Counts entities grouped by two nominal fields, displayed as a horizontal stacked bar chart.",
        design_considerations="Horizontal stacked layout for higher category counts (>4). Color encodes the sub-group; stacking shows part-to-whole within each bar. Color is preferably mapped to the variable with fewer unique values for better discriminability.",
        tasks="Compare group compositions across categories; identify dominant sub-groups within each bar.",
    )

    # DATA CUBE: vertical stacked bar of the measure by two nominal dimensions
    df = add_row(
        df,
        query_templates=[
            "How many are there by <dimension1> and <dimension2>?",
            "Make a stacked bar chart across two categorical dimensions.",
        ],
        spec=(
            Chart()
            .source("<E>", "<E.url>")
            .filter("<MARGINAL:D1,D2>")
            .mark("bar")
            .x(field="<D1:n>", type="nominal")
            .y(field="<M>", type="quantitative")
            .color(field="<D2:n>", type="nominal")
        ),
        chart_type=ChartType.STACKED_BAR,
        task_types=[TaskType.COMPUTE_DERIVED_VALUE],
        description="Shows the pre-aggregated cube measure by two nominal dimensions as a vertical stacked bar chart.",
        design_considerations=(
            _CUBE_MARGINAL_NOTE + " Color encodes the sub-group; prefer the dimension with "
            "fewer categories for color."
        ),
        tasks="Compare group compositions across categories; identify dominant sub-groups.",
        shape="data_cube",
    )

    # ---------------------------------------------------------------
    # Grouped bar charts — side-by-side comparison
    # ---------------------------------------------------------------

    # Grouped bar vertical, <=4 categories
    df = add_row(
        df,
        query_templates=[
            "What is the count of <F1:n> for each <F2:n>?",
        ],
        spec=(
            Chart()
            .source("<E>", "<E.url>")
            .groupby(["<F1>", "<F2>"])
            .rollup({"count <E>": Op.count()})
            .mark("bar")
            .y(field="count <E>", type="quantitative")
            .xOffset(field="<F1>", type="nominal")
            .color(field="<F1>", type="nominal")
            .x(field="<F2>", type="nominal")
        ),
        chart_type=ChartType.GROUPED_BAR,
        task_types=[
            TaskType.COMPUTE_DERIVED_VALUE,
        ],
        description="Counts entities grouped by two nominal fields, displayed as a grouped (side-by-side) vertical bar chart.",
        design_considerations="Uses xOffset for side-by-side grouping, allowing direct comparison between sub-groups. Suitable for small category counts (<=4).",
        tasks="Directly compare sub-group counts within and across categories.",
    )

    # Grouped bar horizontal, >4 categories
    df = add_row(
        df,
        query_templates=[
            "What is the count of <F1:n> for each <F2:n>?",
        ],
        spec=(
            Chart()
            .source("<E>", "<E.url>")
            .groupby(["<F1>", "<F2>"])
            .rollup({"count <E>": Op.count()})
            .mark("bar")
            .x(field="count <E>", type="quantitative")
            .yOffset(field="<F1>", type="nominal")
            .color(field="<F1>", type="nominal")
            .y(field="<F2>", type="nominal")
        ),
        chart_type=ChartType.GROUPED_BAR,
        task_types=[
            TaskType.COMPUTE_DERIVED_VALUE,
        ],
        description="Counts entities grouped by two nominal fields, displayed as a grouped (side-by-side) horizontal bar chart.",
        design_considerations="Uses yOffset for side-by-side grouping in horizontal orientation. Chosen when at least one field has more than 4 categories.",
        tasks="Directly compare sub-group counts within and across categories.",
    )

    # DATA CUBE: grouped (side-by-side) bar of the measure by two nominal dims
    df = add_row(
        df,
        query_templates=["Make a grouped (side-by-side) bar chart across two categorical dimensions."],
        spec=(
            Chart()
            .source("<E>", "<E.url>")
            .filter("<MARGINAL:D1,D2>")
            .mark("bar")
            .x(field="<D1:n>", type="nominal")
            .y(field="<M>", type="quantitative")
            .xOffset(field="<D2:n>", type="nominal")
            .color(field="<D2:n>", type="nominal")
        ),
        chart_type=ChartType.GROUPED_BAR,
        task_types=[TaskType.COMPUTE_DERIVED_VALUE],
        description="Shows the pre-aggregated cube measure by two nominal dimensions as a grouped (side-by-side) bar chart.",
        design_considerations=(
            _CUBE_MARGINAL_NOTE + " xOffset gives side-by-side grouping for direct comparison "
            "of the sub-group within each category."
        ),
        tasks="Directly compare sub-group values within and across categories.",
        shape="data_cube",
    )

    # ---------------------------------------------------------------
    # Normalized bar charts — proportions
    # ---------------------------------------------------------------

    # Normalized vertical, <=4 categories
    df = add_row(
        df,
        query_templates=[
            "What is the proportion of <F1:n> for each <F2:n>?",
        ],
        spec=(
            Chart()
            .source("<E>", "<E.url>")
            .groupby("<F2>", out_name="groupCounts")
            .rollup({"<F2>_count": Op.count()})
            .groupby(["<F1>", "<F2>"], in_name="<E>")
            .rollup({"<F1>_and_<F2>_count": Op.count()})
            .join(
                in_name=["<E>", "groupCounts"],
                on="<F2>",
                out_name="datasets",
            )
            .derive(
                {
                    "proportion": Expr.binop(
                        "/",
                        Expr.field("<F1>_and_<F2>_count"),
                        Expr.field("<F2>_count"),
                    )
                }
            )
            .mark("bar")
            .y(field="proportion", type="quantitative")
            .color(field="<F1>", type="nominal")
            .x(field="<F2>", type="nominal")
        ),
        chart_type=ChartType.NORMALIZED_BAR,
        task_types=[
            TaskType.COMPUTE_DERIVED_VALUE,
        ],
        description="Shows the relative frequency (proportion) of one nominal field within each category of another, as a vertical normalized bar chart.",
        design_considerations="Normalization computes proportions per group, enabling fair comparison across groups of different sizes. Vertical layout for small category counts (<=4). Color is preferably mapped to the variable with fewer unique values for better discriminability.",
        tasks="Compare relative proportions across categories; identify which sub-groups dominate in each group.",
    )

    # Normalized horizontal, >4 categories
    df = add_row(
        df,
        query_templates=[
            "What is the proportion of <F1:n> for each <F2:n>?",
        ],
        spec=(
            Chart()
            .source("<E>", "<E.url>")
            .groupby("<F2>", out_name="groupCounts")
            .rollup({"<F2>_count": Op.count()})
            .groupby(["<F1>", "<F2>"], in_name="<E>")
            .rollup({"<F1>_and_<F2>_count": Op.count()})
            .join(
                in_name=["<E>", "groupCounts"],
                on="<F2>",
                out_name="datasets",
            )
            .derive(
                {
                    "proportion": Expr.binop(
                        "/",
                        Expr.field("<F1>_and_<F2>_count"),
                        Expr.field("<F2>_count"),
                    )
                }
            )
            .mark("bar")
            .x(field="proportion", type="quantitative")
            .color(field="<F1>", type="nominal")
            .y(field="<F2>", type="nominal")
        ),
        chart_type=ChartType.NORMALIZED_BAR,
        task_types=[
            TaskType.COMPUTE_DERIVED_VALUE,
        ],
        description="Shows the relative frequency (proportion) of one nominal field within each category of another, as a horizontal normalized bar chart.",
        design_considerations="Normalization for proportional comparison. Horizontal layout for higher category counts (>4). Color is preferably mapped to the variable with fewer unique values for better discriminability.",
        tasks="Compare relative proportions across categories; identify which sub-groups dominate in each group.",
    )

    # DATA CUBE: normalized (proportional) stacked bar of two nominal dimensions
    df = add_row(
        df,
        query_templates=["What is the proportion of <dimension2> for each <dimension1>?"],
        spec=(
            Chart()
            .source("<E>", "<E.url>")
            .filter("<MARGINAL:D1,D2>")
            .groupby("<D1>", out_name="groupTotals")
            .rollup({"axis_total": Op.sum("<M>")})
            .groupby(["<D2>", "<D1>"], in_name="<E>")
            .rollup({"cell_total": Op.sum("<M>")})
            .join("<D1>", in_name=["<E>", "groupTotals"], out_name="datasets")
            .derive(
                {
                    "proportion": Expr.binop(
                        "/", Expr.field("cell_total"), Expr.field("axis_total")
                    )
                }
            )
            .mark("bar")
            .x(field="<D1:n>", type="nominal")
            .y(field="proportion", type="quantitative")
            .color(field="<D2:n>", type="nominal")
        ),
        chart_type=ChartType.NORMALIZED_BAR,
        task_types=[TaskType.COMPUTE_DERIVED_VALUE],
        description="Shows the relative proportion of one nominal dimension within each category of another as a normalized stacked bar chart.",
        design_considerations=(
            "First filters to the two-dimension marginal (expanded from the schema), then sums "
            "the measure per primary-dimension group and divides each cell by its group total to "
            "obtain proportions. Color is preferably the dimension with fewer categories."
        ),
        tasks="Compare relative proportions across categories; identify dominant sub-groups.",
        shape="data_cube",
    )

    # ---------------------------------------------------------------
    # Aggregate bar charts — min/max/mean/median/sum
    # ---------------------------------------------------------------

    for name, op in [
        ("minimum", Op.min),
        ("maximum", Op.max),
        ("average", Op.mean),
        ("median", Op.median),
        ("total", Op.sum),
    ]:
        named_aggregate = f"{name} <F1>"

        # Horizontal, >4 categories
        df = add_row(
            df,
            query_templates=[
                f"What is the {name} <F1:q> for each <F2:n>?",
            ],
            spec=(
                Chart()
                .source("<E>", "<E.url>")
                .groupby("<F2>")
                .rollup({named_aggregate: op("<F1:q>")})
                .mark("bar")
                .x(field=named_aggregate, type="quantitative")
                .y(field="<F2>", type="nominal")
            ),
            chart_type=ChartType.BARCHART,
            task_types=[
                TaskType.COMPUTE_DERIVED_VALUE,
            ],
            description=f"Computes the {name} of a quantitative field for each category, displayed as a horizontal bar chart.",
            design_considerations=f"Horizontal orientation for many categories (>4). Bar length encodes the {name} aggregate value for easy comparison.",
            tasks=f"Compare the {name} value across categories; identify which group has the highest or lowest {name}.",
        )

        # Vertical, <=4 categories
        df = add_row(
            df,
            query_templates=[
                f"What is the {name} <F1:q> for each <F2:n>?",
            ],
            spec=(
                Chart()
                .source("<E>", "<E.url>")
                .groupby("<F2>")
                .rollup({named_aggregate: op("<F1:q>")})
                .mark("bar")
                .x(field="<F2>", type="nominal")
                .y(field=named_aggregate, type="quantitative")
            ),
            chart_type=ChartType.BARCHART,
            task_types=[
                TaskType.COMPUTE_DERIVED_VALUE,
            ],
            description=f"Computes the {name} of a quantitative field for each category, displayed as a vertical bar chart.",
            design_considerations=f"Vertical orientation for few categories (<=4). Bar height encodes the {name} aggregate value.",
            tasks=f"Compare the {name} value across categories; identify which group has the highest or lowest {name}.",
        )

    # ---------------------------------------------------------------
    # Scatterplots
    # ---------------------------------------------------------------

    # MERGED: scatterplot (question + utterance)
    df = add_row(
        df,
        query_templates=[
            "Is there a correlation between <F1:q> and <F2:q>?",
            "Make a scatterplot of <F1:q> and <F2:q>?",
        ],
        spec=(
            Chart()
            .source("<E>", "<E.url>")
            .mark("point")
            .x(field="<F1>", type="quantitative")
            .y(field="<F2>", type="quantitative")
        ),
        chart_type=ChartType.SCATTERPLOT,
        task_types=[
            TaskType.CORRELATE,
            TaskType.CLUSTER,
            TaskType.FIND_ANOMALIES,
            TaskType.DETERMINE_RANGE,
            TaskType.FIND_EXTREMUM,
        ],
        description="Plots two quantitative fields as a scatterplot to explore their relationship.",
        design_considerations="Point marks on two quantitative axes reveal correlations, clusters, and outliers. Data size capped at 100k rows for rendering performance.",
        tasks="Assess correlation between two variables; identify clusters, outliers, extremes, and the range of both variables.",
    )

    # ---------------------------------------------------------------
    # Stacked bar charts — utterance form
    # ---------------------------------------------------------------

    # Stacked bar utterance, vertical, <=4 categories
    df = add_row(
        df,
        query_templates=[
            "Make a stacked bar chart of <F1:n> and <F2:n>?",
        ],
        spec=(
            Chart()
            .source("<E>", "<E.url>")
            .groupby(["<F1>", "<F2>"])
            .rollup({"count": Op.count()})
            .mark("bar")
            .x(field="<F1>", type="nominal")
            .y(field="count", type="quantitative")
            .color(field="<F2>", type="nominal")
        ),
        chart_type=ChartType.STACKED_BAR,
        task_types=[
            TaskType.COMPUTE_DERIVED_VALUE,
            TaskType.DETERMINE_RANGE,
        ],
        description="Creates a vertical stacked bar chart of counts grouped by two nominal fields.",
        design_considerations="Vertical stacked layout for small primary category counts (<=4). Color encodes the secondary field. Color is preferably mapped to the variable with fewer unique values for better discriminability.",
        tasks="Compare group compositions across categories; assess the overall range of counts.",
    )

    # Stacked bar utterance, horizontal, >4 categories
    df = add_row(
        df,
        query_templates=[
            "Make a stacked bar chart of <F1:n> and <F2:n>?",
        ],
        spec=(
            Chart()
            .source("<E>", "<E.url>")
            .groupby(["<F1>", "<F2>"])
            .rollup({"count": Op.count()})
            .mark("bar")
            .x(field="count", type="quantitative")
            .y(field="<F1>", type="nominal")
            .color(field="<F2>", type="nominal")
        ),
        chart_type=ChartType.STACKED_BAR,
        task_types=[
            TaskType.COMPUTE_DERIVED_VALUE,
            TaskType.DETERMINE_RANGE,
        ],
        description="Creates a horizontal stacked bar chart of counts grouped by two nominal fields.",
        design_considerations="Horizontal stacked layout for higher primary category counts (>4). Color encodes the secondary field. Color is preferably mapped to the variable with fewer unique values for better discriminability.",
        tasks="Compare group compositions across categories; assess the overall range of counts.",
    )

    # ---------------------------------------------------------------
    # Circular charts — pie and donut
    # ---------------------------------------------------------------

    # Pie chart
    df = add_row(
        df,
        query_templates=[
            "Make a pie chart of <F:n>?",
        ],
        spec=(
            Chart()
            .source("<E>", "<E.url>")
            .groupby("<F>")
            .rollup({"proportion": Op.frequency()})
            .mark("arc")
            .theta(
                field="proportion", type="quantitative", domainWhenFiltered="filtered"
            )
            .color(field="<F>", type="nominal")
        ),
        chart_type=ChartType.CIRCULAR,
        task_types=[
            TaskType.COMPUTE_DERIVED_VALUE,
            TaskType.DETERMINE_RANGE,
        ],
        description="Creates a pie chart showing the proportional distribution of a nominal field.",
        design_considerations="Arc marks with theta encoding map proportion to angle. Suitable for fields with few categories (<8) where part-to-whole perception is the goal.",
        tasks="Assess part-to-whole proportions; identify the dominant category.",
    )

    # Donut chart
    df = add_row(
        df,
        query_templates=[
            "Make a donut chart of <F:n>?",
        ],
        spec=(
            Chart()
            .source("<E>", "<E.url>")
            .groupby("<F>")
            .rollup({"proportion": Op.frequency()})
            .mark("arc")
            .theta(
                field="proportion", type="quantitative", domainWhenFiltered="filtered"
            )
            .color(field="<F>", type="nominal")
            .radius(value=60)
            .radius2(value=80)
        ),
        chart_type=ChartType.CIRCULAR,
        task_types=[
            TaskType.COMPUTE_DERIVED_VALUE,
            TaskType.DETERMINE_RANGE,
        ],
        description="Creates a donut chart showing the proportional distribution of a nominal field.",
        design_considerations="Donut variant with inner/outer radius creates a hollow center that can improve label readability. Suitable for few categories (<8).",
        tasks="Assess part-to-whole proportions; identify the dominant category.",
    )

    # DATA CUBE: pie of the measure by a single nominal dimension (its marginal)
    df = add_row(
        df,
        query_templates=["Make a pie chart of the measure by a categorical dimension."],
        spec=(
            Chart()
            .source("<E>", "<E.url>")
            .filter("<MARGINAL:D>")
            .mark("arc")
            .theta(field="<M>", type="quantitative")
            .color(field="<D:n>", type="nominal")
        ),
        chart_type=ChartType.CIRCULAR,
        task_types=[TaskType.COMPUTE_DERIVED_VALUE, TaskType.DETERMINE_RANGE],
        description="Shows the proportional cube measure for each category of a nominal dimension as a pie chart.",
        design_considerations=(
            _CUBE_MARGINAL_NOTE + " The measure maps to angle and the renderer normalizes each "
            "slice against the total. Best for a small number of categories."
        ),
        tasks="Assess part-to-whole proportions; identify the dominant category.",
        shape="data_cube",
    )

    # DATA CUBE: donut of the measure by a single nominal dimension (its marginal)
    df = add_row(
        df,
        query_templates=["Make a donut chart of the measure by a categorical dimension."],
        spec=(
            Chart()
            .source("<E>", "<E.url>")
            .filter("<MARGINAL:D>")
            .mark("arc")
            .theta(field="<M>", type="quantitative")
            .color(field="<D:n>", type="nominal")
            .radius(value=60)
            .radius2(value=80)
        ),
        chart_type=ChartType.CIRCULAR,
        task_types=[TaskType.COMPUTE_DERIVED_VALUE, TaskType.DETERMINE_RANGE],
        description="Shows the proportional cube measure for each category of a nominal dimension as a donut chart.",
        design_considerations=(
            _CUBE_MARGINAL_NOTE + " The measure maps to angle and the renderer normalizes each "
            "slice against the total. Best for a small number of categories."
        ),
        tasks="Assess part-to-whole proportions; identify the dominant category.",
        shape="data_cube",
    )

    # ---------------------------------------------------------------
    # Tables — data preview and exploration
    # ---------------------------------------------------------------

    # Record count
    df = add_row(
        df,
        query_templates=[
            "How many <E> records are there?",
        ],
        spec=(Chart().source("<E>", "<E.url>").rollup({"<E> Records": Op.count()})),
        chart_type=ChartType.TABLE,
        task_types=[
            TaskType.COMPUTE_DERIVED_VALUE,
        ],
        description="Counts the total number of records in an entity and displays the result as a single-row table.",
        design_considerations="Simple rollup with no visual encoding beyond the count value. Useful as a quick data quality or size check.",
        tasks="Retrieve the total record count for an entity.",
    )

    # MERGED: data preview, single entity (question + utterance)
    df = add_row(
        df,
        query_templates=[
            "What does the <E> data look like?",
            "Make a table of <E>?",
        ],
        spec=(Chart().source("<E>", "<E.url>")),
        chart_type=ChartType.TABLE,
        task_types=[
            TaskType.DETERMINE_RANGE,
            TaskType.RETRIEVE_VALUE,
            TaskType.FIND_ANOMALIES,
            TaskType.FIND_EXTREMUM,
        ],
        description="Displays the raw data for an entity as a table.",
        design_considerations="No aggregation or transformation applied; shows the underlying data as-is for exploration.",
        tasks="Explore raw data; retrieve specific values; understand field values and ranges; identify anomalies and extremes.",
    )

    # MERGED: data preview, joined entities (question + utterance)
    df = add_row(
        df,
        query_templates=[
            "What does the combined data of <E1> and <E2> look like?",
            "Make a table that combines <E1> and <E2>.",
        ],
        spec=(
            Chart()
            .source("<E1>", "<E1.url>")
            .source("<E2>", "<E2.url>")
            .join(
                in_name=["<E1>", "<E2>"],
                on=["<E1.r.E2.id.from>", "<E1.r.E2.id.to>"],
                out_name="<E1>__<E2>",
            )
        ),
        chart_type=ChartType.TABLE,
        task_types=[
            TaskType.DETERMINE_RANGE,
            TaskType.RETRIEVE_VALUE,
            TaskType.FIND_ANOMALIES,
            TaskType.FIND_EXTREMUM,
        ],
        description="Joins two related entities and displays the combined data as a table.",
        design_considerations="Cross-entity join enriches the view by combining fields from two related entities. Requires a valid foreign-key relationship.",
        tasks="Explore combined data from two related entities; retrieve specific values; identify anomalies and extremes.",
    )

    # ---------------------------------------------------------------
    # Tables — extremum (find largest / smallest / most)
    # ---------------------------------------------------------------

    # Cross-entity: which record has the most associated entities
    df = add_row(
        df,
        query_templates=[
            "What <E2> has the most <E1>?",
        ],
        spec=(
            Chart()
            .source("<E1>", "<E1.url>")
            .source("<E2>", "<E2.url>")
            .join(
                in_name=["<E1>", "<E2>"],
                on=["<E1.r.E2.id.from>", "<E1.r.E2.id.to>"],
                out_name="<E1>__<E2>",
            )
            .groupby("<E1.r.E2.id.from>")
            .rollup({"<E1> count": Op.count()})
            .orderby("<E1> count", ascending=False)
            .derive({"rank": Expr.rank()})
            .derive({"most frequent": RANK_1_YES_NO})
            .mark("row")
            .x(field="<E1> count", mark="bar", type="quantitative", domain={"min": 0})
            .color(
                column="<E1> count",
                mark="bar",
                field="most frequent",
                type="nominal",
                domain=["yes", "no"],
                range=["#FFA500", "#c6cfd8"],
            )
            .mark("row")
            .text(field="*", mark="text", type="nominal")
        ),
        chart_type=ChartType.TABLE,
        task_types=[
            TaskType.FIND_EXTREMUM,
            TaskType.RETRIEVE_VALUE,
            TaskType.COMPUTE_DERIVED_VALUE,
        ],
        description="Finds which related entity record has the highest count of associated records, displayed as a ranked table with bar indicators.",
        design_considerations="Groups by foreign key, counts, ranks, and highlights the top record with color encoding. Bar marks on the count column provide visual comparison.",
        tasks="Identify the record with the most associated entities; compare counts across records.",
    )

    # Single entity: largest value
    df = add_row(
        df,
        query_templates=[
            "What Record in <E> has the largest <F:q>?",
        ],
        spec=(
            Chart()
            .source("<E>", "<E.url>")
            .filter(Expr.not_null("<F>"))
            .orderby("<F>", ascending=False)
            .derive(
                {
                    "largest": Expr.cond(
                        Expr.binop("==", Expr.rank(), Expr.lit(1)),
                        Expr.lit("largest"),
                        Expr.lit("not"),
                    )
                }
            )
            .mark("row")
            .x(field="<F>", mark="bar", type="quantitative")
            .color(
                column="<F>",
                mark="bar",
                field="largest",
                type="nominal",
                domain=["largest", "not"],
                range=["#FFA500", "c6cfd8"],
            )
            .text(field="*", mark="text", type="nominal")
        ),
        chart_type=ChartType.TABLE,
        task_types=[
            TaskType.FIND_EXTREMUM,
            TaskType.RETRIEVE_VALUE,
        ],
        description="Finds the record with the largest value in a quantitative field, displayed as a ranked table with bar indicators.",
        design_considerations="Sorts descending by the target field, derives a rank, and highlights the top record with color. Bar marks provide visual magnitude comparison.",
        tasks="Identify the record with the largest value; compare values across records.",
    )

    # Cross-entity: largest aggregate
    df = add_row(
        df,
        query_templates=[
            "What Record in <E2> has the largest <E1> <E1.F:q>?",
        ],
        spec=(
            Chart()
            .source("<E1>", "<E1.url>")
            .source("<E2>", "<E2.url>")
            .join(
                in_name=["<E1>", "<E2>"],
                on=["<E1.r.E2.id.from>", "<E1.r.E2.id.to>"],
                out_name="<E1>__<E2>",
            )
            .groupby("<E1.r.E2.id.from>")
            .rollup({"Largest <E1.F>": Op.max("<E1.F:q>")})
            .filter(Expr.not_null("Largest <E1.F>"))
            .orderby("Largest <E1.F>", ascending=False)
            .derive({"rank": Expr.rank()})
            .derive({"largest": RANK_1_YES_NO})
            .mark("row")
            .x(field="Largest <E1.F>", mark="bar", type="quantitative")
            .color(
                column="Largest <E1.F>",
                mark="bar",
                field="largest",
                type="nominal",
                domain=["yes", "no"],
                range=["#FFA500", "#c6cfd8"],
            )
            .text(field="*", mark="text", type="nominal")
        ),
        chart_type=ChartType.TABLE,
        task_types=[
            TaskType.FIND_EXTREMUM,
            TaskType.RETRIEVE_VALUE,
            TaskType.COMPUTE_DERIVED_VALUE,
        ],
        description="Joins two entities, computes the maximum of a quantitative field per group, and ranks the results in a table with bar indicators.",
        design_considerations="Cross-entity join followed by group-level max aggregation. Highlights the top record with color encoding.",
        tasks="Identify which related record has the largest aggregated value; compare across groups.",
    )

    # Single entity: smallest value
    df = add_row(
        df,
        query_templates=[
            "What Record in <E> has the smallest <F:q>?",
        ],
        spec=(
            Chart()
            .source("<E>", "<E.url>")
            .filter(Expr.not_null("<F>"))
            .orderby("<F:q>")
            .derive(
                {
                    "smallest": Expr.cond(
                        Expr.binop("==", Expr.rank(), Expr.lit(1)),
                        Expr.lit("smallest"),
                        Expr.lit("not"),
                    )
                }
            )
            .mark("row")
            .color(
                column="<F>",
                mark="rect",
                orderby="<F>",
                field="smallest",
                type="nominal",
                domain=["smallest", "not"],
                range=["#ffdb9a", "white"],
            )
            .text(field="*", mark="text", type="nominal")
        ),
        chart_type=ChartType.TABLE,
        task_types=[
            TaskType.FIND_EXTREMUM,
            TaskType.RETRIEVE_VALUE,
        ],
        description="Finds the record with the smallest value in a quantitative field, displayed as a ranked table with conditional formatting.",
        design_considerations="Sorts ascending by the target field, derives a rank, and highlights the top record with background color. Uses rect mark for row-level highlighting.",
        tasks="Identify the record with the smallest value; compare values across records.",
    )

    # Cross-entity: smallest aggregate
    df = add_row(
        df,
        query_templates=[
            "What Record in <E2> has the smallest <E1> <E1.F:q>?",
        ],
        spec=(
            Chart()
            .source("<E1>", "<E1.url>")
            .source("<E2>", "<E2.url>")
            .join(
                in_name=["<E1>", "<E2>"],
                on=["<E1.r.E2.id.from>", "<E1.r.E2.id.to>"],
                out_name="<E1>__<E2>",
            )
            .groupby("<E1.r.E2.id.from>")
            .rollup({"Smallest <E1.F>": Op.min("<E1.F:q>")})
            .filter(Expr.not_null("Smallest <E1.F>"))
            .orderby("Smallest <E1.F>", ascending=True)
            .derive({"rank": Expr.rank()})
            .derive({"smallest": RANK_1_YES_NO})
            .mark("row")
            .color(
                column="Smallest <E1.F>",
                mark="bar",
                orderby="Smallest <E1.F>",
                field="smallest",
                type="nominal",
                domain=["yes", "no"],
                range=["#ffdb9a", "white"],
            )
            .text(field="*", mark="text", type="nominal")
        ),
        chart_type=ChartType.TABLE,
        task_types=[
            TaskType.FIND_EXTREMUM,
            TaskType.RETRIEVE_VALUE,
        ],
        description="Joins two entities, computes the minimum of a quantitative field per group, and ranks the results in a table with conditional formatting.",
        design_considerations="Cross-entity join followed by group-level min aggregation. Highlights the top record with background color via rect mark.",
        tasks="Identify which related record has the smallest aggregated value; compare across groups.",
    )

    # ---------------------------------------------------------------
    # Tables — sort, range, proportion
    # ---------------------------------------------------------------

    # Sort by quantitative field
    df = add_row(
        df,
        query_templates=[
            "Order the <E> by <F:q>?",
        ],
        spec=(
            Chart()
            .source("<E>", "<E.url>")
            .filter(Expr.not_null("<F>"))
            .orderby("<F>")
            .mark("row")
            .x(
                column="<F>",
                mark="bar",
                field="<F>",
                type="quantitative",
                range={"min": 0.2, "max": 1},
            )
            .text(field="*", mark="text", type="nominal")
        ),
        chart_type=ChartType.TABLE,
        task_types=[
            TaskType.SORT,
        ],
        description="Sorts entity records by a quantitative field and displays the result as an ordered table with in-cell bar marks.",
        design_considerations="Ordered by the quantitative field with nulls filtered out. In-cell bar marks provide visual comparison of magnitude alongside the text values.",
        tasks="View records in sorted order; compare relative magnitudes.",
    )

    # Range of a quantitative field
    df = add_row(
        df,
        query_templates=[
            "What is the range of <E> <F:q> values?",
        ],
        spec=(
            Chart()
            .source("<E>", "<E.url>")
            .filter(Expr.not_null("<F>"))
            .rollup({"<F> min": Op.min("<F:q>"), "<F> max": Op.max("<F:q>")})
            .mark("row")
            .text(field="<F> min", mark="text", type="nominal")
            .text(field="<F> max", mark="text", type="nominal")
        ),
        chart_type=ChartType.TABLE,
        task_types=[
            TaskType.DETERMINE_RANGE,
        ],
        description="Computes the minimum and maximum of a quantitative field and displays them as a single-row table.",
        design_considerations="Simple rollup of min and max. Filters out nulls before aggregation for accuracy.",
        tasks="Determine the range of a quantitative field.",
    )

    # Range of a nominal field (distinct values with counts)
    df = add_row(
        df,
        query_templates=[
            "What is the range of <E> <F:n> values?",
        ],
        spec=(
            Chart()
            .source("<E>", "<E.url>")
            .filter(Expr.not_null("<F>"))
            # `:n` is required here: the text mapping below uses field="*", so
            # this groupby is the only place left that can constrain <F>'s type.
            .groupby("<F:n>")
            .rollup({"count": Op.count()})
            .orderby("count", ascending=False)
            .mark("row")
            .text(field="<F>", mark="text", type="nominal")
            # The bar and the number share one column (`column="count"`, the same
            # idiom the range table uses), so the count reads as a value and not
            # just a length. Text comes after the bar deliberately: in-cell marks
            # are absolutely positioned siblings, so the later mapping paints on
            # top — with the text first the bar hid the number.
            .x(
                column="count",
                field="count",
                mark="bar",
                type="quantitative",
                range={"min": 0.1, "max": 1},
            )
            .text(column="count", field="count", mark="text", type="nominal")
        ),
        chart_type=ChartType.TABLE,
        task_types=[
            TaskType.DETERMINE_RANGE,
        ],
        description="Lists all distinct values of a nominal field with their counts, ordered by descending count, displayed as a table with in-cell bar marks.",
        design_considerations="Groups by the nominal field and counts occurrences, sorted descending so the bars are comparable top-to-bottom. The count is drawn as both a bar and a number, since a bar alone shows relative frequency but not the value.",
        tasks="Determine the range (distinct values) of a nominal field; compare category frequencies.",
    )

    # Grouped range: min/max per category
    df = add_row(
        df,
        query_templates=[
            "What is the range of <E> <F1:q> values for every <F2:n>?",
        ],
        spec=(
            Chart()
            .source("<E>", "<E.url>")
            .filter(Expr.not_null("<F1>"))
            .groupby("<F2>")
            .rollup({"<F1> min": Op.min("<F1:q>"), "<F1> max": Op.max("<F1:q>")})
            .derive(
                {
                    "range": Expr.binop(
                        "-", Expr.field("<F1> max"), Expr.field("<F1> min")
                    )
                }
            )
            .orderby("range", ascending=False)
            .mark("row")
            .text(field="<F2>", mark="text", type="nominal")
            .text(field="<F1> min", mark="text", type="nominal")
            .x(
                column="range",
                mark="bar",
                field="<F1> min",
                type="quantitative",
                domain={"numberFields": ["<F1> min", "<F1> max"]},
            )
            .x2(
                column="range",
                mark="bar",
                field="<F1> max",
                type="quantitative",
                domain={"numberFields": ["<F1> min", "<F1> max"]},
            )
            .text(field="<F1> max", mark="text", type="nominal")
        ),
        chart_type=ChartType.TABLE,
        task_types=[
            TaskType.DETERMINE_RANGE,
        ],
        description="Computes the min and max of a quantitative field for each category of a nominal field, displayed as a table with range bar marks.",
        design_considerations="Groups by nominal field, computes min/max and derived range, then orders by range descending. Uses x/x2 encoding to show the span between min and max values.",
        tasks="Compare the spread of a quantitative field across categories; identify which group has the widest or narrowest range.",
    )

    # Most frequent nominal value
    df = add_row(
        df,
        query_templates=[
            "What is the most frequent <F:n>?",
        ],
        spec=(
            Chart()
            .source("<E>", "<E.url>")
            .filter(Expr.field("<F>"))
            .groupby("<F>")
            .rollup({"count": Op.count()})
            .orderby("count", ascending=False)
            .derive({"rank": Expr.rank()})
            .derive({"most frequent": RANK_1_YES_NO})
            .mark("row")
            .color(
                column="<F>",
                mark="bar",
                orderby="<F>",
                field="most frequent",
                type="nominal",
                domain=["yes", "no"],
                range=["#ffdb9a", "white"],
            )
            .text(field="<F>", mark="text", type="nominal")
            .x(column="count", field="count", mark="bar", type="quantitative", domain={"min": 0})
            .color(
                column="count",
                mark="bar",
                field="most frequent",
                type="nominal",
                domain=["yes", "no"],
                range=["#FFA500", "#c6cfd8"],
            )
            # Last, so the count reads as a number on top of its bar.
            .text(column="count", field="count", mark="text", type="nominal")
        ),
        chart_type=ChartType.TABLE,
        task_types=[
            TaskType.FIND_EXTREMUM,
            TaskType.RETRIEVE_VALUE,
            TaskType.COMPUTE_DERIVED_VALUE,
        ],
        description="Finds the most frequent value of a nominal field, displayed as a ranked table with bar marks and conditional formatting.",
        design_considerations="Groups by nominal field, counts, ranks, and highlights the top value. Combines bar marks for count comparison and background color for emphasis.",
        tasks="Identify the most frequent category; compare frequencies across all categories.",
    )

    # DATA CUBE: grand-total single-row table (the all-empty marginal)
    df = add_row(
        df,
        query_templates=["What is the grand total of the measure?", "How many are there in total?"],
        spec=(
            Chart()
            .source("<E>", "<E.url>")
            .filter("<MARGINAL>")
            .mark("row")
            .text(field="<M>", mark="text", type="nominal")
        ),
        chart_type=ChartType.TABLE,
        task_types=[TaskType.RETRIEVE_VALUE, TaskType.COMPUTE_DERIVED_VALUE],
        description="Shows the grand-total cube measure as a single-row table.",
        design_considerations=(
            "Reads the grand-total row directly by filtering to the marginal where every "
            "dimension is empty; no aggregation is performed."
        ),
        tasks="Retrieve the overall total.",
        shape="data_cube",
    )

    # DATA CUBE: per-category table with in-cell bars, sorted by the measure
    df = add_row(
        df,
        query_templates=[
            "List the measure for each category of a dimension.",
            "What is the range of values for a dimension?",
        ],
        spec=(
            Chart()
            .source("<E>", "<E.url>")
            .filter("<MARGINAL:D>")
            .orderby("<M>", ascending=False)
            .mark("row")
            .text(field="<D:n>", mark="text", type="nominal")
            # Bar and number share the measure's column. Text goes last: in-cell
            # marks are absolutely positioned siblings, so the later mapping
            # paints on top — text first and the bar would hide the value.
            .x(
                column="<M>",
                field="<M>",
                mark="bar",
                type="quantitative",
                range={"min": 0.1, "max": 1},
            )
            .text(column="<M>", field="<M>", mark="text", type="nominal")
        ),
        chart_type=ChartType.TABLE,
        task_types=[TaskType.DETERMINE_RANGE, TaskType.SORT, TaskType.RETRIEVE_VALUE],
        description="Lists each category of a nominal dimension with its pre-aggregated measure as a sorted table with in-cell bars.",
        design_considerations=(
            _CUBE_MARGINAL_NOTE + " Ordered by the measure descending, with the measure drawn "
            "as both an in-cell bar and a number so the value is readable and not just its length."
        ),
        tasks="Determine the distinct values of a dimension; compare category counts.",
        shape="data_cube",
    )

    # ---------------------------------------------------------------
    # Line / CDF charts
    # ---------------------------------------------------------------

    # MERGED: CDF single field (question + utterance)
    df = add_row(
        df,
        query_templates=[
            "What is the cumulative distribution of <F:q>?",
            "Make a CDF plot of <F:q>.",
        ],
        spec=(
            Chart()
            .source("<E>", "<E.url>")
            .filter(Expr.not_null("<F>"))
            .orderby("<F>")
            .derive({"total": Expr.agg("count")})
            .derive(
                {
                    "percentile": rolling(
                        Expr.binop("/", Expr.agg("count"), Expr.field("total"))
                    )
                }
            )
            # Final sort by the derived percentile so the line renders as a
            # monotonic step: at tied values, the rolling frame emits several
            # percentiles for one x, and ordering by value alone leaves them in
            # a non-ascending order that draws as downward jags.
            .orderby("percentile")
            .mark("line")
            .x(field="<F>", type="quantitative")
            .y(field="percentile", type="quantitative")
        ),
        chart_type=ChartType.LINE,
        task_types=[
            TaskType.CHARACTERIZE_DISTRIBUTION,
        ],
        description="Shows the cumulative distribution function (CDF) of a quantitative field as a line chart.",
        design_considerations="Sorts by value, computes rolling percentile, then sorts by percentile so the line is a monotonic step. The CDF reveals the full distribution shape including median, quartiles, and tails.",
        tasks="Characterize the distribution of a variable; identify median, quartiles, and concentration of values.",
    )

    # MERGED: CDF grouped by nominal field (question + utterance)
    df = add_row(
        df,
        query_templates=[
            "What is the cumulative distribution of <F1:q> for each <F2:n>?",
            "Make a CDF plot of <F1:q> with a line for each <F2:n>.",
        ],
        spec=(
            Chart()
            .source("<E>", "<E.url>")
            .filter(Expr.not_null("<F1>"))
            # Group first, then sort within groups: the rolling percentile is a
            # per-group cumulative, so grouping must be established before the
            # ordered window is computed.
            .groupby("<F2>")
            .orderby("<F1>")
            .derive({"total": Expr.agg("count")})
            .derive(
                {
                    "percentile": rolling(
                        Expr.binop("/", Expr.agg("count"), Expr.field("total"))
                    )
                }
            )
            # Final sort by the derived percentile so each group's line renders
            # as a monotonic step (see the single-field CDF above).
            .orderby("percentile")
            .mark("line")
            .x(field="<F1>", type="quantitative")
            .y(field="percentile", type="quantitative")
            .color(field="<F2>", type="nominal")
        ),
        chart_type=ChartType.GROUPED_LINE,
        task_types=[
            TaskType.CHARACTERIZE_DISTRIBUTION,
        ],
        description="Shows the cumulative distribution of a quantitative field for each category of a nominal field, with separate lines per group.",
        design_considerations="Groups by the nominal field, sorts within groups, computes the per-group rolling percentile, then sorts by percentile so each line is a monotonic step. Color encodes group identity. Limited to fewer than 5 groups for readability.",
        tasks="Compare distributions across groups; identify which groups have higher or lower concentrations of values.",
    )

    # DATA CUBE: line of the measure over an ordered (e.g. temporal) dimension
    df = add_row(
        df,
        query_templates=[
            "How does the measure change over <dimension>?",
            "Make a line chart of the measure over an ordered (e.g. temporal) dimension.",
        ],
        spec=(
            Chart()
            .source("<E>", "<E.url>")
            .filter("<MARGINAL:D>")
            .orderby("<D>", ascending=True)
            .mark("line")
            .x(field="<D:o>", type="ordinal")
            .y(field="<M>", type="quantitative")
        ),
        chart_type=ChartType.LINE,
        task_types=[TaskType.CHARACTERIZE_DISTRIBUTION, TaskType.DETERMINE_RANGE],
        description="Shows the pre-aggregated cube measure over an ordered dimension (e.g. time) as a line chart.",
        design_considerations=(
            _CUBE_MARGINAL_NOTE + " The axis is ordered ascending; a temporal dimension is "
            "encoded as an ordered (ordinal) axis."
        ),
        tasks="Identify trends over time; spot peaks, troughs, and seasonality.",
        shape="data_cube",
    )

    # ---------------------------------------------------------------
    # Survival curves (event-log tables)
    # ---------------------------------------------------------------

    # An event log records one row per event per subject, so survival time is not
    # a column — it has to be reconstructed by pairing two events for the same
    # subject. This is the only template that derives its x-axis from the gap
    # between two rows, which is why the pipeline is longer than the others.
    df = add_row(
        df,
        query_templates=[
            "Show a survival curve for <E>.",
            "Plot survival time from diagnosis to death for each <F1:n>.",
            "What fraction of subjects are still alive over time after diagnosis?",
        ],
        spec=_survival_chart(),
        chart_type=ChartType.LINE,
        task_types=[
            TaskType.CHARACTERIZE_DISTRIBUTION,
            TaskType.COMPUTE_DERIVED_VALUE,
        ],
        description=(
            "Survival curve from an event log — a table with one row per event, a subject id, "
            "an event-type column and a numeric time column. Given a start event type and an end "
            "event type, derives each subject's elapsed time between them and plots the falling "
            "fraction of subjects that have not yet reached the end event."
        ),
        design_considerations=(
            "Survival time is not stored anywhere; it is reconstructed as the gap between two "
            "events for the same subject, so the template groups the event log by subject id and "
            "rolls it up to one row each before computing anything. The subject id is only a "
            "grouping key and is never encoded, so its cardinality does not matter. "
            "IMPORTANT: this is a crude survival curve, not a Kaplan-Meier estimate. Subjects "
            "with no end event are kept in the denominator but contribute no drop, which assumes "
            "every one of them was followed for the whole window. A true Kaplan-Meier estimator "
            "reweights by the number still at risk at each event time; that needs a cumulative "
            "product and per-time at-risk counts, which the grammar cannot express today. Read "
            "the curve as an observed-survival fraction over the cohort, and do not use it where "
            "differences in follow-up length matter."
            "Every curve starts at (0, 100%): subjects who never reach the end event sit at day 0 and contribute no drop, and where a group has none of those, its flat opening segment and the drop into its first event are drawn explicitly. The dashed rule carries the final value out to the right edge, where a label repeats it as a number — so a group with no end events at all gets neither, having no final value to report."
        ),
        tasks=(
            "Judge how survival falls over time after a starting event; compare the observed "
            "survival fraction of a cohort at a given number of days."
        ),
        review_hint=(
            "The two event types are <V1>/<V2> literal-value placeholders, so the model supplies "
            "them per request from the column's domain — nothing here is dataset-specific. Check "
            "the censoring caveat in the design considerations before approving."
        ),
        # The studio cannot infer which column is the subject id, which is the
        # event type, or which holds the day offset — a type-directed search would
        # pick three plausible-looking columns and draw an empty curve. Name them.
        preview_bindings={
            "E": "Event",
            "F1": "research_id",
            "F2": "event_type",
            "F3": "event_date",
            "V1": PREVIEW_START_EVENT,
            "V2": PREVIEW_END_EVENT,
        },
    )

    # Stratified, reading the stratifier at the START event: a baseline covariate.
    # Each subject is placed once, from the value it had when the clock started, so
    # the groups partition the cohort and add back up to the unstratified curve.
    # This is the safe default; the "ever recorded" variant below answers a
    # different question and does not reconcile.
    df = add_row(
        df,
        query_templates=[
            "Show survival curves for <E> split by <F4:n>.",
            "Compare survival between <F4:n> groups.",
            "Does survival differ by <F4:n>?",
        ],
        spec=_survival_chart(stratum="<F4:n>", reading=StratumReading.AT_START),
        chart_type=ChartType.LINE,
        name_hint="survival_baseline",
        task_types=[
            TaskType.CHARACTERIZE_DISTRIBUTION,
            TaskType.COMPUTE_DERIVED_VALUE,
            TaskType.CORRELATE,
        ],
        description=(
            "Survival curves split by a nominal field as recorded at the start event, from an "
            "event log — one row per event, with a subject id, an event-type column and a numeric "
            "time column. Given a start and an end event type, derives each subject's elapsed time "
            "between them and plots one curve per category. The stratifier is read once, from the "
            "subject's start event, so each subject falls in exactly one group and the groups add "
            "back up to the whole cohort. This is the default way to split a survival curve."
        ),
        design_considerations=(
            _SURVIVAL_TIME_VARYING +
            "This template reads it once, at the start event, which is what makes the groups a "
            "partition: reading it per event would split a subject whose value changed into two "
            "rows, one with a start and no end (read as censored) and one with an end and no start "
            "(dropped), losing the death from both. The value is nulled everywhere but the start "
            "event and carried through the per-subject rollup by `max`, which sees exactly one "
            "candidate. "
            "A subject with no value on its start event cannot be placed and leaves the cohort, so "
            "group sizes can add to less than the unstratified curve's; a subject with two start "
            "events carrying different values takes the later by codepoint order. "
            "Strata are drawn as colours because the grammar has no facet channel. "
            "Only for single-valued fields: a delimited multi-value column would make every "
            "distinct combination its own stratum — use the multi-value variant for those. "
            + _SURVIVAL_CENSORING
            + _SURVIVAL_ANCHORING
        ),
        tasks=(
            "Compare survival between groups defined at baseline; judge whether an attribute "
            "present when the clock started is associated with worse or better observed survival."
        ),
        review_hint=(
            "For a two-value stratifier the curves must BRACKET the unstratified curve — one "
            "above it, one below — because a weighted average has to sit between them. Two curves "
            "both above it means the stratifier is being read per event again, which silently "
            "drops the deaths of subjects whose value changed. Previews with `metastasis`, whose "
            "value differs between the start and death events for 24 of 34 pcx deaths, so that "
            "failure would be visible. Also check the group sizes add to the unstratified card's "
            "cohort. Each curve should start at 1 - 1/n for its own stratum, so a small group "
            "starts visibly lower and steps coarsely; that is correct, not a denominator bug. "
            "There is no at-risk weighting or significance test, so do not read group differences "
            "as real."
        ),
        preview_bindings={
            "E": "Event",
            "F1": "research_id",
            "F2": "event_type",
            "F3": "event_date",
            "F4": "metastasis",
            "V1": PREVIEW_START_EVENT,
            "V2": PREVIEW_END_EVENT,
        },
    )

    # Stratified at the START event by a LIST-valued field. The delimited value is
    # expanded AFTER the per-subject rollup — the row is already one-per-subject and
    # nothing has been counted, so this multiplies nothing. Expanding first would
    # instead read the stratifier off every event, which is the "ever" variant.
    df = add_row(
        df,
        query_templates=[
            "Show survival curves for <E> split by each <F4:n> value.",
            "Compare survival across <F4:n>, where a subject can have several.",
        ],
        spec=_survival_chart(
            stratum="<F4:n>", reading=StratumReading.AT_START, multi_value=True
        ),
        chart_type=ChartType.LINE,
        name_hint="survival_baseline_multivalue",
        task_types=[
            TaskType.CHARACTERIZE_DISTRIBUTION,
            TaskType.COMPUTE_DERIVED_VALUE,
            TaskType.CORRELATE,
        ],
        description=(
            "Survival curves split by each value of a multi-value (delimited) field as recorded at "
            "the start event, from an event log — one row per event, with a subject id, an "
            "event-type column and a numeric time column. Expands the start event's list so a "
            "subject counts toward every value it listed then, derives each subject's elapsed time "
            "between a start and an end event type, and plots one curve per value."
        ),
        design_considerations=(
            "For set-valued columns such as tumor locations, where one subject can belong to "
            "several categories at once. "
            + _SURVIVAL_TIME_VARYING +
            "The list is taken from the start event only, so a category first recorded later is "
            "absent by design — that is what keeps each subject's whole timeline attributable to "
            "the categories it started with. `unnest` runs after the per-subject rollup, on a row "
            "that is already one-per-subject, so it multiplies nothing that has been counted. "
            "The cohorts overlap and their sizes sum to more than the number of subjects, which is "
            "the correct reading of a multi-value attribute but means the curves are not "
            "independent and must not be compared as if they partitioned the cohort. Without "
            "unnest each distinct combination would be its own stratum — a column with ~20 real "
            "values can easily have ~80 combinations, which also exceeds the 50-cardinality cap "
            "for an encoded field. A subject whose start-event list is present but empty expands "
            "to no rows and appears in no group, so this cohort can be smaller than the "
            "single-valued variant's. "
            + _SURVIVAL_CENSORING
            + _SURVIVAL_ANCHORING
        ),
        tasks=(
            "Compare observed survival across overlapping categories recorded at baseline; see "
            "which of a subject's several starting attributes coincide with worse survival."
        ),
        review_hint=(
            "Cohort sizes overlap here, so they sum to more than the subject count — that is "
            "intended. Check the end-of-curve labels name individual values (e.g. 'Spine', "
            "'Brain') and not combined strings like 'Leptomeningeal;Spine'; if they show "
            "combinations, unnest did not run. Requires browser (interactive) mode: the SQL "
            "backend rejects unnest."
        ),
        preview_bindings={
            "E": "Event",
            "F1": "research_id",
            "F2": "event_type",
            "F3": "event_date",
            "F4": "metastasis_location",
            "V1": PREVIEW_START_EVENT,
            "V2": PREVIEW_END_EVENT,
        },
    )

    # Stratified by EVER having recorded a value: membership rather than baseline.
    # A subject joins every group whose value appears anywhere on its timeline and
    # carries its whole span into each, so cohorts overlap and do NOT add up. Prefer
    # the baseline variant unless the request is explicitly about "ever having" a
    # value.
    df = add_row(
        df,
        query_templates=[
            "Show survival curves for each <F4:n> value ever recorded for a subject.",
            "Compare survival across every <F4:n> a subject has ever had.",
        ],
        spec=_survival_chart(stratum="<F4:n>", reading=StratumReading.EVER),
        chart_type=ChartType.LINE,
        name_hint="survival_ever",
        task_types=[
            TaskType.CHARACTERIZE_DISTRIBUTION,
            TaskType.COMPUTE_DERIVED_VALUE,
            TaskType.CORRELATE,
        ],
        description=(
            "Survival curves split by every value a subject ever recorded, from an event log — one "
            "row per event, with a subject id, an event-type column and a numeric time column. A "
            "subject joins every group whose value appears anywhere on its timeline and carries "
            "its whole elapsed time into each, so the cohorts OVERLAP and the groups do not add up "
            "to the whole. Use this only when the request is explicitly about ever having a value; "
            "otherwise prefer the variant that reads the field at the start event, which "
            "partitions the cohort."
        ),
        design_considerations=(
            _SURVIVAL_TIME_VARYING +
            "This template treats it as membership: the subject's span is broadcast onto each of "
            "its event rows, then re-grouped per (subject, value), so one subject can appear in "
            "several curves and a single death is attributed to each group the subject belongs to. "
            "The groups therefore cannot be reconciled with the unstratified curve — if a reader "
            "would interpret them as a partition, the baseline variant is the right template. "
            "IMPORTANT: membership is defined using events that may occur AFTER the clock starts, "
            "which is immortal-time bias by construction, not a caveat. A value recorded only at "
            "the end event produces a group in which every member is dead by definition, drawing "
            "flat at 0% — on the pcx event log, `metastasis` = 'Unavailable' is exactly that: 9 "
            "subjects, 9 deaths. Membership is also read only from events that carry a time value, "
            "since rows with no time are filtered first. "
            "Strata are drawn as colours because the grammar has no facet channel. "
            "Only for single-valued fields — use the multi-value variant for delimited columns. "
            + _SURVIVAL_CENSORING
            + _SURVIVAL_ANCHORING
        ),
        tasks=(
            "Compare observed survival between subjects who ever recorded a value and those who "
            "did not; see whether ever having an attribute coincides with worse survival."
        ),
        review_hint=(
            "Expect overlap: on pcx `metastasis` this is 100 cohort rows from 65 subjects, 26 "
            "subjects in both 'No' and 'Yes', and 65 death attributions from 34 deaths. Those "
            "numbers are correct for this reading and must NOT be 'fixed' to reconcile. A curve "
            "pinned flat at 0% is the immortal-time artefact — a value that only ever appears on "
            "the end event — and should be named in the design considerations. Judge this template "
            "on whether a reader could mistake the curves for a partition; if so, the baseline "
            "variant is strictly better and this one should be rejected."
        ),
        preview_bindings={
            "E": "Event",
            "F1": "research_id",
            "F2": "event_type",
            "F3": "event_date",
            "F4": "metastasis",
            "V1": PREVIEW_START_EVENT,
            "V2": PREVIEW_END_EVENT,
        },
    )

    # Ever-recorded membership for a LIST-valued field: `unnest` runs FIRST, on the
    # event rows, so a subject joins every value it listed at any point.
    df = add_row(
        df,
        query_templates=[
            "Show survival curves for each <F4:n> value a subject ever recorded.",
            "Compare survival across every <F4:n> ever listed for a subject.",
        ],
        spec=_survival_chart(
            stratum="<F4:n>", reading=StratumReading.EVER, multi_value=True
        ),
        chart_type=ChartType.LINE,
        name_hint="survival_ever_multivalue",
        task_types=[
            TaskType.CHARACTERIZE_DISTRIBUTION,
            TaskType.COMPUTE_DERIVED_VALUE,
            TaskType.CORRELATE,
        ],
        description=(
            "Survival curves split by every value of a multi-value (delimited) field a subject "
            "ever recorded, from an event log — one row per event, with a subject id, an "
            "event-type column and a numeric time column. Expands the delimited column on every "
            "event, so a subject joins each value listed at any point and carries its whole "
            "elapsed time into all of them. Cohorts OVERLAP twice over — across values of one "
            "event and across events — and do not add up."
        ),
        design_considerations=(
            "For set-valued columns where membership at any point is the question. "
            + _SURVIVAL_TIME_VARYING +
            "`unnest` runs first, on the event rows, so the per-subject rollup sees one row per "
            "(subject, value) pair and a subject joins every value it ever listed. "
            "Overlap compounds: a subject contributes to one group per distinct value across its "
            "whole timeline, so cohort sizes sum to well above the subject count and a single "
            "death is attributed many times. Prefer the baseline multi-value variant unless the "
            "request is explicitly about values recorded at any point. "
            "The same immortal-time property as the single-valued 'ever' variant applies: "
            "membership is defined by events that may happen after the clock starts, and a value "
            "appearing only on end events draws flat at 0% by construction. "
            + _SURVIVAL_CENSORING
            + _SURVIVAL_ANCHORING
        ),
        tasks=(
            "Compare observed survival across overlapping categories a subject recorded at any "
            "point; see which attributes ever present coincide with worse survival."
        ),
        review_hint=(
            "Cohorts overlap heavily by design — expect the sizes to sum to well over the subject "
            "count. Check the labels name individual values and not combined strings like "
            "'Leptomeningeal;Spine'; if they show combinations, unnest did not run. Requires "
            "browser (interactive) mode: the SQL backend rejects unnest. As with the single-valued "
            "'ever' variant, judge whether a reader could mistake these overlapping curves for a "
            "partition."
        ),
        preview_bindings={
            "E": "Event",
            "F1": "research_id",
            "F2": "event_type",
            "F3": "event_date",
            "F4": "metastasis_location",
            "V1": PREVIEW_START_EVENT,
            "V2": PREVIEW_END_EVENT,
        },
    )

    # Stratified by a field in a RELATED table — the protocol a subject was on, the
    # site that enrolled them — joined in on the relationship the schema declares.
    # Membership, like the "ever" reading: a subject with several related records
    # joins a group for each, so cohorts overlap.
    df = add_row(
        df,
        query_templates=[
            "Show survival curves for <E1> split by <E2.F:n>.",
            "Compare survival across <E2.F:n> from the related <E2> table.",
            "Does survival differ by <E2.F:n>?",
        ],
        spec=_survival_chart(
            stratum="<E2.F:n>", reading=StratumReading.RELATED
        ),
        chart_type=ChartType.LINE,
        name_hint="survival_related",
        task_types=[
            TaskType.CHARACTERIZE_DISTRIBUTION,
            TaskType.COMPUTE_DERIVED_VALUE,
            TaskType.CORRELATE,
        ],
        description=(
            "Survival curves split by a field in a RELATED table, from an event log — one row "
            "per event, with a subject id, an event-type column and a numeric time column. Joins "
            "the event log to a second entity on the relationship between them, derives each "
            "subject's elapsed time between a start and an end event type, and plots one curve "
            "per value of the related field. Both tables must name the subject-id column they "
            "share, which is what the join runs on. Use this when the attribute to split by does not "
            "live on the event log itself — a treatment protocol, an enrolling site, a cohort "
            "assignment recorded elsewhere. A subject with several related records joins a group "
            "for each, so the cohorts OVERLAP and the groups do not add up to the whole."
        ),
        design_considerations=(
            "The stratifier is not a column of the event log, so the two entities are joined "
            "first, on the subject-id column each side names. A declared relationship is not "
            "required and usually does not exist: the tables carrying a stratifier are typically "
            "*siblings* of the event log — both hang off a patient table — and what they share is "
            "the subject identifier, which is all the join needs. That join multiplies event rows by the "
            "subject's related records, which is harmless here only because everything after it "
            "reduces by min/max over a (subject, stratum) group — both idempotent under "
            "duplication. A template that counted rows after such a join would silently "
            "over-count, so do not copy this shape into one that aggregates. "
            "Membership is read the same way as the 'ever' variant: a subject's whole span is "
            "carried into every group it belongs to, so one death is attributed to each. The "
            "groups therefore cannot be reconciled with the unstratified curve, and if a reader "
            "would take them for a partition this is the wrong chart. Subjects with no related "
            "record at all drop out of the join and disappear from the cohort entirely, which is "
            "the one way this can show FEWER subjects than the unstratified curve. "
            "IMPORTANT: the related record may itself post-date the start event — a "
            "protocol begun after diagnosis, a site a subject transferred to — so "
            "membership can be defined by something that happened after the clock "
            "started. That is immortal-time bias by construction, and it means a group "
            "whose records only ever appear late will look artificially good; a value "
            "that only ever accompanies an end event produces a group in which everyone "
            "is dead, drawing flat at 0%. "
            + _SURVIVAL_CENSORING
            + _SURVIVAL_ANCHORING
        ),
        tasks=(
            "Compare observed survival across groups defined in another table; see whether a "
            "treatment, protocol or site recorded separately coincides with worse survival."
        ),
        review_hint=(
            "Check the curves are labelled with values from the related table, not the event "
            "log. Cohort sizes overlap and can also be SMALLER in total than the unstratified "
            "curve, since a subject with no related record leaves the join — both are expected "
            "and worth confirming against the data. As with the other overlapping variants, "
            "judge whether a reader could mistake these curves for a partition. Previews with "
            "the therapy table's protocol, where most subjects have several records."
        ),
        preview_bindings={
            "E1": "Event",
            "E2": "Medical Therapy",
            "E1.F1": "research_id",
            "E1.F2": "event_type",
            "E1.F3": "event_date",
            "E2.F1": "research_id",
            "E2.F": "protocol_name_and_arm",
            "V1": PREVIEW_START_EVENT,
            "V2": PREVIEW_END_EVENT,
        },
    )

    # The same cross-table stratifier, but the related column is a delimited LIST —
    # the agents on a chemotherapy regimen, the sites one course of radiation
    # covered. `unnest` runs on the JOINED rows, before the per-subject rollup, so
    # a subject joins every value listed on any of its related records. Overlap
    # therefore compounds twice over: across the subject's related records, and
    # across each record's own list.
    df = add_row(
        df,
        query_templates=[
            "Show survival curves for <E1> split by each <E2.F:n> value.",
            "Compare survival across every <E2.F:n> listed for a subject in <E2>.",
            "Does survival differ by which <E2.F:n> a subject received?",
        ],
        spec=_survival_chart(
            stratum="<E2.F:n>", reading=StratumReading.RELATED, multi_value=True
        ),
        chart_type=ChartType.LINE,
        name_hint="survival_related_multivalue",
        task_types=[
            TaskType.CHARACTERIZE_DISTRIBUTION,
            TaskType.COMPUTE_DERIVED_VALUE,
            TaskType.CORRELATE,
        ],
        description=(
            "Survival curves split by each value of a multi-value (delimited) field in a RELATED "
            "table, from an event log — one row per event, with a subject id, an event-type "
            "column and a numeric time column. Joins the event log to a second entity on the "
            "subject-id column each side names, expands that entity's semicolon-delimited column "
            "so one record listing several values counts toward each of them, derives every "
            "subject's elapsed time between a start and an end event type, and plots one curve "
            "per value. Use this when the attribute to split by lives in another table AND that "
            "column holds a set rather than a single value — the agents making up a chemotherapy "
            "regimen, the sites one course of radiation covered, the conditions listed on a "
            "diagnosis record. The cohorts OVERLAP: a subject joins a group for every value "
            "listed on any of its related records, so the groups do not add up to the whole."
        ),
        design_considerations=(
            "The cross-table and multi-value readings composed: the stratifier is neither a "
            "column of the event log nor single-valued. The two entities are joined first, on "
            "the subject-id column each side names — a declared relationship is not required and "
            "usually does not exist, since the table carrying a stratifier is typically a "
            "*sibling* of the event log, both hanging off a patient table. `unnest` then runs on "
            "the joined rows, before the per-subject rollup, which is what makes membership read "
            "from every value on every related record; expanding after the rollup would instead "
            "read the list off whichever single row the rollup kept. "
            "Both steps multiply rows — the join by the subject's related records, the expansion "
            "by each record's list length — and that is harmless here only because everything "
            "downstream reduces by min/max over a (subject, value) group, which is idempotent "
            "under duplication. A template that counted rows after either step would silently "
            "over-count, so do not copy this shape into one that aggregates. "
            "Overlap compounds accordingly: cohort sizes sum to well above the subject count and "
            "one death is attributed to every value the subject is associated with, so these "
            "curves cannot be reconciled with the unstratified one and must not be read as a "
            "partition. Without the expansion each distinct combination would be its own stratum "
            "— a regimen column with ~20 distinct agents can easily have ~40 combinations, which "
            "also exceeds the 50-cardinality cap for an encoded field. Subjects with no related "
            "record at all drop out of the join and leave the cohort entirely, which is the one "
            "way this can show FEWER subjects in total than the unstratified curve; a related "
            "record whose list is present but empty expands to no rows and contributes to no "
            "group. "
            "The delimiter is a semicolon, matching the other multi-value templates: a "
            "comma-delimited column has to be normalised in the data package first, since a "
            "comma is also what separates fields in the source CSV. "
            "IMPORTANT: the related record may post-date the start event — a regimen begun after "
            "diagnosis, a treatment given on relapse — so membership can be defined by something "
            "that happened after the clock started. That is immortal-time bias by construction: "
            "a subject must survive long enough to be treated at all, so any group defined by "
            "treatment is flattered relative to one that is not, and a value that only ever "
            "accompanies a late record will look artificially good. A value appearing only "
            "alongside an end event gives a group in which everyone is dead, drawing flat at 0%. "
            "This chart describes groups; it does not compare treatments. "
            "Strata are drawn as colours because the grammar has no facet channel. "
            + _SURVIVAL_CENSORING
            + _SURVIVAL_ANCHORING
        ),
        tasks=(
            "Compare observed survival across overlapping categories drawn from a set-valued "
            "column in another table — which agents of a regimen, which sites of a treatment, "
            "coincide with worse survival."
        ),
        review_hint=(
            "Check the end-of-curve labels name individual values (e.g. 'cisplatin') and not "
            "combined strings like 'cisplatin;etoposide'; if they show combinations, unnest did "
            "not run or the column is delimited by something other than a semicolon. Cohort "
            "sizes overlap doubly here — expect them to sum to well over the subject count — "
            "while the total can still be SMALLER than the unstratified cohort, since a subject "
            "with no related record leaves the join. Both are expected; confirm them against the "
            "data rather than treating either as a bug. THE MAIN THING TO JUDGE is whether the "
            "number of curves is legible at all: a list column crossed with a join produces more "
            "strata than any other survival variant, and only the 50-cardinality cap bounds it. "
            "On pcx this draws 42 curves — 43 distinct agents from 37 distinct regimen strings, "
            "under the cap and so not rejected — with cohort sizes summing to 579 over 63 "
            "subjects and 336 death attributions from 34 deaths. Roughly 30 of those curves rest "
            "on one or two subjects. If that is unreadable, the template needs a cardinality "
            "limit rather than a caption. Check too that a sentinel string is not being drawn as "
            "a category: pcx has a 'Not Reported' agent, which the null filter cannot catch "
            "because it is a value, not a null. Requires browser (interactive) mode: the SQL "
            "backend rejects unnest."
        ),
        preview_bindings={
            "E1": "Event",
            "E2": "Medical Therapy",
            "E1.F1": "research_id",
            "E1.F2": "event_type",
            "E1.F3": "event_date",
            "E2.F1": "research_id",
            "E2.F": "chemotherapy_agents",
            "V1": PREVIEW_START_EVENT,
            "V2": PREVIEW_END_EVENT,
        },
    )

    # Stratified by whether the subject appears in another table at all — did this
    # patient receive radiation, have surgery, enrol on any protocol. The
    # stratifier is not a column anywhere, so it is derived from a LEFT join;
    # unlike the other cross-table variant this one PARTITIONS the cohort.
    df = add_row(
        df,
        query_templates=[
            "Show survival curves for <E1> split by whether the subject appears in <E2>.",
            "Compare survival between subjects with and without a <E2> record.",
            "Does survival differ for subjects who have <E2> records?",
            "Survival by whether the patient received <E2>.",
        ],
        spec=_survival_chart(reading=StratumReading.PRESENCE),
        chart_type=ChartType.LINE,
        name_hint="survival_presence",
        task_types=[
            TaskType.CHARACTERIZE_DISTRIBUTION,
            TaskType.COMPUTE_DERIVED_VALUE,
            TaskType.CORRELATE,
        ],
        description=(
            "Survival curves split by PRESENCE OR ABSENCE of the subject in a second table, from "
            "an event log — one row per event, with a subject id, an event-type column and a "
            "numeric time column. Answers 'did this subject receive/undergo/enrol in the thing "
            "that table records' — radiation, surgery, a protocol — where the fact is the "
            "existence of a row, not the value of any column. No field from the second table is "
            "named or plotted; only the shared subject-id column on each side. Exactly two "
            "curves, and they PARTITION the cohort: every subject is in one or the other, so the "
            "two groups add back to the whole and reconcile with the unstratified curve."
        ),
        design_considerations=(
            "Use this, not the related-field variant, when the question is whether a subject has "
            "any record in a table rather than which value it holds. Absence is unanswerable from "
            "an ordinary join, which drops exactly the rows that would have answered 'no', so the "
            "second table is first reduced to one row per subject and LEFT joined; a subject with "
            "no match keeps a null marker and lands in the 'No' group. Reducing before the join "
            "matters twice over: it makes the answer boolean rather than once-per-record, and it "
            "stops the join from multiplying event rows. The two groups are labelled with the "
            "table's own name, so a legend reads e.g. 'Radiation' / 'No Radiation'. "
            + _SURVIVAL_PRESENCE_WINDOW +
            "IMPORTANT: the record establishing presence may post-date the start event — "
            "treatment usually follows diagnosis — so membership can be defined by something "
            "that happened after the clock started. That is immortal-time bias by construction, "
            "and it biases the 'yes' group upward: a subject must survive long enough to be "
            "treated at all, while a subject who died immediately can only ever be a 'no'. Say "
            "so when reporting a difference; a treated-vs-untreated gap read from this chart is "
            "not a treatment effect. "
            + _SURVIVAL_CENSORING
            + _SURVIVAL_ANCHORING
        ),
        tasks=(
            "Compare observed survival between subjects who do and do not appear in another "
            "table — treated vs untreated, operated vs not, enrolled vs not."
        ),
        review_hint=(
            "Expect exactly two curves, named after the second table ('Radiation' / 'No "
            "Radiation'), and expect them to BRACKET the unstratified curve: this reading "
            "partitions the cohort, so two curves on the same side of the pooled one is a bug. "
            "The counts in the labels must add to the unstratified subject count. Previews with "
            "the radiation table, where roughly half the subjects have a record. Judge whether "
            "the immortal-time caveat in the description is visible enough to a reader who sees "
            "only the chart."
        ),
        preview_bindings={
            "E1": "Event",
            "E2": "Radiation",
            "E1.F1": "research_id",
            "E1.F2": "event_type",
            "E1.F3": "event_date",
            "E2.F1": "research_id",
            "V1": PREVIEW_START_EVENT,
            "V2": PREVIEW_END_EVENT,
        },
    )

    # The same idea crossed over TWO tables: radiation only, surgery only, both,
    # neither. Still a partition, now with up to four groups.
    df = add_row(
        df,
        query_templates=[
            "Show survival curves for <E1> split by presence in <E2> and <E3>.",
            "Compare survival across subjects with only <E2>, only <E3>, both or neither.",
            "Does survival differ between subjects who had <E2>, <E3>, both or neither?",
        ],
        spec=_survival_chart(reading=StratumReading.PRESENCE_2X2),
        chart_type=ChartType.LINE,
        name_hint="survival_presence_2x2",
        task_types=[
            TaskType.CHARACTERIZE_DISTRIBUTION,
            TaskType.COMPUTE_DERIVED_VALUE,
            TaskType.CORRELATE,
        ],
        description=(
            "Survival curves for the 2x2 CROSS of presence in two other tables, from an event log "
            "— one row per event, with a subject id, an event-type column and a numeric time "
            "column. Produces up to four curves — second table only, third table only, both, "
            "neither — for questions about combinations of treatments or procedures recorded in "
            "separate tables. No field from either extra table is named or plotted; only the "
            "shared subject-id column on each side. The four groups PARTITION the cohort: every "
            "subject falls in exactly one cell, so they add back to the whole. Use the "
            "single-table presence variant when only one table is in question — four curves for a "
            "two-way question is harder to read for no gain."
        ),
        design_considerations=(
            "Two LEFT joins, each against the other table reduced to one row per subject, so "
            "absence stays visible and neither join multiplies event rows. Each cell is labelled "
            "with the tables it names — '<E2> + <E3>', '<E2> only', '<E3> only', 'Neither' — "
            "rather than a pair of flags, so no decoding is required. "
            + _SURVIVAL_PRESENCE_WINDOW +
            "Cells can be small: with four groups from a modest cohort, a curve may rest on a "
            "handful of subjects, where one death moves it by tens of percent. Read the counts in "
            "the labels before reading the gaps, and prefer the single-table variant when one is "
            "nearly empty. A cell with no subjects simply does not appear, which is easy to "
            "misread as 'nobody had only radiation' when it may mean the tables do not overlap "
            "the way the reader assumes. "
            "IMPORTANT: as with the single-table variant, presence may be established after the "
            "clock started, so every 'had it' cell is immortal-time biased upward relative to "
            "'Neither' — a subject had to survive to be treated. This chart describes groups, it "
            "does not compare treatments. "
            + _SURVIVAL_CENSORING
            + _SURVIVAL_ANCHORING
        ),
        tasks=(
            "Compare observed survival across combinations of two things recorded in separate "
            "tables — radiation only, surgery only, both, neither."
        ),
        review_hint=(
            "Expect up to four curves, labelled by the tables rather than yes/no, and the counts "
            "to add to the unstratified subject count — this is a partition. A missing cell is "
            "legitimate (nobody in that combination) but worth checking against the data rather "
            "than assumed. A cell with no deaths draws flat at 100% and, having no final value "
            "to report, gets no label — with no legend that reads as an unexplained line, and it "
            "is likeliest here, where a cell can hold one subject. On pcx that is 'Neither', and "
            "'Radiation only' is empty: every irradiated patient also had surgery. Judge whether four "
            "curves plus their end labels are still legible at review-card size, and whether the "
            "smallest cell is large enough to be worth drawing."
        ),
        preview_bindings={
            "E1": "Event",
            "E2": "Radiation",
            "E3": "Surgery",
            "E1.F1": "research_id",
            "E1.F2": "event_type",
            "E1.F3": "event_date",
            "E2.F1": "research_id",
            "E3.F1": "research_id",
            "V1": PREVIEW_START_EVENT,
            "V2": PREVIEW_END_EVENT,
        },
    )

    # ---------------------------------------------------------------
    # Heatmaps
    # ---------------------------------------------------------------

    # MERGED: count heatmap (question + utterance)
    df = add_row(
        df,
        query_templates=[
            "Are there any clusters with respect to <E> counts of <F1:n> and <F2:n>?",
            "Make a heatmap of <E> <F1:n> and <F2:n>.",
        ],
        spec=(
            Chart()
            .source("<E>", "<E.url>")
            .groupby(["<F2>", "<F1>"])
            .rollup({"count <E>": Op.count()})
            .derive(
                {
                    "udi_internal_percentile": Expr.binop(
                        "/", Expr.field("count <E>"), Expr.agg("max", "count <E>")
                    )
                }
            )
            .derive(
                {
                    "udi_internal_text_color_threshold": Expr.cond(
                        Expr.binop(
                            ">", Expr.field("udi_internal_percentile"), Expr.lit(0.5)
                        ),
                        Expr.lit("large"),
                        Expr.lit("small"),
                    )
                }
            )
            .mark("rect")
            .color(field="count <E>", type="quantitative")
            .y(field="<F1>", type="nominal")
            .x(field="<F2>", type="nominal")
            .mark("text")
            .text(field="count <E>", type="quantitative")
            .y(field="<F1>", type="nominal")
            .x(field="<F2>", type="nominal")
            .color(
                field="udi_internal_text_color_threshold",
                type="nominal",
                domain=["large", "small"],
                range=["white", "black"],
                omitLegend=True,
            )
        ),
        chart_type=ChartType.HEATMAP,
        task_types=[
            TaskType.CLUSTER,
            TaskType.COMPUTE_DERIVED_VALUE,
            TaskType.CORRELATE,
        ],
        description="Displays the count of entities for each combination of two nominal fields as a heatmap with labeled cells.",
        design_considerations="Rect marks with quantitative color encoding show density. Overlaid text marks display exact counts. Text color adapts based on cell intensity for readability. The field with more unique values is preferably placed on the y-axis, where longer labels remain readable.",
        tasks="Identify clusters or patterns in the co-occurrence of two fields; compare counts across combinations; find correlations.",
    )

    # Aggregate heatmap (average over two nominal fields)
    for name, op in [("average", Op.mean)]:
        named_aggregate = f"{name} <F1>"
        df = add_row(
            df,
            query_templates=[
                f"What is the {name} <F1:q> for each <F2:n> and <F3:n>?",
            ],
            spec=(
                Chart()
                .source("<E>", "<E.url>")
                .groupby(["<F3>", "<F2>"])
                .rollup({named_aggregate: op("<F1:q>")})
                .mark("rect")
                .color(field=named_aggregate, type="quantitative")
                .y(field="<F2>", type="nominal")
                .x(field="<F3>", type="nominal")
            ),
            chart_type=ChartType.HEATMAP,
            task_types=[
                TaskType.CLUSTER,
                TaskType.COMPUTE_DERIVED_VALUE,
                TaskType.CORRELATE,
            ],
            description=f"Displays the {name} of a quantitative field for each combination of two nominal fields as a heatmap.",
            design_considerations=f"Uses three fields: a quantitative measure aggregated by {name}, and two nominal axes. Color encodes the aggregate value. The field with more unique values is preferably placed on the y-axis for better label readability.",
            tasks=f"Identify patterns in the {name} value across two categorical dimensions; find combinations with extreme values.",
        )

    # DATA CUBE: labeled heatmap of the measure across two nominal dimensions
    df = add_row(
        df,
        query_templates=[
            "Are there clusters in the measure across two dimensions?",
            "Make a heatmap across two categorical dimensions.",
        ],
        spec=(
            Chart()
            .source("<E>", "<E.url>")
            .filter("<MARGINAL:D1,D2>")
            .derive(
                {
                    "udi_internal_percentile": Expr.binop(
                        "/", Expr.field("<M>"), Expr.agg("max", "<M>")
                    )
                }
            )
            .derive(
                {
                    "udi_internal_text_color_threshold": Expr.cond(
                        Expr.binop(
                            ">", Expr.field("udi_internal_percentile"), Expr.lit(0.5)
                        ),
                        Expr.lit("large"),
                        Expr.lit("small"),
                    )
                }
            )
            .mark("rect")
            .color(field="<M>", type="quantitative")
            .y(field="<D2:n>", type="nominal")
            .x(field="<D1:n>", type="nominal")
            .mark("text")
            .text(field="<M>", type="quantitative")
            .y(field="<D2:n>", type="nominal")
            .x(field="<D1:n>", type="nominal")
            .color(
                field="udi_internal_text_color_threshold",
                type="nominal",
                domain=["large", "small"],
                range=["white", "black"],
                omitLegend=True,
            )
        ),
        chart_type=ChartType.HEATMAP,
        task_types=[TaskType.CLUSTER, TaskType.COMPUTE_DERIVED_VALUE, TaskType.CORRELATE],
        description="Shows the pre-aggregated cube measure for each combination of two nominal dimensions as a labeled heatmap.",
        design_considerations=(
            _CUBE_MARGINAL_NOTE + " The measure maps to cell color with overlaid contrast-aware "
            "value labels. Prefer the dimension with more categories on the y-axis."
        ),
        tasks="Identify clusters or patterns across two dimensions; compare values across combinations.",
        shape="data_cube",
    )

    # ---------------------------------------------------------------
    # Grouped scatter — clusters with color
    # ---------------------------------------------------------------

    df = add_row(
        df,
        query_templates=[
            "Are there clusters of <E> <F1:q> and <F2:q> values across different <F3:n> groups?",
        ],
        spec=(
            Chart()
            .source("<E>", "<E.url>")
            .mark("point")
            .x(field="<F1>", type="quantitative")
            .y(field="<F2>", type="quantitative")
            .color(field="<F3>", type="nominal")
        ),
        chart_type=ChartType.GROUPED_SCATTER,
        task_types=[
            TaskType.CLUSTER,
        ],
        description="Plots two quantitative fields as a scatterplot with points colored by a nominal field to reveal group-level clusters.",
        design_considerations="Adds color encoding to a standard scatterplot to separate groups visually. Limited to fewer than 8 color categories for perceptual clarity.",
        tasks="Identify clusters that separate by group; assess whether the relationship between two quantitative fields differs across groups.",
    )

    # ---------------------------------------------------------------
    # Histograms
    # ---------------------------------------------------------------

    # MERGED: histogram (question + utterance)
    df = add_row(
        df,
        query_templates=[
            "What is the distribution of <F:q>?",
            "Make a histogram of <F:q>?",
        ],
        spec=(
            Chart()
            .source("<E>", "<E.url>")
            .filter(Expr.not_null("<F>"))
            .binby(field="<F:q>", output={"bin_start": "start", "bin_end": "end"})
            .rollup({"count": Op.count()})
            .mark("rect")
            .x(field="start", type="quantitative", title="<F>")
            .x2(field="end", type="quantitative")
            .y(field="count", type="quantitative", domainWhenFiltered="filtered")
        ),
        chart_type=ChartType.HISTOGRAM,
        task_types=[
            TaskType.CHARACTERIZE_DISTRIBUTION,
        ],
        description="Shows the distribution of a quantitative field as a histogram with automatically computed bins.",
        design_considerations="Uses binby to create equal-width bins. Rect marks span from bin start to bin end on x, with count on y.",
        tasks="Characterize the shape of a distribution; identify modes, skewness, and gaps.",
    )

    # ---------------------------------------------------------------
    # KDE / Area chart
    # ---------------------------------------------------------------

    df = add_row(
        df,
        query_templates=[
            "What is the distribution of <F:q>?",
        ],
        spec=(
            Chart()
            .source("<E>", "<E.url>")
            .filter(Expr.not_null("<F>"))
            .kde(
                field="<F>",
                output={"sample": "<F>", "density": "density"},
            )
            .mark("area")
            .x(field="<F>", type="quantitative")
            .y(field="density", type="quantitative", domainWhenFiltered="filtered")
        ),
        chart_type=ChartType.AREA,
        task_types=[
            TaskType.CHARACTERIZE_DISTRIBUTION,
        ],
        description="Shows the distribution of a quantitative field as a smooth density curve (KDE) rendered as an area chart.",
        design_considerations="Kernel density estimation produces a smooth curve. Area mark fills below the density line. Used for moderate cardinality (50-250) where a smooth estimate is more informative than binning.",
        tasks="Characterize the shape of a distribution; identify modes and overall density patterns.",
    )

    # ---------------------------------------------------------------
    # Dot plots
    # ---------------------------------------------------------------

    # Single-axis dot plot
    df = add_row(
        df,
        query_templates=[
            "What is the distribution of <F:q>?",
        ],
        spec=(
            Chart()
            .source("<E>", "<E.url>")
            .mark("point")
            .x(field="<F>", type="quantitative")
        ),
        chart_type=ChartType.DOT,
        task_types=[
            TaskType.CHARACTERIZE_DISTRIBUTION,
        ],
        description="Shows the distribution of a quantitative field as individual points along a single axis.",
        design_considerations="Point marks on a single quantitative x-axis. Best for small datasets (50 or fewer values) where individual observations are meaningful and overplotting is minimal.",
        tasks="Characterize the distribution; identify individual values, clusters, and outliers.",
    )

    # Grouped KDE / area with line overlay
    df = add_row(
        df,
        query_templates=[
            "Is the distribution of <F1:q> similar for each <F2:n>?",
        ],
        spec=(
            Chart()
            .source("<E>", "<E.url>")
            .filter(Expr.not_null("<F1>"))
            .groupby("<F2>")
            .kde(
                field="<F1>",
                output={"sample": "<F1>", "density": "density"},
            )
            .mark("area")
            .x(field="<F1>", type="quantitative")
            .color(field="<F2>", type="nominal")
            .y(field="density", type="quantitative", domainWhenFiltered="filtered")
            .opacity(value=0.25)
            .mark("line")
            .x(field="<F1>", type="quantitative")
            .color(field="<F2>", type="nominal")
            .y(field="density", type="quantitative", domainWhenFiltered="filtered")
        ),
        chart_type=ChartType.GROUPED_AREA,
        task_types=[
            TaskType.CHARACTERIZE_DISTRIBUTION,
        ],
        description="Compares the distribution of a quantitative field across categories using overlapping density curves (KDE) with area and line marks.",
        design_considerations="Per-group KDE with semi-transparent area fills and line outlines. Color encodes group identity. Limited to fewer than 4 groups to avoid excessive overlap. Opacity set to 0.25 for layering.",
        tasks="Compare distribution shapes across groups; identify shifts in central tendency or spread.",
    )

    # Grouped dot plot
    df = add_row(
        df,
        query_templates=[
            "Is the distribution of <F1:q> similar for each <F2:n>?",
        ],
        spec=(
            Chart()
            .source("<E>", "<E.url>")
            .mark("point")
            .x(field="<F1>", type="quantitative")
            .y(field="<F2>", type="nominal")
            .color(field="<F2>", type="nominal")
        ),
        chart_type=ChartType.GROUPED_DOT,
        task_types=[
            TaskType.CHARACTERIZE_DISTRIBUTION,
        ],
        description="Compares the distribution of a quantitative field across categories using dot strips, with one row per category.",
        design_considerations="Points plotted on a quantitative x-axis with nominal y-axis for group separation. Color reinforces group identity. Best for small datasets (50 or fewer values per group).",
        tasks="Compare distributions across groups; identify clusters and outliers within each group.",
    )

    # ---------------------------------------------------------------
    # Null analysis tables
    # ---------------------------------------------------------------

    # MERGED: non-null count and percentage
    df = add_row(
        df,
        query_templates=[
            "How many <E> records have a non-null <F:q|o|n>?",
            "What percentage of <E> records have a non-null <F:q|o|n>?",
        ],
        spec=(
            Chart()
            .source("<E>", "<E.url>")
            .derive({"<E> Count": Expr.agg("count")})
            .filter(Expr.not_null("<F>"))
            .rollup(
                {"Valid <F> Count": Op.count(), "<E> Count": Op.median("<E> Count")}
            )
            .derive(
                {
                    "Valid <F> %": Expr.binop(
                        "/", Expr.field("Valid <F> Count"), Expr.field("<E> Count")
                    )
                }
            )
            .mark("row")
            .text(field="Valid <F> Count", mark="text", type="nominal")
            .text(field="<E> Count", mark="text", type="nominal")
            .x(
                field="Valid <F> %",
                mark="bar",
                type="quantitative",
                domain={"min": 0, "max": 1},
            )
            .y(
                field="Valid <F> %",
                mark="line",
                type="quantitative",
                range={"min": 0.5, "max": 0.5},
            )
        ),
        chart_type=ChartType.TABLE,
        task_types=[
            TaskType.FILTER,
            TaskType.COMPUTE_DERIVED_VALUE,
        ],
        description="Analyzes data completeness by counting and computing the percentage of records with non-null values in a specified field.",
        design_considerations="Derives total count before filtering, then computes valid count and percentage. Percentage bar with 50% reference line provides visual context for data completeness.",
        tasks="Assess data completeness for a field; determine how many records have valid values and what proportion.",
    )

    # MERGED: null count and percentage
    df = add_row(
        df,
        query_templates=[
            "How many <E> records have a null <F:q|o|n>?",
            "What percentage of <E> records have a null <F:q|o|n>?",
        ],
        spec=(
            Chart()
            .source("<E>", "<E.url>")
            .derive({"<E> Count": Expr.agg("count")})
            .filter(Expr.not_null("<F>"))
            .rollup(
                {"Valid <F> Count": Op.count(), "<E> Count": Op.median("<E> Count")}
            )
            .derive(
                {
                    "Null <F> Count": Expr.binop(
                        "-", Expr.field("<E> Count"), Expr.field("Valid <F> Count")
                    ),
                    "Null <F> %": Expr.binop(
                        "-",
                        Expr.lit(1),
                        Expr.binop(
                            "/", Expr.field("Valid <F> Count"), Expr.field("<E> Count")
                        ),
                    ),
                }
            )
            .mark("row")
            .text(field="Null <F> Count", mark="text", type="nominal")
            .text(field="<E> Count", mark="text", type="nominal")
            .x(
                field="Null <F> %",
                mark="bar",
                type="quantitative",
                domain={"min": 0, "max": 1},
            )
            .y(
                field="Null <F> %",
                mark="line",
                type="quantitative",
                range={"min": 0.5, "max": 0.5},
            )
        ),
        chart_type=ChartType.TABLE,
        task_types=[
            TaskType.FILTER,
            TaskType.COMPUTE_DERIVED_VALUE,
        ],
        description="Analyzes data quality by counting and computing the percentage of records with null values in a specified field.",
        design_considerations="Derives null count as total minus valid count. Percentage bar shows the null proportion with a 50% reference line.",
        tasks="Assess data quality; determine how many records are missing a value and what proportion.",
    )

    return df


if __name__ == "__main__":
    import argparse
    import os

    _default_out = (
        _REPO_ROOT / "src" / "udiagent" / "data" / "skills" / "template_visualizations.json"
    )
    parser = argparse.ArgumentParser(
        description="Generate the unified visualization templates (line-item + data-cube)."
    )
    parser.add_argument("-o", "--output", default=str(_default_out), help="Output template JSON path.")
    parser.add_argument("--grammar", default=str(_GRAMMAR), help="Path to UDIGrammarSchema.json.")
    parser.add_argument(
        "--strict", action="store_true", help="Fail if any template does not conform to the grammar."
    )
    args = parser.parse_args()

    df = generate()

    # Serialize task_types enum values to strings
    df["task_types"] = df["task_types"].apply(lambda x: [t.value for t in x])

    print(f"Generated {len(df)} unique visualization templates.")
    print(f"\nColumns: {list(df.columns)}")
    print(f"\nChart types: {df['chart_type'].value_counts().to_dict()}")
    print(f"Complexity: {df['chart_complexity'].value_counts().to_dict()}")
    print(f"Shapes: {df['tags'].apply(lambda t: t[0]).value_counts().to_dict()}")

    validate_specs(df, args.grammar, strict=args.strict)

    os.makedirs(os.path.dirname(args.output), exist_ok=True)
    # Written with json.dump rather than df.to_json: pandas changed its
    # indent/separator style between versions, so to_json rewrote all 63 records
    # whenever the generating machine's pandas differed — burying the real change
    # in ~2000 lines of whitespace churn. json.dump's formatting is fixed, so
    # regenerating on any machine produces a diff containing only what changed.
    records = df.to_dict(orient="records")
    # Drop empty optional keys rather than writing `"name_hint": ""` onto every
    # record — 60-odd templates don't set one, and the churn would bury the
    # handful that do.
    records = [
        {k: v for k, v in record.items() if k != "name_hint" or v} for record in records
    ]
    with open(args.output, "w") as f:
        json.dump(records, f, indent=2, default=_json_default)
    print(f"\nExported to {args.output}")
