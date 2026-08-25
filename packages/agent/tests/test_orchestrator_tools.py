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
