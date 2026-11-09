"""The dashboard state a request carries, and how the agent reads it.

The chat client sends which charts are on its dashboard with each completion
request. The conversation history cannot stand in for this: it echoes back
every chart the agent ever made as a ``RenderVisualization`` call, including
the ones the user has since closed.

The chat names a chart by where its call sits in the history it sends,
``"{message index}-{tool call index}"``. The agent maps that to the
``chart_id`` the model is shown (``udiagent.messages.chart_keys``)::

    {"open": [{"key": "3-0", "tableView": true}, {"key": "1-0", "sortByTotal": true}],
     "closed": ["5-0"]}

``open`` is in dashboard order (left to right, top to bottom). ``closed`` is
the memory bank, where a closed chart stays until it is restored.
"""

from __future__ import annotations

from udiagent.messages import chart_keys


def _list(value) -> list:
    return value if isinstance(value, list) else []


def normalize_dashboard(raw, messages: list[dict]) -> dict | None:
    """The request's dashboard, each chart with its ``chart_id``; None if not sent.

    Lenient like ``normalize_filters``: an entry that is malformed, or names no
    chart in ``messages`` (a Data Overview card, say), is skipped. ``messages``
    must be the history as sent, before ``split_tool_calls``.
    """
    if not isinstance(raw, dict):
        return None
    ids = chart_keys(messages)
    open_charts = []
    for entry in _list(raw.get("open")):
        key = entry.get("key") if isinstance(entry, dict) else None
        if isinstance(key, str) and key in ids:
            open_charts.append(
                {
                    "chart_id": ids[key],
                    "key": key,
                    "table_view": entry.get("tableView") is True,
                    "sort_by_total": entry.get("sortByTotal") is True,
                }
            )
    closed = [
        {"chart_id": ids[key], "key": key}
        for key in _list(raw.get("closed"))
        if isinstance(key, str) and key in ids
    ]
    return {"open": open_charts, "closed": closed}


def describe_dashboard(dashboard: dict | None) -> str:
    """The current dashboard as prompt text."""
    if dashboard is None:
        return "Not reported. Treat every chart in the conversation as still open."
    lines = []
    if dashboard["open"]:
        lines.append("Open, in dashboard order (left to right, top to bottom):")
        for chart in dashboard["open"]:
            views = [
                label
                for flag, label in (
                    (chart["table_view"], "shown as a table"),
                    (chart["sort_by_total"], "sorted by total"),
                )
                if flag
            ]
            lines.append(f"- {chart['chart_id']}" + (f" ({', '.join(views)})" if views else ""))
    else:
        lines.append("No charts are open.")
    if dashboard["closed"]:
        lines.append("Closed — in the memory bank, not visible until restored:")
        lines.extend(f"- {chart['chart_id']}" for chart in dashboard["closed"])
    return "\n".join(lines)
