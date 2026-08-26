"""Guards on the orchestrator's tool schemas.

Chart names are built programmatically from the generated spec on the frontend
(packages/chat/src/features/dashboard/utils/vizTitle.ts), so CreateVisualization
must not ask the model for a title: paying output tokens for one buys wording
that varies run to run and goes stale the moment a field is swapped.
"""

from udiagent.tools import ORCHESTRATOR_TOOLS


def _tool(name):
    for tool in ORCHESTRATOR_TOOLS:
        if tool["function"]["name"] == name:
            return tool["function"]
    raise AssertionError(f"{name} is not in ORCHESTRATOR_TOOLS")


def test_create_visualization_does_not_ask_for_a_title():
    params = _tool("CreateVisualization")["parameters"]
    assert "title" not in params["properties"]
    assert "title" not in params["required"]
    assert params["required"] == ["description"]


def test_filter_data_still_names_its_filter():
    """A filter chip has no spec to build a name from, so this title stays."""
    params = _tool("FilterData")["parameters"]
    assert "title" in params["properties"]


def test_every_template_carries_user_facing_text():
    """Both strings are authored per template, so the frontend's generic
    builder only ever covers specs that came from no template at all."""
    import json
    from pathlib import Path

    path = (
        Path(__file__).resolve().parent.parent
        / "src/udiagent/data/skills/template_visualizations.json"
    )
    templates = json.loads(path.read_text())
    missing = [
        i
        for i, t in enumerate(templates)
        if not t.get("title_template") or not t.get("summary_template")
    ]
    assert missing == [], f"templates without title/summary text: {missing}"


def test_text_templates_are_tokenized_for_the_frontend():
    """Raw <placeholders> must not survive into the generated module — the
    frontend resolves {entity}/{enc:…}/{field:…}, and {bind:…} at runtime."""
    from udiagent.generated_vis_tools import TOOL_TEXT

    assert TOOL_TEXT, "no user-facing text was generated"
    leftover = {k: v for k, v in TOOL_TEXT.items() if "<" in v[0] + v[1]}
    assert leftover == {}, f"untokenized placeholders: {leftover}"
    # A representative template, end to end.
    assert TOOL_TEXT["vis_027_scatterplot_basic"] == (
        "Scatterplot of {enc:x} and {enc:y}",
        "Displays a point for each {entity:one}, positioned by {enc:x} and {enc:y}.",
    )


def test_bind_tokens_resolve_to_the_chosen_column():
    """A placeholder with no encoding (a binby input) is filled in server-side."""
    from udiagent.vis_generate import resolve_text_templates

    text = resolve_text_templates(
        "vis_056_histogram_distribution", {"E": "donors", "F": "age_value"}
    )
    assert text["title"] == "Histogram of age_value"
    assert "{bind:" not in text["summary"]


def test_entity_singular_token_is_emitted():
    """Prose that counts one row at a time asks for the singular, because an
    entity label names a table and so reads as a plural ("each Donors")."""
    from udiagent.generated_vis_tools import TOOL_TEXT

    _, summary = TOOL_TEXT["vis_027_scatterplot_basic"]
    assert "{entity:one}" in summary
    assert "for each {entity}," not in summary
