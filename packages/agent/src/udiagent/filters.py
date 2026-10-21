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

import json

SCOPE_MATCHES = ("any", "all", "none")

_ORIGIN_LABELS = {
    "chat": "set in chat, editable",
    "chart": "set on a chart, editable",
    "host": "set by the host page, read-only",
}

#: Filters the agent may modify or remove. Chat and chart filters are one
#: filter per column, whoever set them last; the host page owns its own.
EDITABLE_ORIGINS = ("chat", "chart")


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
        if not all(
            isinstance(entry.get(k), str) and entry[k]
            for k in ("id", "entity", "field")
        ):
            continue
        if entry.get("filterType") not in ("point", "interval"):
            continue
        origin = entry.get("origin")
        out.append({**entry, "origin": origin if origin in _ORIGIN_LABELS else "chat"})
    return out


def describe_condition(entry: dict) -> str:
    """``Entity.field`` and its values, in words."""
    column = f"{entry['entity']}.{entry['field']}"
    if entry["filterType"] == "interval":
        rng = entry.get("intervalRange")
        if not isinstance(rng, dict):
            return f"{column} (no range set — the filter keeps every row)"
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


def filter_summary(filters) -> str:
    """The filter state for a log line: ids and shapes, never fields or values.

    Field names and values can identify patients, and the server logs neither
    (it logs the schema and domains only as character counts). A value count
    is enough to tell an edited filter from the one first made.
    """
    parts = []
    for entry in filters:
        if entry.get("filterType") == "interval":
            shape = (
                "interval"
                if isinstance(entry.get("intervalRange"), dict)
                else "interval:unset"
            )
        else:
            shape = f"point:{len(entry.get('pointValues') or [])}"
        scope = entry.get("scope")
        match = scope.get("match") if isinstance(scope, dict) else "rows"
        parts.append(f"{entry.get('id')}({entry.get('origin')},{shape},{match})")
    return f"{len(parts)} [{', '.join(parts)}]" if parts else "0"


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


# ---------------------------------------------------------------------------
# Filter operations: what the filter step may do to that state
# ---------------------------------------------------------------------------

OPERATIONS = ("add", "modify", "remove", "clear")

#: Attempts at a valid set of operations: the first call plus two retries, as
#: in visualization generation.
MAX_FILTER_ATTEMPTS = 3

APPLY_FILTER_OPERATIONS = "ApplyFilterOperations"

#: Closes the replayed rejections on a retry (see ``vis_generate._retry_turns``).
FILTER_RETRY_CLOSING = (
    "Call the tool again with those problems fixed. Keep every operation and "
    "argument that was not named above exactly as it was."
)

APPLY_FILTER_OPERATIONS_TOOL = {
    "type": "function",
    "function": {
        "name": APPLY_FILTER_OPERATIONS,
        "description": "Apply these changes to the active filters, in order.",
        "parameters": {
            "type": "object",
            "properties": {
                "operations": {
                    "type": "array",
                    "minItems": 1,
                    "items": {
                        "type": "object",
                        "properties": {
                            "op": {
                                "type": "string",
                                "enum": list(OPERATIONS),
                                "description": (
                                    "'add' a new filter; 'modify' an existing one "
                                    "(by id) — give its full new definition; "
                                    "'remove' one (by id); 'clear' every filter "
                                    "you made."
                                ),
                            },
                            "id": {
                                "type": "string",
                                "description": "The filter to modify or remove.",
                            },
                            "title": {
                                "type": "string",
                                "description": (
                                    "A short title for the filter (e.g. 'Donor Sex')."
                                ),
                            },
                            "entity": {
                                "type": "string",
                                "description": "The table whose rows are tested.",
                            },
                            "field": {
                                "type": "string",
                                "description": "The column tested.",
                            },
                            "filterType": {
                                "type": "string",
                                "enum": ["point", "interval"],
                                "description": (
                                    "'point' for categorical values, 'interval' "
                                    "for a numeric range."
                                ),
                            },
                            "pointValues": {
                                "type": "array",
                                "items": {"type": "string"},
                                "description": (
                                    "Values to keep, copied exactly from the data. "
                                    "Leave empty only on 'add', when the user named "
                                    "the field but not the values, so they can pick "
                                    "them."
                                ),
                            },
                            "intervalRange": {
                                "type": "object",
                                "properties": {
                                    "min": {"type": "number"},
                                    "max": {"type": "number"},
                                },
                                "required": ["min", "max"],
                                "additionalProperties": False,
                            },
                            "scope": {
                                "type": "object",
                                "description": (
                                    "Omit to keep only the matching rows. Set it to "
                                    "test the condition per subject instead, and "
                                    "keep every row of each subject that passes."
                                ),
                                "properties": {
                                    "entity": {
                                        "type": "string",
                                        "description": (
                                            "The subject table (e.g. 'Patient'). Must "
                                            "be related to the filtered table by a "
                                            "foreign key."
                                        ),
                                    },
                                    "match": {
                                        "type": "string",
                                        "enum": list(SCOPE_MATCHES),
                                        "description": (
                                            "'any': subjects with at least one "
                                            "matching row. 'all': subjects whose every "
                                            "row matches. 'none': subjects with no "
                                            "matching row."
                                        ),
                                    },
                                },
                                "required": ["entity", "match"],
                                "additionalProperties": False,
                            },
                        },
                        "required": ["op"],
                        "additionalProperties": False,
                    },
                }
            },
            "required": ["operations"],
            "additionalProperties": False,
        },
    },
}


def _is_number(value) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool)


def _value_lists(data_domains) -> dict:
    """``{(entity, field): [values]}`` for the columns whose full value list was sent.

    A list the client shortened (``distinct`` above its length, or marked
    ``omitted``) is left out: a value missing from a sample may still exist,
    and rejecting it would block a correct filter.
    """
    try:
        entries = (
            json.loads(data_domains) if isinstance(data_domains, str) else data_domains
        )
    except (TypeError, json.JSONDecodeError):
        return {}
    out = {}
    for entry in entries if isinstance(entries, list) else []:
        if not isinstance(entry, dict) or entry.get("type") != "point":
            continue
        domain = entry.get("domain")
        if not isinstance(domain, dict) or not isinstance(domain.get("values"), list):
            continue
        values = [v for v in domain["values"] if isinstance(v, str)]
        if domain.get("omitted") or (domain.get("distinct") or 0) > len(values):
            continue
        out[(entry.get("entity"), entry.get("field"))] = values
    return out


def _related(schema: dict, a: str, b: str) -> bool:
    """A direct foreign key between ``a`` and ``b``, either way round."""
    return any(
        {rel["from_entity"], rel["to_entity"]} == {a, b}
        for rel in schema.get("relationships", [])
    )


def _validate_condition(
    op: dict, schema: dict, values: dict, *, allow_unpicked: bool
) -> list[str]:
    errors: list[str] = []
    entities = schema.get("entities", {})
    entity, field = op.get("entity"), op.get("field")
    if not entities:
        # The schema did not parse; as in visualization generation, that
        # disables the checks rather than rejecting everything.
        return []
    if entity not in entities:
        return [
            f"Table '{entity}' does not exist. Tables: {', '.join(sorted(entities))}."
        ]
    fields = entities[entity]["fields"]
    if field not in fields:
        return [
            f"Column '{field}' does not exist on '{entity}'. Columns: "
            f"{', '.join(sorted(fields))}."
        ]
    data_type = fields[field].get("type")
    filter_type = op.get("filterType")
    if filter_type == "interval":
        if data_type in ("nominal", "ordinal"):
            errors.append(
                f"'{entity}.{field}' is categorical, so it takes a 'point' filter "
                f"with values, not an interval."
            )
        rng = op.get("intervalRange")
        if not isinstance(rng, dict) or not (
            _is_number(rng.get("min")) and _is_number(rng.get("max"))
        ):
            errors.append(
                "An interval filter needs a numeric intervalRange {min, max}."
            )
        elif rng["min"] > rng["max"]:
            errors.append(
                f"intervalRange min ({rng['min']}) is above max ({rng['max']})."
            )
    elif filter_type == "point":
        picked = [v for v in op.get("pointValues") or [] if v != ""]
        if not picked and not allow_unpicked:
            errors.append(
                "A modified point filter needs its values. Leave them empty only "
                "when adding a filter for the user to pick values in."
            )
        known = values.get((entity, field))
        for value in picked if known else []:
            if value in known:
                continue
            lowered = {v.lower(): v for v in known}
            if value.lower() in lowered:
                errors.append(
                    f"Value '{value}' is not in '{entity}.{field}', but "
                    f"'{lowered[value.lower()]}' is — copy it exactly, including case."
                )
            else:
                sample = ", ".join(repr(v) for v in known[:8])
                more = "" if len(known) <= 8 else f", … ({len(known)} in all)"
                errors.append(
                    f"Value '{value}' is not in '{entity}.{field}', so the filter "
                    f"would match no rows. Values there: {sample}{more}."
                )
    else:
        errors.append("filterType must be 'point' or 'interval'.")

    scope = op.get("scope")
    if scope is not None:
        subject = scope.get("entity") if isinstance(scope, dict) else None
        if subject not in entities:
            errors.append(f"Scope table '{subject}' does not exist.")
        elif subject == entity:
            errors.append(
                f"Scope '{subject}' is the filtered table itself, which is the same "
                f"as no scope. Omit scope."
            )
        elif not _related(schema, entity, subject):
            errors.append(
                f"'{entity}' has no foreign key to or from '{subject}', so its rows "
                f"cannot be matched per {subject}."
            )
        if isinstance(scope, dict) and scope.get("match") not in SCOPE_MATCHES:
            errors.append("scope.match must be 'any', 'all' or 'none'.")
    return errors


def validate_operations(
    operations, schema: dict, data_domains, current: list[dict]
) -> list[str]:
    """Every reason these operations cannot be applied, written for the model.

    ``schema`` is the parsed schema (``schema.parse_schema_from_dict``);
    ``current`` the request's normalized filter state.
    """
    if not isinstance(operations, list) or not operations:
        return ["Give at least one operation."]
    origins = {f["id"]: f["origin"] for f in current}
    editable_ids = sorted(i for i, o in origins.items() if o in EDITABLE_ORIGINS)
    values = _value_lists(data_domains)
    touched: set[str] = set()
    errors: list[str] = []
    for n, op in enumerate(operations, start=1):
        if not isinstance(op, dict) or op.get("op") not in OPERATIONS:
            errors.append(f"Operation {n}: op must be one of {', '.join(OPERATIONS)}.")
            continue
        kind = op["op"]
        problems: list[str] = []
        if kind in ("modify", "remove"):
            target = op.get("id")
            if target not in origins:
                known = ", ".join(editable_ids) or "none"
                problems.append(
                    f"No filter has id '{target}'. Editable filters: {known}."
                )
            elif origins[target] not in EDITABLE_ORIGINS:
                problems.append(
                    f"Filter '{target}' is read-only ({_ORIGIN_LABELS[origins[target]]}). "
                    f"Add a new filter instead."
                )
            elif target in touched:
                problems.append(f"Filter '{target}' is changed twice. Change it once.")
            touched.add(target)
        if kind in ("add", "modify"):
            problems += _validate_condition(
                op, schema, values, allow_unpicked=kind == "add"
            )
        errors += [f"Operation {n} ({kind}): {p}" for p in problems]
    return errors


def operation_tool_calls(operations, current: list[dict]) -> list[dict]:
    """One ``FilterData`` tool call per operation, in the shape the client applies.

    ``op`` is omitted on an add, which is the shape every earlier ``FilterData``
    call has, so the client and the benchmark read old and new calls alike.
    """
    titles = {f["id"]: f.get("title") for f in current}
    calls = []
    for op in operations:
        kind = op["op"]
        if kind == "clear":
            arguments = {"op": "clear"}
        elif kind == "remove":
            arguments = {
                "op": "remove",
                "id": op["id"],
                "title": titles.get(op["id"]) or "",
            }
        else:
            arguments = {
                "title": op.get("title") or "",
                "entity": op["entity"],
                "field": op["field"],
                "filter": {
                    "filterType": op["filterType"],
                    "intervalRange": op.get("intervalRange") or {"min": 0, "max": 0},
                    # Empty leaves the filter in place with nothing picked, so
                    # the chat widget lists the field's values for the user.
                    "pointValues": op.get("pointValues") or [],
                },
            }
            if op.get("scope"):
                arguments["scope"] = {
                    "entity": op["scope"]["entity"],
                    "match": op["scope"]["match"],
                }
            if kind == "modify":
                arguments = {"op": "modify", "id": op["id"], **arguments}
        calls.append({"name": "FilterData", "arguments": arguments})
    return calls


def filter_failure_args(errors: list[str]) -> dict:
    """FreeTextExplain arguments for a filter change that never validated."""
    lines = ["I could not make that filter change: it did not fit this data."]
    lines += [f"• {e}" for e in errors]
    lines.append("Try naming the column and the exact values you want to filter on.")
    return {"response_type": "general", "text": lines, "has_structured_elements": False}
