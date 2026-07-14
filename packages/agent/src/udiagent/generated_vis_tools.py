"""
Auto-generated visualization tool definitions.

Generated from: src/udiagent/data/skills/template_visualizations.json, src/udiagent/data/skills/template_visualizations_cube.json
Tools: 63

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
 '{"source": {"name": "<E>", "source": "<E.url>"}, "transformation": [{"groupby": ["<F1>", "<F2>"]}, {"rollup": '
 '{"count <E>": {"op": "count"}}}], "representation": {"mark": "bar", "mapping": [{"encoding": "y", "field": "count '
 '<E>", "type": "quantitative"}, {"encoding": "xOffset", "field": "<F1>", "type": "nominal"}, {"encoding": "color", '
 '"field": "<F1>", "type": "nominal"}, {"encoding": "x", "field": "<F2>", "type": "nominal"}]}}',
 '{"source": {"name": "<E>", "source": "<E.url>"}, "transformation": [{"groupby": ["<F1>", "<F2>"]}, {"rollup": '
 '{"count <E>": {"op": "count"}}}], "representation": {"mark": "bar", "mapping": [{"encoding": "x", "field": "count '
 '<E>", "type": "quantitative"}, {"encoding": "yOffset", "field": "<F1>", "type": "nominal"}, {"encoding": "color", '
 '"field": "<F1>", "type": "nominal"}, {"encoding": "y", "field": "<F2>", "type": "nominal"}]}}',
 '{"source": {"name": "<E>", "source": "<E.url>"}, "transformation": [{"groupby": "<F2>", "out": "groupCounts"}, '
 '{"rollup": {"<F2>_count": {"op": "count"}}}, {"groupby": ["<F1>", "<F2>"], "in": "<E>"}, {"rollup": '
 '{"<F1>_and_<F2>_count": {"op": "count"}}}, {"join": {"on": "<F2>"}, "in": ["<E>", "groupCounts"], "out": '
 '"datasets"}, {"derive": {"proportion": "d[\'<F1>_and_<F2>_count\'] / d[\'<F2>_count\']"}}], "representation": '
 '{"mark": "bar", "mapping": [{"encoding": "y", "field": "proportion", "type": "quantitative"}, {"encoding": "color", '
 '"field": "<F1>", "type": "nominal"}, {"encoding": "x", "field": "<F2>", "type": "nominal"}]}}',
 '{"source": {"name": "<E>", "source": "<E.url>"}, "transformation": [{"groupby": "<F2>", "out": "groupCounts"}, '
 '{"rollup": {"<F2>_count": {"op": "count"}}}, {"groupby": ["<F1>", "<F2>"], "in": "<E>"}, {"rollup": '
 '{"<F1>_and_<F2>_count": {"op": "count"}}}, {"join": {"on": "<F2>"}, "in": ["<E>", "groupCounts"], "out": '
 '"datasets"}, {"derive": {"proportion": "d[\'<F1>_and_<F2>_count\'] / d[\'<F2>_count\']"}}], "representation": '
 '{"mark": "bar", "mapping": [{"encoding": "x", "field": "proportion", "type": "quantitative"}, {"encoding": "color", '
 '"field": "<F1>", "type": "nominal"}, {"encoding": "y", "field": "<F2>", "type": "nominal"}]}}',
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
 '{"source": {"name": "<E>", "source": "<E.url>"}, "transformation": [{"rollup": {"<E> Records": {"op": "count"}}}]}',
 '{"source": {"name": "<E>", "source": "<E.url>"}}',
 '{"source": [{"name": "<E1>", "source": "<E1.url>"}, {"name": "<E2>", "source": "<E2.url>"}], "transformation": '
 '[{"join": {"on": ["<E1.r.E2.id.from>", "<E1.r.E2.id.to>"]}, "in": ["<E1>", "<E2>"], "out": "<E1>__<E2>"}]}',
 '{"source": [{"name": "<E1>", "source": "<E1.url>"}, {"name": "<E2>", "source": "<E2.url>"}], "transformation": '
 '[{"join": {"on": ["<E1.r.E2.id.from>", "<E1.r.E2.id.to>"]}, "in": ["<E1>", "<E2>"], "out": "<E1>__<E2>"}, '
 '{"groupby": "<E1.r.E2.id.from>"}, {"rollup": {"<E1> count": {"op": "count"}}}, {"orderby": {"field": "<E1> count", '
 '"order": "desc"}}, {"derive": {"rank": "rank()"}}, {"derive": {"most frequent": "d.rank == 1 ? \'yes\' : \'no\'"}}], '
 '"representation": [{"mark": "row", "mapping": [{"encoding": "x", "field": "<E1> count", "mark": "bar", "type": '
 '"quantitative", "domain": {"min": 0}}, {"encoding": "color", "column": "<E1> count", "mark": "bar", "field": "most '
 'frequent", "type": "nominal", "domain": ["yes", "no"], "range": ["#FFA500", "#c6cfd8"]}]}, {"mark": "row", '
 '"mapping": {"encoding": "text", "field": "*", "mark": "text", "type": "nominal"}}]}',
 '{"source": {"name": "<E>", "source": "<E.url>"}, "transformation": [{"filter": "d[\'<F>\'] != null"}, {"orderby": '
 '{"field": "<F>", "order": "desc"}}, {"derive": {"largest": "rank() == 1 ? \'largest\' : \'not\'"}}], '
 '"representation": {"mark": "row", "mapping": [{"encoding": "x", "field": "<F>", "mark": "bar", "type": '
 '"quantitative"}, {"encoding": "color", "column": "<F>", "mark": "bar", "field": "largest", "type": "nominal", '
 '"domain": ["largest", "not"], "range": ["#FFA500", "c6cfd8"]}, {"encoding": "text", "field": "*", "mark": "text", '
 '"type": "nominal"}]}}',
 '{"source": [{"name": "<E1>", "source": "<E1.url>"}, {"name": "<E2>", "source": "<E2.url>"}], "transformation": '
 '[{"join": {"on": ["<E1.r.E2.id.from>", "<E1.r.E2.id.to>"]}, "in": ["<E1>", "<E2>"], "out": "<E1>__<E2>"}, '
 '{"groupby": "<E1.r.E2.id.from>"}, {"rollup": {"Largest <E1.F>": {"op": "max", "field": "<E1.F>"}}}, {"filter": '
 '"d[\'Largest <E1.F>\'] != null"}, {"orderby": {"field": "Largest <E1.F>", "order": "desc"}}, {"derive": {"rank": '
 '"rank()"}}, {"derive": {"largest": "d.rank == 1 ? \'yes\' : \'no\'"}}], "representation": {"mark": "row", "mapping": '
 '[{"encoding": "x", "field": "Largest <E1.F>", "mark": "bar", "type": "quantitative"}, {"encoding": "color", '
 '"column": "Largest <E1.F>", "mark": "bar", "field": "largest", "type": "nominal", "domain": ["yes", "no"], "range": '
 '["#FFA500", "#c6cfd8"]}, {"encoding": "text", "field": "*", "mark": "text", "type": "nominal"}]}}',
 '{"source": {"name": "<E>", "source": "<E.url>"}, "transformation": [{"filter": "d[\'<F>\'] != null"}, {"orderby": '
 '{"field": "<F>", "order": "asc"}}, {"derive": {"smallest": "rank() == 1 ? \'smallest\' : \'not\'"}}], '
 '"representation": {"mark": "row", "mapping": [{"encoding": "color", "column": "<F>", "mark": "rect", "orderby": '
 '"<F>", "field": "smallest", "type": "nominal", "domain": ["smallest", "not"], "range": ["#ffdb9a", "white"]}, '
 '{"encoding": "text", "field": "*", "mark": "text", "type": "nominal"}]}}',
 '{"source": [{"name": "<E1>", "source": "<E1.url>"}, {"name": "<E2>", "source": "<E2.url>"}], "transformation": '
 '[{"join": {"on": ["<E1.r.E2.id.from>", "<E1.r.E2.id.to>"]}, "in": ["<E1>", "<E2>"], "out": "<E1>__<E2>"}, '
 '{"groupby": "<E1.r.E2.id.from>"}, {"rollup": {"Smallest <E1.F>": {"op": "min", "field": "<E1.F>"}}}, {"filter": '
 '"d[\'Smallest <E1.F>\'] != null"}, {"orderby": {"field": "Smallest <E1.F>", "order": "asc"}}, {"derive": {"rank": '
 '"rank()"}}, {"derive": {"smallest": "d.rank == 1 ? \'yes\' : \'no\'"}}], "representation": {"mark": "row", '
 '"mapping": [{"encoding": "color", "column": "Smallest <E1.F>", "mark": "bar", "orderby": "Smallest <E1.F>", "field": '
 '"smallest", "type": "nominal", "domain": ["yes", "no"], "range": ["#ffdb9a", "white"]}, {"encoding": "text", '
 '"field": "*", "mark": "text", "type": "nominal"}]}}',
 '{"source": {"name": "<E>", "source": "<E.url>"}, "transformation": [{"filter": "d[\'<F>\'] != null"}, {"orderby": '
 '{"field": "<F>", "order": "asc"}}], "representation": {"mark": "row", "mapping": [{"encoding": "x", "column": "<F>", '
 '"mark": "bar", "field": "<F>", "type": "quantitative", "range": {"min": 0.2, "max": 1}}, {"encoding": "text", '
 '"field": "*", "mark": "text", "type": "nominal"}]}}',
 '{"source": {"name": "<E>", "source": "<E.url>"}, "transformation": [{"filter": "d[\'<F>\'] != null"}, {"rollup": '
 '{"<F> min": {"op": "min", "field": "<F>"}, "<F> max": {"op": "max", "field": "<F>"}}}], "representation": {"mark": '
 '"row", "mapping": [{"encoding": "text", "field": "<F> min", "mark": "text", "type": "nominal"}, {"encoding": "text", '
 '"field": "<F> max", "mark": "text", "type": "nominal"}]}}',
 '{"source": {"name": "<E>", "source": "<E.url>"}, "transformation": [{"filter": "d[\'<F>\'] != null"}, {"groupby": '
 '"<F>"}, {"rollup": {"count": {"op": "count"}}}], "representation": {"mark": "row", "mapping": [{"encoding": "text", '
 '"field": "<F>", "mark": "text", "type": "nominal"}, {"encoding": "x", "field": "count", "mark": "bar", "type": '
 '"quantitative", "range": {"min": 0.1, "max": 1}}]}}',
 '{"source": {"name": "<E>", "source": "<E.url>"}, "transformation": [{"filter": "d[\'<F1>\'] != null"}, {"groupby": '
 '"<F2>"}, {"rollup": {"<F1> min": {"op": "min", "field": "<F1>"}, "<F1> max": {"op": "max", "field": "<F1>"}}}, '
 '{"derive": {"range": "d[\'<F1> max\'] - d[\'<F1> min\']"}}, {"orderby": {"field": "range", "order": "desc"}}], '
 '"representation": {"mark": "row", "mapping": [{"encoding": "text", "field": "<F2>", "mark": "text", "type": '
 '"nominal"}, {"encoding": "text", "field": "<F1> min", "mark": "text", "type": "nominal"}, {"encoding": "x", '
 '"column": "range", "mark": "bar", "field": "<F1> min", "type": "quantitative", "domain": {"numberFields": ["<F1> '
 'min", "<F1> max"]}}, {"encoding": "x2", "column": "range", "mark": "bar", "field": "<F1> max", "type": '
 '"quantitative", "domain": {"numberFields": ["<F1> min", "<F1> max"]}}, {"encoding": "text", "field": "<F1> max", '
 '"mark": "text", "type": "nominal"}]}}',
 '{"source": {"name": "<E>", "source": "<E.url>"}, "transformation": [{"filter": "d[\'<F>\']"}, {"groupby": "<F>"}, '
 '{"rollup": {"count": {"op": "count"}}}, {"orderby": {"field": "count", "order": "desc"}}, {"derive": {"rank": '
 '"rank()"}}, {"derive": {"most frequent": "d.rank == 1 ? \'yes\' : \'no\'"}}], "representation": {"mark": "row", '
 '"mapping": [{"encoding": "color", "column": "<F>", "mark": "bar", "orderby": "<F>", "field": "most frequent", '
 '"type": "nominal", "domain": ["yes", "no"], "range": ["#ffdb9a", "white"]}, {"encoding": "text", "field": "<F>", '
 '"mark": "text", "type": "nominal"}, {"encoding": "x", "field": "count", "mark": "bar", "type": "quantitative", '
 '"domain": {"min": 0}}, {"encoding": "color", "column": "count", "mark": "bar", "field": "most frequent", "type": '
 '"nominal", "domain": ["yes", "no"], "range": ["#FFA500", "#c6cfd8"]}]}}',
 '{"source": {"name": "<E>", "source": "<E.url>"}, "transformation": [{"filter": "d[\'<F>\'] != null"}, {"orderby": '
 '{"field": "<F>", "order": "asc"}}, {"derive": {"total": "count()"}}, {"derive": {"percentile": {"rolling": '
 '{"expression": "count() / d.total"}}}}], "representation": {"mark": "line", "mapping": [{"encoding": "x", "field": '
 '"<F>", "type": "quantitative"}, {"encoding": "y", "field": "percentile", "type": "quantitative"}]}}',
 '{"source": {"name": "<E>", "source": "<E.url>"}, "transformation": [{"filter": "d[\'<F1>\'] != null"}, {"orderby": '
 '{"field": "<F1>", "order": "asc"}}, {"groupby": "<F2>"}, {"derive": {"total": "count()"}}, {"derive": {"percentile": '
 '{"rolling": {"expression": "count() / d.total"}}}}], "representation": {"mark": "line", "mapping": [{"encoding": '
 '"x", "field": "<F1>", "type": "quantitative"}, {"encoding": "y", "field": "percentile", "type": "quantitative"}, '
 '{"encoding": "color", "field": "<F2>", "type": "nominal"}]}}',
 '{"source": {"name": "<E>", "source": "<E.url>"}, "transformation": [{"groupby": ["<F2>", "<F1>"]}, {"rollup": '
 '{"count <E>": {"op": "count"}}}, {"derive": {"udi_internal_percentile": "d[\'count <E>\'] / max(d[\'count '
 '<E>\'])"}}, {"derive": {"udi_internal_text_color_threshold": "d.udi_internal_percentile > .5 ? \'large\' : '
 '\'small\'"}}], "representation": [{"mark": "rect", "mapping": [{"encoding": "color", "field": "count <E>", "type": '
 '"quantitative"}, {"encoding": "y", "field": "<F1>", "type": "nominal"}, {"encoding": "x", "field": "<F2>", "type": '
 '"nominal"}]}, {"mark": "text", "mapping": [{"encoding": "text", "field": "count <E>", "type": "quantitative"}, '
 '{"encoding": "y", "field": "<F1>", "type": "nominal"}, {"encoding": "x", "field": "<F2>", "type": "nominal"}, '
 '{"encoding": "color", "field": "udi_internal_text_color_threshold", "type": "nominal", "domain": ["large", "small"], '
 '"range": ["white", "black"], "omitLegend": true}]}]}',
 '{"source": {"name": "<E>", "source": "<E.url>"}, "transformation": [{"groupby": ["<F3>", "<F2>"]}, {"rollup": '
 '{"average <F1>": {"op": "mean", "field": "<F1>"}}}], "representation": {"mark": "rect", "mapping": [{"encoding": '
 '"color", "field": "average <F1>", "type": "quantitative"}, {"encoding": "y", "field": "<F2>", "type": "nominal"}, '
 '{"encoding": "x", "field": "<F3>", "type": "nominal"}]}}',
 '{"source": {"name": "<E>", "source": "<E.url>"}, "representation": {"mark": "point", "mapping": [{"encoding": "x", '
 '"field": "<F1>", "type": "quantitative"}, {"encoding": "y", "field": "<F2>", "type": "quantitative"}, {"encoding": '
 '"color", "field": "<F3>", "type": "nominal"}]}}',
 '{"source": {"name": "<E>", "source": "<E.url>"}, "transformation": [{"filter": "d[\'<F>\'] != null"}, {"binby": '
 '{"field": "<F>", "output": {"bin_start": "start", "bin_end": "end"}}}, {"rollup": {"count": {"op": "count"}}}], '
 '"representation": {"mark": "rect", "mapping": [{"encoding": "x", "field": "start", "type": "quantitative", "title": '
 '"<F>"}, {"encoding": "x2", "field": "end", "type": "quantitative"}, {"encoding": "y", "field": "count", "type": '
 '"quantitative", "domainWhenFiltered": "filtered"}]}}',
 '{"source": {"name": "<E>", "source": "<E.url>"}, "transformation": [{"filter": "d[\'<F>\'] != null"}, {"kde": '
 '{"field": "<F>", "output": {"sample": "<F>", "density": "density"}}}], "representation": {"mark": "area", "mapping": '
 '[{"encoding": "x", "field": "<F>", "type": "quantitative"}, {"encoding": "y", "field": "density", "type": '
 '"quantitative", "domainWhenFiltered": "filtered"}]}}',
 '{"source": {"name": "<E>", "source": "<E.url>"}, "representation": {"mark": "point", "mapping": {"encoding": "x", '
 '"field": "<F>", "type": "quantitative"}}}',
 '{"source": {"name": "<E>", "source": "<E.url>"}, "transformation": [{"filter": "d[\'<F1>\'] != null"}, {"groupby": '
 '"<F2>"}, {"kde": {"field": "<F1>", "output": {"sample": "<F1>", "density": "density"}}}], "representation": '
 '[{"mark": "area", "mapping": [{"encoding": "x", "field": "<F1>", "type": "quantitative"}, {"encoding": "color", '
 '"field": "<F2>", "type": "nominal"}, {"encoding": "y", "field": "density", "type": "quantitative", '
 '"domainWhenFiltered": "filtered"}, {"encoding": "opacity", "value": 0.25}]}, {"mark": "line", "mapping": '
 '[{"encoding": "x", "field": "<F1>", "type": "quantitative"}, {"encoding": "color", "field": "<F2>", "type": '
 '"nominal"}, {"encoding": "y", "field": "density", "type": "quantitative", "domainWhenFiltered": "filtered"}]}]}',
 '{"source": {"name": "<E>", "source": "<E.url>"}, "representation": {"mark": "point", "mapping": [{"encoding": "x", '
 '"field": "<F1>", "type": "quantitative"}, {"encoding": "y", "field": "<F2>", "type": "nominal"}, {"encoding": '
 '"color", "field": "<F2>", "type": "nominal"}]}}',
 '{"source": {"name": "<E>", "source": "<E.url>"}, "transformation": [{"derive": {"<E> Count": "count()"}}, {"filter": '
 '"d[\'<F>\'] != null"}, {"rollup": {"Valid <F> Count": {"op": "count"}, "<E> Count": {"op": "median", "field": "<E> '
 'Count"}}}, {"derive": {"Valid <F> %": "d[\'Valid <F> Count\'] / d[\'<E> Count\']"}}], "representation": {"mark": '
 '"row", "mapping": [{"encoding": "text", "field": "Valid <F> Count", "mark": "text", "type": "nominal"}, {"encoding": '
 '"text", "field": "<E> Count", "mark": "text", "type": "nominal"}, {"encoding": "x", "field": "Valid <F> %", "mark": '
 '"bar", "type": "quantitative", "domain": {"min": 0, "max": 1}}, {"encoding": "y", "field": "Valid <F> %", "mark": '
 '"line", "type": "quantitative", "range": {"min": 0.5, "max": 0.5}}]}}',
 '{"source": {"name": "<E>", "source": "<E.url>"}, "transformation": [{"derive": {"<E> Count": "count()"}}, {"filter": '
 '"d[\'<F>\'] != null"}, {"rollup": {"Valid <F> Count": {"op": "count"}, "<E> Count": {"op": "median", "field": "<E> '
 'Count"}}}, {"derive": {"Null <F> Count": "d[\'<E> Count\'] - d[\'Valid <F> Count\']", "Null <F> %": "1 - d[\'Valid '
 '<F> Count\'] / d[\'<E> Count\']"}}], "representation": {"mark": "row", "mapping": [{"encoding": "text", "field": '
 '"Null <F> Count", "mark": "text", "type": "nominal"}, {"encoding": "text", "field": "<E> Count", "mark": "text", '
 '"type": "nominal"}, {"encoding": "x", "field": "Null <F> %", "mark": "bar", "type": "quantitative", "domain": '
 '{"min": 0, "max": 1}}, {"encoding": "y", "field": "Null <F> %", "mark": "line", "type": "quantitative", "range": '
 '{"min": 0.5, "max": 0.5}}]}}',
 '{"source": {"name": "<E>", "source": "<E.url>"}, "transformation": [{"filter": "<MARGINAL:D>"}], "representation": '
 '{"mark": "bar", "mapping": [{"encoding": "x", "field": "<D:n>", "type": "nominal"}, {"encoding": "y", "field": '
 '"<M>", "type": "quantitative"}]}}',
 '{"source": {"name": "<E>", "source": "<E.url>"}, "transformation": [{"filter": "<MARGINAL:D>"}], "representation": '
 '{"mark": "bar", "mapping": [{"encoding": "x", "field": "<D:q>", "type": "quantitative"}, {"encoding": "y", "field": '
 '"<M>", "type": "quantitative"}]}}',
 '{"source": {"name": "<E>", "source": "<E.url>"}, "transformation": [{"filter": "<MARGINAL:D>"}, {"orderby": '
 '{"field": "<D>", "order": "asc"}}], "representation": {"mark": "line", "mapping": [{"encoding": "x", "field": '
 '"<D:o>", "type": "ordinal"}, {"encoding": "y", "field": "<M>", "type": "quantitative"}]}}',
 '{"source": {"name": "<E>", "source": "<E.url>"}, "transformation": [{"filter": "<MARGINAL:D>"}], "representation": '
 '{"mark": "arc", "mapping": [{"encoding": "theta", "field": "<M>", "type": "quantitative"}, {"encoding": "color", '
 '"field": "<D:n>", "type": "nominal"}]}}',
 '{"source": {"name": "<E>", "source": "<E.url>"}, "transformation": [{"filter": "<MARGINAL:D>"}], "representation": '
 '{"mark": "arc", "mapping": [{"encoding": "theta", "field": "<M>", "type": "quantitative"}, {"encoding": "color", '
 '"field": "<D:n>", "type": "nominal"}, {"encoding": "radius", "value": 60}, {"encoding": "radius2", "value": 80}]}}',
 '{"source": {"name": "<E>", "source": "<E.url>"}, "transformation": [{"filter": "<MARGINAL:D1,D2>"}], '
 '"representation": {"mark": "bar", "mapping": [{"encoding": "x", "field": "<D1:n>", "type": "nominal"}, {"encoding": '
 '"y", "field": "<M>", "type": "quantitative"}, {"encoding": "color", "field": "<D2:n>", "type": "nominal"}]}}',
 '{"source": {"name": "<E>", "source": "<E.url>"}, "transformation": [{"filter": "<MARGINAL:D1,D2>"}], '
 '"representation": {"mark": "bar", "mapping": [{"encoding": "x", "field": "<D1:n>", "type": "nominal"}, {"encoding": '
 '"y", "field": "<M>", "type": "quantitative"}, {"encoding": "xOffset", "field": "<D2:n>", "type": "nominal"}, '
 '{"encoding": "color", "field": "<D2:n>", "type": "nominal"}]}}',
 '{"source": {"name": "<E>", "source": "<E.url>"}, "transformation": [{"filter": "<MARGINAL:D1,D2>"}, {"groupby": '
 '"<D1>", "out": "groupTotals"}, {"rollup": {"axis_total": {"op": "sum", "field": "<M>"}}}, {"groupby": ["<D2>", '
 '"<D1>"], "in": "<E>"}, {"rollup": {"cell_total": {"op": "sum", "field": "<M>"}}}, {"join": {"on": "<D1>"}, "in": '
 '["<E>", "groupTotals"], "out": "datasets"}, {"derive": {"proportion": "d[\'cell_total\'] / d[\'axis_total\']"}}], '
 '"representation": {"mark": "bar", "mapping": [{"encoding": "x", "field": "<D1:n>", "type": "nominal"}, {"encoding": '
 '"y", "field": "proportion", "type": "quantitative"}, {"encoding": "color", "field": "<D2:n>", "type": "nominal"}]}}',
 '{"source": {"name": "<E>", "source": "<E.url>"}, "transformation": [{"filter": "<MARGINAL:D1,D2>"}, {"derive": '
 '{"udi_internal_percentile": "d[\'<M>\'] / max(d[\'<M>\'])"}}, {"derive": {"udi_internal_text_color_threshold": '
 '"d.udi_internal_percentile > .5 ? \'large\' : \'small\'"}}], "representation": [{"mark": "rect", "mapping": '
 '[{"encoding": "color", "field": "<M>", "type": "quantitative"}, {"encoding": "y", "field": "<D2:n>", "type": '
 '"nominal"}, {"encoding": "x", "field": "<D1:n>", "type": "nominal"}]}, {"mark": "text", "mapping": [{"encoding": '
 '"text", "field": "<M>", "type": "quantitative"}, {"encoding": "y", "field": "<D2:n>", "type": "nominal"}, '
 '{"encoding": "x", "field": "<D1:n>", "type": "nominal"}, {"encoding": "color", "field": '
 '"udi_internal_text_color_threshold", "type": "nominal", "domain": ["large", "small"], "range": ["white", "black"], '
 '"omitLegend": true}]}]}',
 '{"source": {"name": "<E>", "source": "<E.url>"}, "transformation": [{"filter": "<MARGINAL>"}], "representation": '
 '{"mark": "row", "mapping": [{"encoding": "text", "field": "<M>", "mark": "text", "type": "nominal"}]}}',
 '{"source": {"name": "<E>", "source": "<E.url>"}, "transformation": [{"filter": "<MARGINAL:D>"}, {"orderby": '
 '{"field": "<M>", "order": "desc"}}], "representation": {"mark": "row", "mapping": [{"encoding": "text", "field": '
 '"<D:n>", "mark": "text", "type": "nominal"}, {"encoding": "x", "field": "<M>", "mark": "bar", "type": '
 '"quantitative", "range": {"min": 0.1, "max": 1}}]}}']


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
 {'function': {'description': '[stacked_bar] Joins two entities and produces a vertical stacked bar chart of counts '
                              'grouped by two nominal fields. Design: Stacked bars show part-to-whole composition '
                              'within each category. Vertical layout for small category counts (<=4). Color encodes '
                              'the secondary grouping field from the related entity. Color is preferably mapped to the '
                              'variable with fewer unique values for better discriminability. Tasks: Compare group '
                              'compositions across categories; identify dominant sub-groups within each bar. Query '
                              'patterns: How many <E1> are there, grouped by <E1.F1:n> and <E2.F2:n>?',
               'name': 'vis_004_stacked_bar_join_count_vert_stacked_grouped',
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
               'name': 'vis_005_stacked_bar_join_count_horiz_stacked_grouped',
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
               'name': 'vis_006_stacked_bar_count_vert_stacked_grouped',
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
               'name': 'vis_007_stacked_bar_count_horiz_stacked_grouped',
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
 {'function': {'description': 'nominal field, encodes x-axis.',
               'name': 'vis_008_stacked_bar_count_vert_grouped',
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
               'name': 'vis_009_stacked_bar_count_horiz_grouped',
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
 {'function': {'description': 'nominal field, encodes x-axis.',
               'name': 'vis_010_stacked_bar_freq_vert_normalized',
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
               'name': 'vis_011_stacked_bar_freq_horiz_normalized',
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
 {'function': {'description': 'nominal field, encodes y-axis.',
               'name': 'vis_012_barchart_min_horiz',
               'parameters': {'additionalProperties': False,
                              'properties': {'entity': {'description': 'The data entity (table) to visualize.',
                                                        'type': 'string'},
                                             'field1': {'description': 'any type field.', 'type': 'string'},
                                             'field2': {'description': 'nominal field, encodes y-axis.',
                                                        'type': 'string'}},
                              'required': ['entity', 'field1', 'field2'],
                              'type': 'object'}},
  'type': 'function'},
 {'function': {'description': 'nominal field, encodes x-axis.',
               'name': 'vis_013_barchart_min_vert',
               'parameters': {'additionalProperties': False,
                              'properties': {'entity': {'description': 'The data entity (table) to visualize.',
                                                        'type': 'string'},
                                             'field1': {'description': 'any type field.', 'type': 'string'},
                                             'field2': {'description': 'nominal field, encodes x-axis.',
                                                        'type': 'string'}},
                              'required': ['entity', 'field1', 'field2'],
                              'type': 'object'}},
  'type': 'function'},
 {'function': {'description': 'nominal field, encodes y-axis.',
               'name': 'vis_014_barchart_max_horiz',
               'parameters': {'additionalProperties': False,
                              'properties': {'entity': {'description': 'The data entity (table) to visualize.',
                                                        'type': 'string'},
                                             'field1': {'description': 'any type field.', 'type': 'string'},
                                             'field2': {'description': 'nominal field, encodes y-axis.',
                                                        'type': 'string'}},
                              'required': ['entity', 'field1', 'field2'],
                              'type': 'object'}},
  'type': 'function'},
 {'function': {'description': 'nominal field, encodes x-axis.',
               'name': 'vis_015_barchart_max_vert',
               'parameters': {'additionalProperties': False,
                              'properties': {'entity': {'description': 'The data entity (table) to visualize.',
                                                        'type': 'string'},
                                             'field1': {'description': 'any type field.', 'type': 'string'},
                                             'field2': {'description': 'nominal field, encodes x-axis.',
                                                        'type': 'string'}},
                              'required': ['entity', 'field1', 'field2'],
                              'type': 'object'}},
  'type': 'function'},
 {'function': {'description': 'nominal field, encodes y-axis.',
               'name': 'vis_016_barchart_avg_horiz',
               'parameters': {'additionalProperties': False,
                              'properties': {'entity': {'description': 'The data entity (table) to visualize.',
                                                        'type': 'string'},
                                             'field1': {'description': 'any type field.', 'type': 'string'},
                                             'field2': {'description': 'nominal field, encodes y-axis.',
                                                        'type': 'string'}},
                              'required': ['entity', 'field1', 'field2'],
                              'type': 'object'}},
  'type': 'function'},
 {'function': {'description': 'nominal field, encodes x-axis.',
               'name': 'vis_017_barchart_avg_vert',
               'parameters': {'additionalProperties': False,
                              'properties': {'entity': {'description': 'The data entity (table) to visualize.',
                                                        'type': 'string'},
                                             'field1': {'description': 'any type field.', 'type': 'string'},
                                             'field2': {'description': 'nominal field, encodes x-axis.',
                                                        'type': 'string'}},
                              'required': ['entity', 'field1', 'field2'],
                              'type': 'object'}},
  'type': 'function'},
 {'function': {'description': 'nominal field, encodes y-axis.',
               'name': 'vis_018_barchart_median_horiz',
               'parameters': {'additionalProperties': False,
                              'properties': {'entity': {'description': 'The data entity (table) to visualize.',
                                                        'type': 'string'},
                                             'field1': {'description': 'any type field.', 'type': 'string'},
                                             'field2': {'description': 'nominal field, encodes y-axis.',
                                                        'type': 'string'}},
                              'required': ['entity', 'field1', 'field2'],
                              'type': 'object'}},
  'type': 'function'},
 {'function': {'description': 'nominal field, encodes x-axis.',
               'name': 'vis_019_barchart_median_vert',
               'parameters': {'additionalProperties': False,
                              'properties': {'entity': {'description': 'The data entity (table) to visualize.',
                                                        'type': 'string'},
                                             'field1': {'description': 'any type field.', 'type': 'string'},
                                             'field2': {'description': 'nominal field, encodes x-axis.',
                                                        'type': 'string'}},
                              'required': ['entity', 'field1', 'field2'],
                              'type': 'object'}},
  'type': 'function'},
 {'function': {'description': 'nominal field, encodes y-axis.',
               'name': 'vis_020_barchart_sum_horiz',
               'parameters': {'additionalProperties': False,
                              'properties': {'entity': {'description': 'The data entity (table) to visualize.',
                                                        'type': 'string'},
                                             'field1': {'description': 'any type field.', 'type': 'string'},
                                             'field2': {'description': 'nominal field, encodes y-axis.',
                                                        'type': 'string'}},
                              'required': ['entity', 'field1', 'field2'],
                              'type': 'object'}},
  'type': 'function'},
 {'function': {'description': 'nominal field, encodes x-axis.',
               'name': 'vis_021_barchart_sum_vert',
               'parameters': {'additionalProperties': False,
                              'properties': {'entity': {'description': 'The data entity (table) to visualize.',
                                                        'type': 'string'},
                                             'field1': {'description': 'any type field.', 'type': 'string'},
                                             'field2': {'description': 'nominal field, encodes x-axis.',
                                                        'type': 'string'}},
                              'required': ['entity', 'field1', 'field2'],
                              'type': 'object'}},
  'type': 'function'},
 {'function': {'description': 'quantitative field, encodes y-axis.',
               'name': 'vis_022_scatterplot_basic',
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
               'name': 'vis_023_stacked_bar_count_vert_stacked_grouped',
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
               'name': 'vis_024_stacked_bar_count_horiz_stacked_grouped',
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
               'name': 'vis_025_circular_proportion_distribution',
               'parameters': {'additionalProperties': False,
                              'properties': {'entity': {'description': 'The data entity (table) to visualize.',
                                                        'type': 'string'},
                                             'field': {'description': 'nominal field, encodes color.',
                                                       'type': 'string'}},
                              'required': ['entity', 'field'],
                              'type': 'object'}},
  'type': 'function'},
 {'function': {'description': 'nominal field, encodes color.',
               'name': 'vis_026_circular_proportion_distribution',
               'parameters': {'additionalProperties': False,
                              'properties': {'entity': {'description': 'The data entity (table) to visualize.',
                                                        'type': 'string'},
                                             'field': {'description': 'nominal field, encodes color.',
                                                       'type': 'string'}},
                              'required': ['entity', 'field'],
                              'type': 'object'}},
  'type': 'function'},
 {'function': {'description': '[table] Counts the total number of records in an entity and displays the result as a '
                              'single-row table. Design: Simple rollup with no visual encoding beyond the count value. '
                              'Useful as a quick data quality or size check. Tasks: Retrieve the total record count '
                              'for an entity. Query patterns: How many <E> records are there?',
               'name': 'vis_027_table_count',
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
               'name': 'vis_028_table_raw',
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
               'name': 'vis_029_table_join',
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
               'name': 'vis_030_table_join_count_ranked',
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
               'name': 'vis_031_table_ranked',
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
               'name': 'vis_032_table_join_max_ranked',
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
 {'function': {'description': 'any type field.',
               'name': 'vis_033_table_ranked',
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
               'name': 'vis_034_table_join_min_ranked',
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
               'name': 'vis_035_table_sorted',
               'parameters': {'additionalProperties': False,
                              'properties': {'entity': {'description': 'The data entity (table) to visualize.',
                                                        'type': 'string'},
                                             'field': {'description': 'quantitative field, encodes x-axis.',
                                                       'type': 'string'}},
                              'required': ['entity', 'field'],
                              'type': 'object'}},
  'type': 'function'},
 {'function': {'description': 'any type field.',
               'name': 'vis_036_table_min',
               'parameters': {'additionalProperties': False,
                              'properties': {'entity': {'description': 'The data entity (table) to visualize.',
                                                        'type': 'string'},
                                             'field': {'description': 'any type field.', 'type': 'string'}},
                              'required': ['entity', 'field'],
                              'type': 'object'}},
  'type': 'function'},
 {'function': {'description': 'nominal field, encodes text label.',
               'name': 'vis_037_table_count_distinct',
               'parameters': {'additionalProperties': False,
                              'properties': {'entity': {'description': 'The data entity (table) to visualize.',
                                                        'type': 'string'},
                                             'field': {'description': 'nominal field, encodes text label.',
                                                       'type': 'string'}},
                              'required': ['entity', 'field'],
                              'type': 'object'}},
  'type': 'function'},
 {'function': {'description': 'nominal field, encodes text label.',
               'name': 'vis_038_table_range',
               'parameters': {'additionalProperties': False,
                              'properties': {'entity': {'description': 'The data entity (table) to visualize.',
                                                        'type': 'string'},
                                             'field1': {'description': 'any type field.', 'type': 'string'},
                                             'field2': {'description': 'nominal field, encodes text label.',
                                                        'type': 'string'}},
                              'required': ['entity', 'field1', 'field2'],
                              'type': 'object'}},
  'type': 'function'},
 {'function': {'description': 'nominal field, encodes text label.',
               'name': 'vis_039_table_ranked_mode',
               'parameters': {'additionalProperties': False,
                              'properties': {'entity': {'description': 'The data entity (table) to visualize.',
                                                        'type': 'string'},
                                             'field': {'description': 'nominal field, encodes text label.',
                                                       'type': 'string'}},
                              'required': ['entity', 'field'],
                              'type': 'object'}},
  'type': 'function'},
 {'function': {'description': 'quantitative field, encodes x-axis.',
               'name': 'vis_040_line_cdf',
               'parameters': {'additionalProperties': False,
                              'properties': {'entity': {'description': 'The data entity (table) to visualize.',
                                                        'type': 'string'},
                                             'field': {'description': 'quantitative field, encodes x-axis.',
                                                       'type': 'string'}},
                              'required': ['entity', 'field'],
                              'type': 'object'}},
  'type': 'function'},
 {'function': {'description': 'nominal field, encodes color.',
               'name': 'vis_041_grouped_line_cdf',
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
 {'function': {'description': 'nominal field, encodes x-axis.',
               'name': 'vis_042_heatmap_count',
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
               'name': 'vis_043_heatmap_avg',
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
 {'function': {'description': 'nominal field, encodes color.',
               'name': 'vis_044_grouped_scatter_by_color',
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
               'name': 'vis_045_histogram_distribution',
               'parameters': {'additionalProperties': False,
                              'properties': {'entity': {'description': 'The data entity (table) to visualize.',
                                                        'type': 'string'},
                                             'field': {'description': 'any type field.', 'type': 'string'}},
                              'required': ['entity', 'field'],
                              'type': 'object'}},
  'type': 'function'},
 {'function': {'description': 'quantitative field, encodes x-axis.',
               'name': 'vis_046_area_density',
               'parameters': {'additionalProperties': False,
                              'properties': {'entity': {'description': 'The data entity (table) to visualize.',
                                                        'type': 'string'},
                                             'field': {'description': 'quantitative field, encodes x-axis.',
                                                       'type': 'string'}},
                              'required': ['entity', 'field'],
                              'type': 'object'}},
  'type': 'function'},
 {'function': {'description': 'quantitative field, encodes x-axis.',
               'name': 'vis_047_dot_distribution',
               'parameters': {'additionalProperties': False,
                              'properties': {'entity': {'description': 'The data entity (table) to visualize.',
                                                        'type': 'string'},
                                             'field': {'description': 'quantitative field, encodes x-axis.',
                                                       'type': 'string'}},
                              'required': ['entity', 'field'],
                              'type': 'object'}},
  'type': 'function'},
 {'function': {'description': 'nominal field, encodes color.',
               'name': 'vis_048_grouped_area_density',
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
               'name': 'vis_049_grouped_dot_distribution',
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
 {'function': {'description': 'any type field.',
               'name': 'vis_050_table_count_null_nonnull',
               'parameters': {'additionalProperties': False,
                              'properties': {'entity': {'description': 'The data entity (table) to visualize.',
                                                        'type': 'string'},
                                             'field': {'description': 'any type field.', 'type': 'string'}},
                              'required': ['entity', 'field'],
                              'type': 'object'}},
  'type': 'function'},
 {'function': {'description': 'any type field.',
               'name': 'vis_051_table_count_null',
               'parameters': {'additionalProperties': False,
                              'properties': {'entity': {'description': 'The data entity (table) to visualize.',
                                                        'type': 'string'},
                                             'field': {'description': 'any type field.', 'type': 'string'}},
                              'required': ['entity', 'field'],
                              'type': 'object'}},
  'type': 'function'},
 {'function': {'description': 'cube nominal dimension, encodes x-axis.',
               'name': 'vis_052_barchart_basic',
               'parameters': {'additionalProperties': False,
                              'properties': {'dimension': {'description': 'cube nominal dimension, encodes x-axis.',
                                                           'type': 'string'},
                                             'entity': {'description': 'The data entity (table) to visualize.',
                                                        'type': 'string'}},
                              'required': ['entity', 'dimension'],
                              'type': 'object'}},
  'type': 'function'},
 {'function': {'description': 'cube quantitative dimension, encodes x-axis.',
               'name': 'vis_053_barchart_basic',
               'parameters': {'additionalProperties': False,
                              'properties': {'dimension': {'description': 'cube quantitative dimension, encodes '
                                                                          'x-axis.',
                                                           'type': 'string'},
                                             'entity': {'description': 'The data entity (table) to visualize.',
                                                        'type': 'string'}},
                              'required': ['entity', 'dimension'],
                              'type': 'object'}},
  'type': 'function'},
 {'function': {'description': 'cube ordinal dimension, encodes x-axis.',
               'name': 'vis_054_line_sorted',
               'parameters': {'additionalProperties': False,
                              'properties': {'dimension': {'description': 'cube ordinal dimension, encodes x-axis.',
                                                           'type': 'string'},
                                             'entity': {'description': 'The data entity (table) to visualize.',
                                                        'type': 'string'}},
                              'required': ['entity', 'dimension'],
                              'type': 'object'}},
  'type': 'function'},
 {'function': {'description': 'cube nominal dimension, encodes color.',
               'name': 'vis_055_circular_proportion',
               'parameters': {'additionalProperties': False,
                              'properties': {'dimension': {'description': 'cube nominal dimension, encodes color.',
                                                           'type': 'string'},
                                             'entity': {'description': 'The data entity (table) to visualize.',
                                                        'type': 'string'}},
                              'required': ['entity', 'dimension'],
                              'type': 'object'}},
  'type': 'function'},
 {'function': {'description': 'cube nominal dimension, encodes color.',
               'name': 'vis_056_circular_proportion',
               'parameters': {'additionalProperties': False,
                              'properties': {'dimension': {'description': 'cube nominal dimension, encodes color.',
                                                           'type': 'string'},
                                             'entity': {'description': 'The data entity (table) to visualize.',
                                                        'type': 'string'}},
                              'required': ['entity', 'dimension'],
                              'type': 'object'}},
  'type': 'function'},
 {'function': {'description': 'cube nominal dimension, encodes color.',
               'name': 'vis_057_stacked_bar_vert_stacked',
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
 {'function': {'description': 'cube nominal dimension, encodes x-axis sub-group, color.',
               'name': 'vis_058_stacked_bar_grouped',
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
 {'function': {'description': 'cube nominal dimension, encodes color.',
               'name': 'vis_059_stacked_bar_proportion_stacked_normalized',
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
 {'function': {'description': 'cube nominal dimension, encodes y-axis.',
               'name': 'vis_060_heatmap_basic',
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
 {'function': {'description': '[table] Shows the grand-total cube measure as a single-row table. Design: Reads the '
                              'grand-total row directly by filtering to the marginal where every dimension is empty; '
                              'no aggregation is performed. Tasks: Retrieve the overall total. Query patterns: What is '
                              'the grand total of the measure?; How many are there in total?',
               'name': 'vis_061_table_sum',
               'parameters': {'additionalProperties': False,
                              'properties': {'entity': {'description': 'The data entity (table) to visualize.',
                                                        'type': 'string'}},
                              'required': ['entity'],
                              'type': 'object'}},
  'type': 'function'},
 {'function': {'description': 'cube nominal dimension, encodes text label.',
               'name': 'vis_062_table_sorted',
               'parameters': {'additionalProperties': False,
                              'properties': {'dimension': {'description': 'cube nominal dimension, encodes text label.',
                                                           'type': 'string'},
                                             'entity': {'description': 'The data entity (table) to visualize.',
                                                        'type': 'string'}},
                              'required': ['entity', 'dimension'],
                              'type': 'object'}},
  'type': 'function'}]


# Dispatch: tool name -> (template_index, param_to_binding_map)
TOOL_DISPATCH = {'vis_000_barchart_count_vert_grouped': (0, {'entity': 'E', 'field': 'F'}),
 'vis_001_barchart_count_horiz_grouped': (1, {'entity': 'E', 'field': 'F'}),
 'vis_002_barchart_join_count_vert_grouped': (2, {'entity1': 'E1', 'entity2': 'E2', 'entity2_field': 'E2.F'}),
 'vis_003_barchart_join_count_horiz_grouped': (3, {'entity1': 'E1', 'entity2': 'E2', 'entity2_field': 'E2.F'}),
 'vis_004_stacked_bar_join_count_vert_stacked_grouped': (4,
                                                         {'entity1': 'E1',
                                                          'entity1_field': 'E1.F1',
                                                          'entity2': 'E2',
                                                          'entity2_field': 'E2.F2'}),
 'vis_005_stacked_bar_join_count_horiz_stacked_grouped': (5,
                                                          {'entity1': 'E1',
                                                           'entity1_field': 'E1.F1',
                                                           'entity2': 'E2',
                                                           'entity2_field': 'E2.F2'}),
 'vis_006_stacked_bar_count_vert_stacked_grouped': (6, {'entity': 'E', 'field1': 'F1', 'field2': 'F2'}),
 'vis_007_stacked_bar_count_horiz_stacked_grouped': (7, {'entity': 'E', 'field1': 'F1', 'field2': 'F2'}),
 'vis_008_stacked_bar_count_vert_grouped': (8, {'entity': 'E', 'field1': 'F1', 'field2': 'F2'}),
 'vis_009_stacked_bar_count_horiz_grouped': (9, {'entity': 'E', 'field1': 'F1', 'field2': 'F2'}),
 'vis_010_stacked_bar_freq_vert_normalized': (10, {'entity': 'E', 'field1': 'F1', 'field2': 'F2'}),
 'vis_011_stacked_bar_freq_horiz_normalized': (11, {'entity': 'E', 'field1': 'F1', 'field2': 'F2'}),
 'vis_012_barchart_min_horiz': (12, {'entity': 'E', 'field1': 'F1', 'field2': 'F2'}),
 'vis_013_barchart_min_vert': (13, {'entity': 'E', 'field1': 'F1', 'field2': 'F2'}),
 'vis_014_barchart_max_horiz': (14, {'entity': 'E', 'field1': 'F1', 'field2': 'F2'}),
 'vis_015_barchart_max_vert': (15, {'entity': 'E', 'field1': 'F1', 'field2': 'F2'}),
 'vis_016_barchart_avg_horiz': (16, {'entity': 'E', 'field1': 'F1', 'field2': 'F2'}),
 'vis_017_barchart_avg_vert': (17, {'entity': 'E', 'field1': 'F1', 'field2': 'F2'}),
 'vis_018_barchart_median_horiz': (18, {'entity': 'E', 'field1': 'F1', 'field2': 'F2'}),
 'vis_019_barchart_median_vert': (19, {'entity': 'E', 'field1': 'F1', 'field2': 'F2'}),
 'vis_020_barchart_sum_horiz': (20, {'entity': 'E', 'field1': 'F1', 'field2': 'F2'}),
 'vis_021_barchart_sum_vert': (21, {'entity': 'E', 'field1': 'F1', 'field2': 'F2'}),
 'vis_022_scatterplot_basic': (22, {'entity': 'E', 'field1': 'F1', 'field2': 'F2'}),
 'vis_023_stacked_bar_count_vert_stacked_grouped': (23, {'entity': 'E', 'field1': 'F1', 'field2': 'F2'}),
 'vis_024_stacked_bar_count_horiz_stacked_grouped': (24, {'entity': 'E', 'field1': 'F1', 'field2': 'F2'}),
 'vis_025_circular_proportion_distribution': (25, {'entity': 'E', 'field': 'F'}),
 'vis_026_circular_proportion_distribution': (26, {'entity': 'E', 'field': 'F'}),
 'vis_027_table_count': (27, {'entity': 'E'}),
 'vis_028_table_raw': (28, {'entity': 'E'}),
 'vis_029_table_join': (29, {'entity1': 'E1', 'entity2': 'E2'}),
 'vis_030_table_join_count_ranked': (30, {'entity1': 'E1', 'entity2': 'E2'}),
 'vis_031_table_ranked': (31, {'entity': 'E', 'field': 'F'}),
 'vis_032_table_join_max_ranked': (32, {'entity1': 'E1', 'entity1_field': 'E1.F', 'entity2': 'E2'}),
 'vis_033_table_ranked': (33, {'entity': 'E', 'field': 'F'}),
 'vis_034_table_join_min_ranked': (34, {'entity1': 'E1', 'entity1_field': 'E1.F', 'entity2': 'E2'}),
 'vis_035_table_sorted': (35, {'entity': 'E', 'field': 'F'}),
 'vis_036_table_min': (36, {'entity': 'E', 'field': 'F'}),
 'vis_037_table_count_distinct': (37, {'entity': 'E', 'field': 'F'}),
 'vis_038_table_range': (38, {'entity': 'E', 'field1': 'F1', 'field2': 'F2'}),
 'vis_039_table_ranked_mode': (39, {'entity': 'E', 'field': 'F'}),
 'vis_040_line_cdf': (40, {'entity': 'E', 'field': 'F'}),
 'vis_041_grouped_line_cdf': (41, {'entity': 'E', 'field1': 'F1', 'field2': 'F2'}),
 'vis_042_heatmap_count': (42, {'entity': 'E', 'field1': 'F1', 'field2': 'F2'}),
 'vis_043_heatmap_avg': (43, {'entity': 'E', 'field1': 'F1', 'field2': 'F2', 'field3': 'F3'}),
 'vis_044_grouped_scatter_by_color': (44, {'entity': 'E', 'field1': 'F1', 'field2': 'F2', 'field3': 'F3'}),
 'vis_045_histogram_distribution': (45, {'entity': 'E', 'field': 'F'}),
 'vis_046_area_density': (46, {'entity': 'E', 'field': 'F'}),
 'vis_047_dot_distribution': (47, {'entity': 'E', 'field': 'F'}),
 'vis_048_grouped_area_density': (48, {'entity': 'E', 'field1': 'F1', 'field2': 'F2'}),
 'vis_049_grouped_dot_distribution': (49, {'entity': 'E', 'field1': 'F1', 'field2': 'F2'}),
 'vis_050_table_count_null_nonnull': (50, {'entity': 'E', 'field': 'F'}),
 'vis_051_table_count_null': (51, {'entity': 'E', 'field': 'F'}),
 'vis_052_barchart_basic': (52, {'dimension': 'D', 'entity': 'E'}),
 'vis_053_barchart_basic': (53, {'dimension': 'D', 'entity': 'E'}),
 'vis_054_line_sorted': (54, {'dimension': 'D', 'entity': 'E'}),
 'vis_055_circular_proportion': (55, {'dimension': 'D', 'entity': 'E'}),
 'vis_056_circular_proportion': (56, {'dimension': 'D', 'entity': 'E'}),
 'vis_057_stacked_bar_vert_stacked': (57, {'dimension1': 'D1', 'dimension2': 'D2', 'entity': 'E'}),
 'vis_058_stacked_bar_grouped': (58, {'dimension1': 'D1', 'dimension2': 'D2', 'entity': 'E'}),
 'vis_059_stacked_bar_proportion_stacked_normalized': (59, {'dimension1': 'D1', 'dimension2': 'D2', 'entity': 'E'}),
 'vis_060_heatmap_basic': (60, {'dimension1': 'D1', 'dimension2': 'D2', 'entity': 'E'}),
 'vis_061_table_sum': (61, {'entity': 'E'}),
 'vis_062_table_sorted': (62, {'dimension': 'D', 'entity': 'E'})}


# Tags per tool name (drives per-request template selection)
TOOL_TAGS = {'vis_000_barchart_count_vert_grouped': ['line_item'],
 'vis_001_barchart_count_horiz_grouped': ['line_item'],
 'vis_002_barchart_join_count_vert_grouped': ['line_item'],
 'vis_003_barchart_join_count_horiz_grouped': ['line_item'],
 'vis_004_stacked_bar_join_count_vert_stacked_grouped': ['line_item'],
 'vis_005_stacked_bar_join_count_horiz_stacked_grouped': ['line_item'],
 'vis_006_stacked_bar_count_vert_stacked_grouped': ['line_item'],
 'vis_007_stacked_bar_count_horiz_stacked_grouped': ['line_item'],
 'vis_008_stacked_bar_count_vert_grouped': ['line_item'],
 'vis_009_stacked_bar_count_horiz_grouped': ['line_item'],
 'vis_010_stacked_bar_freq_vert_normalized': ['line_item'],
 'vis_011_stacked_bar_freq_horiz_normalized': ['line_item'],
 'vis_012_barchart_min_horiz': ['line_item'],
 'vis_013_barchart_min_vert': ['line_item'],
 'vis_014_barchart_max_horiz': ['line_item'],
 'vis_015_barchart_max_vert': ['line_item'],
 'vis_016_barchart_avg_horiz': ['line_item'],
 'vis_017_barchart_avg_vert': ['line_item'],
 'vis_018_barchart_median_horiz': ['line_item'],
 'vis_019_barchart_median_vert': ['line_item'],
 'vis_020_barchart_sum_horiz': ['line_item'],
 'vis_021_barchart_sum_vert': ['line_item'],
 'vis_022_scatterplot_basic': ['line_item'],
 'vis_023_stacked_bar_count_vert_stacked_grouped': ['line_item'],
 'vis_024_stacked_bar_count_horiz_stacked_grouped': ['line_item'],
 'vis_025_circular_proportion_distribution': ['line_item'],
 'vis_026_circular_proportion_distribution': ['line_item'],
 'vis_027_table_count': ['line_item'],
 'vis_028_table_raw': ['line_item'],
 'vis_029_table_join': ['line_item'],
 'vis_030_table_join_count_ranked': ['line_item'],
 'vis_031_table_ranked': ['line_item'],
 'vis_032_table_join_max_ranked': ['line_item'],
 'vis_033_table_ranked': ['line_item'],
 'vis_034_table_join_min_ranked': ['line_item'],
 'vis_035_table_sorted': ['line_item'],
 'vis_036_table_min': ['line_item'],
 'vis_037_table_count_distinct': ['line_item'],
 'vis_038_table_range': ['line_item'],
 'vis_039_table_ranked_mode': ['line_item'],
 'vis_040_line_cdf': ['line_item'],
 'vis_041_grouped_line_cdf': ['line_item'],
 'vis_042_heatmap_count': ['line_item'],
 'vis_043_heatmap_avg': ['line_item'],
 'vis_044_grouped_scatter_by_color': ['line_item'],
 'vis_045_histogram_distribution': ['line_item'],
 'vis_046_area_density': ['line_item'],
 'vis_047_dot_distribution': ['line_item'],
 'vis_048_grouped_area_density': ['line_item'],
 'vis_049_grouped_dot_distribution': ['line_item'],
 'vis_050_table_count_null_nonnull': ['line_item'],
 'vis_051_table_count_null': ['line_item'],
 'vis_052_barchart_basic': ['data_cube'],
 'vis_053_barchart_basic': ['data_cube'],
 'vis_054_line_sorted': ['data_cube'],
 'vis_055_circular_proportion': ['data_cube'],
 'vis_056_circular_proportion': ['data_cube'],
 'vis_057_stacked_bar_vert_stacked': ['data_cube'],
 'vis_058_stacked_bar_grouped': ['data_cube'],
 'vis_059_stacked_bar_proportion_stacked_normalized': ['data_cube'],
 'vis_060_heatmap_basic': ['data_cube'],
 'vis_061_table_sum': ['data_cube'],
 'vis_062_table_sorted': ['data_cube']}
