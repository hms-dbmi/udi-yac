"""
Auto-generated visualization tool definitions.

Generated from: src/udiagent/data/skills/template_visualizations.json
Tools: 66

Schema-independent: tool params are free-form strings resolved against the
per-request data schema at runtime (see vis_generate._execute_generate).
TOOL_TAGS maps each tool to its template tags for per-request selection.

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
 '{"op": "min", "field": "<F1:q>"}}}], "representation": {"mark": "bar", "mapping": [{"encoding": "x", "field": '
 '"minimum <F1>", "type": "quantitative"}, {"encoding": "y", "field": "<F2>", "type": "nominal"}]}}',
 '{"source": {"name": "<E>", "source": "<E.url>"}, "transformation": [{"groupby": "<F2>"}, {"rollup": {"minimum <F1>": '
 '{"op": "min", "field": "<F1:q>"}}}], "representation": {"mark": "bar", "mapping": [{"encoding": "x", "field": '
 '"<F2>", "type": "nominal"}, {"encoding": "y", "field": "minimum <F1>", "type": "quantitative"}]}}',
 '{"source": {"name": "<E>", "source": "<E.url>"}, "transformation": [{"groupby": "<F2>"}, {"rollup": {"maximum <F1>": '
 '{"op": "max", "field": "<F1:q>"}}}], "representation": {"mark": "bar", "mapping": [{"encoding": "x", "field": '
 '"maximum <F1>", "type": "quantitative"}, {"encoding": "y", "field": "<F2>", "type": "nominal"}]}}',
 '{"source": {"name": "<E>", "source": "<E.url>"}, "transformation": [{"groupby": "<F2>"}, {"rollup": {"maximum <F1>": '
 '{"op": "max", "field": "<F1:q>"}}}], "representation": {"mark": "bar", "mapping": [{"encoding": "x", "field": '
 '"<F2>", "type": "nominal"}, {"encoding": "y", "field": "maximum <F1>", "type": "quantitative"}]}}',
 '{"source": {"name": "<E>", "source": "<E.url>"}, "transformation": [{"groupby": "<F2>"}, {"rollup": {"average <F1>": '
 '{"op": "mean", "field": "<F1:q>"}}}], "representation": {"mark": "bar", "mapping": [{"encoding": "x", "field": '
 '"average <F1>", "type": "quantitative"}, {"encoding": "y", "field": "<F2>", "type": "nominal"}]}}',
 '{"source": {"name": "<E>", "source": "<E.url>"}, "transformation": [{"groupby": "<F2>"}, {"rollup": {"average <F1>": '
 '{"op": "mean", "field": "<F1:q>"}}}], "representation": {"mark": "bar", "mapping": [{"encoding": "x", "field": '
 '"<F2>", "type": "nominal"}, {"encoding": "y", "field": "average <F1>", "type": "quantitative"}]}}',
 '{"source": {"name": "<E>", "source": "<E.url>"}, "transformation": [{"groupby": "<F2>"}, {"rollup": {"median <F1>": '
 '{"op": "median", "field": "<F1:q>"}}}], "representation": {"mark": "bar", "mapping": [{"encoding": "x", "field": '
 '"median <F1>", "type": "quantitative"}, {"encoding": "y", "field": "<F2>", "type": "nominal"}]}}',
 '{"source": {"name": "<E>", "source": "<E.url>"}, "transformation": [{"groupby": "<F2>"}, {"rollup": {"median <F1>": '
 '{"op": "median", "field": "<F1:q>"}}}], "representation": {"mark": "bar", "mapping": [{"encoding": "x", "field": '
 '"<F2>", "type": "nominal"}, {"encoding": "y", "field": "median <F1>", "type": "quantitative"}]}}',
 '{"source": {"name": "<E>", "source": "<E.url>"}, "transformation": [{"groupby": "<F2>"}, {"rollup": {"total <F1>": '
 '{"op": "sum", "field": "<F1:q>"}}}], "representation": {"mark": "bar", "mapping": [{"encoding": "x", "field": "total '
 '<F1>", "type": "quantitative"}, {"encoding": "y", "field": "<F2>", "type": "nominal"}]}}',
 '{"source": {"name": "<E>", "source": "<E.url>"}, "transformation": [{"groupby": "<F2>"}, {"rollup": {"total <F1>": '
 '{"op": "sum", "field": "<F1:q>"}}}], "representation": {"mark": "bar", "mapping": [{"encoding": "x", "field": '
 '"<F2>", "type": "nominal"}, {"encoding": "y", "field": "total <F1>", "type": "quantitative"}]}}',
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
 '{"groupby": "<E1.r.E2.id.from>"}, {"rollup": {"Largest <E1.F>": {"op": "max", "field": "<E1.F:q>"}}}, {"filter": '
 '{"op": "!=", "left": {"field": "Largest <E1.F>"}, "right": {"literal": null}}}, {"orderby": {"field": "Largest '
 '<E1.F>", "order": "desc"}}, {"derive": {"rank": {"window": "rank"}}}, {"derive": {"largest": {"if": {"op": "==", '
 '"left": {"field": "rank"}, "right": {"literal": 1}}, "then": {"literal": "yes"}, "else": {"literal": "no"}}}}], '
 '"representation": {"mark": "row", "mapping": [{"encoding": "x", "field": "Largest <E1.F>", "mark": "bar", "type": '
 '"quantitative"}, {"encoding": "color", "column": "Largest <E1.F>", "mark": "bar", "field": "largest", "type": '
 '"nominal", "domain": ["yes", "no"], "range": ["#FFA500", "#c6cfd8"]}, {"encoding": "text", "field": "*", "mark": '
 '"text", "type": "nominal"}]}}',
 '{"source": {"name": "<E>", "source": "<E.url>"}, "transformation": [{"filter": {"op": "!=", "left": {"field": '
 '"<F>"}, "right": {"literal": null}}}, {"orderby": {"field": "<F:q>", "order": "asc"}}, {"derive": {"smallest": '
 '{"if": {"op": "==", "left": {"window": "rank"}, "right": {"literal": 1}}, "then": {"literal": "smallest"}, "else": '
 '{"literal": "not"}}}}], "representation": {"mark": "row", "mapping": [{"encoding": "color", "column": "<F>", "mark": '
 '"rect", "orderby": "<F>", "field": "smallest", "type": "nominal", "domain": ["smallest", "not"], "range": '
 '["#ffdb9a", "white"]}, {"encoding": "text", "field": "*", "mark": "text", "type": "nominal"}]}}',
 '{"source": [{"name": "<E1>", "source": "<E1.url>"}, {"name": "<E2>", "source": "<E2.url>"}], "transformation": '
 '[{"join": {"on": ["<E1.r.E2.id.from>", "<E1.r.E2.id.to>"]}, "in": ["<E1>", "<E2>"], "out": "<E1>__<E2>"}, '
 '{"groupby": "<E1.r.E2.id.from>"}, {"rollup": {"Smallest <E1.F>": {"op": "min", "field": "<E1.F:q>"}}}, {"filter": '
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
 '"<F>"}, "right": {"literal": null}}}, {"rollup": {"<F> min": {"op": "min", "field": "<F:q>"}, "<F> max": {"op": '
 '"max", "field": "<F:q>"}}}], "representation": {"mark": "row", "mapping": [{"encoding": "text", "field": "<F> min", '
 '"mark": "text", "type": "nominal"}, {"encoding": "text", "field": "<F> max", "mark": "text", "type": "nominal"}]}}',
 '{"source": {"name": "<E>", "source": "<E.url>"}, "transformation": [{"filter": {"op": "!=", "left": {"field": '
 '"<F>"}, "right": {"literal": null}}}, {"groupby": "<F:n>"}, {"rollup": {"count": {"op": "count"}}}, {"orderby": '
 '{"field": "count", "order": "desc"}}], "representation": {"mark": "row", "mapping": [{"encoding": "text", "field": '
 '"<F>", "mark": "text", "type": "nominal"}, {"encoding": "x", "column": "count", "field": "count", "mark": "bar", '
 '"type": "quantitative", "range": {"min": 0.1, "max": 1}}, {"encoding": "text", "column": "count", "field": "count", '
 '"mark": "text", "type": "nominal"}]}}',
 '{"source": {"name": "<E>", "source": "<E.url>"}, "transformation": [{"filter": {"op": "!=", "left": {"field": '
 '"<F1>"}, "right": {"literal": null}}}, {"groupby": "<F2>"}, {"rollup": {"<F1> min": {"op": "min", "field": '
 '"<F1:q>"}, "<F1> max": {"op": "max", "field": "<F1:q>"}}}, {"derive": {"range": {"op": "-", "left": {"field": "<F1> '
 'max"}, "right": {"field": "<F1> min"}}}}, {"orderby": {"field": "range", "order": "desc"}}], "representation": '
 '{"mark": "row", "mapping": [{"encoding": "text", "field": "<F2>", "mark": "text", "type": "nominal"}, {"encoding": '
 '"text", "field": "<F1> min", "mark": "text", "type": "nominal"}, {"encoding": "x", "column": "range", "mark": "bar", '
 '"field": "<F1> min", "type": "quantitative", "domain": {"numberFields": ["<F1> min", "<F1> max"]}}, {"encoding": '
 '"x2", "column": "range", "mark": "bar", "field": "<F1> max", "type": "quantitative", "domain": {"numberFields": '
 '["<F1> min", "<F1> max"]}}, {"encoding": "text", "field": "<F1> max", "mark": "text", "type": "nominal"}]}}',
 '{"source": {"name": "<E>", "source": "<E.url>"}, "transformation": [{"filter": {"field": "<F>"}}, {"groupby": '
 '"<F>"}, {"rollup": {"count": {"op": "count"}}}, {"orderby": {"field": "count", "order": "desc"}}, {"derive": '
 '{"rank": {"window": "rank"}}}, {"derive": {"most frequent": {"if": {"op": "==", "left": {"field": "rank"}, "right": '
 '{"literal": 1}}, "then": {"literal": "yes"}, "else": {"literal": "no"}}}}], "representation": {"mark": "row", '
 '"mapping": [{"encoding": "color", "column": "<F>", "mark": "bar", "orderby": "<F>", "field": "most frequent", '
 '"type": "nominal", "domain": ["yes", "no"], "range": ["#ffdb9a", "white"]}, {"encoding": "text", "field": "<F>", '
 '"mark": "text", "type": "nominal"}, {"encoding": "x", "column": "count", "field": "count", "mark": "bar", "type": '
 '"quantitative", "domain": {"min": 0}}, {"encoding": "color", "column": "count", "mark": "bar", "field": "most '
 'frequent", "type": "nominal", "domain": ["yes", "no"], "range": ["#FFA500", "#c6cfd8"]}, {"encoding": "text", '
 '"column": "count", "field": "count", "mark": "text", "type": "nominal"}]}}',
 '{"source": {"name": "<E>", "source": "<E.url>"}, "transformation": [{"filter": "<MARGINAL>"}], "representation": '
 '{"mark": "row", "mapping": {"encoding": "text", "field": "<M>", "mark": "text", "type": "nominal"}}}',
 '{"source": {"name": "<E>", "source": "<E.url>"}, "transformation": [{"filter": "<MARGINAL:D>"}, {"orderby": '
 '{"field": "<M>", "order": "desc"}}], "representation": {"mark": "row", "mapping": [{"encoding": "text", "field": '
 '"<D:n>", "mark": "text", "type": "nominal"}, {"encoding": "x", "column": "<M>", "field": "<M>", "mark": "bar", '
 '"type": "quantitative", "range": {"min": 0.1, "max": 1}}, {"encoding": "text", "column": "<M>", "field": "<M>", '
 '"mark": "text", "type": "nominal"}]}}',
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
 '{"source": {"name": "<E>", "source": "<E.url>"}, "transformation": [{"filter": {"op": "!=", "left": {"field": '
 '"<F3:q>"}, "right": {"literal": null}}}, {"derive": {"start day": {"if": {"op": "==", "left": {"field": "<F2:n>"}, '
 '"right": {"literal": "<V1>"}}, "then": {"field": "<F3>"}, "else": {"literal": null}}, "end day": {"if": {"op": "==", '
 '"left": {"field": "<F2>"}, "right": {"literal": "<V2>"}}, "then": {"field": "<F3>"}, "else": {"literal": null}}}}, '
 '{"groupby": "<F1:n>"}, {"rollup": {"start day": {"op": "min", "field": "start day"}, "end day": {"op": "max", '
 '"field": "end day"}}}, {"filter": {"op": "!=", "left": {"field": "start day"}, "right": {"literal": null}}}, '
 '{"derive": {"subjects": {"agg": "count"}}}, {"derive": {"survival days": {"op": "-", "left": {"field": "end day"}, '
 '"right": {"field": "start day"}}}}, {"filter": {"op": "&&", "left": {"op": "!=", "left": {"field": "survival days"}, '
 '"right": {"literal": null}}, "right": {"op": ">=", "left": {"field": "survival days"}, "right": {"literal": 0}}}}, '
 '{"orderby": {"field": "survival days", "order": "asc"}}, {"derive": {"survival probability": {"rolling": '
 '{"expression": {"op": "-", "left": {"literal": 1}, "right": {"op": "/", "left": {"agg": "count"}, "right": {"field": '
 '"subjects"}}}}}}}], "representation": {"mark": "line", "mapping": [{"encoding": "x", "field": "survival days", '
 '"type": "quantitative"}, {"encoding": "y", "field": "survival probability", "type": "quantitative"}]}}',
 '{"source": {"name": "<E>", "source": "<E.url>"}, "transformation": [{"filter": {"op": "!=", "left": {"field": '
 '"<F3:q>"}, "right": {"literal": null}}}, {"derive": {"start day": {"if": {"op": "==", "left": {"field": "<F2:n>"}, '
 '"right": {"literal": "<V1>"}}, "then": {"field": "<F3>"}, "else": {"literal": null}}, "end day": {"if": {"op": "==", '
 '"left": {"field": "<F2>"}, "right": {"literal": "<V2>"}}, "then": {"field": "<F3>"}, "else": {"literal": null}}}}, '
 '{"groupby": ["<F1:n>", "<F4:n>"]}, {"rollup": {"start day": {"op": "min", "field": "start day"}, "end day": {"op": '
 '"max", "field": "end day"}}}, {"filter": {"op": "!=", "left": {"field": "start day"}, "right": {"literal": null}}}, '
 '{"groupby": "<F4>"}, {"derive": {"subjects": {"agg": "count"}}}, {"derive": {"survival days": {"op": "-", "left": '
 '{"field": "end day"}, "right": {"field": "start day"}}}}, {"filter": {"op": "&&", "left": {"op": "!=", "left": '
 '{"field": "survival days"}, "right": {"literal": null}}, "right": {"op": ">=", "left": {"field": "survival days"}, '
 '"right": {"literal": 0}}}}, {"orderby": {"field": "survival days", "order": "asc"}}, {"derive": {"survival '
 'probability": {"rolling": {"expression": {"op": "-", "left": {"literal": 1}, "right": {"op": "/", "left": {"agg": '
 '"count"}, "right": {"field": "subjects"}}}}}}}], "representation": {"mark": "line", "mapping": [{"encoding": "x", '
 '"field": "survival days", "type": "quantitative"}, {"encoding": "y", "field": "survival probability", "type": '
 '"quantitative"}, {"encoding": "color", "field": "<F4>", "type": "nominal"}]}}',
 '{"source": {"name": "<E>", "source": "<E.url>"}, "transformation": [{"unnest": {"field": "<F4:n>", "separator": '
 '";"}}, {"filter": {"op": "!=", "left": {"field": "<F3:q>"}, "right": {"literal": null}}}, {"derive": {"start day": '
 '{"if": {"op": "==", "left": {"field": "<F2:n>"}, "right": {"literal": "<V1>"}}, "then": {"field": "<F3>"}, "else": '
 '{"literal": null}}, "end day": {"if": {"op": "==", "left": {"field": "<F2>"}, "right": {"literal": "<V2>"}}, "then": '
 '{"field": "<F3>"}, "else": {"literal": null}}}}, {"groupby": ["<F1:n>", "<F4>"]}, {"rollup": {"start day": {"op": '
 '"min", "field": "start day"}, "end day": {"op": "max", "field": "end day"}}}, {"filter": {"op": "!=", "left": '
 '{"field": "start day"}, "right": {"literal": null}}}, {"groupby": "<F4>"}, {"derive": {"subjects": {"agg": '
 '"count"}}}, {"derive": {"survival days": {"op": "-", "left": {"field": "end day"}, "right": {"field": "start '
 'day"}}}}, {"filter": {"op": "&&", "left": {"op": "!=", "left": {"field": "survival days"}, "right": {"literal": '
 'null}}, "right": {"op": ">=", "left": {"field": "survival days"}, "right": {"literal": 0}}}}, {"orderby": {"field": '
 '"survival days", "order": "asc"}}, {"derive": {"survival probability": {"rolling": {"expression": {"op": "-", '
 '"left": {"literal": 1}, "right": {"op": "/", "left": {"agg": "count"}, "right": {"field": "subjects"}}}}}}}], '
 '"representation": {"mark": "line", "mapping": [{"encoding": "x", "field": "survival days", "type": "quantitative"}, '
 '{"encoding": "y", "field": "survival probability", "type": "quantitative"}, {"encoding": "color", "field": "<F4>", '
 '"type": "nominal"}]}}',
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
 '{"average <F1>": {"op": "mean", "field": "<F1:q>"}}}], "representation": {"mark": "rect", "mapping": [{"encoding": '
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
 '"<F>"}, "right": {"literal": null}}}, {"binby": {"field": "<F:q>", "output": {"bin_start": "start", "bin_end": '
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
TOOL_DEFS = [{'function': {'description': '[barchart] Counts entities grouped by a nominal field, displayed as a vertical bar '
                              'chart. Design: Vertical orientation chosen because category count is small (<=4), '
                              'keeping x-axis labels readable. Tasks: Compare counts across categories; identify the '
                              'most or least common category; assess the range of counts. Query patterns: How many <E> '
                              'are there, grouped by <F:n>?; Make a bar chart of <E> <F:n>.',
               'name': 'vis_000_barchart_count_vert_grouped',
               'parameters': {'additionalProperties': False,
                              'properties': {'entity': {'description': 'The data entity (table) to visualize.',
                                                        'type': 'string'},
                                             'field': {'description': 'nominal field, encodes x-axis.',
                                                       'type': 'string'}},
                              'required': ['entity', 'field'],
                              'type': 'object'}},
  'type': 'function'},
 {'function': {'description': '[barchart] Counts entities grouped by a nominal field, displayed as a horizontal bar '
                              'chart. Design: Horizontal orientation chosen because category count is high (>4), '
                              'allowing longer labels on the y-axis. Tasks: Compare counts across categories; identify '
                              'the most or least common category; assess the range of counts. Query patterns: How many '
                              '<E> are there, grouped by <F:n>?; Make a bar chart of <E> <F:n>.',
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
 {'function': {'description': '[barchart] Shows the pre-aggregated cube measure for each category of a nominal '
                              'dimension as a bar chart. Design: Reads the cube marginal by filtering to rows where '
                              'the chosen dimension(s) are present and every other dimension is empty; the measure is '
                              'mapped directly with no re-aggregation. The marginal filter is expanded from the '
                              "per-request schema's dimension list, so this template works for any cube. Tasks: "
                              'Compare the measure across categories; identify the most or least common category. '
                              'Query patterns: How many are there by <dimension>?; Make a bar chart of the measure by '
                              'a categorical dimension.',
               'name': 'vis_004_barchart_basic',
               'parameters': {'additionalProperties': False,
                              'properties': {'dimension': {'description': 'cube nominal dimension, encodes x-axis.',
                                                           'type': 'string'},
                                             'entity': {'description': 'The data entity (table) to visualize.',
                                                        'type': 'string'}},
                              'required': ['entity', 'dimension'],
                              'type': 'object'}},
  'type': 'function'},
 {'function': {'description': '[barchart] Shows the pre-aggregated cube measure across the values of a quantitative '
                              'dimension as a bar chart. Design: Reads the cube marginal by filtering to rows where '
                              'the chosen dimension(s) are present and every other dimension is empty; the measure is '
                              'mapped directly with no re-aggregation. The marginal filter is expanded from the '
                              "per-request schema's dimension list, so this template works for any cube. Tasks: Assess "
                              'how the measure is distributed across a numeric dimension. Query patterns: Make a bar '
                              'chart of the measure across a quantitative dimension.',
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
 {'function': {'description': '[stacked_bar] Counts entities grouped by two nominal fields, displayed as a vertical '
                              'stacked bar chart. Design: Vertical stacked layout for small category counts (<=4). '
                              'Color encodes the sub-group field; x-axis shows the primary grouping. Color is '
                              'preferably mapped to the variable with fewer unique values for better discriminability. '
                              'Tasks: Compare group compositions across categories; identify dominant sub-groups '
                              'within each bar. Query patterns: How many <E> are there, grouped by <F1:n> and <F2:n>?',
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
 {'function': {'description': '[stacked_bar] Counts entities grouped by two nominal fields, displayed as a horizontal '
                              'stacked bar chart. Design: Horizontal stacked layout for higher category counts (>4). '
                              'Color encodes the sub-group; stacking shows part-to-whole within each bar. Color is '
                              'preferably mapped to the variable with fewer unique values for better discriminability. '
                              'Tasks: Compare group compositions across categories; identify dominant sub-groups '
                              'within each bar. Query patterns: How many <E> are there, grouped by <F1:n> and <F2:n>?; '
                              'What is the count of <F1:n> for each <F2:n>?',
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
 {'function': {'description': '[stacked_bar] Shows the pre-aggregated cube measure by two nominal dimensions as a '
                              'vertical stacked bar chart. Design: Reads the cube marginal by filtering to rows where '
                              'the chosen dimension(s) are present and every other dimension is empty; the measure is '
                              'mapped directly with no re-aggregation. The marginal filter is expanded from the '
                              "per-request schema's dimension list, so this template works for any cube. Color encodes "
                              'the sub-group; prefer the dimension with fewer categories for color. Tasks: Compare '
                              'group compositions across categories; identify dominant sub-groups. Query patterns: How '
                              'many are there by <dimension1> and <dimension2>?; Make a stacked bar chart across two '
                              'categorical dimensions.',
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
 {'function': {'description': '[stacked_bar] Counts entities grouped by two nominal fields, displayed as a grouped '
                              '(side-by-side) vertical bar chart. Design: Uses xOffset for side-by-side grouping, '
                              'allowing direct comparison between sub-groups. Suitable for small category counts '
                              '(<=4). Tasks: Directly compare sub-group counts within and across categories. Query '
                              'patterns: What is the count of <F1:n> for each <F2:n>?',
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
 {'function': {'description': '[stacked_bar] Counts entities grouped by two nominal fields, displayed as a grouped '
                              '(side-by-side) horizontal bar chart. Design: Uses yOffset for side-by-side grouping in '
                              'horizontal orientation. Chosen when at least one field has more than 4 categories. '
                              'Tasks: Directly compare sub-group counts within and across categories. Query patterns: '
                              'What is the count of <F1:n> for each <F2:n>?',
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
 {'function': {'description': '[stacked_bar] Shows the pre-aggregated cube measure by two nominal dimensions as a '
                              'grouped (side-by-side) bar chart. Design: Reads the cube marginal by filtering to rows '
                              'where the chosen dimension(s) are present and every other dimension is empty; the '
                              'measure is mapped directly with no re-aggregation. The marginal filter is expanded from '
                              "the per-request schema's dimension list, so this template works for any cube. xOffset "
                              'gives side-by-side grouping for direct comparison of the sub-group within each '
                              'category. Tasks: Directly compare sub-group values within and across categories. Query '
                              'patterns: Make a grouped (side-by-side) bar chart across two categorical dimensions.',
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
 {'function': {'description': '[stacked_bar] Shows the relative frequency (proportion) of one nominal field within '
                              'each category of another, as a vertical normalized bar chart. Design: Normalization '
                              'computes proportions per group, enabling fair comparison across groups of different '
                              'sizes. Vertical layout for small category counts (<=4). Color is preferably mapped to '
                              'the variable with fewer unique values for better discriminability. Tasks: Compare '
                              'relative proportions across categories; identify which sub-groups dominate in each '
                              'group. Query patterns: What is the proportion of <F1:n> for each <F2:n>?',
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
 {'function': {'description': '[stacked_bar] Shows the relative frequency (proportion) of one nominal field within '
                              'each category of another, as a horizontal normalized bar chart. Design: Normalization '
                              'for proportional comparison. Horizontal layout for higher category counts (>4). Color '
                              'is preferably mapped to the variable with fewer unique values for better '
                              'discriminability. Tasks: Compare relative proportions across categories; identify which '
                              'sub-groups dominate in each group. Query patterns: What is the proportion of <F1:n> for '
                              'each <F2:n>?',
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
 {'function': {'description': '[stacked_bar] Shows the relative proportion of one nominal dimension within each '
                              'category of another as a normalized stacked bar chart. Design: First filters to the '
                              'two-dimension marginal (expanded from the schema), then sums the measure per '
                              'primary-dimension group and divides each cell by its group total to obtain proportions. '
                              'Color is preferably the dimension with fewer categories. Tasks: Compare relative '
                              'proportions across categories; identify dominant sub-groups. Query patterns: What is '
                              'the proportion of <dimension2> for each <dimension1>?',
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
 {'function': {'description': '[barchart] Computes the minimum of a quantitative field for each category, displayed as '
                              'a horizontal bar chart. Design: Horizontal orientation for many categories (>4). Bar '
                              'length encodes the minimum aggregate value for easy comparison. Tasks: Compare the '
                              'minimum value across categories; identify which group has the highest or lowest '
                              'minimum. Query patterns: What is the minimum <F1:q> for each <F2:n>?',
               'name': 'vis_017_barchart_min_horiz',
               'parameters': {'additionalProperties': False,
                              'properties': {'entity': {'description': 'The data entity (table) to visualize.',
                                                        'type': 'string'},
                                             'field1': {'description': 'any type field.', 'type': 'string'},
                                             'field2': {'description': 'nominal field, encodes y-axis.',
                                                        'type': 'string'}},
                              'required': ['entity', 'field1', 'field2'],
                              'type': 'object'}},
  'type': 'function'},
 {'function': {'description': '[barchart] Computes the minimum of a quantitative field for each category, displayed as '
                              'a vertical bar chart. Design: Vertical orientation for few categories (<=4). Bar height '
                              'encodes the minimum aggregate value. Tasks: Compare the minimum value across '
                              'categories; identify which group has the highest or lowest minimum. Query patterns: '
                              'What is the minimum <F1:q> for each <F2:n>?',
               'name': 'vis_018_barchart_min_vert',
               'parameters': {'additionalProperties': False,
                              'properties': {'entity': {'description': 'The data entity (table) to visualize.',
                                                        'type': 'string'},
                                             'field1': {'description': 'any type field.', 'type': 'string'},
                                             'field2': {'description': 'nominal field, encodes x-axis.',
                                                        'type': 'string'}},
                              'required': ['entity', 'field1', 'field2'],
                              'type': 'object'}},
  'type': 'function'},
 {'function': {'description': '[barchart] Computes the maximum of a quantitative field for each category, displayed as '
                              'a horizontal bar chart. Design: Horizontal orientation for many categories (>4). Bar '
                              'length encodes the maximum aggregate value for easy comparison. Tasks: Compare the '
                              'maximum value across categories; identify which group has the highest or lowest '
                              'maximum. Query patterns: What is the maximum <F1:q> for each <F2:n>?',
               'name': 'vis_019_barchart_max_horiz',
               'parameters': {'additionalProperties': False,
                              'properties': {'entity': {'description': 'The data entity (table) to visualize.',
                                                        'type': 'string'},
                                             'field1': {'description': 'any type field.', 'type': 'string'},
                                             'field2': {'description': 'nominal field, encodes y-axis.',
                                                        'type': 'string'}},
                              'required': ['entity', 'field1', 'field2'],
                              'type': 'object'}},
  'type': 'function'},
 {'function': {'description': '[barchart] Computes the maximum of a quantitative field for each category, displayed as '
                              'a vertical bar chart. Design: Vertical orientation for few categories (<=4). Bar height '
                              'encodes the maximum aggregate value. Tasks: Compare the maximum value across '
                              'categories; identify which group has the highest or lowest maximum. Query patterns: '
                              'What is the maximum <F1:q> for each <F2:n>?',
               'name': 'vis_020_barchart_max_vert',
               'parameters': {'additionalProperties': False,
                              'properties': {'entity': {'description': 'The data entity (table) to visualize.',
                                                        'type': 'string'},
                                             'field1': {'description': 'any type field.', 'type': 'string'},
                                             'field2': {'description': 'nominal field, encodes x-axis.',
                                                        'type': 'string'}},
                              'required': ['entity', 'field1', 'field2'],
                              'type': 'object'}},
  'type': 'function'},
 {'function': {'description': '[barchart] Computes the average of a quantitative field for each category, displayed as '
                              'a horizontal bar chart. Design: Horizontal orientation for many categories (>4). Bar '
                              'length encodes the average aggregate value for easy comparison. Tasks: Compare the '
                              'average value across categories; identify which group has the highest or lowest '
                              'average. Query patterns: What is the average <F1:q> for each <F2:n>?',
               'name': 'vis_021_barchart_avg_horiz',
               'parameters': {'additionalProperties': False,
                              'properties': {'entity': {'description': 'The data entity (table) to visualize.',
                                                        'type': 'string'},
                                             'field1': {'description': 'any type field.', 'type': 'string'},
                                             'field2': {'description': 'nominal field, encodes y-axis.',
                                                        'type': 'string'}},
                              'required': ['entity', 'field1', 'field2'],
                              'type': 'object'}},
  'type': 'function'},
 {'function': {'description': '[barchart] Computes the average of a quantitative field for each category, displayed as '
                              'a vertical bar chart. Design: Vertical orientation for few categories (<=4). Bar height '
                              'encodes the average aggregate value. Tasks: Compare the average value across '
                              'categories; identify which group has the highest or lowest average. Query patterns: '
                              'What is the average <F1:q> for each <F2:n>?',
               'name': 'vis_022_barchart_avg_vert',
               'parameters': {'additionalProperties': False,
                              'properties': {'entity': {'description': 'The data entity (table) to visualize.',
                                                        'type': 'string'},
                                             'field1': {'description': 'any type field.', 'type': 'string'},
                                             'field2': {'description': 'nominal field, encodes x-axis.',
                                                        'type': 'string'}},
                              'required': ['entity', 'field1', 'field2'],
                              'type': 'object'}},
  'type': 'function'},
 {'function': {'description': '[barchart] Computes the median of a quantitative field for each category, displayed as '
                              'a horizontal bar chart. Design: Horizontal orientation for many categories (>4). Bar '
                              'length encodes the median aggregate value for easy comparison. Tasks: Compare the '
                              'median value across categories; identify which group has the highest or lowest median. '
                              'Query patterns: What is the median <F1:q> for each <F2:n>?',
               'name': 'vis_023_barchart_median_horiz',
               'parameters': {'additionalProperties': False,
                              'properties': {'entity': {'description': 'The data entity (table) to visualize.',
                                                        'type': 'string'},
                                             'field1': {'description': 'any type field.', 'type': 'string'},
                                             'field2': {'description': 'nominal field, encodes y-axis.',
                                                        'type': 'string'}},
                              'required': ['entity', 'field1', 'field2'],
                              'type': 'object'}},
  'type': 'function'},
 {'function': {'description': '[barchart] Computes the median of a quantitative field for each category, displayed as '
                              'a vertical bar chart. Design: Vertical orientation for few categories (<=4). Bar height '
                              'encodes the median aggregate value. Tasks: Compare the median value across categories; '
                              'identify which group has the highest or lowest median. Query patterns: What is the '
                              'median <F1:q> for each <F2:n>?',
               'name': 'vis_024_barchart_median_vert',
               'parameters': {'additionalProperties': False,
                              'properties': {'entity': {'description': 'The data entity (table) to visualize.',
                                                        'type': 'string'},
                                             'field1': {'description': 'any type field.', 'type': 'string'},
                                             'field2': {'description': 'nominal field, encodes x-axis.',
                                                        'type': 'string'}},
                              'required': ['entity', 'field1', 'field2'],
                              'type': 'object'}},
  'type': 'function'},
 {'function': {'description': '[barchart] Computes the total of a quantitative field for each category, displayed as a '
                              'horizontal bar chart. Design: Horizontal orientation for many categories (>4). Bar '
                              'length encodes the total aggregate value for easy comparison. Tasks: Compare the total '
                              'value across categories; identify which group has the highest or lowest total. Query '
                              'patterns: What is the total <F1:q> for each <F2:n>?',
               'name': 'vis_025_barchart_sum_horiz',
               'parameters': {'additionalProperties': False,
                              'properties': {'entity': {'description': 'The data entity (table) to visualize.',
                                                        'type': 'string'},
                                             'field1': {'description': 'any type field.', 'type': 'string'},
                                             'field2': {'description': 'nominal field, encodes y-axis.',
                                                        'type': 'string'}},
                              'required': ['entity', 'field1', 'field2'],
                              'type': 'object'}},
  'type': 'function'},
 {'function': {'description': '[barchart] Computes the total of a quantitative field for each category, displayed as a '
                              'vertical bar chart. Design: Vertical orientation for few categories (<=4). Bar height '
                              'encodes the total aggregate value. Tasks: Compare the total value across categories; '
                              'identify which group has the highest or lowest total. Query patterns: What is the total '
                              '<F1:q> for each <F2:n>?',
               'name': 'vis_026_barchart_sum_vert',
               'parameters': {'additionalProperties': False,
                              'properties': {'entity': {'description': 'The data entity (table) to visualize.',
                                                        'type': 'string'},
                                             'field1': {'description': 'any type field.', 'type': 'string'},
                                             'field2': {'description': 'nominal field, encodes x-axis.',
                                                        'type': 'string'}},
                              'required': ['entity', 'field1', 'field2'],
                              'type': 'object'}},
  'type': 'function'},
 {'function': {'description': '[scatterplot] Plots two quantitative fields as a scatterplot to explore their '
                              'relationship. Design: Point marks on two quantitative axes reveal correlations, '
                              'clusters, and outliers. Data size capped at 100k rows for rendering performance. Tasks: '
                              'Assess correlation between two variables; identify clusters, outliers, extremes, and '
                              'the range of both variables. Query patterns: Is there a correlation between <F1:q> and '
                              '<F2:q>?; Make a scatterplot of <F1:q> and <F2:q>?',
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
 {'function': {'description': '[stacked_bar] Creates a vertical stacked bar chart of counts grouped by two nominal '
                              'fields. Design: Vertical stacked layout for small primary category counts (<=4). Color '
                              'encodes the secondary field. Color is preferably mapped to the variable with fewer '
                              'unique values for better discriminability. Tasks: Compare group compositions across '
                              'categories; assess the overall range of counts. Query patterns: Make a stacked bar '
                              'chart of <F1:n> and <F2:n>?',
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
 {'function': {'description': '[stacked_bar] Creates a horizontal stacked bar chart of counts grouped by two nominal '
                              'fields. Design: Horizontal stacked layout for higher primary category counts (>4). '
                              'Color encodes the secondary field. Color is preferably mapped to the variable with '
                              'fewer unique values for better discriminability. Tasks: Compare group compositions '
                              'across categories; assess the overall range of counts. Query patterns: Make a stacked '
                              'bar chart of <F1:n> and <F2:n>?',
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
 {'function': {'description': '[circular] Creates a pie chart showing the proportional distribution of a nominal '
                              'field. Design: Arc marks with theta encoding map proportion to angle. Suitable for '
                              'fields with few categories (<8) where part-to-whole perception is the goal. Tasks: '
                              'Assess part-to-whole proportions; identify the dominant category. Query patterns: Make '
                              'a pie chart of <F:n>?',
               'name': 'vis_030_circular_proportion_distribution',
               'parameters': {'additionalProperties': False,
                              'properties': {'entity': {'description': 'The data entity (table) to visualize.',
                                                        'type': 'string'},
                                             'field': {'description': 'nominal field, encodes color.',
                                                       'type': 'string'}},
                              'required': ['entity', 'field'],
                              'type': 'object'}},
  'type': 'function'},
 {'function': {'description': '[circular] Creates a donut chart showing the proportional distribution of a nominal '
                              'field. Design: Donut variant with inner/outer radius creates a hollow center that can '
                              'improve label readability. Suitable for few categories (<8). Tasks: Assess '
                              'part-to-whole proportions; identify the dominant category. Query patterns: Make a donut '
                              'chart of <F:n>?',
               'name': 'vis_031_circular_proportion_distribution',
               'parameters': {'additionalProperties': False,
                              'properties': {'entity': {'description': 'The data entity (table) to visualize.',
                                                        'type': 'string'},
                                             'field': {'description': 'nominal field, encodes color.',
                                                       'type': 'string'}},
                              'required': ['entity', 'field'],
                              'type': 'object'}},
  'type': 'function'},
 {'function': {'description': '[circular] Shows the proportional cube measure for each category of a nominal dimension '
                              'as a pie chart. Design: Reads the cube marginal by filtering to rows where the chosen '
                              'dimension(s) are present and every other dimension is empty; the measure is mapped '
                              'directly with no re-aggregation. The marginal filter is expanded from the per-request '
                              "schema's dimension list, so this template works for any cube. The measure maps to angle "
                              'and the renderer normalizes each slice against the total. Best for a small number of '
                              'categories. Tasks: Assess part-to-whole proportions; identify the dominant category. '
                              'Query patterns: Make a pie chart of the measure by a categorical dimension.',
               'name': 'vis_032_circular_proportion',
               'parameters': {'additionalProperties': False,
                              'properties': {'dimension': {'description': 'cube nominal dimension, encodes color.',
                                                           'type': 'string'},
                                             'entity': {'description': 'The data entity (table) to visualize.',
                                                        'type': 'string'}},
                              'required': ['entity', 'dimension'],
                              'type': 'object'}},
  'type': 'function'},
 {'function': {'description': '[circular] Shows the proportional cube measure for each category of a nominal dimension '
                              'as a donut chart. Design: Reads the cube marginal by filtering to rows where the chosen '
                              'dimension(s) are present and every other dimension is empty; the measure is mapped '
                              'directly with no re-aggregation. The marginal filter is expanded from the per-request '
                              "schema's dimension list, so this template works for any cube. The measure maps to angle "
                              'and the renderer normalizes each slice against the total. Best for a small number of '
                              'categories. Tasks: Assess part-to-whole proportions; identify the dominant category. '
                              'Query patterns: Make a donut chart of the measure by a categorical dimension.',
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
 {'function': {'description': '[table] Finds the record with the largest value in a quantitative field, displayed as a '
                              'ranked table with bar indicators. Design: Sorts descending by the target field, derives '
                              'a rank, and highlights the top record with color. Bar marks provide visual magnitude '
                              'comparison. Tasks: Identify the record with the largest value; compare values across '
                              'records. Query patterns: What Record in <E> has the largest <F:q>?',
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
                                             'entity1_field': {'description': 'any type field.', 'type': 'string'},
                                             'entity2': {'description': 'The secondary data entity (table) to join '
                                                                        'with.',
                                                         'type': 'string'}},
                              'required': ['entity1', 'entity2', 'entity1_field'],
                              'type': 'object'}},
  'type': 'function'},
 {'function': {'description': '[table] Finds the record with the smallest value in a quantitative field, displayed as '
                              'a ranked table with conditional formatting. Design: Sorts ascending by the target '
                              'field, derives a rank, and highlights the top record with background color. Uses rect '
                              'mark for row-level highlighting. Tasks: Identify the record with the smallest value; '
                              'compare values across records. Query patterns: What Record in <E> has the smallest '
                              '<F:q>?',
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
 {'function': {'description': '[table] Sorts entity records by a quantitative field and displays the result as an '
                              'ordered table with in-cell bar marks. Design: Ordered by the quantitative field with '
                              'nulls filtered out. In-cell bar marks provide visual comparison of magnitude alongside '
                              'the text values. Tasks: View records in sorted order; compare relative magnitudes. '
                              'Query patterns: Order the <E> by <F:q>?',
               'name': 'vis_042_table_sorted',
               'parameters': {'additionalProperties': False,
                              'properties': {'entity': {'description': 'The data entity (table) to visualize.',
                                                        'type': 'string'},
                                             'field': {'description': 'quantitative field, encodes x-axis.',
                                                       'type': 'string'}},
                              'required': ['entity', 'field'],
                              'type': 'object'}},
  'type': 'function'},
 {'function': {'description': '[table] Computes the minimum and maximum of a quantitative field and displays them as a '
                              'single-row table. Design: Simple rollup of min and max. Filters out nulls before '
                              'aggregation for accuracy. Tasks: Determine the range of a quantitative field. Query '
                              'patterns: What is the range of <E> <F:q> values?',
               'name': 'vis_043_table_min',
               'parameters': {'additionalProperties': False,
                              'properties': {'entity': {'description': 'The data entity (table) to visualize.',
                                                        'type': 'string'},
                                             'field': {'description': 'any type field.', 'type': 'string'}},
                              'required': ['entity', 'field'],
                              'type': 'object'}},
  'type': 'function'},
 {'function': {'description': '[table] Lists all distinct values of a nominal field with their counts, ordered by '
                              'descending count, displayed as a table with in-cell bar marks. Design: Groups by the '
                              'nominal field and counts occurrences, sorted descending so the bars are comparable '
                              'top-to-bottom. The count is drawn as both a bar and a number, since a bar alone shows '
                              'relative frequency but not the value. Tasks: Determine the range (distinct values) of a '
                              'nominal field; compare category frequencies. Query patterns: What is the range of <E> '
                              '<F:n> values?',
               'name': 'vis_044_table_count_sorted_distinct',
               'parameters': {'additionalProperties': False,
                              'properties': {'entity': {'description': 'The data entity (table) to visualize.',
                                                        'type': 'string'},
                                             'field': {'description': 'nominal field, encodes text label.',
                                                       'type': 'string'}},
                              'required': ['entity', 'field'],
                              'type': 'object'}},
  'type': 'function'},
 {'function': {'description': '[table] Computes the min and max of a quantitative field for each category of a nominal '
                              'field, displayed as a table with range bar marks. Design: Groups by nominal field, '
                              'computes min/max and derived range, then orders by range descending. Uses x/x2 encoding '
                              'to show the span between min and max values. Tasks: Compare the spread of a '
                              'quantitative field across categories; identify which group has the widest or narrowest '
                              'range. Query patterns: What is the range of <E> <F1:q> values for every <F2:n>?',
               'name': 'vis_045_table_range',
               'parameters': {'additionalProperties': False,
                              'properties': {'entity': {'description': 'The data entity (table) to visualize.',
                                                        'type': 'string'},
                                             'field1': {'description': 'any type field.', 'type': 'string'},
                                             'field2': {'description': 'nominal field, encodes text label.',
                                                        'type': 'string'}},
                              'required': ['entity', 'field1', 'field2'],
                              'type': 'object'}},
  'type': 'function'},
 {'function': {'description': '[table] Finds the most frequent value of a nominal field, displayed as a ranked table '
                              'with bar marks and conditional formatting. Design: Groups by nominal field, counts, '
                              'ranks, and highlights the top value. Combines bar marks for count comparison and '
                              'background color for emphasis. Tasks: Identify the most frequent category; compare '
                              'frequencies across all categories. Query patterns: What is the most frequent <F:n>?',
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
 {'function': {'description': '[table] Lists each category of a nominal dimension with its pre-aggregated measure as a '
                              'sorted table with in-cell bars. Design: Reads the cube marginal by filtering to rows '
                              'where the chosen dimension(s) are present and every other dimension is empty; the '
                              'measure is mapped directly with no re-aggregation. The marginal filter is expanded from '
                              "the per-request schema's dimension list, so this template works for any cube. Ordered "
                              'by the measure descending, with the measure drawn as both an in-cell bar and a number '
                              'so the value is readable and not just its length. Tasks: Determine the distinct values '
                              'of a dimension; compare category counts. Query patterns: List the measure for each '
                              'category of a dimension.; What is the range of values for a dimension?',
               'name': 'vis_048_table_sorted',
               'parameters': {'additionalProperties': False,
                              'properties': {'dimension': {'description': 'cube nominal dimension, encodes text label.',
                                                           'type': 'string'},
                                             'entity': {'description': 'The data entity (table) to visualize.',
                                                        'type': 'string'}},
                              'required': ['entity', 'dimension'],
                              'type': 'object'}},
  'type': 'function'},
 {'function': {'description': '[line] Shows the cumulative distribution function (CDF) of a quantitative field as a '
                              'line chart. Design: Sorts by value, computes rolling percentile, then sorts by '
                              'percentile so the line is a monotonic step. The CDF reveals the full distribution shape '
                              'including median, quartiles, and tails. Tasks: Characterize the distribution of a '
                              'variable; identify median, quartiles, and concentration of values. Query patterns: What '
                              'is the cumulative distribution of <F:q>?; Make a CDF plot of <F:q>.',
               'name': 'vis_049_line_cdf',
               'parameters': {'additionalProperties': False,
                              'properties': {'entity': {'description': 'The data entity (table) to visualize.',
                                                        'type': 'string'},
                                             'field': {'description': 'quantitative field, encodes x-axis.',
                                                       'type': 'string'}},
                              'required': ['entity', 'field'],
                              'type': 'object'}},
  'type': 'function'},
 {'function': {'description': '[grouped_line] Shows the cumulative distribution of a quantitative field for each '
                              'category of a nominal field, with separate lines per group. Design: Groups by the '
                              'nominal field, sorts within groups, computes the per-group rolling percentile, then '
                              'sorts by percentile so each line is a monotonic step. Color encodes group identity. '
                              'Limited to fewer than 5 groups for readability. Tasks: Compare distributions across '
                              'groups; identify which groups have higher or lower concentrations of values. Query '
                              'patterns: What is the cumulative distribution of <F1:q> for each <F2:n>?; Make a CDF '
                              'plot of <F1:q> with a line for each <F2:n>.',
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
 {'function': {'description': '[line] Shows the pre-aggregated cube measure over an ordered dimension (e.g. time) as a '
                              'line chart. Design: Reads the cube marginal by filtering to rows where the chosen '
                              'dimension(s) are present and every other dimension is empty; the measure is mapped '
                              'directly with no re-aggregation. The marginal filter is expanded from the per-request '
                              "schema's dimension list, so this template works for any cube. The axis is ordered "
                              'ascending; a temporal dimension is encoded as an ordered (ordinal) axis. Tasks: '
                              'Identify trends over time; spot peaks, troughs, and seasonality. Query patterns: How '
                              'does the measure change over <dimension>?; Make a line chart of the measure over an '
                              'ordered (e.g. temporal) dimension.',
               'name': 'vis_051_line_sorted',
               'parameters': {'additionalProperties': False,
                              'properties': {'dimension': {'description': 'cube ordinal dimension, encodes x-axis.',
                                                           'type': 'string'},
                                             'entity': {'description': 'The data entity (table) to visualize.',
                                                        'type': 'string'}},
                              'required': ['entity', 'dimension'],
                              'type': 'object'}},
  'type': 'function'},
 {'function': {'description': '[line] Survival curve from an event log — a table with one row per event, a subject id, '
                              'an event-type column and a numeric time column. Given a start event type and an end '
                              "event type, derives each subject's elapsed time between them and plots the falling "
                              'fraction of subjects that have not yet reached the end event. Design: Survival time is '
                              'not stored anywhere; it is reconstructed as the gap between two events for the same '
                              'subject, so the template groups the event log by subject id and rolls it up to one row '
                              'each before computing anything. The subject id is only a grouping key and is never '
                              'encoded, so its cardinality does not matter. IMPORTANT: this is a crude survival curve, '
                              'not a Kaplan-Meier estimate. Subjects with no end event are kept in the denominator but '
                              'contribute no drop, which assumes every one of them was followed for the whole window. '
                              'A true Kaplan-Meier estimator reweights by the number still at risk at each event time; '
                              'that needs a cumulative product and per-time at-risk counts, which the gramma',
               'name': 'vis_052_line_survival',
               'parameters': {'additionalProperties': False,
                              'properties': {'entity': {'description': 'The data entity (table) to visualize.',
                                                        'type': 'string'},
                                             'field1': {'description': 'nominal field.', 'type': 'string'},
                                             'field2': {'description': 'any type field.', 'type': 'string'},
                                             'field3': {'description': 'any type field.', 'type': 'string'},
                                             'value1': {'description': 'A literal data VALUE to match (not a column '
                                                                       'name) — one of the values actually present in '
                                                                       'the relevant column, copied exactly, including '
                                                                       'case and spacing.',
                                                        'type': 'string'},
                                             'value2': {'description': 'A literal data VALUE to match (not a column '
                                                                       'name) — one of the values actually present in '
                                                                       'the relevant column, copied exactly, including '
                                                                       'case and spacing.',
                                                        'type': 'string'}},
                              'required': ['entity', 'field1', 'field2', 'field3', 'value1', 'value2'],
                              'type': 'object'}},
  'type': 'function'},
 {'function': {'description': '[line] Survival curves split by a nominal field, from an event log — one row per event, '
                              'with a subject id, an event-type column and a numeric time column. Given a start and an '
                              "end event type, derives each subject's elapsed time between them and plots one curve "
                              'per category, each against its own cohort. Design: Groups by subject and stratum '
                              'together so the stratum survives the per-subject rollup, then re-groups by stratum so '
                              "each curve's denominator is its own cohort — otherwise the curves would be fractions of "
                              'the whole table and would not each start near 1. Strata are drawn as colours because '
                              'the grammar has no facet channel. Only for single-valued fields: a delimited '
                              'multi-value column would make every distinct combination its own stratum — use the '
                              'multi-value variant for those. The same censoring caveat as the unstratified survival '
                              'curve applies, and it bites harder here: subjects with no end event hold their '
                              "stratum's curve up, so comparing groups whose follow-up differs is misleading. This is "
                              'not a Kapla',
               'name': 'vis_053_line_survival',
               'parameters': {'additionalProperties': False,
                              'properties': {'entity': {'description': 'The data entity (table) to visualize.',
                                                        'type': 'string'},
                                             'field1': {'description': 'nominal field.', 'type': 'string'},
                                             'field2': {'description': 'any type field.', 'type': 'string'},
                                             'field3': {'description': 'any type field.', 'type': 'string'},
                                             'field4': {'description': 'nominal field, encodes color.',
                                                        'type': 'string'},
                                             'value1': {'description': 'A literal data VALUE to match (not a column '
                                                                       'name) — one of the values actually present in '
                                                                       'the relevant column, copied exactly, including '
                                                                       'case and spacing.',
                                                        'type': 'string'},
                                             'value2': {'description': 'A literal data VALUE to match (not a column '
                                                                       'name) — one of the values actually present in '
                                                                       'the relevant column, copied exactly, including '
                                                                       'case and spacing.',
                                                        'type': 'string'}},
                              'required': ['entity', 'field1', 'field2', 'field3', 'field4', 'value1', 'value2'],
                              'type': 'object'}},
  'type': 'function'},
 {'function': {'description': '[line] Survival curves split by each value of a multi-value (delimited) field, from an '
                              'event log — one row per event, with a subject id, an event-type column and a numeric '
                              'time column. Expands the multi-value field so a subject counts toward every value it '
                              "lists, derives each subject's elapsed time between a start and an end event type, then "
                              'plots one curve per value. Design: For set-valued columns such as tumor locations, '
                              'where one subject can belong to several categories. `unnest` runs first, before any row '
                              'counting, so the per-subject rollup sees one row per (subject, value) pair. The cohorts '
                              'therefore overlap by design and their sizes sum to more than the number of subjects — '
                              'that is the correct reading of a multi-value attribute, but it means the curves are not '
                              'independent and must not be compared as if they partitioned the cohort. Without unnest '
                              'each distinct combination would be its own stratum — a column with ~20 real values can '
                              'easily have ~80 combinations, which also exceeds the 50-cardinality cap f',
               'name': 'vis_054_line_count_survival',
               'parameters': {'additionalProperties': False,
                              'properties': {'entity': {'description': 'The data entity (table) to visualize.',
                                                        'type': 'string'},
                                             'field1': {'description': 'nominal field.', 'type': 'string'},
                                             'field2': {'description': 'any type field.', 'type': 'string'},
                                             'field3': {'description': 'any type field.', 'type': 'string'},
                                             'field4': {'description': 'nominal field, encodes color.',
                                                        'type': 'string'},
                                             'value1': {'description': 'A literal data VALUE to match (not a column '
                                                                       'name) — one of the values actually present in '
                                                                       'the relevant column, copied exactly, including '
                                                                       'case and spacing.',
                                                        'type': 'string'},
                                             'value2': {'description': 'A literal data VALUE to match (not a column '
                                                                       'name) — one of the values actually present in '
                                                                       'the relevant column, copied exactly, including '
                                                                       'case and spacing.',
                                                        'type': 'string'}},
                              'required': ['entity', 'field1', 'field2', 'field3', 'field4', 'value1', 'value2'],
                              'type': 'object'}},
  'type': 'function'},
 {'function': {'description': '[heatmap] Displays the count of entities for each combination of two nominal fields as '
                              'a heatmap with labeled cells. Design: Rect marks with quantitative color encoding show '
                              'density. Overlaid text marks display exact counts. Text color adapts based on cell '
                              'intensity for readability. The field with more unique values is preferably placed on '
                              'the y-axis, where longer labels remain readable. Tasks: Identify clusters or patterns '
                              'in the co-occurrence of two fields; compare counts across combinations; find '
                              'correlations. Query patterns: Are there any clusters with respect to <E> counts of '
                              '<F1:n> and <F2:n>?; Make a heatmap of <E> <F1:n> and <F2:n>.',
               'name': 'vis_055_heatmap_count',
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
 {'function': {'description': '[heatmap] Displays the average of a quantitative field for each combination of two '
                              'nominal fields as a heatmap. Design: Uses three fields: a quantitative measure '
                              'aggregated by average, and two nominal axes. Color encodes the aggregate value. The '
                              'field with more unique values is preferably placed on the y-axis for better label '
                              'readability. Tasks: Identify patterns in the average value across two categorical '
                              'dimensions; find combinations with extreme values. Query patterns: What is the average '
                              '<F1:q> for each <F2:n> and <F3:n>?',
               'name': 'vis_056_heatmap_avg',
               'parameters': {'additionalProperties': False,
                              'properties': {'entity': {'description': 'The data entity (table) to visualize.',
                                                        'type': 'string'},
                                             'field1': {'description': 'any type field.', 'type': 'string'},
                                             'field2': {'description': 'nominal field, encodes y-axis.',
                                                        'type': 'string'},
                                             'field3': {'description': 'nominal field, encodes x-axis.',
                                                        'type': 'string'}},
                              'required': ['entity', 'field1', 'field2', 'field3'],
                              'type': 'object'}},
  'type': 'function'},
 {'function': {'description': '[heatmap] Shows the pre-aggregated cube measure for each combination of two nominal '
                              'dimensions as a labeled heatmap. Design: Reads the cube marginal by filtering to rows '
                              'where the chosen dimension(s) are present and every other dimension is empty; the '
                              'measure is mapped directly with no re-aggregation. The marginal filter is expanded from '
                              "the per-request schema's dimension list, so this template works for any cube. The "
                              'measure maps to cell color with overlaid contrast-aware value labels. Prefer the '
                              'dimension with more categories on the y-axis. Tasks: Identify clusters or patterns '
                              'across two dimensions; compare values across combinations. Query patterns: Are there '
                              'clusters in the measure across two dimensions?; Make a heatmap across two categorical '
                              'dimensions.',
               'name': 'vis_057_heatmap_basic',
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
 {'function': {'description': '[grouped_scatter] Plots two quantitative fields as a scatterplot with points colored by '
                              'a nominal field to reveal group-level clusters. Design: Adds color encoding to a '
                              'standard scatterplot to separate groups visually. Limited to fewer than 8 color '
                              'categories for perceptual clarity. Tasks: Identify clusters that separate by group; '
                              'assess whether the relationship between two quantitative fields differs across groups. '
                              'Query patterns: Are there clusters of <E> <F1:q> and <F2:q> values across different '
                              '<F3:n> groups?',
               'name': 'vis_058_grouped_scatter_by_color',
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
 {'function': {'description': '[histogram] Shows the distribution of a quantitative field as a histogram with '
                              'automatically computed bins. Design: Uses binby to create equal-width bins. Rect marks '
                              'span from bin start to bin end on x, with count on y. Tasks: Characterize the shape of '
                              'a distribution; identify modes, skewness, and gaps. Query patterns: What is the '
                              'distribution of <F:q>?; Make a histogram of <F:q>?',
               'name': 'vis_059_histogram_distribution',
               'parameters': {'additionalProperties': False,
                              'properties': {'entity': {'description': 'The data entity (table) to visualize.',
                                                        'type': 'string'},
                                             'field': {'description': 'any type field.', 'type': 'string'}},
                              'required': ['entity', 'field'],
                              'type': 'object'}},
  'type': 'function'},
 {'function': {'description': '[area] Shows the distribution of a quantitative field as a smooth density curve (KDE) '
                              'rendered as an area chart. Design: Kernel density estimation produces a smooth curve. '
                              'Area mark fills below the density line. Used for moderate cardinality (50-250) where a '
                              'smooth estimate is more informative than binning. Tasks: Characterize the shape of a '
                              'distribution; identify modes and overall density patterns. Query patterns: What is the '
                              'distribution of <F:q>?',
               'name': 'vis_060_area_density',
               'parameters': {'additionalProperties': False,
                              'properties': {'entity': {'description': 'The data entity (table) to visualize.',
                                                        'type': 'string'},
                                             'field': {'description': 'quantitative field, encodes x-axis.',
                                                       'type': 'string'}},
                              'required': ['entity', 'field'],
                              'type': 'object'}},
  'type': 'function'},
 {'function': {'description': '[dot] Shows the distribution of a quantitative field as individual points along a '
                              'single axis. Design: Point marks on a single quantitative x-axis. Best for small '
                              'datasets (50 or fewer values) where individual observations are meaningful and '
                              'overplotting is minimal. Tasks: Characterize the distribution; identify individual '
                              'values, clusters, and outliers. Query patterns: What is the distribution of <F:q>?',
               'name': 'vis_061_dot_distribution',
               'parameters': {'additionalProperties': False,
                              'properties': {'entity': {'description': 'The data entity (table) to visualize.',
                                                        'type': 'string'},
                                             'field': {'description': 'quantitative field, encodes x-axis.',
                                                       'type': 'string'}},
                              'required': ['entity', 'field'],
                              'type': 'object'}},
  'type': 'function'},
 {'function': {'description': '[grouped_area] Compares the distribution of a quantitative field across categories '
                              'using overlapping density curves (KDE) with area and line marks. Design: Per-group KDE '
                              'with semi-transparent area fills and line outlines. Color encodes group identity. '
                              'Limited to fewer than 4 groups to avoid excessive overlap. Opacity set to 0.25 for '
                              'layering. Tasks: Compare distribution shapes across groups; identify shifts in central '
                              'tendency or spread. Query patterns: Is the distribution of <F1:q> similar for each '
                              '<F2:n>?',
               'name': 'vis_062_grouped_area_density',
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
 {'function': {'description': '[grouped_dot] Compares the distribution of a quantitative field across categories using '
                              'dot strips, with one row per category. Design: Points plotted on a quantitative x-axis '
                              'with nominal y-axis for group separation. Color reinforces group identity. Best for '
                              'small datasets (50 or fewer values per group). Tasks: Compare distributions across '
                              'groups; identify clusters and outliers within each group. Query patterns: Is the '
                              'distribution of <F1:q> similar for each <F2:n>?',
               'name': 'vis_063_grouped_dot_distribution',
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
 {'function': {'description': '[table] Analyzes data completeness by counting and computing the percentage of records '
                              'with non-null values in a specified field. Design: Derives total count before '
                              'filtering, then computes valid count and percentage. Percentage bar with 50% reference '
                              'line provides visual context for data completeness. Tasks: Assess data completeness for '
                              'a field; determine how many records have valid values and what proportion. Query '
                              'patterns: How many <E> records have a non-null <F:q|o|n>?; What percentage of <E> '
                              'records have a non-null <F:q|o|n>?',
               'name': 'vis_064_table_count_null_nonnull',
               'parameters': {'additionalProperties': False,
                              'properties': {'entity': {'description': 'The data entity (table) to visualize.',
                                                        'type': 'string'},
                                             'field': {'description': 'any type field.', 'type': 'string'}},
                              'required': ['entity', 'field'],
                              'type': 'object'}},
  'type': 'function'},
 {'function': {'description': '[table] Analyzes data quality by counting and computing the percentage of records with '
                              'null values in a specified field. Design: Derives null count as total minus valid '
                              'count. Percentage bar shows the null proportion with a 50% reference line. Tasks: '
                              'Assess data quality; determine how many records are missing a value and what '
                              'proportion. Query patterns: How many <E> records have a null <F:q|o|n>?; What '
                              'percentage of <E> records have a null <F:q|o|n>?',
               'name': 'vis_065_table_count_null',
               'parameters': {'additionalProperties': False,
                              'properties': {'entity': {'description': 'The data entity (table) to visualize.',
                                                        'type': 'string'},
                                             'field': {'description': 'any type field.', 'type': 'string'}},
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
 'vis_044_table_count_sorted_distinct': (44, {'entity': 'E', 'field': 'F'}),
 'vis_045_table_range': (45, {'entity': 'E', 'field1': 'F1', 'field2': 'F2'}),
 'vis_046_table_ranked_mode': (46, {'entity': 'E', 'field': 'F'}),
 'vis_047_table_sum': (47, {'entity': 'E'}),
 'vis_048_table_sorted': (48, {'dimension': 'D', 'entity': 'E'}),
 'vis_049_line_cdf': (49, {'entity': 'E', 'field': 'F'}),
 'vis_050_grouped_line_cdf': (50, {'entity': 'E', 'field1': 'F1', 'field2': 'F2'}),
 'vis_051_line_sorted': (51, {'dimension': 'D', 'entity': 'E'}),
 'vis_052_line_survival': (52,
                           {'entity': 'E',
                            'field1': 'F1',
                            'field2': 'F2',
                            'field3': 'F3',
                            'value1': 'V1',
                            'value2': 'V2'}),
 'vis_053_line_survival': (53,
                           {'entity': 'E',
                            'field1': 'F1',
                            'field2': 'F2',
                            'field3': 'F3',
                            'field4': 'F4',
                            'value1': 'V1',
                            'value2': 'V2'}),
 'vis_054_line_count_survival': (54,
                                 {'entity': 'E',
                                  'field1': 'F1',
                                  'field2': 'F2',
                                  'field3': 'F3',
                                  'field4': 'F4',
                                  'value1': 'V1',
                                  'value2': 'V2'}),
 'vis_055_heatmap_count': (55, {'entity': 'E', 'field1': 'F1', 'field2': 'F2'}),
 'vis_056_heatmap_avg': (56, {'entity': 'E', 'field1': 'F1', 'field2': 'F2', 'field3': 'F3'}),
 'vis_057_heatmap_basic': (57, {'dimension1': 'D1', 'dimension2': 'D2', 'entity': 'E'}),
 'vis_058_grouped_scatter_by_color': (58, {'entity': 'E', 'field1': 'F1', 'field2': 'F2', 'field3': 'F3'}),
 'vis_059_histogram_distribution': (59, {'entity': 'E', 'field': 'F'}),
 'vis_060_area_density': (60, {'entity': 'E', 'field': 'F'}),
 'vis_061_dot_distribution': (61, {'entity': 'E', 'field': 'F'}),
 'vis_062_grouped_area_density': (62, {'entity': 'E', 'field1': 'F1', 'field2': 'F2'}),
 'vis_063_grouped_dot_distribution': (63, {'entity': 'E', 'field1': 'F1', 'field2': 'F2'}),
 'vis_064_table_count_null_nonnull': (64, {'entity': 'E', 'field': 'F'}),
 'vis_065_table_count_null': (65, {'entity': 'E', 'field': 'F'})}


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
 'vis_044_table_count_sorted_distinct': ['line_item', 'table'],
 'vis_045_table_range': ['line_item', 'table'],
 'vis_046_table_ranked_mode': ['line_item', 'table'],
 'vis_047_table_sum': ['data_cube', 'table'],
 'vis_048_table_sorted': ['data_cube', 'table'],
 'vis_049_line_cdf': ['line_item', 'line'],
 'vis_050_grouped_line_cdf': ['line_item', 'grouped_line'],
 'vis_051_line_sorted': ['data_cube', 'line'],
 'vis_052_line_survival': ['line_item', 'line'],
 'vis_053_line_survival': ['line_item', 'line'],
 'vis_054_line_count_survival': ['line_item', 'line'],
 'vis_055_heatmap_count': ['line_item', 'heatmap'],
 'vis_056_heatmap_avg': ['line_item', 'heatmap'],
 'vis_057_heatmap_basic': ['data_cube', 'heatmap'],
 'vis_058_grouped_scatter_by_color': ['line_item', 'grouped_scatter'],
 'vis_059_histogram_distribution': ['line_item', 'histogram'],
 'vis_060_area_density': ['line_item', 'area'],
 'vis_061_dot_distribution': ['line_item', 'dot'],
 'vis_062_grouped_area_density': ['line_item', 'grouped_area'],
 'vis_063_grouped_dot_distribution': ['line_item', 'grouped_dot'],
 'vis_064_table_count_null_nonnull': ['line_item', 'table'],
 'vis_065_table_count_null': ['line_item', 'table']}
