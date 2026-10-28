"""Plain cube charts are titled by what they count, not by their chart type.

"Bar chart of Cnt by Diagnosis" names the chart the reader is already looking
at and the measure column's raw name. The title leads with the measure instead
("Patient count by Diagnosis", once the package titles `cnt`); charts whose
type changes how they read — normalized bars, survival curves — keep it.
"""

from udiagent.vis_generate import _load_generated_tools, resolve_text_templates

_CHART_TYPES = ("Bar chart", "Stacked", "Grouped", "Pie", "Donut", "Table", "Line chart", "Heatmap")
_KEEPS_ITS_TYPE = ("_normalized", "_survival_cube")


def _cube_tools():
    _defs, _dispatch, _templates, tags = _load_generated_tools()
    return [name for name, t in tags.items() if "data_cube" in t]


def test_plain_cube_titles_lead_with_the_measure():
    plain = [n for n in _cube_tools() if not any(k in n for k in _KEEPS_ITS_TYPE)]
    assert len(plain) == 10
    for name in plain:
        title = resolve_text_templates(name, {})["title"]
        assert title.startswith("{enc:"), (name, title)
        assert not any(t in title for t in _CHART_TYPES), (name, title)


def test_the_bar_chart_title():
    assert resolve_text_templates("vis_004_barchart_basic", {})["title"] == "{enc:y} by {enc:x}"
