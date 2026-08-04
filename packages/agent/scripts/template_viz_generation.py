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


def _placeholder_base(placeholder: str) -> str:
    """``"<F4:n>"`` -> ``"<F4>"`` — drop the type suffix but keep the brackets.

    Getting this wrong is silent and destructive: a bare ``"<F4"`` leaves the
    placeholder unterminated, so the resolver's ``<([^>]+)>`` match runs past it
    and swallows the surrounding JSON.
    """
    return re.sub(r":[^>]+>", ">", placeholder)


def _survival_chart(stratum: str | None = None, unnest_stratum: bool = False):
    """Build the shared survival pipeline.

    Survival time is not a column in an event log — it is the gap between two
    events for the same subject — so the whole pipeline exists to reconstruct it
    before anything can be plotted. Shared by the three survival templates so
    they cannot drift apart.

    `stratum` is the placeholder to split by (None for a single curve);
    `unnest_stratum` expands a delimited multi-value stratum first.
    """
    chart = Chart().source("<E>", "<E.url>")

    if unnest_stratum:
        # Must precede everything that counts rows.
        chart = chart.unnest("<F4:n>", separator=";")

    chart = chart.filter(Expr.not_null("<F3:q>")).derive(
        {
            "start day": Expr.cond(
                Expr.binop("==", Expr.field("<F2:n>"), Expr.lit("<V1>")),
                Expr.field("<F3>"),
                Expr.lit(None),
            ),
            "end day": Expr.cond(
                Expr.binop("==", Expr.field("<F2>"), Expr.lit("<V2>")),
                Expr.field("<F3>"),
                Expr.lit(None),
            ),
        }
    )

    # One row per subject (per stratum, when stratified, so the stratum survives
    # the rollup). min/max ignore the nulls the conditionals leave behind.
    subject_key = "<F1:n>"
    group_keys = [subject_key] + ([stratum] if stratum else [])
    chart = chart.groupby(group_keys if stratum else subject_key).rollup(
        {"start day": Op.min("start day"), "end day": Op.max("end day")}
    )

    # The cohort is everyone with a start event, counted BEFORE anyone is dropped
    # for lacking an end event — that is what makes the curve level off at the
    # observed survival fraction instead of falling to zero.
    chart = chart.filter(Expr.not_null("start day"))
    if stratum:
        # Re-group so each curve is a fraction of its own cohort.
        chart = chart.groupby(_placeholder_base(stratum))
    chart = chart.derive({"subjects": Expr.agg("count")})

    # Subjects with no end event sit at day 0 and contribute no drop. That is
    # what puts the curve's first point at (0, 100%) — the grammar cannot
    # synthesize a leading row, but these subjects legitimately belong there.
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
    chart = chart.orderby("survival days")

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
    # Anchor for the end-of-line label, nudged just past the last event so the
    # centred text is not clipped at the plot edge. Purely an annotation anchor.
    chart = chart.derive(
        {
            "label day": Expr.binop(
                "*", Expr.agg("max", "survival days"), Expr.lit(1.12)
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
    chart = chart.derive({"first day": Expr.agg("min", "survival days")})
    chart = chart.derive(
        {
            "lead day": Expr.cond(
                Expr.binop("==", Expr.rank(), Expr.lit(1)),
                Expr.lit(0),
                Expr.cond(
                    Expr.binop("==", Expr.rank(), Expr.lit(2)),
                    Expr.field("first day"),
                    Expr.lit(None),
                ),
            )
        }
    )
    chart = chart.derive(
        {
            "rule day": Expr.cond(
                Expr.binop("==", Expr.rank(), Expr.lit(1)),
                Expr.field("label day"),
                Expr.cond(
                    Expr.binop(
                        "==",
                        Expr.field("survival percentage"),
                        Expr.field("final percentage"),
                    ),
                    Expr.field("survival days"),
                    Expr.lit(None),
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
    chart = chart.derive(
        {
            "final label": Expr.concat(
                ([Expr.field(_placeholder_base(stratum))] if stratum else [])
                + ([Expr.lit(" ")] if stratum else [])
                + [Expr.field("final survival"), Expr.lit("%")]
            )
        }
    )

    # --- layers: the curve, a dashed reference line at the final value, and its
    # numeric label just right of where the line ends.
    # Flat 100% lead-in, before the curve so the curve draws over it.
    chart = (
        chart.mark("line")
        .x(field="lead day", type="quantitative", title="survival days", domain={"min": 0})
        .y(field="full survival", type="quantitative", domain={"min": 0, "max": 100})
    )
    if stratum:
        chart = chart.color(
            field=_placeholder_base(stratum), type="nominal", omitLegend=True
        )

    chart = (
        chart.mark("line")
        .x(field="survival days", type="quantitative", title="survival days", domain={"min": 0})
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
        .x(field="rule day", type="quantitative", title="survival days", domain={"min": 0})
        .y(field="final percentage", type="quantitative", domain={"min": 0, "max": 100})
    )
    if stratum:
        chart = chart.color(field=_placeholder_base(stratum), type="nominal", omitLegend=True)

    chart = (
        chart.mark("text")
        # Right-aligned and lifted clear of the rule: a centred label would sit
        # across the dashes and read as a strikethrough.
        .place(align="right", dy=-9)
        .x(field="label day", type="quantitative", title="survival days", domain={"min": 0})
        .y(field="final percentage", type="quantitative", domain={"min": 0, "max": 100})
        .text(field="final label", type="nominal")
    )
    if stratum:
        chart = chart.color(field=_placeholder_base(stratum), type="nominal", omitLegend=True)

    if stratum:
        chart = chart.title(_placeholder_base(stratum))

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
            "The curve starts at (0, 100%) because subjects who never reach the end event sit at day 0 and contribute no drop; a group in which every subject reached the end event therefore has nobody at day 0 and its curve begins at its first event instead. The dashed rule and its number mark the final value."
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

    # Stratified: one curve per category of a single-valued nominal field
    # (organization, diagnosis category, metastasis yes/no). Each subject belongs
    # to exactly one stratum, so the cohort splits cleanly and each curve gets its
    # own denominator. Delimited multi-value columns do NOT work here — the next
    # template handles those.
    df = add_row(
        df,
        query_templates=[
            "Show survival curves for <E> split by <F4:n>.",
            "Compare survival between <F4:n> groups.",
            "Does survival differ by <F4:n>?",
        ],
        spec=_survival_chart(stratum="<F4:n>"),
        chart_type=ChartType.LINE,
        task_types=[
            TaskType.CHARACTERIZE_DISTRIBUTION,
            TaskType.COMPUTE_DERIVED_VALUE,
            TaskType.CORRELATE,
        ],
        description=(
            "Survival curves split by a nominal field, from an event log — one row per event, "
            "with a subject id, an event-type column and a numeric time column. Given a start "
            "and an end event type, derives each subject's elapsed time between them and plots "
            "one curve per category, each against its own cohort."
        ),
        design_considerations=(
            "Groups by subject and stratum together so the stratum survives the per-subject "
            "rollup, then re-groups by stratum so each curve's denominator is its own cohort — "
            "otherwise the curves would be fractions of the whole table and would not each start "
            "near 1. Strata are drawn as colours because the grammar has no facet channel. "
            "Only for single-valued fields: a delimited multi-value column would make every distinct "
            "combination its own stratum — use the multi-value variant for those. "
            "The same censoring caveat as the unstratified survival curve applies, and it bites "
            "harder here: subjects with no end event hold their stratum's curve up, so comparing "
            "groups whose follow-up differs is misleading. This is not a Kaplan-Meier estimate "
            "and carries no significance test. Strata are also unequal in size, and a small one "
            "steps coarsely (n=4 moves in quarters), so a dramatic-looking curve may rest on a "
            "handful of subjects."
            "The curve starts at (0, 100%) because subjects who never reach the end event sit at day 0 and contribute no drop; a group in which every subject reached the end event therefore has nobody at day 0 and its curve begins at its first event instead. The dashed rule and its number mark the final value."
        ),
        tasks=(
            "Compare survival between groups; judge whether an attribute is associated with "
            "worse or better observed survival."
        ),
        review_hint=(
            "Each curve should start at 1 - 1/n for its own stratum, so a small group starts "
            "visibly lower and steps coarsely: a stratum of 4 starts at 0.75 and moves in quarters. "
            "That is correct, not a denominator bug — the failure to look for is a curve starting "
            "near 1/(total cohort) instead. A tiny stratum reaching zero looks dramatic and means "
            "very little, which is the main thing to be wary of. The event types are supplied per "
            "request, and there is no at-risk weighting or significance test, so do not read group "
            "differences as real."
        ),
        preview_bindings={
            "E": "Event",
            "F1": "research_id",
            "F2": "event_type",
            "F3": "event_date",
            "F4": "organization_name",
            "V1": PREVIEW_START_EVENT,
            "V2": PREVIEW_END_EVENT,
        },
    )

    # Stratified by a LIST-valued field. Such columns hold ";"-delimited sets, so a
    # subject belongs to several strata at once. `unnest` expands the column to one
    # row per value before anything else runs; without it each distinct combination
    # becomes its own stratum.
    df = add_row(
        df,
        query_templates=[
            "Show survival curves for <E> split by each <F4:n> value.",
            "Compare survival across <F4:n>, where a subject can have several.",
        ],
        spec=_survival_chart(stratum="<F4:n>", unnest_stratum=True),
        chart_type=ChartType.LINE,
        task_types=[
            TaskType.CHARACTERIZE_DISTRIBUTION,
            TaskType.COMPUTE_DERIVED_VALUE,
            TaskType.CORRELATE,
        ],
        description=(
            "Survival curves split by each value of a multi-value (delimited) field, from an "
            "event log — one row per event, with a subject id, an event-type column and a "
            "numeric time column. Expands the multi-value field so a subject counts toward every "
            "value it lists, derives each subject's elapsed time between a start and an end event "
            "type, then plots one curve per value."
        ),
        design_considerations=(
            "For set-valued columns such as tumor locations, where one subject can belong to "
            "several categories. `unnest` runs first, before any row counting, so the per-subject "
            "rollup sees one row per (subject, value) pair. The cohorts therefore overlap by "
            "design and their sizes sum to more than the number of subjects — that is the correct "
            "reading of a multi-value attribute, but it means the curves are not independent and "
            "must not be compared as if they partitioned the cohort. Without unnest each distinct "
            "combination would be its own stratum — a column with ~20 real values can easily have "
            "~80 combinations, which also exceeds the 50-cardinality cap for an encoded field. "
            "Every caveat from the "
            "single-valued stratified curve still applies — no censoring, no at-risk weighting, "
            "no significance test, and small cohorts step coarsely. A value whose subjects have "
            "no end event at all still appears, as a flat line held at 100% — that is a real "
            "reading of the data (nobody in it reached the end event), not a rendering artefact, "
            "though with a handful of subjects it means very little. "
            "The curve starts at (0, 100%) because subjects who never reach the end event sit at day 0 and contribute no drop; a group in which every subject reached the end event therefore has nobody at day 0 and its curve begins at its first event instead. The dashed rule and its number mark the final value."
        ),
        tasks=(
            "Compare observed survival across overlapping categories; see which of a subject's "
            "several attributes coincide with worse survival."
        ),
        review_hint=(
            "Cohort sizes overlap here, so they sum to more than the subject count — that is "
            "intended. Check the legend shows individual values (e.g. 'Spine', 'Brain') and not "
            "combined strings like 'Leptomeningeal;Spine'; if it shows combinations, unnest did "
            "not run. Requires browser (interactive) mode: the SQL backend rejects unnest."
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
    with open(args.output, "w") as f:
        json.dump(records, f, indent=2, default=_json_default)
    print(f"\nExported to {args.output}")
