"""Message normalization utilities for OpenAI-compatible chat histories."""

import json


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


def normalize_tool_calls(messages: list[dict]) -> list[dict]:
    """Reformat tool_calls into valid OpenAI function-calling format and
    inject synthetic tool-response messages where missing.

    The frontend echoes back dispatched results as flat dicts
    (e.g. {"name": "RenderVisualization", "arguments": {...}}).
    The OpenAI API requires each tool_call entry to have "id",
    "type": "function", and arguments as a JSON string.  It also
    requires a corresponding "tool" role message for every tool_call_id.
    """
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
