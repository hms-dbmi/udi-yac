"""The filter state a request carries, and how the agent reads it.

The chat client sends every active filter with each completion request: the
ones the agent made (``chat``), the ones the embedding page set (``host``) and
chart brushes (``chart``), with the values the user has since edited them to.
The conversation history cannot stand in for this. It holds the agent's own
past ``FilterData`` calls with their original arguments, so it misses every
edit, removal and brush the user made in the UI.

One entry per (filter, field)::

    {"id": "message-filter-3-0", "origin": "chat", "title": "Diagnosis",
     "entity": "Event", "field": "cns_integrated_diagnosis",
     "filterType": "point", "pointValues": ["Medulloblastoma, Group 3"],
     "scope": {"entity": "Patient", "match": "any"}}

``intervalRange: {min, max}`` replaces ``pointValues`` on an interval filter.
``scope`` is absent (or null) for a row-level filter.
"""

from __future__ import annotations

ORIGINS = ("chat", "host", "chart")
SCOPE_MATCHES = ("any", "all", "none")

_ORIGIN_LABELS = {
    "chat": "made by you, editable",
    "host": "set by the host page, read-only",
    "chart": "a chart brush, read-only",
}


def normalize_filters(raw) -> list[dict]:
    """The request's filter entries, dropping any that are not usable.

    Lenient on purpose: the state is context for the model, so a malformed
    entry is skipped rather than failing the whole request.
    """
    if not isinstance(raw, list):
        return []
    out = []
    for entry in raw:
        if not isinstance(entry, dict):
            continue
        if not all(isinstance(entry.get(k), str) and entry[k] for k in ("id", "entity", "field")):
            continue
        if entry.get("filterType") not in ("point", "interval"):
            continue
        origin = entry.get("origin")
        out.append({**entry, "origin": origin if origin in ORIGINS else "chat"})
    return out


def describe_condition(entry: dict) -> str:
    """``Entity.field`` and its values, in words."""
    column = f"{entry['entity']}.{entry['field']}"
    if entry["filterType"] == "interval":
        rng = entry.get("intervalRange") or {}
        return f"{column} between {rng.get('min')} and {rng.get('max')}"
    values = [v for v in entry.get("pointValues") or [] if v != ""]
    if not values:
        return f"{column} (no values picked yet — the user is choosing)"
    return f"{column} is one of: " + ", ".join(repr(v) for v in values)


def describe_scope(entry: dict) -> str:
    scope = entry.get("scope")
    if not isinstance(scope, dict) or not scope.get("entity"):
        return "rows (keeps only the matching rows)"
    match = scope.get("match", "any")
    subject = scope["entity"]
    if entry["entity"] == subject:
        return f"{subject} with {match} matching"
    return f"{subject} with {match} {entry['entity']} rows matching"


def describe_filters(filters: list[dict]) -> str:
    """The current filter state as prompt text."""
    if not filters:
        return "No filters are active."
    lines = []
    for entry in filters:
        lines.append(f"- id: {entry['id']} ({_ORIGIN_LABELS[entry['origin']]})")
        if entry.get("title"):
            lines.append(f"  title: {entry['title']}")
        lines.append(f"  condition: {describe_condition(entry)}")
        lines.append(f"  scope: {describe_scope(entry)}")
    return "\n".join(lines)
