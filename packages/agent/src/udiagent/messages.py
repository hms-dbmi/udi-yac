"""Message normalization utilities for OpenAI-compatible chat histories."""

import json

#: The tool call a client echoes back for every chart already on the dashboard.
RENDER_VISUALIZATION = "RenderVisualization"

#: The internal tool that reads back a chart's full spec (see `udiagent.tools`).
GET_VISUALIZATION_SPEC = "GetVisualizationSpec"


def _function(tool_call: dict) -> dict:
    """A tool call's function part, in either the flat or the OpenAI shape."""
    return tool_call.get("function") or tool_call


def visualization_calls(messages: list[dict]):
    """Yield `(chart_id, tool_call)` for each chart rendered earlier in a history.

    Charts are numbered in the order they appear — `chart_1`, `chart_2` — so the
    same history always gives the same ids, which is what lets the model ask
    for one by the id it was shown.
    """
    count = 0
    for message in messages:
        for tool_call in message.get("tool_calls") or []:
            if isinstance(tool_call, dict) and _function(tool_call).get("name") == RENDER_VISUALIZATION:
                count += 1
                yield f"chart_{count}", tool_call


def _compact_arguments(chart_id: str, meta: dict) -> dict:
    """What the model is shown for a template-made chart instead of its spec.

    The template call that produced it: the arguments a follow-up ("EFS too")
    should start from, rather than a long spec it would have to reverse-engineer
    — which also read its derived columns as settings to choose, and so switched
    on options nobody asked for. Marked as trimmed, with the way to the rest.
    """
    return {
        "chart_id": chart_id,
        "template_tool": meta["tool_used"],
        "template_args": meta.get("tool_args") or {},
        "spec": (
            "Omitted here to keep the history short; it is exactly what "
            "template_tool produces from template_args. Call "
            f'{GET_VISUALIZATION_SPEC} with chart_id "{chart_id}" to read it in full.'
        ),
    }


def compact_visualization_history(messages: list[dict]) -> list[dict]:
    """Replace each template-made chart's spec with the template call behind it.

    Applies to a `RenderVisualization` call whose `meta` names the template it
    came from and which has not been revealed (`meta.spec_revealed`, set when the
    model asked for it with `GetVisualizationSpec`). A chart without that
    provenance — drawn freehand — keeps its spec: there is no shorter, faithful
    description of it. Mutates and returns `messages`; pass a copy.
    """
    for chart_id, tool_call in visualization_calls(messages):
        function = _function(tool_call)
        meta = function.get("meta") or {}
        if meta.get("tool_used") and not meta.get("spec_revealed"):
            function["arguments"] = _compact_arguments(chart_id, meta)
    return messages


def split_tool_calls(messages: list[dict]) -> list[dict]:
    """Split messages with multiple tool calls into separate messages.

    Returns a new list — does not mutate the input.
    """
    new_messages = []
    for message in messages:
        if "tool_calls" in message:
            tool_calls = message["tool_calls"]
            if isinstance(tool_calls, list) and len(tool_calls) > 1:
                for tool_call in tool_calls:
                    new_message = message.copy()
                    new_message["tool_calls"] = [tool_call]
                    new_messages.append(new_message)
            else:
                new_messages.append(message)
        else:
            new_messages.append(message)
    return new_messages


def normalize_tool_calls(messages: list[dict], *, compact_charts: bool = True) -> list[dict]:
    """Reformat tool_calls into valid OpenAI function-calling format and
    inject synthetic tool-response messages where missing.

    The frontend echoes back dispatched results as flat dicts
    (e.g. {"name": "RenderVisualization", "arguments": {...}}).
    The OpenAI API requires each tool_call entry to have "id",
    "type": "function", and arguments as a JSON string.  It also
    requires a corresponding "tool" role message for every tool_call_id.

    With `compact_charts` (the default), a chart made from a template is shown
    as the template call behind it rather than its full spec — see
    `compact_visualization_history`. Mutates `messages`; pass a copy.
    """
    if compact_charts:
        messages = compact_visualization_history(messages)
    result = []
    for idx, message in enumerate(messages):
        if "tool_calls" not in message:
            result.append(message)
            continue

        # Normalize the tool_calls on this assistant message
        normalized = []
        for i, tc in enumerate(message.get("tool_calls", [])):
            if not isinstance(tc, dict):
                continue
            # Already in OpenAI format
            if "type" in tc and "function" in tc and "id" in tc:
                normalized.append(tc)
                continue
            # Flat / dispatched format -> convert
            fn = tc.get("function", {})
            if fn:
                name = fn.get("name", "")
                args = fn.get("arguments", {})
            else:
                name = tc.get("name", "")
                args = tc.get("arguments", {})
            normalized.append(
                {
                    "id": f"call_{idx}_{i}",
                    "type": "function",
                    "function": {
                        "name": name,
                        "arguments": json.dumps(args)
                        if not isinstance(args, str)
                        else args,
                    },
                }
            )
        message["tool_calls"] = normalized
        # Ensure content is not None (OpenAI requires it)
        if not message.get("content"):
            message["content"] = ""
        result.append(message)

        # Check if the next message(s) already contain tool responses
        # for these IDs; if not, inject synthetic ones.
        next_idx = idx + 1
        existing_ids = set()
        while next_idx < len(messages):
            nxt = messages[next_idx]
            if nxt.get("role") == "tool":
                existing_ids.add(nxt.get("tool_call_id"))
                next_idx += 1
            else:
                break

        for tc in normalized:
            if tc["id"] not in existing_ids:
                result.append(
                    {
                        "role": "tool",
                        "tool_call_id": tc["id"],
                        "content": "OK",
                    }
                )

    return result
