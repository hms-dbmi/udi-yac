"""Generate the *data-cube* visualization template set.

Unlike ``template_viz_generation.py`` (tidy line-item tables re-aggregated with
groupby/rollup/count), this targets a **pre-aggregated powerset cube**: one
measure column (e.g. ``cnt``) plus several dimension columns, where every row is
a marginal/crosstab and *empty* dimension columns mean the row is aggregated
over that dimension.

To read the measure for a set of "active" dimensions you do NOT re-aggregate —
you **filter to the marginal rows** (active dimensions non-null, every other
dimension null) and map the measure directly. Proportional charts apply that
marginal filter first, then compute proportions on top.

Unlike PR #61's original, these templates are **schema-independent**: instead of
baking one cube's dimension names into every filter, each template uses
placeholders resolved against whatever cube schema arrives per request:

    <E>, <E.url>   the cube entity + its data URL
    <M>            the measure column (resolved from the schema's udi:measures)
    <D>, <D1>, <D2>  active dimensions (bound by the model, like line-item <F>)
    <MARGINAL:D>, <MARGINAL:D1,D2>, <MARGINAL>
                   the marginal filter, expanded at runtime from the schema's
                   full dimension list (see vis_generate._resolve_placeholder)

So a single generated cube tool set serves any cube dataset. Chart types that
require per-record data (scatterplot, dot, histogram, CDF/KDE/density) are
impossible on a cube and are omitted.

Every spec is validated against ``UDIGrammarSchema.json`` before being written.

Usage:
    python scripts/template_viz_generation_cube.py \
        -o src/udiagent/data/skills/template_visualizations_cube.json
"""

import argparse
import json
from collections import Counter
from pathlib import Path

import jsonschema

_REPO_ROOT = Path(__file__).resolve().parent.parent
_DEFAULT_OUT = (
    _REPO_ROOT / "src" / "udiagent" / "data" / "skills" / "template_visualizations_cube.json"
)
_GRAMMAR = _REPO_ROOT / "src" / "udiagent" / "data" / "UDIGrammarSchema.json"

TAGS = ["data_cube"]

SOURCE = {"name": "<E>", "source": "<E.url>"}


# ---------------------------------------------------------------------------
# Row assembly (mirrors template_viz_generation.py conventions)
# ---------------------------------------------------------------------------


def _key_count(node):
    if isinstance(node, dict):
        return sum(_key_count(v) for v in node.values())
    if isinstance(node, list):
        return sum(_key_count(v) for v in node)
    return 1


def make_row(query_templates, spec, chart_type, task_types, description,
             design_considerations, tasks):
    n = _key_count(spec)
    if n <= 12:
        complexity = "simple"
    elif n <= 24:
        complexity = "medium"
    elif n <= 36:
        complexity = "complex"
    else:
        complexity = "extra complex"
    return {
        "query_templates": query_templates,
        "spec_template": json.dumps(spec),
        "creation_method": "template",
        "chart_type": chart_type,
        "chart_complexity": complexity,
        "spec_key_count": n,
        "task_types": task_types,
        "tags": list(TAGS),
        "description": description,
        "design_considerations": design_considerations,
        "tasks": tasks,
    }


_MARGINAL_NOTE = (
    "Reads the cube marginal by filtering to rows where the chosen dimension(s) "
    "are present and every other dimension is empty; the measure is mapped "
    "directly with no re-aggregation. The marginal filter is expanded from the "
    "per-request schema's dimension list, so this template works for any cube."
)


# ---------------------------------------------------------------------------
# Template families (all placeholder-based)
# ---------------------------------------------------------------------------


def bar_by_nominal_dim():
    spec = {
        "source": SOURCE,
        "transformation": [{"filter": "<MARGINAL:D>"}],
        "representation": {
            "mark": "bar",
            "mapping": [
                {"encoding": "x", "field": "<D:n>", "type": "nominal"},
                {"encoding": "y", "field": "<M>", "type": "quantitative"},
            ],
        },
    }
    return make_row(
        query_templates=[
            "How many are there by <dimension>?",
            "Make a bar chart of the measure by a categorical dimension.",
        ],
        spec=spec,
        chart_type="barchart",
        task_types=["Compute_Derived_Value", "Determine_Range"],
        description="Shows the pre-aggregated cube measure for each category of a nominal dimension as a bar chart.",
        design_considerations=_MARGINAL_NOTE,
        tasks="Compare the measure across categories; identify the most or least common category.",
    )


def bar_by_quant_dim():
    spec = {
        "source": SOURCE,
        "transformation": [{"filter": "<MARGINAL:D>"}],
        "representation": {
            "mark": "bar",
            "mapping": [
                {"encoding": "x", "field": "<D:q>", "type": "quantitative"},
                {"encoding": "y", "field": "<M>", "type": "quantitative"},
            ],
        },
    }
    return make_row(
        query_templates=["Make a bar chart of the measure across a quantitative dimension."],
        spec=spec,
        chart_type="barchart",
        task_types=["Characterize_Distribution", "Determine_Range"],
        description="Shows the pre-aggregated cube measure across the values of a quantitative dimension as a bar chart.",
        design_considerations=_MARGINAL_NOTE,
        tasks="Assess how the measure is distributed across a numeric dimension.",
    )


def line_over_ordered_dim():
    spec = {
        "source": SOURCE,
        "transformation": [
            {"filter": "<MARGINAL:D>"},
            {"orderby": {"field": "<D>", "order": "asc"}},
        ],
        "representation": {
            "mark": "line",
            "mapping": [
                {"encoding": "x", "field": "<D:o>", "type": "ordinal"},
                {"encoding": "y", "field": "<M>", "type": "quantitative"},
            ],
        },
    }
    return make_row(
        query_templates=[
            "How does the measure change over <dimension>?",
            "Make a line chart of the measure over an ordered (e.g. temporal) dimension.",
        ],
        spec=spec,
        chart_type="line",
        task_types=["Characterize_Distribution", "Determine_Range"],
        description="Shows the pre-aggregated cube measure over an ordered dimension (e.g. time) as a line chart.",
        design_considerations=(
            _MARGINAL_NOTE + " The axis is ordered ascending; a temporal dimension is "
            "encoded as an ordered (ordinal) axis."
        ),
        tasks="Identify trends over time; spot peaks, troughs, and seasonality.",
    )


def circular_by_nominal_dim(donut=False):
    mapping = [
        {"encoding": "theta", "field": "<M>", "type": "quantitative"},
        {"encoding": "color", "field": "<D:n>", "type": "nominal"},
    ]
    if donut:
        mapping.append({"encoding": "radius", "value": 60})
        mapping.append({"encoding": "radius2", "value": 80})
    kind = "donut" if donut else "pie"
    spec = {
        "source": SOURCE,
        "transformation": [{"filter": "<MARGINAL:D>"}],
        "representation": {"mark": "arc", "mapping": mapping},
    }
    return make_row(
        query_templates=[f"Make a {kind} chart of the measure by a categorical dimension."],
        spec=spec,
        chart_type="circular",
        task_types=["Compute_Derived_Value", "Determine_Range"],
        description=f"Shows the proportional cube measure for each category of a nominal dimension as a {kind} chart.",
        design_considerations=(
            _MARGINAL_NOTE + " The measure maps to angle and the renderer normalizes each "
            "slice against the total. Best for a small number of categories."
        ),
        tasks="Assess part-to-whole proportions; identify the dominant category.",
    )


def stacked_bar_two_dims():
    spec = {
        "source": SOURCE,
        "transformation": [{"filter": "<MARGINAL:D1,D2>"}],
        "representation": {
            "mark": "bar",
            "mapping": [
                {"encoding": "x", "field": "<D1:n>", "type": "nominal"},
                {"encoding": "y", "field": "<M>", "type": "quantitative"},
                {"encoding": "color", "field": "<D2:n>", "type": "nominal"},
            ],
        },
    }
    return make_row(
        query_templates=[
            "How many are there by <dimension1> and <dimension2>?",
            "Make a stacked bar chart across two categorical dimensions.",
        ],
        spec=spec,
        chart_type="stacked_bar",
        task_types=["Compute_Derived_Value"],
        description="Shows the pre-aggregated cube measure by two nominal dimensions as a vertical stacked bar chart.",
        design_considerations=(
            _MARGINAL_NOTE + " Color encodes the sub-group; prefer the dimension with "
            "fewer categories for color."
        ),
        tasks="Compare group compositions across categories; identify dominant sub-groups.",
    )


def grouped_bar_two_dims():
    spec = {
        "source": SOURCE,
        "transformation": [{"filter": "<MARGINAL:D1,D2>"}],
        "representation": {
            "mark": "bar",
            "mapping": [
                {"encoding": "x", "field": "<D1:n>", "type": "nominal"},
                {"encoding": "y", "field": "<M>", "type": "quantitative"},
                {"encoding": "xOffset", "field": "<D2:n>", "type": "nominal"},
                {"encoding": "color", "field": "<D2:n>", "type": "nominal"},
            ],
        },
    }
    return make_row(
        query_templates=["Make a grouped (side-by-side) bar chart across two categorical dimensions."],
        spec=spec,
        chart_type="stacked_bar",
        task_types=["Compute_Derived_Value"],
        description="Shows the pre-aggregated cube measure by two nominal dimensions as a grouped (side-by-side) bar chart.",
        design_considerations=(
            _MARGINAL_NOTE + " xOffset gives side-by-side grouping for direct comparison "
            "of the sub-group within each category."
        ),
        tasks="Directly compare sub-group values within and across categories.",
    )


def normalized_bar_two_dims():
    spec = {
        "source": SOURCE,
        "transformation": [
            {"filter": "<MARGINAL:D1,D2>"},
            {"groupby": "<D1>", "out": "groupTotals"},
            {"rollup": {"axis_total": {"op": "sum", "field": "<M>"}}},
            {"groupby": ["<D2>", "<D1>"], "in": "<E>"},
            {"rollup": {"cell_total": {"op": "sum", "field": "<M>"}}},
            {"join": {"on": "<D1>"}, "in": ["<E>", "groupTotals"], "out": "datasets"},
            {"derive": {"proportion": "d['cell_total'] / d['axis_total']"}},
        ],
        "representation": {
            "mark": "bar",
            "mapping": [
                {"encoding": "x", "field": "<D1:n>", "type": "nominal"},
                {"encoding": "y", "field": "proportion", "type": "quantitative"},
                {"encoding": "color", "field": "<D2:n>", "type": "nominal"},
            ],
        },
    }
    return make_row(
        query_templates=["What is the proportion of <dimension2> for each <dimension1>?"],
        spec=spec,
        chart_type="stacked_bar",
        task_types=["Compute_Derived_Value"],
        description="Shows the relative proportion of one nominal dimension within each category of another as a normalized stacked bar chart.",
        design_considerations=(
            "First filters to the two-dimension marginal (expanded from the schema), then "
            "sums the measure per primary-dimension group and divides each cell by its group "
            "total to obtain proportions. Color is preferably the dimension with fewer categories."
        ),
        tasks="Compare relative proportions across categories; identify dominant sub-groups.",
    )


def heatmap_two_dims():
    spec = {
        "source": SOURCE,
        "transformation": [
            {"filter": "<MARGINAL:D1,D2>"},
            {"derive": {"udi_internal_percentile": "d['<M>'] / max(d['<M>'])"}},
            {"derive": {
                "udi_internal_text_color_threshold":
                    "d.udi_internal_percentile > .5 ? 'large' : 'small'"
            }},
        ],
        "representation": [
            {"mark": "rect", "mapping": [
                {"encoding": "color", "field": "<M>", "type": "quantitative"},
                {"encoding": "y", "field": "<D2:n>", "type": "nominal"},
                {"encoding": "x", "field": "<D1:n>", "type": "nominal"},
            ]},
            {"mark": "text", "mapping": [
                {"encoding": "text", "field": "<M>", "type": "quantitative"},
                {"encoding": "y", "field": "<D2:n>", "type": "nominal"},
                {"encoding": "x", "field": "<D1:n>", "type": "nominal"},
                {"encoding": "color", "field": "udi_internal_text_color_threshold",
                 "type": "nominal", "domain": ["large", "small"],
                 "range": ["white", "black"], "omitLegend": True},
            ]},
        ],
    }
    return make_row(
        query_templates=[
            "Are there clusters in the measure across two dimensions?",
            "Make a heatmap across two categorical dimensions.",
        ],
        spec=spec,
        chart_type="heatmap",
        task_types=["Cluster", "Compute_Derived_Value", "Correlate"],
        description="Shows the pre-aggregated cube measure for each combination of two nominal dimensions as a labeled heatmap.",
        design_considerations=(
            _MARGINAL_NOTE + " The measure maps to cell color with overlaid contrast-aware "
            "value labels. Prefer the dimension with more categories on the y-axis."
        ),
        tasks="Identify clusters or patterns across two dimensions; compare values across combinations.",
    )


def total_table():
    spec = {
        "source": SOURCE,
        "transformation": [{"filter": "<MARGINAL>"}],
        "representation": {
            "mark": "row",
            "mapping": [{"encoding": "text", "field": "<M>", "mark": "text", "type": "nominal"}],
        },
    }
    return make_row(
        query_templates=["What is the grand total of the measure?", "How many are there in total?"],
        spec=spec,
        chart_type="table",
        task_types=["Retrieve_Value", "Compute_Derived_Value"],
        description="Shows the grand-total cube measure as a single-row table.",
        design_considerations=(
            "Reads the grand-total row directly by filtering to the marginal where every "
            "dimension is empty; no aggregation is performed."
        ),
        tasks="Retrieve the overall total.",
    )


def count_table_by_nominal_dim():
    spec = {
        "source": SOURCE,
        "transformation": [
            {"filter": "<MARGINAL:D>"},
            {"orderby": {"field": "<M>", "order": "desc"}},
        ],
        "representation": {
            "mark": "row",
            "mapping": [
                {"encoding": "text", "field": "<D:n>", "mark": "text", "type": "nominal"},
                {"encoding": "x", "field": "<M>", "mark": "bar",
                 "type": "quantitative", "range": {"min": 0.1, "max": 1}},
            ],
        },
    }
    return make_row(
        query_templates=[
            "List the measure for each category of a dimension.",
            "What is the range of values for a dimension?",
        ],
        spec=spec,
        chart_type="table",
        task_types=["Determine_Range", "Sort", "Retrieve_Value"],
        description="Lists each category of a nominal dimension with its pre-aggregated measure as a sorted table with in-cell bars.",
        design_considerations=(
            _MARGINAL_NOTE + " Ordered by the measure descending with in-cell bars for "
            "visual comparison."
        ),
        tasks="Determine the distinct values of a dimension; compare category counts.",
    )


# ---------------------------------------------------------------------------
# Assembly
# ---------------------------------------------------------------------------


def generate():
    return [
        bar_by_nominal_dim(),
        bar_by_quant_dim(),
        line_over_ordered_dim(),
        circular_by_nominal_dim(donut=False),
        circular_by_nominal_dim(donut=True),
        stacked_bar_two_dims(),
        grouped_bar_two_dims(),
        normalized_bar_two_dims(),
        heatmap_two_dims(),
        total_table(),
        count_table_by_nominal_dim(),
    ]


def validate_specs(rows, grammar_path):
    schema = json.loads(Path(grammar_path).read_text())
    for i, row in enumerate(rows):
        spec = json.loads(row["spec_template"])
        try:
            jsonschema.validate(instance=spec, schema=schema)
        except jsonschema.ValidationError as e:
            raise SystemExit(
                f"Cube spec {i} ({row['chart_type']}) failed grammar validation: {e.message}"
            )


def main():
    parser = argparse.ArgumentParser(description="Generate schema-independent data-cube visualization templates.")
    parser.add_argument("-o", "--output", default=str(_DEFAULT_OUT), help="Output template JSON path.")
    parser.add_argument("--grammar", default=str(_GRAMMAR), help="Path to UDIGrammarSchema.json.")
    args = parser.parse_args()

    rows = generate()
    validate_specs(rows, args.grammar)
    Path(args.output).write_text(json.dumps(rows, indent=2) + "\n")

    print(f"Generated {len(rows)} data-cube visualization templates.")
    print("Chart types:", dict(Counter(r["chart_type"] for r in rows)))
    print(f"Validated against grammar: {args.grammar}")
    print(f"Exported to {args.output}")


if __name__ == "__main__":
    main()
