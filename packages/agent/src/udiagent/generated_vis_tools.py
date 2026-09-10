"""
Auto-generated visualization tool definitions.

Generated from: src/udiagent/data/skills/template_visualizations.json
Tools: 63

Schema-independent: tool params are free-form strings resolved against the
per-request data schema at runtime (see vis_generate._execute_generate).
TOOL_TAGS maps each tool to its template tags for per-request selection.
TOOL_TEXT carries the user-facing title/summary templates.

DO NOT EDIT — regenerate with: python scripts/regenerate_vis_tools.py
"""


# Spec template strings (indexed by position)
TEMPLATES = ['{"source": {"name": "<E>", "source": "<E.url>"}, "transformation": [{"groupby": "<F>"}, {"rollup": {"<E> count": '
 '{"op": "count"}}}], "representation": {"mark": "bar", "mapping": [{"encoding": "x", "field": "<F>", "type": '
 '"nominal"}, {"encoding": "y", "field": "<E> count", "type": "quantitative"}]}}',
 '{"source": {"name": "<E>", "source": "<E.url>"}, "transformation": [{"groupby": "<F>"}, {"rollup": {"<E> count": '
 '{"op": "count"}}}], "representation": {"mark": "bar", "mapping": [{"encoding": "x", "field": "<E> count", "type": '
 '"quantitative"}, {"encoding": "y", "field": "<F>", "type": "nominal"}]}}',
 '{"source": [{"name": "<E1>", "source": "<E1.url>"}, {"name": "<E2>", "source": "<E2.url>"}], "transformation": '
 '[{"join": {"on": ["<E1.r.E2.id.from>", "<E1.r.E2.id.to>"]}, "in": ["<E1>", "<E2>"], "out": "<E1>__<E2>"}, '
 '{"groupby": "<E2.F>"}, {"rollup": {"<E1> count": {"op": "count"}}}], "representation": {"mark": "bar", "mapping": '
 '[{"encoding": "x", "field": "<E2.F>", "type": "nominal"}, {"encoding": "y", "field": "<E1> count", "type": '
 '"quantitative"}]}}',
 '{"source": [{"name": "<E1>", "source": "<E1.url>"}, {"name": "<E2>", "source": "<E2.url>"}], "transformation": '
 '[{"join": {"on": ["<E1.r.E2.id.from>", "<E1.r.E2.id.to>"]}, "in": ["<E1>", "<E2>"], "out": "<E1>__<E2>"}, '
 '{"groupby": "<E2.F>"}, {"rollup": {"<E1> count": {"op": "count"}}}], "representation": {"mark": "bar", "mapping": '
 '[{"encoding": "x", "field": "<E1> count", "type": "quantitative"}, {"encoding": "y", "field": "<E2.F>", "type": '
 '"nominal"}]}}',
 '{"source": {"name": "<E>", "source": "<E.url>"}, "transformation": [{"filter": "<MARGINAL:D>"}], "representation": '
 '{"mark": "bar", "mapping": [{"encoding": "x", "field": "<D:n>", "type": "nominal"}, {"encoding": "y", "field": '
 '"<M>", "type": "quantitative"}]}}',
 '{"source": {"name": "<E>", "source": "<E.url>"}, "transformation": [{"filter": "<MARGINAL:D>"}], "representation": '
 '{"mark": "bar", "mapping": [{"encoding": "x", "field": "<D:q>", "type": "quantitative"}, {"encoding": "y", "field": '
 '"<M>", "type": "quantitative"}]}}',
 '{"source": [{"name": "<E1>", "source": "<E1.url>"}, {"name": "<E2>", "source": "<E2.url>"}], "transformation": '
 '[{"join": {"on": ["<E1.r.E2.id.from>", "<E1.r.E2.id.to>"]}, "in": ["<E1>", "<E2>"], "out": "<E1>__<E2>"}, '
 '{"groupby": ["<E2.F2>", "<E1.F1>"]}, {"rollup": {"count <E1>": {"op": "count"}}}], "representation": {"mark": "bar", '
 '"mapping": [{"encoding": "y", "field": "count <E1>", "type": "quantitative"}, {"encoding": "color", "field": '
 '"<E2.F2>", "type": "nominal"}, {"encoding": "x", "field": "<E1.F1>", "type": "nominal"}]}}',
 '{"source": [{"name": "<E1>", "source": "<E1.url>"}, {"name": "<E2>", "source": "<E2.url>"}], "transformation": '
 '[{"join": {"on": ["<E1.r.E2.id.from>", "<E1.r.E2.id.to>"]}, "in": ["<E1>", "<E2>"], "out": "<E1>__<E2>"}, '
 '{"groupby": ["<E2.F2>", "<E1.F1>"]}, {"rollup": {"count <E1>": {"op": "count"}}}], "representation": {"mark": "bar", '
 '"mapping": [{"encoding": "x", "field": "count <E1>", "type": "quantitative"}, {"encoding": "color", "field": '
 '"<E1.F1>", "type": "nominal"}, {"encoding": "y", "field": "<E2.F2>", "type": "nominal"}]}}',
 '{"source": {"name": "<E>", "source": "<E.url>"}, "transformation": [{"groupby": ["<F2>", "<F1>"]}, {"rollup": '
 '{"count <E>": {"op": "count"}}}], "representation": {"mark": "bar", "mapping": [{"encoding": "y", "field": "count '
 '<E>", "type": "quantitative"}, {"encoding": "color", "field": "<F1>", "type": "nominal"}, {"encoding": "x", "field": '
 '"<F2>", "type": "nominal"}]}}',
 '{"source": {"name": "<E>", "source": "<E.url>"}, "transformation": [{"groupby": ["<F1>", "<F2>"]}, {"rollup": '
 '{"count <E>": {"op": "count"}}}], "representation": {"mark": "bar", "mapping": [{"encoding": "x", "field": "count '
 '<E>", "type": "quantitative"}, {"encoding": "color", "field": "<F1>", "type": "nominal"}, {"encoding": "y", "field": '
 '"<F2>", "type": "nominal"}]}}',
 '{"source": {"name": "<E>", "source": "<E.url>"}, "transformation": [{"filter": "<MARGINAL:D1,D2>"}], '
 '"representation": {"mark": "bar", "mapping": [{"encoding": "x", "field": "<D1:n>", "type": "nominal"}, {"encoding": '
 '"y", "field": "<M>", "type": "quantitative"}, {"encoding": "color", "field": "<D2:n>", "type": "nominal"}]}}',
 '{"source": {"name": "<E>", "source": "<E.url>"}, "transformation": [{"groupby": ["<F1>", "<F2>"]}, {"rollup": '
 '{"count <E>": {"op": "count"}}}], "representation": {"mark": "bar", "mapping": [{"encoding": "y", "field": "count '
 '<E>", "type": "quantitative"}, {"encoding": "xOffset", "field": "<F1>", "type": "nominal"}, {"encoding": "color", '
 '"field": "<F1>", "type": "nominal"}, {"encoding": "x", "field": "<F2>", "type": "nominal"}]}}',
 '{"source": {"name": "<E>", "source": "<E.url>"}, "transformation": [{"groupby": ["<F1>", "<F2>"]}, {"rollup": '
 '{"count <E>": {"op": "count"}}}], "representation": {"mark": "bar", "mapping": [{"encoding": "x", "field": "count '
 '<E>", "type": "quantitative"}, {"encoding": "yOffset", "field": "<F1>", "type": "nominal"}, {"encoding": "color", '
 '"field": "<F1>", "type": "nominal"}, {"encoding": "y", "field": "<F2>", "type": "nominal"}]}}',
 '{"source": {"name": "<E>", "source": "<E.url>"}, "transformation": [{"filter": "<MARGINAL:D1,D2>"}], '
 '"representation": {"mark": "bar", "mapping": [{"encoding": "x", "field": "<D1:n>", "type": "nominal"}, {"encoding": '
 '"y", "field": "<M>", "type": "quantitative"}, {"encoding": "xOffset", "field": "<D2:n>", "type": "nominal"}, '
 '{"encoding": "color", "field": "<D2:n>", "type": "nominal"}]}}',
 '{"source": {"name": "<E>", "source": "<E.url>"}, "transformation": [{"groupby": "<F2>", "out": "groupCounts"}, '
 '{"rollup": {"<F2>_count": {"op": "count"}}}, {"groupby": ["<F1>", "<F2>"], "in": "<E>"}, {"rollup": '
 '{"<F1>_and_<F2>_count": {"op": "count"}}}, {"join": {"on": "<F2>"}, "in": ["<E>", "groupCounts"], "out": '
 '"datasets"}, {"derive": {"proportion": {"op": "/", "left": {"field": "<F1>_and_<F2>_count"}, "right": {"field": '
 '"<F2>_count"}}}}], "representation": {"mark": "bar", "mapping": [{"encoding": "y", "field": "proportion", "type": '
 '"quantitative"}, {"encoding": "color", "field": "<F1>", "type": "nominal"}, {"encoding": "x", "field": "<F2>", '
 '"type": "nominal"}]}}',
 '{"source": {"name": "<E>", "source": "<E.url>"}, "transformation": [{"groupby": "<F2>", "out": "groupCounts"}, '
 '{"rollup": {"<F2>_count": {"op": "count"}}}, {"groupby": ["<F1>", "<F2>"], "in": "<E>"}, {"rollup": '
 '{"<F1>_and_<F2>_count": {"op": "count"}}}, {"join": {"on": "<F2>"}, "in": ["<E>", "groupCounts"], "out": '
 '"datasets"}, {"derive": {"proportion": {"op": "/", "left": {"field": "<F1>_and_<F2>_count"}, "right": {"field": '
 '"<F2>_count"}}}}], "representation": {"mark": "bar", "mapping": [{"encoding": "x", "field": "proportion", "type": '
 '"quantitative"}, {"encoding": "color", "field": "<F1>", "type": "nominal"}, {"encoding": "y", "field": "<F2>", '
 '"type": "nominal"}]}}',
 '{"source": {"name": "<E>", "source": "<E.url>"}, "transformation": [{"filter": "<MARGINAL:D1,D2>"}, {"groupby": '
 '"<D1>", "out": "groupTotals"}, {"rollup": {"axis_total": {"op": "sum", "field": "<M>"}}}, {"groupby": ["<D2>", '
 '"<D1>"], "in": "<E>"}, {"rollup": {"cell_total": {"op": "sum", "field": "<M>"}}}, {"join": {"on": "<D1>"}, "in": '
 '["<E>", "groupTotals"], "out": "datasets"}, {"derive": {"proportion": {"op": "/", "left": {"field": "cell_total"}, '
 '"right": {"field": "axis_total"}}}}], "representation": {"mark": "bar", "mapping": [{"encoding": "x", "field": '
 '"<D1:n>", "type": "nominal"}, {"encoding": "y", "field": "proportion", "type": "quantitative"}, {"encoding": '
 '"color", "field": "<D2:n>", "type": "nominal"}]}}',
 '{"source": {"name": "<E>", "source": "<E.url>"}, "transformation": [{"groupby": "<F2>"}, {"rollup": {"minimum <F1>": '
 '{"op": "min", "field": "<F1>"}}}], "representation": {"mark": "bar", "mapping": [{"encoding": "x", "field": "minimum '
 '<F1>", "type": "quantitative"}, {"encoding": "y", "field": "<F2>", "type": "nominal"}]}}',
 '{"source": {"name": "<E>", "source": "<E.url>"}, "transformation": [{"groupby": "<F2>"}, {"rollup": {"minimum <F1>": '
 '{"op": "min", "field": "<F1>"}}}], "representation": {"mark": "bar", "mapping": [{"encoding": "x", "field": "<F2>", '
 '"type": "nominal"}, {"encoding": "y", "field": "minimum <F1>", "type": "quantitative"}]}}',
 '{"source": {"name": "<E>", "source": "<E.url>"}, "transformation": [{"groupby": "<F2>"}, {"rollup": {"maximum <F1>": '
 '{"op": "max", "field": "<F1>"}}}], "representation": {"mark": "bar", "mapping": [{"encoding": "x", "field": "maximum '
 '<F1>", "type": "quantitative"}, {"encoding": "y", "field": "<F2>", "type": "nominal"}]}}',
 '{"source": {"name": "<E>", "source": "<E.url>"}, "transformation": [{"groupby": "<F2>"}, {"rollup": {"maximum <F1>": '
 '{"op": "max", "field": "<F1>"}}}], "representation": {"mark": "bar", "mapping": [{"encoding": "x", "field": "<F2>", '
 '"type": "nominal"}, {"encoding": "y", "field": "maximum <F1>", "type": "quantitative"}]}}',
 '{"source": {"name": "<E>", "source": "<E.url>"}, "transformation": [{"groupby": "<F2>"}, {"rollup": {"average <F1>": '
 '{"op": "mean", "field": "<F1>"}}}], "representation": {"mark": "bar", "mapping": [{"encoding": "x", "field": '
 '"average <F1>", "type": "quantitative"}, {"encoding": "y", "field": "<F2>", "type": "nominal"}]}}',
 '{"source": {"name": "<E>", "source": "<E.url>"}, "transformation": [{"groupby": "<F2>"}, {"rollup": {"average <F1>": '
 '{"op": "mean", "field": "<F1>"}}}], "representation": {"mark": "bar", "mapping": [{"encoding": "x", "field": "<F2>", '
 '"type": "nominal"}, {"encoding": "y", "field": "average <F1>", "type": "quantitative"}]}}',
 '{"source": {"name": "<E>", "source": "<E.url>"}, "transformation": [{"groupby": "<F2>"}, {"rollup": {"median <F1>": '
 '{"op": "median", "field": "<F1>"}}}], "representation": {"mark": "bar", "mapping": [{"encoding": "x", "field": '
 '"median <F1>", "type": "quantitative"}, {"encoding": "y", "field": "<F2>", "type": "nominal"}]}}',
 '{"source": {"name": "<E>", "source": "<E.url>"}, "transformation": [{"groupby": "<F2>"}, {"rollup": {"median <F1>": '
 '{"op": "median", "field": "<F1>"}}}], "representation": {"mark": "bar", "mapping": [{"encoding": "x", "field": '
 '"<F2>", "type": "nominal"}, {"encoding": "y", "field": "median <F1>", "type": "quantitative"}]}}',
 '{"source": {"name": "<E>", "source": "<E.url>"}, "transformation": [{"groupby": "<F2>"}, {"rollup": {"total <F1>": '
 '{"op": "sum", "field": "<F1>"}}}], "representation": {"mark": "bar", "mapping": [{"encoding": "x", "field": "total '
 '<F1>", "type": "quantitative"}, {"encoding": "y", "field": "<F2>", "type": "nominal"}]}}',
 '{"source": {"name": "<E>", "source": "<E.url>"}, "transformation": [{"groupby": "<F2>"}, {"rollup": {"total <F1>": '
 '{"op": "sum", "field": "<F1>"}}}], "representation": {"mark": "bar", "mapping": [{"encoding": "x", "field": "<F2>", '
 '"type": "nominal"}, {"encoding": "y", "field": "total <F1>", "type": "quantitative"}]}}',
 '{"source": {"name": "<E>", "source": "<E.url>"}, "representation": {"mark": "point", "mapping": [{"encoding": "x", '
 '"field": "<F1>", "type": "quantitative"}, {"encoding": "y", "field": "<F2>", "type": "quantitative"}]}}',
 '{"source": {"name": "<E>", "source": "<E.url>"}, "transformation": [{"groupby": ["<F1>", "<F2>"]}, {"rollup": '
 '{"count": {"op": "count"}}}], "representation": {"mark": "bar", "mapping": [{"encoding": "x", "field": "<F1>", '
 '"type": "nominal"}, {"encoding": "y", "field": "count", "type": "quantitative"}, {"encoding": "color", "field": '
 '"<F2>", "type": "nominal"}]}}',
 '{"source": {"name": "<E>", "source": "<E.url>"}, "transformation": [{"groupby": ["<F1>", "<F2>"]}, {"rollup": '
 '{"count": {"op": "count"}}}], "representation": {"mark": "bar", "mapping": [{"encoding": "x", "field": "count", '
 '"type": "quantitative"}, {"encoding": "y", "field": "<F1>", "type": "nominal"}, {"encoding": "color", "field": '
 '"<F2>", "type": "nominal"}]}}',
 '{"source": {"name": "<E>", "source": "<E.url>"}, "transformation": [{"groupby": "<F>"}, {"rollup": {"proportion": '
 '{"op": "frequency"}}}], "representation": {"mark": "arc", "mapping": [{"encoding": "theta", "field": "proportion", '
 '"type": "quantitative", "domainWhenFiltered": "filtered"}, {"encoding": "color", "field": "<F>", "type": '
 '"nominal"}]}}',
 '{"source": {"name": "<E>", "source": "<E.url>"}, "transformation": [{"groupby": "<F>"}, {"rollup": {"proportion": '
 '{"op": "frequency"}}}], "representation": {"mark": "arc", "mapping": [{"encoding": "theta", "field": "proportion", '
 '"type": "quantitative", "domainWhenFiltered": "filtered"}, {"encoding": "color", "field": "<F>", "type": "nominal"}, '
 '{"encoding": "radius", "value": 60}, {"encoding": "radius2", "value": 80}]}}',
 '{"source": {"name": "<E>", "source": "<E.url>"}, "transformation": [{"filter": "<MARGINAL:D>"}], "representation": '
 '{"mark": "arc", "mapping": [{"encoding": "theta", "field": "<M>", "type": "quantitative"}, {"encoding": "color", '
 '"field": "<D:n>", "type": "nominal"}]}}',
 '{"source": {"name": "<E>", "source": "<E.url>"}, "transformation": [{"filter": "<MARGINAL:D>"}], "representation": '
 '{"mark": "arc", "mapping": [{"encoding": "theta", "field": "<M>", "type": "quantitative"}, {"encoding": "color", '
 '"field": "<D:n>", "type": "nominal"}, {"encoding": "radius", "value": 60}, {"encoding": "radius2", "value": 80}]}}',
 '{"source": {"name": "<E>", "source": "<E.url>"}, "transformation": [{"rollup": {"<E> Records": {"op": "count"}}}]}',
 '{"source": {"name": "<E>", "source": "<E.url>"}}',
 '{"source": [{"name": "<E1>", "source": "<E1.url>"}, {"name": "<E2>", "source": "<E2.url>"}], "transformation": '
 '[{"join": {"on": ["<E1.r.E2.id.from>", "<E1.r.E2.id.to>"]}, "in": ["<E1>", "<E2>"], "out": "<E1>__<E2>"}]}',
 '{"source": [{"name": "<E1>", "source": "<E1.url>"}, {"name": "<E2>", "source": "<E2.url>"}], "transformation": '
 '[{"join": {"on": ["<E1.r.E2.id.from>", "<E1.r.E2.id.to>"]}, "in": ["<E1>", "<E2>"], "out": "<E1>__<E2>"}, '
 '{"groupby": "<E1.r.E2.id.from>"}, {"rollup": {"<E1> count": {"op": "count"}}}, {"orderby": {"field": "<E1> count", '
 '"order": "desc"}}, {"derive": {"rank": {"window": "rank"}}}, {"derive": {"most frequent": {"if": {"op": "==", '
 '"left": {"field": "rank"}, "right": {"literal": 1}}, "then": {"literal": "yes"}, "else": {"literal": "no"}}}}], '
 '"representation": [{"mark": "row", "mapping": [{"encoding": "x", "field": "<E1> count", "mark": "bar", "type": '
 '"quantitative", "domain": {"min": 0}}, {"encoding": "color", "column": "<E1> count", "mark": "bar", "field": "most '
 'frequent", "type": "nominal", "domain": ["yes", "no"], "range": ["#FFA500", "#c6cfd8"]}]}, {"mark": "row", '
 '"mapping": {"encoding": "text", "field": "*", "mark": "text", "type": "nominal"}}]}',
 '{"source": {"name": "<E>", "source": "<E.url>"}, "transformation": [{"filter": {"op": "!=", "left": {"field": '
 '"<F>"}, "right": {"literal": null}}}, {"orderby": {"field": "<F>", "order": "desc"}}, {"derive": {"largest": {"if": '
 '{"op": "==", "left": {"window": "rank"}, "right": {"literal": 1}}, "then": {"literal": "largest"}, "else": '
 '{"literal": "not"}}}}], "representation": {"mark": "row", "mapping": [{"encoding": "x", "field": "<F>", "mark": '
 '"bar", "type": "quantitative"}, {"encoding": "color", "column": "<F>", "mark": "bar", "field": "largest", "type": '
 '"nominal", "domain": ["largest", "not"], "range": ["#FFA500", "c6cfd8"]}, {"encoding": "text", "field": "*", "mark": '
 '"text", "type": "nominal"}]}}',
 '{"source": [{"name": "<E1>", "source": "<E1.url>"}, {"name": "<E2>", "source": "<E2.url>"}], "transformation": '
 '[{"join": {"on": ["<E1.r.E2.id.from>", "<E1.r.E2.id.to>"]}, "in": ["<E1>", "<E2>"], "out": "<E1>__<E2>"}, '
 '{"groupby": "<E1.r.E2.id.from>"}, {"rollup": {"Largest <E1.F>": {"op": "max", "field": "<E1.F>"}}}, {"filter": '
 '{"op": "!=", "left": {"field": "Largest <E1.F>"}, "right": {"literal": null}}}, {"orderby": {"field": "Largest '
 '<E1.F>", "order": "desc"}}, {"derive": {"rank": {"window": "rank"}}}, {"derive": {"largest": {"if": {"op": "==", '
 '"left": {"field": "rank"}, "right": {"literal": 1}}, "then": {"literal": "yes"}, "else": {"literal": "no"}}}}], '
 '"representation": {"mark": "row", "mapping": [{"encoding": "x", "field": "Largest <E1.F>", "mark": "bar", "type": '
 '"quantitative"}, {"encoding": "color", "column": "Largest <E1.F>", "mark": "bar", "field": "largest", "type": '
 '"nominal", "domain": ["yes", "no"], "range": ["#FFA500", "#c6cfd8"]}, {"encoding": "text", "field": "*", "mark": '
 '"text", "type": "nominal"}]}}',
 '{"source": {"name": "<E>", "source": "<E.url>"}, "transformation": [{"filter": {"op": "!=", "left": {"field": '
 '"<F>"}, "right": {"literal": null}}}, {"orderby": {"field": "<F>", "order": "asc"}}, {"derive": {"smallest": {"if": '
 '{"op": "==", "left": {"window": "rank"}, "right": {"literal": 1}}, "then": {"literal": "smallest"}, "else": '
 '{"literal": "not"}}}}], "representation": {"mark": "row", "mapping": [{"encoding": "color", "column": "<F>", "mark": '
 '"rect", "orderby": "<F>", "field": "smallest", "type": "nominal", "domain": ["smallest", "not"], "range": '
 '["#ffdb9a", "white"]}, {"encoding": "text", "field": "*", "mark": "text", "type": "nominal"}]}}',
 '{"source": [{"name": "<E1>", "source": "<E1.url>"}, {"name": "<E2>", "source": "<E2.url>"}], "transformation": '
 '[{"join": {"on": ["<E1.r.E2.id.from>", "<E1.r.E2.id.to>"]}, "in": ["<E1>", "<E2>"], "out": "<E1>__<E2>"}, '
 '{"groupby": "<E1.r.E2.id.from>"}, {"rollup": {"Smallest <E1.F>": {"op": "min", "field": "<E1.F>"}}}, {"filter": '
 '{"op": "!=", "left": {"field": "Smallest <E1.F>"}, "right": {"literal": null}}}, {"orderby": {"field": "Smallest '
 '<E1.F>", "order": "asc"}}, {"derive": {"rank": {"window": "rank"}}}, {"derive": {"smallest": {"if": {"op": "==", '
 '"left": {"field": "rank"}, "right": {"literal": 1}}, "then": {"literal": "yes"}, "else": {"literal": "no"}}}}], '
 '"representation": {"mark": "row", "mapping": [{"encoding": "color", "column": "Smallest <E1.F>", "mark": "bar", '
 '"orderby": "Smallest <E1.F>", "field": "smallest", "type": "nominal", "domain": ["yes", "no"], "range": ["#ffdb9a", '
 '"white"]}, {"encoding": "text", "field": "*", "mark": "text", "type": "nominal"}]}}',
 '{"source": {"name": "<E>", "source": "<E.url>"}, "transformation": [{"filter": {"op": "!=", "left": {"field": '
 '"<F>"}, "right": {"literal": null}}}, {"orderby": {"field": "<F>", "order": "asc"}}], "representation": {"mark": '
 '"row", "mapping": [{"encoding": "x", "column": "<F>", "mark": "bar", "field": "<F>", "type": "quantitative", '
 '"range": {"min": 0.2, "max": 1}}, {"encoding": "text", "field": "*", "mark": "text", "type": "nominal"}]}}',
 '{"source": {"name": "<E>", "source": "<E.url>"}, "transformation": [{"filter": {"op": "!=", "left": {"field": '
 '"<F>"}, "right": {"literal": null}}}, {"rollup": {"<F> min": {"op": "min", "field": "<F>"}, "<F> max": {"op": "max", '
 '"field": "<F>"}}}], "representation": {"mark": "row", "mapping": [{"encoding": "text", "field": "<F> min", "mark": '
 '"text", "type": "nominal"}, {"encoding": "text", "field": "<F> max", "mark": "text", "type": "nominal"}]}}',
 '{"source": {"name": "<E>", "source": "<E.url>"}, "transformation": [{"filter": {"op": "!=", "left": {"field": '
 '"<F>"}, "right": {"literal": null}}}, {"groupby": "<F>"}, {"rollup": {"count": {"op": "count"}}}], "representation": '
 '{"mark": "row", "mapping": [{"encoding": "text", "field": "<F>", "mark": "text", "type": "nominal"}, {"encoding": '
 '"x", "field": "count", "mark": "bar", "type": "quantitative", "range": {"min": 0.1, "max": 1}}]}}',
 '{"source": {"name": "<E>", "source": "<E.url>"}, "transformation": [{"filter": {"op": "!=", "left": {"field": '
 '"<F1>"}, "right": {"literal": null}}}, {"groupby": "<F2>"}, {"rollup": {"<F1> min": {"op": "min", "field": "<F1>"}, '
 '"<F1> max": {"op": "max", "field": "<F1>"}}}, {"derive": {"range": {"op": "-", "left": {"field": "<F1> max"}, '
 '"right": {"field": "<F1> min"}}}}, {"orderby": {"field": "range", "order": "desc"}}], "representation": {"mark": '
 '"row", "mapping": [{"encoding": "text", "field": "<F2>", "mark": "text", "type": "nominal"}, {"encoding": "text", '
 '"field": "<F1> min", "mark": "text", "type": "nominal"}, {"encoding": "x", "column": "range", "mark": "bar", '
 '"field": "<F1> min", "type": "quantitative", "domain": {"numberFields": ["<F1> min", "<F1> max"]}}, {"encoding": '
 '"x2", "column": "range", "mark": "bar", "field": "<F1> max", "type": "quantitative", "domain": {"numberFields": '
 '["<F1> min", "<F1> max"]}}, {"encoding": "text", "field": "<F1> max", "mark": "text", "type": "nominal"}]}}',
 '{"source": {"name": "<E>", "source": "<E.url>"}, "transformation": [{"filter": {"field": "<F>"}}, {"groupby": '
 '"<F>"}, {"rollup": {"count": {"op": "count"}}}, {"orderby": {"field": "count", "order": "desc"}}, {"derive": '
 '{"rank": {"window": "rank"}}}, {"derive": {"most frequent": {"if": {"op": "==", "left": {"field": "rank"}, "right": '
 '{"literal": 1}}, "then": {"literal": "yes"}, "else": {"literal": "no"}}}}], "representation": {"mark": "row", '
 '"mapping": [{"encoding": "color", "column": "<F>", "mark": "bar", "orderby": "<F>", "field": "most frequent", '
 '"type": "nominal", "domain": ["yes", "no"], "range": ["#ffdb9a", "white"]}, {"encoding": "text", "field": "<F>", '
 '"mark": "text", "type": "nominal"}, {"encoding": "x", "field": "count", "mark": "bar", "type": "quantitative", '
 '"domain": {"min": 0}}, {"encoding": "color", "column": "count", "mark": "bar", "field": "most frequent", "type": '
 '"nominal", "domain": ["yes", "no"], "range": ["#FFA500", "#c6cfd8"]}]}}',
 '{"source": {"name": "<E>", "source": "<E.url>"}, "transformation": [{"filter": "<MARGINAL>"}], "representation": '
 '{"mark": "row", "mapping": {"encoding": "text", "field": "<M>", "mark": "text", "type": "nominal"}}}',
 '{"source": {"name": "<E>", "source": "<E.url>"}, "transformation": [{"filter": "<MARGINAL:D>"}, {"orderby": '
 '{"field": "<M>", "order": "desc"}}], "representation": {"mark": "row", "mapping": [{"encoding": "text", "field": '
 '"<D:n>", "mark": "text", "type": "nominal"}, {"encoding": "x", "field": "<M>", "mark": "bar", "type": '
 '"quantitative", "range": {"min": 0.1, "max": 1}}]}}',
 '{"source": {"name": "<E>", "source": "<E.url>"}, "transformation": [{"filter": {"op": "!=", "left": {"field": '
 '"<F>"}, "right": {"literal": null}}}, {"orderby": {"field": "<F>", "order": "asc"}}, {"derive": {"total": {"agg": '
 '"count"}}}, {"derive": {"percentile": {"rolling": {"expression": {"op": "/", "left": {"agg": "count"}, "right": '
 '{"field": "total"}}}}}}, {"orderby": {"field": "percentile", "order": "asc"}}], "representation": {"mark": "line", '
 '"mapping": [{"encoding": "x", "field": "<F>", "type": "quantitative"}, {"encoding": "y", "field": "percentile", '
 '"type": "quantitative"}]}}',
 '{"source": {"name": "<E>", "source": "<E.url>"}, "transformation": [{"filter": {"op": "!=", "left": {"field": '
 '"<F1>"}, "right": {"literal": null}}}, {"groupby": "<F2>"}, {"orderby": {"field": "<F1>", "order": "asc"}}, '
 '{"derive": {"total": {"agg": "count"}}}, {"derive": {"percentile": {"rolling": {"expression": {"op": "/", "left": '
 '{"agg": "count"}, "right": {"field": "total"}}}}}}, {"orderby": {"field": "percentile", "order": "asc"}}], '
 '"representation": {"mark": "line", "mapping": [{"encoding": "x", "field": "<F1>", "type": "quantitative"}, '
 '{"encoding": "y", "field": "percentile", "type": "quantitative"}, {"encoding": "color", "field": "<F2>", "type": '
 '"nominal"}]}}',
 '{"source": {"name": "<E>", "source": "<E.url>"}, "transformation": [{"filter": "<MARGINAL:D>"}, {"orderby": '
 '{"field": "<D>", "order": "asc"}}], "representation": {"mark": "line", "mapping": [{"encoding": "x", "field": '
 '"<D:o>", "type": "ordinal"}, {"encoding": "y", "field": "<M>", "type": "quantitative"}]}}',
 '{"source": {"name": "<E>", "source": "<E.url>"}, "transformation": [{"groupby": ["<F2>", "<F1>"]}, {"rollup": '
 '{"count <E>": {"op": "count"}}}, {"derive": {"udi_internal_percentile": {"op": "/", "left": {"field": "count <E>"}, '
 '"right": {"agg": "max", "field": "count <E>"}}}}, {"derive": {"udi_internal_text_color_threshold": {"if": {"op": '
 '">", "left": {"field": "udi_internal_percentile"}, "right": {"literal": 0.5}}, "then": {"literal": "large"}, "else": '
 '{"literal": "small"}}}}], "representation": [{"mark": "rect", "mapping": [{"encoding": "color", "field": "count '
 '<E>", "type": "quantitative"}, {"encoding": "y", "field": "<F1>", "type": "nominal"}, {"encoding": "x", "field": '
 '"<F2>", "type": "nominal"}]}, {"mark": "text", "mapping": [{"encoding": "text", "field": "count <E>", "type": '
 '"quantitative"}, {"encoding": "y", "field": "<F1>", "type": "nominal"}, {"encoding": "x", "field": "<F2>", "type": '
 '"nominal"}, {"encoding": "color", "field": "udi_internal_text_color_threshold", "type": "nominal", "domain": '
 '["large", "small"], "range": ["white", "black"], "omitLegend": true}]}]}',
 '{"source": {"name": "<E>", "source": "<E.url>"}, "transformation": [{"groupby": ["<F3>", "<F2>"]}, {"rollup": '
 '{"average <F1>": {"op": "mean", "field": "<F1>"}}}], "representation": {"mark": "rect", "mapping": [{"encoding": '
 '"color", "field": "average <F1>", "type": "quantitative"}, {"encoding": "y", "field": "<F2>", "type": "nominal"}, '
 '{"encoding": "x", "field": "<F3>", "type": "nominal"}]}}',
 '{"source": {"name": "<E>", "source": "<E.url>"}, "transformation": [{"filter": "<MARGINAL:D1,D2>"}, {"derive": '
 '{"udi_internal_percentile": {"op": "/", "left": {"field": "<M>"}, "right": {"agg": "max", "field": "<M>"}}}}, '
 '{"derive": {"udi_internal_text_color_threshold": {"if": {"op": ">", "left": {"field": "udi_internal_percentile"}, '
 '"right": {"literal": 0.5}}, "then": {"literal": "large"}, "else": {"literal": "small"}}}}], "representation": '
 '[{"mark": "rect", "mapping": [{"encoding": "color", "field": "<M>", "type": "quantitative"}, {"encoding": "y", '
 '"field": "<D2:n>", "type": "nominal"}, {"encoding": "x", "field": "<D1:n>", "type": "nominal"}]}, {"mark": "text", '
 '"mapping": [{"encoding": "text", "field": "<M>", "type": "quantitative"}, {"encoding": "y", "field": "<D2:n>", '
 '"type": "nominal"}, {"encoding": "x", "field": "<D1:n>", "type": "nominal"}, {"encoding": "color", "field": '
 '"udi_internal_text_color_threshold", "type": "nominal", "domain": ["large", "small"], "range": ["white", "black"], '
 '"omitLegend": true}]}]}',
 '{"source": {"name": "<E>", "source": "<E.url>"}, "representation": {"mark": "point", "mapping": [{"encoding": "x", '
 '"field": "<F1>", "type": "quantitative"}, {"encoding": "y", "field": "<F2>", "type": "quantitative"}, {"encoding": '
 '"color", "field": "<F3>", "type": "nominal"}]}}',
 '{"source": {"name": "<E>", "source": "<E.url>"}, "transformation": [{"filter": {"op": "!=", "left": {"field": '
 '"<F>"}, "right": {"literal": null}}}, {"binby": {"field": "<F>", "output": {"bin_start": "start", "bin_end": '
 '"end"}}}, {"rollup": {"count": {"op": "count"}}}], "representation": {"mark": "rect", "mapping": [{"encoding": "x", '
 '"field": "start", "type": "quantitative", "title": "<F>"}, {"encoding": "x2", "field": "end", "type": '
 '"quantitative"}, {"encoding": "y", "field": "count", "type": "quantitative", "domainWhenFiltered": "filtered"}]}}',
 '{"source": {"name": "<E>", "source": "<E.url>"}, "transformation": [{"filter": {"op": "!=", "left": {"field": '
 '"<F>"}, "right": {"literal": null}}}, {"kde": {"field": "<F>", "output": {"sample": "<F>", "density": "density"}}}], '
 '"representation": {"mark": "area", "mapping": [{"encoding": "x", "field": "<F>", "type": "quantitative"}, '
 '{"encoding": "y", "field": "density", "type": "quantitative", "domainWhenFiltered": "filtered"}]}}',
 '{"source": {"name": "<E>", "source": "<E.url>"}, "representation": {"mark": "point", "mapping": {"encoding": "x", '
 '"field": "<F>", "type": "quantitative"}}}',
 '{"source": {"name": "<E>", "source": "<E.url>"}, "transformation": [{"filter": {"op": "!=", "left": {"field": '
 '"<F1>"}, "right": {"literal": null}}}, {"groupby": "<F2>"}, {"kde": {"field": "<F1>", "output": {"sample": "<F1>", '
 '"density": "density"}}}], "representation": [{"mark": "area", "mapping": [{"encoding": "x", "field": "<F1>", "type": '
 '"quantitative"}, {"encoding": "color", "field": "<F2>", "type": "nominal"}, {"encoding": "y", "field": "density", '
 '"type": "quantitative", "domainWhenFiltered": "filtered"}, {"encoding": "opacity", "value": 0.25}]}, {"mark": '
 '"line", "mapping": [{"encoding": "x", "field": "<F1>", "type": "quantitative"}, {"encoding": "color", "field": '
 '"<F2>", "type": "nominal"}, {"encoding": "y", "field": "density", "type": "quantitative", "domainWhenFiltered": '
 '"filtered"}]}]}',
 '{"source": {"name": "<E>", "source": "<E.url>"}, "representation": {"mark": "point", "mapping": [{"encoding": "x", '
 '"field": "<F1>", "type": "quantitative"}, {"encoding": "y", "field": "<F2>", "type": "nominal"}, {"encoding": '
 '"color", "field": "<F2>", "type": "nominal"}]}}',
 '{"source": {"name": "<E>", "source": "<E.url>"}, "transformation": [{"derive": {"<E> Count": {"agg": "count"}}}, '
 '{"filter": {"op": "!=", "left": {"field": "<F>"}, "right": {"literal": null}}}, {"rollup": {"Valid <F> Count": '
 '{"op": "count"}, "<E> Count": {"op": "median", "field": "<E> Count"}}}, {"derive": {"Valid <F> %": {"op": "/", '
 '"left": {"field": "Valid <F> Count"}, "right": {"field": "<E> Count"}}}}], "representation": {"mark": "row", '
 '"mapping": [{"encoding": "text", "field": "Valid <F> Count", "mark": "text", "type": "nominal"}, {"encoding": '
 '"text", "field": "<E> Count", "mark": "text", "type": "nominal"}, {"encoding": "x", "field": "Valid <F> %", "mark": '
 '"bar", "type": "quantitative", "domain": {"min": 0, "max": 1}}, {"encoding": "y", "field": "Valid <F> %", "mark": '
 '"line", "type": "quantitative", "range": {"min": 0.5, "max": 0.5}}]}}',
 '{"source": {"name": "<E>", "source": "<E.url>"}, "transformation": [{"derive": {"<E> Count": {"agg": "count"}}}, '
 '{"filter": {"op": "!=", "left": {"field": "<F>"}, "right": {"literal": null}}}, {"rollup": {"Valid <F> Count": '
 '{"op": "count"}, "<E> Count": {"op": "median", "field": "<E> Count"}}}, {"derive": {"Null <F> Count": {"op": "-", '
 '"left": {"field": "<E> Count"}, "right": {"field": "Valid <F> Count"}}, "Null <F> %": {"op": "-", "left": '
 '{"literal": 1}, "right": {"op": "/", "left": {"field": "Valid <F> Count"}, "right": {"field": "<E> Count"}}}}}], '
 '"representation": {"mark": "row", "mapping": [{"encoding": "text", "field": "Null <F> Count", "mark": "text", '
 '"type": "nominal"}, {"encoding": "text", "field": "<E> Count", "mark": "text", "type": "nominal"}, {"encoding": "x", '
 '"field": "Null <F> %", "mark": "bar", "type": "quantitative", "domain": {"min": 0, "max": 1}}, {"encoding": "y", '
 '"field": "Null <F> %", "mark": "line", "type": "quantitative", "range": {"min": 0.5, "max": 0.5}}]}}']


# OpenAI function-calling tool definitions
TOOL_DEFS = [{'function': {'description': 'nominal field, encodes x-axis.',
               'name': 'vis_000_barchart_count_vert_grouped',
               'parameters': {'additionalProperties': False,
                              'properties': {'entity': {'description': 'The data entity (table) to visualize.',
                                                        'type': 'string'},
                                             'field': {'description': 'nominal field, encodes x-axis.',
                                                       'type': 'string'}},
                              'required': ['entity', 'field'],
                              'type': 'object'}},
  'type': 'function'},
 {'function': {'description': 'nominal field, encodes y-axis.',
               'name': 'vis_001_barchart_count_horiz_grouped',
               'parameters': {'additionalProperties': False,
                              'properties': {'entity': {'description': 'The data entity (table) to visualize.',
                                                        'type': 'string'},
                                             'field': {'description': 'nominal field, encodes y-axis.',
                                                       'type': 'string'}},
                              'required': ['entity', 'field'],
                              'type': 'object'}},
  'type': 'function'},
 {'function': {'description': '[barchart] Joins two entities and counts records grouped by a field from the related '
                              'entity, displayed as a vertical bar chart. Design: Cross-entity join groups by a field '
                              'not native to the counted entity. Vertical orientation for small category counts (<=4). '
                              'Tasks: Compare counts across categories from a related entity; discover cross-entity '
                              'frequency patterns. Query patterns: How many <E1> are there, grouped by <E2.F:n>?',
               'name': 'vis_002_barchart_join_count_vert_grouped',
               'parameters': {'additionalProperties': False,
                              'properties': {'entity1': {'description': 'The primary data entity (table).',
                                                         'type': 'string'},
                                             'entity2': {'description': 'The secondary data entity (table) to join '
                                                                        'with.',
                                                         'type': 'string'},
                                             'entity2_field': {'description': 'nominal field, encodes x-axis.',
                                                               'type': 'string'}},
                              'required': ['entity1', 'entity2', 'entity2_field'],
                              'type': 'object'}},
  'type': 'function'},
 {'function': {'description': '[barchart] Joins two entities and counts records grouped by a field from the related '
                              'entity, displayed as a horizontal bar chart. Design: Cross-entity join with horizontal '
                              'orientation for higher category counts (>4). Tasks: Compare counts across categories '
                              'from a related entity; discover cross-entity frequency patterns. Query patterns: How '
                              'many <E1> are there, grouped by <E2.F:n>?',
               'name': 'vis_003_barchart_join_count_horiz_grouped',
               'parameters': {'additionalProperties': False,
                              'properties': {'entity1': {'description': 'The primary data entity (table).',
                                                         'type': 'string'},
                                             'entity2': {'description': 'The secondary data entity (table) to join '
                                                                        'with.',
                                                         'type': 'string'},
                                             'entity2_field': {'description': 'nominal field, encodes y-axis.',
                                                               'type': 'string'}},
                              'required': ['entity1', 'entity2', 'entity2_field'],
                              'type': 'object'}},
  'type': 'function'},
 {'function': {'description': 'cube nominal dimension, encodes x-axis.',
               'name': 'vis_004_barchart_basic',
               'parameters': {'additionalProperties': False,
                              'properties': {'dimension': {'description': 'cube nominal dimension, encodes x-axis.',
                                                           'type': 'string'},
                                             'entity': {'description': 'The data entity (table) to visualize.',
                                                        'type': 'string'}},
                              'required': ['entity', 'dimension'],
                              'type': 'object'}},
  'type': 'function'},
 {'function': {'description': 'cube quantitative dimension, encodes x-axis.',
               'name': 'vis_005_barchart_basic',
               'parameters': {'additionalProperties': False,
                              'properties': {'dimension': {'description': 'cube quantitative dimension, encodes '
                                                                          'x-axis.',
                                                           'type': 'string'},
                                             'entity': {'description': 'The data entity (table) to visualize.',
                                                        'type': 'string'}},
                              'required': ['entity', 'dimension'],
                              'type': 'object'}},
  'type': 'function'},
 {'function': {'description': '[stacked_bar] Joins two entities and produces a vertical stacked bar chart of counts '
                              'grouped by two nominal fields. Design: Stacked bars show part-to-whole composition '
                              'within each category. Vertical layout for small category counts (<=4). Color encodes '
                              'the secondary grouping field from the related entity. Color is preferably mapped to the '
                              'variable with fewer unique values for better discriminability. Tasks: Compare group '
                              'compositions across categories; identify dominant sub-groups within each bar. Query '
                              'patterns: How many <E1> are there, grouped by <E1.F1:n> and <E2.F2:n>?',
               'name': 'vis_006_stacked_bar_join_count_vert_stacked_grouped',
               'parameters': {'additionalProperties': False,
                              'properties': {'entity1': {'description': 'The primary data entity (table).',
                                                         'type': 'string'},
                                             'entity1_field': {'description': 'nominal field, encodes x-axis.',
                                                               'type': 'string'},
                                             'entity2': {'description': 'The secondary data entity (table) to join '
                                                                        'with.',
                                                         'type': 'string'},
                                             'entity2_field': {'description': 'nominal field, encodes color.',
                                                               'type': 'string'}},
                              'required': ['entity1', 'entity2', 'entity1_field', 'entity2_field'],
                              'type': 'object'}},
  'type': 'function'},
 {'function': {'description': '[stacked_bar] Joins two entities and produces a horizontal stacked bar chart of counts '
                              'grouped by two nominal fields. Design: Horizontal orientation for higher category '
                              'counts (>4). Color encodes the primary grouping field. Cross-entity join required. '
                              'Color is preferably mapped to the variable with fewer unique values for better '
                              'discriminability. Tasks: Compare group compositions across categories; identify '
                              'dominant sub-groups within each bar. Query patterns: How many <E1> are there, grouped '
                              'by <E1.F1:n> and <E2.F2:n>?',
               'name': 'vis_007_stacked_bar_join_count_horiz_stacked_grouped',
               'parameters': {'additionalProperties': False,
                              'properties': {'entity1': {'description': 'The primary data entity (table).',
                                                         'type': 'string'},
                                             'entity1_field': {'description': 'nominal field, encodes color.',
                                                               'type': 'string'},
                                             'entity2': {'description': 'The secondary data entity (table) to join '
                                                                        'with.',
                                                         'type': 'string'},
                                             'entity2_field': {'description': 'nominal field, encodes y-axis.',
                                                               'type': 'string'}},
                              'required': ['entity1', 'entity2', 'entity1_field', 'entity2_field'],
                              'type': 'object'}},
  'type': 'function'},
 {'function': {'description': 'nominal field, encodes x-axis.',
               'name': 'vis_008_stacked_bar_count_vert_stacked_grouped',
               'parameters': {'additionalProperties': False,
                              'properties': {'entity': {'description': 'The data entity (table) to visualize.',
                                                        'type': 'string'},
                                             'field1': {'description': 'nominal field, encodes color.',
                                                        'type': 'string'},
                                             'field2': {'description': 'nominal field, encodes x-axis.',
                                                        'type': 'string'}},
                              'required': ['entity', 'field1', 'field2'],
                              'type': 'object'}},
  'type': 'function'},
 {'function': {'description': 'nominal field, encodes y-axis.',
               'name': 'vis_009_stacked_bar_count_horiz_stacked_grouped',
               'parameters': {'additionalProperties': False,
                              'properties': {'entity': {'description': 'The data entity (table) to visualize.',
                                                        'type': 'string'},
                                             'field1': {'description': 'nominal field, encodes color.',
                                                        'type': 'string'},
                                             'field2': {'description': 'nominal field, encodes y-axis.',
                                                        'type': 'string'}},
                              'required': ['entity', 'field1', 'field2'],
                              'type': 'object'}},
  'type': 'function'},
 {'function': {'description': 'cube nominal dimension, encodes color.',
               'name': 'vis_010_stacked_bar_vert_stacked',
               'parameters': {'additionalProperties': False,
                              'properties': {'dimension1': {'description': 'cube nominal dimension, encodes x-axis.',
                                                            'type': 'string'},
                                             'dimension2': {'description': 'cube nominal dimension, encodes color.',
                                                            'type': 'string'},
                                             'entity': {'description': 'The data entity (table) to visualize.',
                                                        'type': 'string'}},
                              'required': ['entity', 'dimension1', 'dimension2'],
                              'type': 'object'}},
  'type': 'function'},
 {'function': {'description': 'nominal field, encodes x-axis.',
               'name': 'vis_011_stacked_bar_count_vert_grouped',
               'parameters': {'additionalProperties': False,
                              'properties': {'entity': {'description': 'The data entity (table) to visualize.',
                                                        'type': 'string'},
                                             'field1': {'description': 'nominal field, encodes x-axis sub-group, '
                                                                       'color.',
                                                        'type': 'string'},
                                             'field2': {'description': 'nominal field, encodes x-axis.',
                                                        'type': 'string'}},
                              'required': ['entity', 'field1', 'field2'],
                              'type': 'object'}},
  'type': 'function'},
 {'function': {'description': 'nominal field, encodes y-axis.',
               'name': 'vis_012_stacked_bar_count_horiz_grouped',
               'parameters': {'additionalProperties': False,
                              'properties': {'entity': {'description': 'The data entity (table) to visualize.',
                                                        'type': 'string'},
                                             'field1': {'description': 'nominal field, encodes y-axis sub-group, '
                                                                       'color.',
                                                        'type': 'string'},
                                             'field2': {'description': 'nominal field, encodes y-axis.',
                                                        'type': 'string'}},
                              'required': ['entity', 'field1', 'field2'],
                              'type': 'object'}},
  'type': 'function'},
 {'function': {'description': 'cube nominal dimension, encodes x-axis sub-group, color.',
               'name': 'vis_013_stacked_bar_grouped',
               'parameters': {'additionalProperties': False,
                              'properties': {'dimension1': {'description': 'cube nominal dimension, encodes x-axis.',
                                                            'type': 'string'},
                                             'dimension2': {'description': 'cube nominal dimension, encodes x-axis '
                                                                           'sub-group, color.',
                                                            'type': 'string'},
                                             'entity': {'description': 'The data entity (table) to visualize.',
                                                        'type': 'string'}},
                              'required': ['entity', 'dimension1', 'dimension2'],
                              'type': 'object'}},
  'type': 'function'},
 {'function': {'description': 'nominal field, encodes x-axis.',
               'name': 'vis_014_stacked_bar_freq_vert_normalized',
               'parameters': {'additionalProperties': False,
                              'properties': {'entity': {'description': 'The data entity (table) to visualize.',
                                                        'type': 'string'},
                                             'field1': {'description': 'nominal field, encodes color.',
                                                        'type': 'string'},
                                             'field2': {'description': 'nominal field, encodes x-axis.',
                                                        'type': 'string'}},
                              'required': ['entity', 'field1', 'field2'],
                              'type': 'object'}},
  'type': 'function'},
 {'function': {'description': 'nominal field, encodes y-axis.',
               'name': 'vis_015_stacked_bar_freq_horiz_normalized',
               'parameters': {'additionalProperties': False,
                              'properties': {'entity': {'description': 'The data entity (table) to visualize.',
                                                        'type': 'string'},
                                             'field1': {'description': 'nominal field, encodes color.',
                                                        'type': 'string'},
                                             'field2': {'description': 'nominal field, encodes y-axis.',
                                                        'type': 'string'}},
                              'required': ['entity', 'field1', 'field2'],
                              'type': 'object'}},
  'type': 'function'},
 {'function': {'description': 'cube nominal dimension, encodes color.',
               'name': 'vis_016_stacked_bar_proportion_stacked_normalized',
               'parameters': {'additionalProperties': False,
                              'properties': {'dimension1': {'description': 'cube nominal dimension, encodes x-axis.',
                                                            'type': 'string'},
                                             'dimension2': {'description': 'cube nominal dimension, encodes color.',
                                                            'type': 'string'},
                                             'entity': {'description': 'The data entity (table) to visualize.',
                                                        'type': 'string'}},
                              'required': ['entity', 'dimension1', 'dimension2'],
                              'type': 'object'}},
  'type': 'function'},
 {'function': {'description': 'nominal field, encodes y-axis.',
               'name': 'vis_017_barchart_min_horiz',
               'parameters': {'additionalProperties': False,
                              'properties': {'entity': {'description': 'The data entity (table) to visualize.',
                                                        'type': 'string'},
                                             'field1': {'description': 'quantitative field, encodes x-axis.',
                                                        'type': 'string'},
                                             'field2': {'description': 'nominal field, encodes y-axis.',
                                                        'type': 'string'}},
                              'required': ['entity', 'field1', 'field2'],
                              'type': 'object'}},
  'type': 'function'},
 {'function': {'description': 'nominal field, encodes x-axis.',
               'name': 'vis_018_barchart_min_vert',
               'parameters': {'additionalProperties': False,
                              'properties': {'entity': {'description': 'The data entity (table) to visualize.',
                                                        'type': 'string'},
                                             'field1': {'description': 'quantitative field, encodes y-axis.',
                                                        'type': 'string'},
                                             'field2': {'description': 'nominal field, encodes x-axis.',
                                                        'type': 'string'}},
                              'required': ['entity', 'field1', 'field2'],
                              'type': 'object'}},
  'type': 'function'},
 {'function': {'description': 'nominal field, encodes y-axis.',
               'name': 'vis_019_barchart_max_horiz',
               'parameters': {'additionalProperties': False,
                              'properties': {'entity': {'description': 'The data entity (table) to visualize.',
                                                        'type': 'string'},
                                             'field1': {'description': 'quantitative field, encodes x-axis.',
                                                        'type': 'string'},
                                             'field2': {'description': 'nominal field, encodes y-axis.',
                                                        'type': 'string'}},
                              'required': ['entity', 'field1', 'field2'],
                              'type': 'object'}},
  'type': 'function'},
 {'function': {'description': 'nominal field, encodes x-axis.',
               'name': 'vis_020_barchart_max_vert',
               'parameters': {'additionalProperties': False,
                              'properties': {'entity': {'description': 'The data entity (table) to visualize.',
                                                        'type': 'string'},
                                             'field1': {'description': 'quantitative field, encodes y-axis.',
                                                        'type': 'string'},
                                             'field2': {'description': 'nominal field, encodes x-axis.',
                                                        'type': 'string'}},
                              'required': ['entity', 'field1', 'field2'],
                              'type': 'object'}},
  'type': 'function'},
 {'function': {'description': 'nominal field, encodes y-axis.',
               'name': 'vis_021_barchart_avg_horiz',
               'parameters': {'additionalProperties': False,
                              'properties': {'entity': {'description': 'The data entity (table) to visualize.',
                                                        'type': 'string'},
                                             'field1': {'description': 'quantitative field, encodes x-axis.',
                                                        'type': 'string'},
                                             'field2': {'description': 'nominal field, encodes y-axis.',
                                                        'type': 'string'}},
                              'required': ['entity', 'field1', 'field2'],
                              'type': 'object'}},
  'type': 'function'},
 {'function': {'description': 'nominal field, encodes x-axis.',
               'name': 'vis_022_barchart_avg_vert',
               'parameters': {'additionalProperties': False,
                              'properties': {'entity': {'description': 'The data entity (table) to visualize.',
                                                        'type': 'string'},
                                             'field1': {'description': 'quantitative field, encodes y-axis.',
                                                        'type': 'string'},
                                             'field2': {'description': 'nominal field, encodes x-axis.',
                                                        'type': 'string'}},
                              'required': ['entity', 'field1', 'field2'],
                              'type': 'object'}},
  'type': 'function'},
 {'function': {'description': 'nominal field, encodes y-axis.',
               'name': 'vis_023_barchart_median_horiz',
               'parameters': {'additionalProperties': False,
                              'properties': {'entity': {'description': 'The data entity (table) to visualize.',
                                                        'type': 'string'},
                                             'field1': {'description': 'quantitative field, encodes x-axis.',
                                                        'type': 'string'},
                                             'field2': {'description': 'nominal field, encodes y-axis.',
                                                        'type': 'string'}},
                              'required': ['entity', 'field1', 'field2'],
                              'type': 'object'}},
  'type': 'function'},
 {'function': {'description': 'nominal field, encodes x-axis.',
               'name': 'vis_024_barchart_median_vert',
               'parameters': {'additionalProperties': False,
                              'properties': {'entity': {'description': 'The data entity (table) to visualize.',
                                                        'type': 'string'},
                                             'field1': {'description': 'quantitative field, encodes y-axis.',
                                                        'type': 'string'},
                                             'field2': {'description': 'nominal field, encodes x-axis.',
                                                        'type': 'string'}},
                              'required': ['entity', 'field1', 'field2'],
                              'type': 'object'}},
  'type': 'function'},
 {'function': {'description': 'nominal field, encodes y-axis.',
               'name': 'vis_025_barchart_sum_horiz',
               'parameters': {'additionalProperties': False,
                              'properties': {'entity': {'description': 'The data entity (table) to visualize.',
                                                        'type': 'string'},
                                             'field1': {'description': 'quantitative field, encodes x-axis.',
                                                        'type': 'string'},
                                             'field2': {'description': 'nominal field, encodes y-axis.',
                                                        'type': 'string'}},
                              'required': ['entity', 'field1', 'field2'],
                              'type': 'object'}},
  'type': 'function'},
 {'function': {'description': 'nominal field, encodes x-axis.',
               'name': 'vis_026_barchart_sum_vert',
               'parameters': {'additionalProperties': False,
                              'properties': {'entity': {'description': 'The data entity (table) to visualize.',
                                                        'type': 'string'},
                                             'field1': {'description': 'quantitative field, encodes y-axis.',
                                                        'type': 'string'},
                                             'field2': {'description': 'nominal field, encodes x-axis.',
                                                        'type': 'string'}},
                              'required': ['entity', 'field1', 'field2'],
                              'type': 'object'}},
  'type': 'function'},
 {'function': {'description': 'quantitative field, encodes y-axis.',
               'name': 'vis_027_scatterplot_basic',
               'parameters': {'additionalProperties': False,
                              'properties': {'entity': {'description': 'The data entity (table) to visualize.',
                                                        'type': 'string'},
                                             'field1': {'description': 'quantitative field, encodes x-axis.',
                                                        'type': 'string'},
                                             'field2': {'description': 'quantitative field, encodes y-axis.',
                                                        'type': 'string'}},
                              'required': ['entity', 'field1', 'field2'],
                              'type': 'object'}},
  'type': 'function'},
 {'function': {'description': 'nominal field, encodes color.',
               'name': 'vis_028_stacked_bar_count_vert_stacked_grouped',
               'parameters': {'additionalProperties': False,
                              'properties': {'entity': {'description': 'The data entity (table) to visualize.',
                                                        'type': 'string'},
                                             'field1': {'description': 'nominal field, encodes x-axis.',
                                                        'type': 'string'},
                                             'field2': {'description': 'nominal field, encodes color.',
                                                        'type': 'string'}},
                              'required': ['entity', 'field1', 'field2'],
                              'type': 'object'}},
  'type': 'function'},
 {'function': {'description': 'nominal field, encodes color.',
               'name': 'vis_029_stacked_bar_count_horiz_stacked_grouped',
               'parameters': {'additionalProperties': False,
                              'properties': {'entity': {'description': 'The data entity (table) to visualize.',
                                                        'type': 'string'},
                                             'field1': {'description': 'nominal field, encodes y-axis.',
                                                        'type': 'string'},
                                             'field2': {'description': 'nominal field, encodes color.',
                                                        'type': 'string'}},
                              'required': ['entity', 'field1', 'field2'],
                              'type': 'object'}},
  'type': 'function'},
 {'function': {'description': 'nominal field, encodes color.',
               'name': 'vis_030_circular_proportion_distribution',
               'parameters': {'additionalProperties': False,
                              'properties': {'entity': {'description': 'The data entity (table) to visualize.',
                                                        'type': 'string'},
                                             'field': {'description': 'nominal field, encodes color.',
                                                       'type': 'string'}},
                              'required': ['entity', 'field'],
                              'type': 'object'}},
  'type': 'function'},
 {'function': {'description': 'nominal field, encodes color.',
               'name': 'vis_031_circular_proportion_distribution',
               'parameters': {'additionalProperties': False,
                              'properties': {'entity': {'description': 'The data entity (table) to visualize.',
                                                        'type': 'string'},
                                             'field': {'description': 'nominal field, encodes color.',
                                                       'type': 'string'}},
                              'required': ['entity', 'field'],
                              'type': 'object'}},
  'type': 'function'},
 {'function': {'description': 'cube nominal dimension, encodes color.',
               'name': 'vis_032_circular_proportion',
               'parameters': {'additionalProperties': False,
                              'properties': {'dimension': {'description': 'cube nominal dimension, encodes color.',
                                                           'type': 'string'},
                                             'entity': {'description': 'The data entity (table) to visualize.',
                                                        'type': 'string'}},
                              'required': ['entity', 'dimension'],
                              'type': 'object'}},
  'type': 'function'},
 {'function': {'description': 'cube nominal dimension, encodes color.',
               'name': 'vis_033_circular_proportion',
               'parameters': {'additionalProperties': False,
                              'properties': {'dimension': {'description': 'cube nominal dimension, encodes color.',
                                                           'type': 'string'},
                                             'entity': {'description': 'The data entity (table) to visualize.',
                                                        'type': 'string'}},
                              'required': ['entity', 'dimension'],
                              'type': 'object'}},
  'type': 'function'},
 {'function': {'description': '[table] Counts the total number of records in an entity and displays the result as a '
                              'single-row table. Design: Simple rollup with no visual encoding beyond the count value. '
                              'Useful as a quick data quality or size check. Tasks: Retrieve the total record count '
                              'for an entity. Query patterns: How many <E> records are there?',
               'name': 'vis_034_table_count',
               'parameters': {'additionalProperties': False,
                              'properties': {'entity': {'description': 'The data entity (table) to visualize.',
                                                        'type': 'string'}},
                              'required': ['entity'],
                              'type': 'object'}},
  'type': 'function'},
 {'function': {'description': '[table] Displays the raw data for an entity as a table. Design: No aggregation or '
                              'transformation applied; shows the underlying data as-is for exploration. Tasks: Explore '
                              'raw data; retrieve specific values; understand field values and ranges; identify '
                              'anomalies and extremes. Query patterns: What does the <E> data look like?; Make a table '
                              'of <E>?',
               'name': 'vis_035_table_raw',
               'parameters': {'additionalProperties': False,
                              'properties': {'entity': {'description': 'The data entity (table) to visualize.',
                                                        'type': 'string'}},
                              'required': ['entity'],
                              'type': 'object'}},
  'type': 'function'},
 {'function': {'description': '[table] Joins two related entities and displays the combined data as a table. Design: '
                              'Cross-entity join enriches the view by combining fields from two related entities. '
                              'Requires a valid foreign-key relationship. Tasks: Explore combined data from two '
                              'related entities; retrieve specific values; identify anomalies and extremes. Query '
                              'patterns: What does the combined data of <E1> and <E2> look like?; Make a table that '
                              'combines <E1> and <E2>.',
               'name': 'vis_036_table_join',
               'parameters': {'additionalProperties': False,
                              'properties': {'entity1': {'description': 'The primary data entity (table).',
                                                         'type': 'string'},
                                             'entity2': {'description': 'The secondary data entity (table) to join '
                                                                        'with.',
                                                         'type': 'string'}},
                              'required': ['entity1', 'entity2'],
                              'type': 'object'}},
  'type': 'function'},
 {'function': {'description': '[table] Finds which related entity record has the highest count of associated records, '
                              'displayed as a ranked table with bar indicators. Design: Groups by foreign key, counts, '
                              'ranks, and highlights the top record with color encoding. Bar marks on the count column '
                              'provide visual comparison. Tasks: Identify the record with the most associated '
                              'entities; compare counts across records. Query patterns: What <E2> has the most <E1>?',
               'name': 'vis_037_table_join_count_ranked',
               'parameters': {'additionalProperties': False,
                              'properties': {'entity1': {'description': 'The primary data entity (table).',
                                                         'type': 'string'},
                                             'entity2': {'description': 'The secondary data entity (table) to join '
                                                                        'with.',
                                                         'type': 'string'}},
                              'required': ['entity1', 'entity2'],
                              'type': 'object'}},
  'type': 'function'},
 {'function': {'description': 'quantitative field, encodes x-axis.',
               'name': 'vis_038_table_ranked',
               'parameters': {'additionalProperties': False,
                              'properties': {'entity': {'description': 'The data entity (table) to visualize.',
                                                        'type': 'string'},
                                             'field': {'description': 'quantitative field, encodes x-axis.',
                                                       'type': 'string'}},
                              'required': ['entity', 'field'],
                              'type': 'object'}},
  'type': 'function'},
 {'function': {'description': '[table] Joins two entities, computes the maximum of a quantitative field per group, and '
                              'ranks the results in a table with bar indicators. Design: Cross-entity join followed by '
                              'group-level max aggregation. Highlights the top record with color encoding. Tasks: '
                              'Identify which related record has the largest aggregated value; compare across groups. '
                              'Query patterns: What Record in <E2> has the largest <E1> <E1.F:q>?',
               'name': 'vis_039_table_join_max_ranked',
               'parameters': {'additionalProperties': False,
                              'properties': {'entity1': {'description': 'The primary data entity (table).',
                                                         'type': 'string'},
                                             'entity1_field': {'description': 'quantitative field, encodes x-axis.',
                                                               'type': 'string'},
                                             'entity2': {'description': 'The secondary data entity (table) to join '
                                                                        'with.',
                                                         'type': 'string'}},
                              'required': ['entity1', 'entity2', 'entity1_field'],
                              'type': 'object'}},
  'type': 'function'},
 {'function': {'description': 'any type field.',
               'name': 'vis_040_table_ranked',
               'parameters': {'additionalProperties': False,
                              'properties': {'entity': {'description': 'The data entity (table) to visualize.',
                                                        'type': 'string'},
                                             'field': {'description': 'any type field.', 'type': 'string'}},
                              'required': ['entity', 'field'],
                              'type': 'object'}},
  'type': 'function'},
 {'function': {'description': '[table] Joins two entities, computes the minimum of a quantitative field per group, and '
                              'ranks the results in a table with conditional formatting. Design: Cross-entity join '
                              'followed by group-level min aggregation. Highlights the top record with background '
                              'color via rect mark. Tasks: Identify which related record has the smallest aggregated '
                              'value; compare across groups. Query patterns: What Record in <E2> has the smallest <E1> '
                              '<E1.F:q>?',
               'name': 'vis_041_table_join_min_ranked',
               'parameters': {'additionalProperties': False,
                              'properties': {'entity1': {'description': 'The primary data entity (table).',
                                                         'type': 'string'},
                                             'entity1_field': {'description': 'any type field.', 'type': 'string'},
                                             'entity2': {'description': 'The secondary data entity (table) to join '
                                                                        'with.',
                                                         'type': 'string'}},
                              'required': ['entity1', 'entity2', 'entity1_field'],
                              'type': 'object'}},
  'type': 'function'},
 {'function': {'description': 'quantitative field, encodes x-axis.',
               'name': 'vis_042_table_sorted',
               'parameters': {'additionalProperties': False,
                              'properties': {'entity': {'description': 'The data entity (table) to visualize.',
                                                        'type': 'string'},
                                             'field': {'description': 'quantitative field, encodes x-axis.',
                                                       'type': 'string'}},
                              'required': ['entity', 'field'],
                              'type': 'object'}},
  'type': 'function'},
 {'function': {'description': 'nominal field, encodes text label.',
               'name': 'vis_043_table_min',
               'parameters': {'additionalProperties': False,
                              'properties': {'entity': {'description': 'The data entity (table) to visualize.',
                                                        'type': 'string'},
                                             'field': {'description': 'nominal field, encodes text label.',
                                                       'type': 'string'}},
                              'required': ['entity', 'field'],
                              'type': 'object'}},
  'type': 'function'},
 {'function': {'description': 'nominal field, encodes text label.',
               'name': 'vis_044_table_count_distinct',
               'parameters': {'additionalProperties': False,
                              'properties': {'entity': {'description': 'The data entity (table) to visualize.',
                                                        'type': 'string'},
                                             'field': {'description': 'nominal field, encodes text label.',
                                                       'type': 'string'}},
                              'required': ['entity', 'field'],
                              'type': 'object'}},
  'type': 'function'},
 {'function': {'description': 'nominal field, encodes text label.',
               'name': 'vis_045_table_range',
               'parameters': {'additionalProperties': False,
                              'properties': {'entity': {'description': 'The data entity (table) to visualize.',
                                                        'type': 'string'},
                                             'field1': {'description': 'nominal field, encodes text label, x-axis, x2.',
                                                        'type': 'string'},
                                             'field2': {'description': 'nominal field, encodes text label.',
                                                        'type': 'string'}},
                              'required': ['entity', 'field1', 'field2'],
                              'type': 'object'}},
  'type': 'function'},
 {'function': {'description': 'nominal field, encodes text label.',
               'name': 'vis_046_table_ranked_mode',
               'parameters': {'additionalProperties': False,
                              'properties': {'entity': {'description': 'The data entity (table) to visualize.',
                                                        'type': 'string'},
                                             'field': {'description': 'nominal field, encodes text label.',
                                                       'type': 'string'}},
                              'required': ['entity', 'field'],
                              'type': 'object'}},
  'type': 'function'},
 {'function': {'description': '[table] Shows the grand-total cube measure as a single-row table. Design: Reads the '
                              'grand-total row directly by filtering to the marginal where every dimension is empty; '
                              'no aggregation is performed. Tasks: Retrieve the overall total. Query patterns: What is '
                              'the grand total of the measure?; How many are there in total?',
               'name': 'vis_047_table_sum',
               'parameters': {'additionalProperties': False,
                              'properties': {'entity': {'description': 'The data entity (table) to visualize.',
                                                        'type': 'string'}},
                              'required': ['entity'],
                              'type': 'object'}},
  'type': 'function'},
 {'function': {'description': 'cube nominal dimension, encodes text label.',
               'name': 'vis_048_table_sorted',
               'parameters': {'additionalProperties': False,
                              'properties': {'dimension': {'description': 'cube nominal dimension, encodes text label.',
                                                           'type': 'string'},
                                             'entity': {'description': 'The data entity (table) to visualize.',
                                                        'type': 'string'}},
                              'required': ['entity', 'dimension'],
                              'type': 'object'}},
  'type': 'function'},
 {'function': {'description': 'quantitative field, encodes x-axis.',
               'name': 'vis_049_line_cdf',
               'parameters': {'additionalProperties': False,
                              'properties': {'entity': {'description': 'The data entity (table) to visualize.',
                                                        'type': 'string'},
                                             'field': {'description': 'quantitative field, encodes x-axis.',
                                                       'type': 'string'}},
                              'required': ['entity', 'field'],
                              'type': 'object'}},
  'type': 'function'},
 {'function': {'description': 'nominal field, encodes color.',
               'name': 'vis_050_grouped_line_cdf',
               'parameters': {'additionalProperties': False,
                              'properties': {'entity': {'description': 'The data entity (table) to visualize.',
                                                        'type': 'string'},
                                             'field1': {'description': 'quantitative field, encodes x-axis.',
                                                        'type': 'string'},
                                             'field2': {'description': 'nominal field, encodes color.',
                                                        'type': 'string'}},
                              'required': ['entity', 'field1', 'field2'],
                              'type': 'object'}},
  'type': 'function'},
 {'function': {'description': 'cube ordinal dimension, encodes x-axis.',
               'name': 'vis_051_line_sorted',
               'parameters': {'additionalProperties': False,
                              'properties': {'dimension': {'description': 'cube ordinal dimension, encodes x-axis.',
                                                           'type': 'string'},
                                             'entity': {'description': 'The data entity (table) to visualize.',
                                                        'type': 'string'}},
                              'required': ['entity', 'dimension'],
                              'type': 'object'}},
  'type': 'function'},
 {'function': {'description': 'nominal field, encodes x-axis.',
               'name': 'vis_052_heatmap_count',
               'parameters': {'additionalProperties': False,
                              'properties': {'entity': {'description': 'The data entity (table) to visualize.',
                                                        'type': 'string'},
                                             'field1': {'description': 'nominal field, encodes y-axis.',
                                                        'type': 'string'},
                                             'field2': {'description': 'nominal field, encodes x-axis.',
                                                        'type': 'string'}},
                              'required': ['entity', 'field1', 'field2'],
                              'type': 'object'}},
  'type': 'function'},
 {'function': {'description': 'nominal field, encodes x-axis.',
               'name': 'vis_053_heatmap_avg',
               'parameters': {'additionalProperties': False,
                              'properties': {'entity': {'description': 'The data entity (table) to visualize.',
                                                        'type': 'string'},
                                             'field1': {'description': 'quantitative field, encodes color.',
                                                        'type': 'string'},
                                             'field2': {'description': 'nominal field, encodes y-axis.',
                                                        'type': 'string'},
                                             'field3': {'description': 'nominal field, encodes x-axis.',
                                                        'type': 'string'}},
                              'required': ['entity', 'field1', 'field2', 'field3'],
                              'type': 'object'}},
  'type': 'function'},
 {'function': {'description': 'cube nominal dimension, encodes y-axis.',
               'name': 'vis_054_heatmap_basic',
               'parameters': {'additionalProperties': False,
                              'properties': {'dimension1': {'description': 'cube nominal dimension, encodes x-axis.',
                                                            'type': 'string'},
                                             'dimension2': {'description': 'cube nominal dimension, encodes y-axis.',
                                                            'type': 'string'},
                                             'entity': {'description': 'The data entity (table) to visualize.',
                                                        'type': 'string'}},
                              'required': ['entity', 'dimension1', 'dimension2'],
                              'type': 'object'}},
  'type': 'function'},
 {'function': {'description': 'nominal field, encodes color.',
               'name': 'vis_055_grouped_scatter_by_color',
               'parameters': {'additionalProperties': False,
                              'properties': {'entity': {'description': 'The data entity (table) to visualize.',
                                                        'type': 'string'},
                                             'field1': {'description': 'quantitative field, encodes x-axis.',
                                                        'type': 'string'},
                                             'field2': {'description': 'quantitative field, encodes y-axis.',
                                                        'type': 'string'},
                                             'field3': {'description': 'nominal field, encodes color.',
                                                        'type': 'string'}},
                              'required': ['entity', 'field1', 'field2', 'field3'],
                              'type': 'object'}},
  'type': 'function'},
 {'function': {'description': 'any type field.',
               'name': 'vis_056_histogram_distribution',
               'parameters': {'additionalProperties': False,
                              'properties': {'entity': {'description': 'The data entity (table) to visualize.',
                                                        'type': 'string'},
                                             'field': {'description': 'any type field.', 'type': 'string'}},
                              'required': ['entity', 'field'],
                              'type': 'object'}},
  'type': 'function'},
 {'function': {'description': 'quantitative field, encodes x-axis.',
               'name': 'vis_057_area_density',
               'parameters': {'additionalProperties': False,
                              'properties': {'entity': {'description': 'The data entity (table) to visualize.',
                                                        'type': 'string'},
                                             'field': {'description': 'quantitative field, encodes x-axis.',
                                                       'type': 'string'}},
                              'required': ['entity', 'field'],
                              'type': 'object'}},
  'type': 'function'},
 {'function': {'description': 'quantitative field, encodes x-axis.',
               'name': 'vis_058_dot_distribution',
               'parameters': {'additionalProperties': False,
                              'properties': {'entity': {'description': 'The data entity (table) to visualize.',
                                                        'type': 'string'},
                                             'field': {'description': 'quantitative field, encodes x-axis.',
                                                       'type': 'string'}},
                              'required': ['entity', 'field'],
                              'type': 'object'}},
  'type': 'function'},
 {'function': {'description': 'nominal field, encodes color.',
               'name': 'vis_059_grouped_area_density',
               'parameters': {'additionalProperties': False,
                              'properties': {'entity': {'description': 'The data entity (table) to visualize.',
                                                        'type': 'string'},
                                             'field1': {'description': 'quantitative field, encodes x-axis.',
                                                        'type': 'string'},
                                             'field2': {'description': 'nominal field, encodes color.',
                                                        'type': 'string'}},
                              'required': ['entity', 'field1', 'field2'],
                              'type': 'object'}},
  'type': 'function'},
 {'function': {'description': 'nominal field, encodes y-axis, color.',
               'name': 'vis_060_grouped_dot_distribution',
               'parameters': {'additionalProperties': False,
                              'properties': {'entity': {'description': 'The data entity (table) to visualize.',
                                                        'type': 'string'},
                                             'field1': {'description': 'quantitative field, encodes x-axis.',
                                                        'type': 'string'},
                                             'field2': {'description': 'nominal field, encodes y-axis, color.',
                                                        'type': 'string'}},
                              'required': ['entity', 'field1', 'field2'],
                              'type': 'object'}},
  'type': 'function'},
 {'function': {'description': 'nominal field, encodes text label, x-axis, y-axis.',
               'name': 'vis_061_table_count_null_nonnull',
               'parameters': {'additionalProperties': False,
                              'properties': {'entity': {'description': 'The data entity (table) to visualize.',
                                                        'type': 'string'},
                                             'field': {'description': 'nominal field, encodes text label, x-axis, '
                                                                      'y-axis.',
                                                       'type': 'string'}},
                              'required': ['entity', 'field'],
                              'type': 'object'}},
  'type': 'function'},
 {'function': {'description': 'nominal field, encodes text label, x-axis, y-axis.',
               'name': 'vis_062_table_count_null',
               'parameters': {'additionalProperties': False,
                              'properties': {'entity': {'description': 'The data entity (table) to visualize.',
                                                        'type': 'string'},
                                             'field': {'description': 'nominal field, encodes text label, x-axis, '
                                                                      'y-axis.',
                                                       'type': 'string'}},
                              'required': ['entity', 'field'],
                              'type': 'object'}},
  'type': 'function'}]


# Dispatch: tool name -> (template_index, param_to_binding_map)
TOOL_DISPATCH = {'vis_000_barchart_count_vert_grouped': (0, {'entity': 'E', 'field': 'F'}),
 'vis_001_barchart_count_horiz_grouped': (1, {'entity': 'E', 'field': 'F'}),
 'vis_002_barchart_join_count_vert_grouped': (2, {'entity1': 'E1', 'entity2': 'E2', 'entity2_field': 'E2.F'}),
 'vis_003_barchart_join_count_horiz_grouped': (3, {'entity1': 'E1', 'entity2': 'E2', 'entity2_field': 'E2.F'}),
 'vis_004_barchart_basic': (4, {'dimension': 'D', 'entity': 'E'}),
 'vis_005_barchart_basic': (5, {'dimension': 'D', 'entity': 'E'}),
 'vis_006_stacked_bar_join_count_vert_stacked_grouped': (6,
                                                         {'entity1': 'E1',
                                                          'entity1_field': 'E1.F1',
                                                          'entity2': 'E2',
                                                          'entity2_field': 'E2.F2'}),
 'vis_007_stacked_bar_join_count_horiz_stacked_grouped': (7,
                                                          {'entity1': 'E1',
                                                           'entity1_field': 'E1.F1',
                                                           'entity2': 'E2',
                                                           'entity2_field': 'E2.F2'}),
 'vis_008_stacked_bar_count_vert_stacked_grouped': (8, {'entity': 'E', 'field1': 'F1', 'field2': 'F2'}),
 'vis_009_stacked_bar_count_horiz_stacked_grouped': (9, {'entity': 'E', 'field1': 'F1', 'field2': 'F2'}),
 'vis_010_stacked_bar_vert_stacked': (10, {'dimension1': 'D1', 'dimension2': 'D2', 'entity': 'E'}),
 'vis_011_stacked_bar_count_vert_grouped': (11, {'entity': 'E', 'field1': 'F1', 'field2': 'F2'}),
 'vis_012_stacked_bar_count_horiz_grouped': (12, {'entity': 'E', 'field1': 'F1', 'field2': 'F2'}),
 'vis_013_stacked_bar_grouped': (13, {'dimension1': 'D1', 'dimension2': 'D2', 'entity': 'E'}),
 'vis_014_stacked_bar_freq_vert_normalized': (14, {'entity': 'E', 'field1': 'F1', 'field2': 'F2'}),
 'vis_015_stacked_bar_freq_horiz_normalized': (15, {'entity': 'E', 'field1': 'F1', 'field2': 'F2'}),
 'vis_016_stacked_bar_proportion_stacked_normalized': (16, {'dimension1': 'D1', 'dimension2': 'D2', 'entity': 'E'}),
 'vis_017_barchart_min_horiz': (17, {'entity': 'E', 'field1': 'F1', 'field2': 'F2'}),
 'vis_018_barchart_min_vert': (18, {'entity': 'E', 'field1': 'F1', 'field2': 'F2'}),
 'vis_019_barchart_max_horiz': (19, {'entity': 'E', 'field1': 'F1', 'field2': 'F2'}),
 'vis_020_barchart_max_vert': (20, {'entity': 'E', 'field1': 'F1', 'field2': 'F2'}),
 'vis_021_barchart_avg_horiz': (21, {'entity': 'E', 'field1': 'F1', 'field2': 'F2'}),
 'vis_022_barchart_avg_vert': (22, {'entity': 'E', 'field1': 'F1', 'field2': 'F2'}),
 'vis_023_barchart_median_horiz': (23, {'entity': 'E', 'field1': 'F1', 'field2': 'F2'}),
 'vis_024_barchart_median_vert': (24, {'entity': 'E', 'field1': 'F1', 'field2': 'F2'}),
 'vis_025_barchart_sum_horiz': (25, {'entity': 'E', 'field1': 'F1', 'field2': 'F2'}),
 'vis_026_barchart_sum_vert': (26, {'entity': 'E', 'field1': 'F1', 'field2': 'F2'}),
 'vis_027_scatterplot_basic': (27, {'entity': 'E', 'field1': 'F1', 'field2': 'F2'}),
 'vis_028_stacked_bar_count_vert_stacked_grouped': (28, {'entity': 'E', 'field1': 'F1', 'field2': 'F2'}),
 'vis_029_stacked_bar_count_horiz_stacked_grouped': (29, {'entity': 'E', 'field1': 'F1', 'field2': 'F2'}),
 'vis_030_circular_proportion_distribution': (30, {'entity': 'E', 'field': 'F'}),
 'vis_031_circular_proportion_distribution': (31, {'entity': 'E', 'field': 'F'}),
 'vis_032_circular_proportion': (32, {'dimension': 'D', 'entity': 'E'}),
 'vis_033_circular_proportion': (33, {'dimension': 'D', 'entity': 'E'}),
 'vis_034_table_count': (34, {'entity': 'E'}),
 'vis_035_table_raw': (35, {'entity': 'E'}),
 'vis_036_table_join': (36, {'entity1': 'E1', 'entity2': 'E2'}),
 'vis_037_table_join_count_ranked': (37, {'entity1': 'E1', 'entity2': 'E2'}),
 'vis_038_table_ranked': (38, {'entity': 'E', 'field': 'F'}),
 'vis_039_table_join_max_ranked': (39, {'entity1': 'E1', 'entity1_field': 'E1.F', 'entity2': 'E2'}),
 'vis_040_table_ranked': (40, {'entity': 'E', 'field': 'F'}),
 'vis_041_table_join_min_ranked': (41, {'entity1': 'E1', 'entity1_field': 'E1.F', 'entity2': 'E2'}),
 'vis_042_table_sorted': (42, {'entity': 'E', 'field': 'F'}),
 'vis_043_table_min': (43, {'entity': 'E', 'field': 'F'}),
 'vis_044_table_count_distinct': (44, {'entity': 'E', 'field': 'F'}),
 'vis_045_table_range': (45, {'entity': 'E', 'field1': 'F1', 'field2': 'F2'}),
 'vis_046_table_ranked_mode': (46, {'entity': 'E', 'field': 'F'}),
 'vis_047_table_sum': (47, {'entity': 'E'}),
 'vis_048_table_sorted': (48, {'dimension': 'D', 'entity': 'E'}),
 'vis_049_line_cdf': (49, {'entity': 'E', 'field': 'F'}),
 'vis_050_grouped_line_cdf': (50, {'entity': 'E', 'field1': 'F1', 'field2': 'F2'}),
 'vis_051_line_sorted': (51, {'dimension': 'D', 'entity': 'E'}),
 'vis_052_heatmap_count': (52, {'entity': 'E', 'field1': 'F1', 'field2': 'F2'}),
 'vis_053_heatmap_avg': (53, {'entity': 'E', 'field1': 'F1', 'field2': 'F2', 'field3': 'F3'}),
 'vis_054_heatmap_basic': (54, {'dimension1': 'D1', 'dimension2': 'D2', 'entity': 'E'}),
 'vis_055_grouped_scatter_by_color': (55, {'entity': 'E', 'field1': 'F1', 'field2': 'F2', 'field3': 'F3'}),
 'vis_056_histogram_distribution': (56, {'entity': 'E', 'field': 'F'}),
 'vis_057_area_density': (57, {'entity': 'E', 'field': 'F'}),
 'vis_058_dot_distribution': (58, {'entity': 'E', 'field': 'F'}),
 'vis_059_grouped_area_density': (59, {'entity': 'E', 'field1': 'F1', 'field2': 'F2'}),
 'vis_060_grouped_dot_distribution': (60, {'entity': 'E', 'field1': 'F1', 'field2': 'F2'}),
 'vis_061_table_count_null_nonnull': (61, {'entity': 'E', 'field': 'F'}),
 'vis_062_table_count_null': (62, {'entity': 'E', 'field': 'F'})}


# Tags per tool name (drives per-request template selection)
TOOL_TAGS = {'vis_000_barchart_count_vert_grouped': ['line_item', 'barchart'],
 'vis_001_barchart_count_horiz_grouped': ['line_item', 'barchart'],
 'vis_002_barchart_join_count_vert_grouped': ['line_item', 'barchart'],
 'vis_003_barchart_join_count_horiz_grouped': ['line_item', 'barchart'],
 'vis_004_barchart_basic': ['data_cube', 'barchart'],
 'vis_005_barchart_basic': ['data_cube', 'barchart'],
 'vis_006_stacked_bar_join_count_vert_stacked_grouped': ['line_item', 'stacked_bar'],
 'vis_007_stacked_bar_join_count_horiz_stacked_grouped': ['line_item', 'stacked_bar'],
 'vis_008_stacked_bar_count_vert_stacked_grouped': ['line_item', 'stacked_bar'],
 'vis_009_stacked_bar_count_horiz_stacked_grouped': ['line_item', 'stacked_bar'],
 'vis_010_stacked_bar_vert_stacked': ['data_cube', 'stacked_bar'],
 'vis_011_stacked_bar_count_vert_grouped': ['line_item', 'stacked_bar'],
 'vis_012_stacked_bar_count_horiz_grouped': ['line_item', 'stacked_bar'],
 'vis_013_stacked_bar_grouped': ['data_cube', 'stacked_bar'],
 'vis_014_stacked_bar_freq_vert_normalized': ['line_item', 'stacked_bar'],
 'vis_015_stacked_bar_freq_horiz_normalized': ['line_item', 'stacked_bar'],
 'vis_016_stacked_bar_proportion_stacked_normalized': ['data_cube', 'stacked_bar'],
 'vis_017_barchart_min_horiz': ['line_item', 'barchart'],
 'vis_018_barchart_min_vert': ['line_item', 'barchart'],
 'vis_019_barchart_max_horiz': ['line_item', 'barchart'],
 'vis_020_barchart_max_vert': ['line_item', 'barchart'],
 'vis_021_barchart_avg_horiz': ['line_item', 'barchart'],
 'vis_022_barchart_avg_vert': ['line_item', 'barchart'],
 'vis_023_barchart_median_horiz': ['line_item', 'barchart'],
 'vis_024_barchart_median_vert': ['line_item', 'barchart'],
 'vis_025_barchart_sum_horiz': ['line_item', 'barchart'],
 'vis_026_barchart_sum_vert': ['line_item', 'barchart'],
 'vis_027_scatterplot_basic': ['line_item', 'scatterplot'],
 'vis_028_stacked_bar_count_vert_stacked_grouped': ['line_item', 'stacked_bar'],
 'vis_029_stacked_bar_count_horiz_stacked_grouped': ['line_item', 'stacked_bar'],
 'vis_030_circular_proportion_distribution': ['line_item', 'circular'],
 'vis_031_circular_proportion_distribution': ['line_item', 'circular'],
 'vis_032_circular_proportion': ['data_cube', 'circular'],
 'vis_033_circular_proportion': ['data_cube', 'circular'],
 'vis_034_table_count': ['line_item', 'table'],
 'vis_035_table_raw': ['line_item', 'table'],
 'vis_036_table_join': ['line_item', 'table'],
 'vis_037_table_join_count_ranked': ['line_item', 'table'],
 'vis_038_table_ranked': ['line_item', 'table'],
 'vis_039_table_join_max_ranked': ['line_item', 'table'],
 'vis_040_table_ranked': ['line_item', 'table'],
 'vis_041_table_join_min_ranked': ['line_item', 'table'],
 'vis_042_table_sorted': ['line_item', 'table'],
 'vis_043_table_min': ['line_item', 'table'],
 'vis_044_table_count_distinct': ['line_item', 'table'],
 'vis_045_table_range': ['line_item', 'table'],
 'vis_046_table_ranked_mode': ['line_item', 'table'],
 'vis_047_table_sum': ['data_cube', 'table'],
 'vis_048_table_sorted': ['data_cube', 'table'],
 'vis_049_line_cdf': ['line_item', 'line'],
 'vis_050_grouped_line_cdf': ['line_item', 'grouped_line'],
 'vis_051_line_sorted': ['data_cube', 'line'],
 'vis_052_heatmap_count': ['line_item', 'heatmap'],
 'vis_053_heatmap_avg': ['line_item', 'heatmap'],
 'vis_054_heatmap_basic': ['data_cube', 'heatmap'],
 'vis_055_grouped_scatter_by_color': ['line_item', 'grouped_scatter'],
 'vis_056_histogram_distribution': ['line_item', 'histogram'],
 'vis_057_area_density': ['line_item', 'area'],
 'vis_058_dot_distribution': ['line_item', 'dot'],
 'vis_059_grouped_area_density': ['line_item', 'grouped_area'],
 'vis_060_grouped_dot_distribution': ['line_item', 'grouped_dot'],
 'vis_061_table_count_null_nonnull': ['line_item', 'table'],
 'vis_062_table_count_null': ['line_item', 'table']}


# User-facing text per tool name: (title_template, summary_template),
# with placeholders rewritten to tokens the frontend resolves against
# the live spec so both survive a field swap.
TOOL_TEXT = {'vis_000_barchart_count_vert_grouped': ('Bar chart of the number of {entity} by {enc:x}',
                                         'Displays the number of {entity} in each {enc:x} category as vertical bars.'),
 'vis_001_barchart_count_horiz_grouped': ('Bar chart of the number of {entity} by {enc:y}',
                                          'Displays the number of {entity} in each {enc:y} category as horizontal '
                                          'bars.'),
 'vis_002_barchart_join_count_vert_grouped': ('Bar chart of the number of {entity1} by {enc:x}',
                                              'Displays the number of {entity1} in each {enc:x} category as vertical '
                                              'bars.'),
 'vis_003_barchart_join_count_horiz_grouped': ('Bar chart of the number of {entity1} by {enc:y}',
                                               'Displays the number of {entity1} in each {enc:y} category as '
                                               'horizontal bars.'),
 'vis_004_barchart_basic': ('Bar chart of {enc:y} by {enc:x}', 'Displays {enc:y} for each {enc:x} category as bars.'),
 'vis_005_barchart_basic': ('Bar chart of {enc:y} by {enc:x}',
                            'Displays {enc:y} across the values of {enc:x} as bars.'),
 'vis_006_stacked_bar_join_count_vert_stacked_grouped': ('Stacked bar chart of the number of {entity1} by {enc:x} and '
                                                         '{enc:color}',
                                                         'Displays the number of {entity1} in each {enc:x} category as '
                                                         'vertical bars, split by {enc:color}.'),
 'vis_007_stacked_bar_join_count_horiz_stacked_grouped': ('Stacked bar chart of the number of {entity1} by {enc:y} and '
                                                          '{enc:color}',
                                                          'Displays the number of {entity1} in each {enc:y} category '
                                                          'as horizontal bars, split by {enc:color}.'),
 'vis_008_stacked_bar_count_vert_stacked_grouped': ('Stacked bar chart of the number of {entity} by {enc:x} and '
                                                    '{enc:color}',
                                                    'Displays the number of {entity} in each {enc:x} category as '
                                                    'vertical bars, split by {enc:color}.'),
 'vis_009_stacked_bar_count_horiz_stacked_grouped': ('Stacked bar chart of the number of {entity} by {enc:y} and '
                                                     '{enc:color}',
                                                     'Displays the number of {entity} in each {enc:y} category as '
                                                     'horizontal bars, split by {enc:color}.'),
 'vis_010_stacked_bar_vert_stacked': ('Stacked bar chart of {enc:y} by {enc:x} and {enc:color}',
                                      'Displays {enc:y} for each {enc:x} category as bars, split by {enc:color}.'),
 'vis_011_stacked_bar_count_vert_grouped': ('Grouped bar chart of the number of {entity} by {enc:x} and {enc:xOffset}',
                                            'Displays the number of {entity} in each {enc:x} category as vertical '
                                            'bars, placed side by side for each {enc:xOffset}.'),
 'vis_012_stacked_bar_count_horiz_grouped': ('Grouped bar chart of the number of {entity} by {enc:y} and {enc:yOffset}',
                                             'Displays the number of {entity} in each {enc:y} category as horizontal '
                                             'bars, placed side by side for each {enc:yOffset}.'),
 'vis_013_stacked_bar_grouped': ('Grouped bar chart of {enc:y} by {enc:x} and {enc:xOffset}',
                                 'Displays {enc:y} for each {enc:x} category as bars, placed side by side for each '
                                 '{enc:xOffset}.'),
 'vis_014_stacked_bar_freq_vert_normalized': ('Normalized bar chart of {enc:color} within {enc:x}',
                                              'Displays what share of the {entity} in each {enc:x} category falls into '
                                              'each {enc:color} value, as vertical bars scaled to 100%.'),
 'vis_015_stacked_bar_freq_horiz_normalized': ('Normalized bar chart of {enc:color} within {enc:y}',
                                               'Displays what share of the {entity} in each {enc:y} category falls '
                                               'into each {enc:color} value, as horizontal bars scaled to 100%.'),
 'vis_016_stacked_bar_proportion_stacked_normalized': ('Normalized bar chart of {enc:color} within {enc:x}',
                                                       'Displays what share of {bind:M} in each {enc:x} category falls '
                                                       'into each {enc:color} value, as bars scaled to 100%.'),
 'vis_017_barchart_min_horiz': ('Bar chart of {enc:x} by {enc:y}',
                                'Displays the smallest {field:x} among the {entity} in each {enc:y} category as '
                                'horizontal bars.'),
 'vis_018_barchart_min_vert': ('Bar chart of {enc:y} by {enc:x}',
                               'Displays the smallest {field:y} among the {entity} in each {enc:x} category as '
                               'vertical bars.'),
 'vis_019_barchart_max_horiz': ('Bar chart of {enc:x} by {enc:y}',
                                'Displays the largest {field:x} among the {entity} in each {enc:y} category as '
                                'horizontal bars.'),
 'vis_020_barchart_max_vert': ('Bar chart of {enc:y} by {enc:x}',
                               'Displays the largest {field:y} among the {entity} in each {enc:x} category as vertical '
                               'bars.'),
 'vis_021_barchart_avg_horiz': ('Bar chart of {enc:x} by {enc:y}',
                                'Displays the mean {field:x} across the {entity} in each {enc:y} category as '
                                'horizontal bars.'),
 'vis_022_barchart_avg_vert': ('Bar chart of {enc:y} by {enc:x}',
                               'Displays the mean {field:y} across the {entity} in each {enc:x} category as vertical '
                               'bars.'),
 'vis_023_barchart_median_horiz': ('Bar chart of {enc:x} by {enc:y}',
                                   'Displays the middle {field:x} value among the {entity} in each {enc:y} category as '
                                   'horizontal bars.'),
 'vis_024_barchart_median_vert': ('Bar chart of {enc:y} by {enc:x}',
                                  'Displays the middle {field:y} value among the {entity} in each {enc:x} category as '
                                  'vertical bars.'),
 'vis_025_barchart_sum_horiz': ('Bar chart of {enc:x} by {enc:y}',
                                'Displays the sum of {field:x} across the {entity} in each {enc:y} category as '
                                'horizontal bars.'),
 'vis_026_barchart_sum_vert': ('Bar chart of {enc:y} by {enc:x}',
                               'Displays the sum of {field:y} across the {entity} in each {enc:x} category as vertical '
                               'bars.'),
 'vis_027_scatterplot_basic': ('Scatterplot of {enc:x} and {enc:y}',
                               'Displays a point for each {entity:one}, positioned by {enc:x} and {enc:y}.'),
 'vis_028_stacked_bar_count_vert_stacked_grouped': ('Stacked bar chart of the number of {entity} by {enc:x} and '
                                                    '{enc:color}',
                                                    'Displays the number of {entity} in each {enc:x} category as '
                                                    'vertical bars, split by {enc:color}.'),
 'vis_029_stacked_bar_count_horiz_stacked_grouped': ('Stacked bar chart of the number of {entity} by {enc:y} and '
                                                     '{enc:color}',
                                                     'Displays the number of {entity} in each {enc:y} category as '
                                                     'horizontal bars, split by {enc:color}.'),
 'vis_030_circular_proportion_distribution': ('Pie chart of the number of {entity} by {enc:color}',
                                              'Displays the share of {entity} that falls into each {enc:color} '
                                              'category as slices of a circle.'),
 'vis_031_circular_proportion_distribution': ('Donut chart of the number of {entity} by {enc:color}',
                                              'Displays the share of {entity} that falls into each {enc:color} '
                                              'category as segments of a ring.'),
 'vis_032_circular_proportion': ('Pie chart of {enc:theta} by {enc:color}',
                                 'Displays the share of {enc:theta} that falls into each {enc:color} category as '
                                 'slices of a circle.'),
 'vis_033_circular_proportion': ('Donut chart of {enc:theta} by {enc:color}',
                                 'Displays the share of {enc:theta} that falls into each {enc:color} category as '
                                 'segments of a ring.'),
 'vis_034_table_count': ('Table of the number of {entity}',
                         'Displays the total number of {entity} as a single figure.'),
 'vis_035_table_raw': ('Table of {entity}', 'Lists each {entity:one} record with all of its fields.'),
 'vis_036_table_join': ('Table of {entity1} and {entity2}',
                        'Lists each {entity1:one} record alongside the related {entity2:one} records it joins to.'),
 'vis_037_table_join_count_ranked': ('Table of {entity2} by the number of {entity1}',
                                     'Ranks each {entity2:one} by how many {entity1:one} records it has, with a bar in '
                                     'each row showing the count.'),
 'vis_038_table_ranked': ('Table of {entity} by {enc:x}',
                          'Ranks {entity} from the largest {enc:x} down, with a bar in each row showing the value.'),
 'vis_039_table_join_max_ranked': ('Table of {entity2} by largest {enc:x}',
                                   'Ranks each {entity2:one} by the largest {field:x} among its {entity1:one} records, '
                                   'with a bar in each row showing the value.'),
 'vis_040_table_ranked': ('Table of {entity} by {bind:F}',
                          'Ranks {entity} from the smallest {bind:F} up, highlighting the smallest value.'),
 'vis_041_table_join_min_ranked': ('Table of {entity2} by smallest {bind:E1.F}',
                                   'Ranks each {entity2:one} by the smallest {bind:E1.F} among its {entity1:one} '
                                   'records, highlighting the smallest value.'),
 'vis_042_table_sorted': ('Table of {entity} sorted by {enc:x}',
                          'Lists {entity} ordered by {enc:x}, with a bar in each row showing the value.'),
 'vis_043_table_min': ('Table of the {enc:text} range',
                       'Displays the smallest and largest {field:text} across all {entity} as a single row.'),
 'vis_044_table_count_distinct': ('Table of the number of {entity} by {enc:text}',
                                  'Lists every distinct {enc:text} value with how many {entity} have it, with a bar in '
                                  'each row showing the count.'),
 'vis_045_table_range': ('Table of the {enc:text} range by {enc:text}',
                         'Lists each {enc:text} category with the smallest and largest {field:text} among its '
                         '{entity}, drawn as a range bar.'),
 'vis_046_table_ranked_mode': ('Table of the number of {entity} by {enc:text}',
                               'Ranks every {enc:text} value by how many {entity} have it, highlighting the most '
                               'frequent.'),
 'vis_047_table_sum': ('Table of {enc:text}', 'Displays the overall {enc:text} as a single figure.'),
 'vis_048_table_sorted': ('Table of {enc:x} by {enc:text}',
                          'Lists each {enc:text} category with its {enc:x}, with a bar in each row showing the value.'),
 'vis_049_line_cdf': ('Line chart of the {enc:x} distribution',
                      'Displays what share of {entity} fall at or below each {enc:x} value, as a rising line.'),
 'vis_050_grouped_line_cdf': ('Line chart of the {enc:x} distribution by {enc:color}',
                              'Displays what share of {entity} fall at or below each {enc:x} value, as one line per '
                              '{enc:color} category.'),
 'vis_051_line_sorted': ('Line chart of {enc:y} over {enc:x}',
                         'Displays how {enc:y} changes across {enc:x}, as a line.'),
 'vis_052_heatmap_count': ('Heatmap of the number of {entity} by {enc:y} and {enc:x}',
                           'Displays the number of {entity} for each pairing of {enc:y} and {enc:x}, as a grid of '
                           'shaded, labelled cells.'),
 'vis_053_heatmap_avg': ('Heatmap of {enc:color} by {enc:y} and {enc:x}',
                         'Displays the mean {field:color} for each pairing of {enc:y} and {enc:x}, as a grid of shaded '
                         'cells.'),
 'vis_054_heatmap_basic': ('Heatmap of {enc:color} by {enc:x} and {enc:y}',
                           'Displays {enc:color} for each pairing of {enc:x} and {enc:y}, as a grid of shaded, '
                           'labelled cells.'),
 'vis_055_grouped_scatter_by_color': ('Scatterplot of {enc:x} and {enc:y} by {enc:color}',
                                      'Displays a point for each {entity:one}, positioned by {enc:x} and {enc:y} and '
                                      'coloured by {enc:color}.'),
 'vis_056_histogram_distribution': ('Histogram of {bind:F}',
                                    'Displays how many {entity} fall into each range of {bind:F}, as adjacent bars.'),
 'vis_057_area_density': ('Density plot of {enc:x}',
                          'Displays where {entity} concentrate across {enc:x}, as a smooth curve.'),
 'vis_058_dot_distribution': ('Dot plot of {enc:x}',
                              'Displays a point for each {entity:one} along a single {enc:x} axis.'),
 'vis_059_grouped_area_density': ('Density plot of {enc:x} by {enc:color}',
                                  'Displays where {entity} concentrate across {enc:x}, as one overlapping curve per '
                                  '{enc:color} category.'),
 'vis_060_grouped_dot_distribution': ('Dot plot of {enc:x} by {enc:y}',
                                      'Displays a point for each {entity:one} along {enc:x}, with one row per {enc:y} '
                                      'category.'),
 'vis_061_table_count_null_nonnull': ('Table of {enc:text} completeness',
                                      'Displays how many {entity} have a value for {field:text}, and what percentage '
                                      'of them that is.'),
 'vis_062_table_count_null': ('Table of missing {enc:text} values',
                              'Displays how many {entity} are missing {field:text}, and what percentage of them that '
                              'is.')}
