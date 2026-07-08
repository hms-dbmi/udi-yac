"""
Structured text function registry for dynamic text responses.

Defines a set of functions that can be embedded in free-text responses
using {function_name(args...)} syntax. The frontend evaluates these
against the latest data at render time, or the server resolves them
for clients that don't support dynamic rendering.
"""

import json
from pathlib import Path


# ---------------------------------------------------------------------------
# Function registry: name -> (callable, arg_count, description)
# ---------------------------------------------------------------------------

def _entity_count(schema):
    """Return the number of entities (tables) in the schema."""
    return str(len(schema.get("entities", {})))


def _entity_names(schema):
    """Return a comma-separated list of entity names."""
    return ", ".join(sorted(schema.get("entities", {}).keys()))


def _field_count(schema, entity):
    """Return the number of fields for a given entity."""
    entity_info = schema.get("entities", {}).get(entity, {})
    return str(len(entity_info.get("fields", {})))


def _field_names(schema, entity):
    """Return a comma-separated list of field names for a given entity."""
    entity_info = schema.get("entities", {}).get(entity, {})
    return ", ".join(sorted(entity_info.get("fields", {}).keys()))


def _field_type(schema, entity, field):
    """Return the data type of a specific field."""
    entity_info = schema.get("entities", {}).get(entity, {})
    field_info = entity_info.get("fields", {}).get(field, {})
    return field_info.get("type", "unknown") if isinstance(field_info, dict) else str(field_info)


def _row_count(schema, entity):
    """Return the row count for a given entity."""
    entity_info = schema.get("entities", {}).get(entity, {})
    return str(entity_info.get("row_count", 0))


# def _sample_values(schema, entity, field):
#     """Return sample values for a field (placeholder — requires live data access)."""
#     return f"[sample values for {entity}.{field}]"


# Registry: function_name -> (implementation, min_args, max_args, description)
FUNCTION_REGISTRY = {
    "entity_count": (_entity_count, 0, 0, "Returns the number of data entities (tables)."),
    "entity_names": (_entity_names, 0, 0, "Returns a comma-separated list of entity names."),
    "field_count": (_field_count, 1, 1, "Returns the number of fields for a given entity. Args: entity_name"),
    "field_names": (_field_names, 1, 1, "Returns a comma-separated list of field names. Args: entity_name"),
    "field_type": (_field_type, 2, 2, "Returns the data type of a field. Args: entity_name, field_name"),
    "row_count": (_row_count, 1, 1, "Returns the row count for an entity. Args: entity_name"),
    # "sample_values": (_sample_values, 2, 2, "Returns sample values for a field. Args: entity_name, field_name"),
}


# ---------------------------------------------------------------------------
# Validation
# ---------------------------------------------------------------------------

import re

# Pattern: {function_name()} or {function_name("arg1")} or {function_name("arg1", "arg2")}
_FUNC_REF_PATTERN = re.compile(
    r'\{(\w+)\(((?:"[^"]*"(?:\s*,\s*"[^"]*")*)?)\)\}'
)

_ARG_PATTERN = re.compile(r'"([^"]*)"')


def validate_structured_text(text):
    """Validate that all function references in the text use registered functions.

    Returns list of error strings (empty = valid).
    """
    errors = []
    for match in _FUNC_REF_PATTERN.finditer(text):
        func_name = match.group(1)
        args_str = match.group(2)

        if func_name not in FUNCTION_REGISTRY:
            errors.append(f"Unknown function: {func_name}")
            continue

        _, min_args, max_args, _ = FUNCTION_REGISTRY[func_name]
        args = _ARG_PATTERN.findall(args_str) if args_str.strip() else []

        if len(args) < min_args or len(args) > max_args:
            errors.append(
                f"Function {func_name} expects {min_args}-{max_args} args, got {len(args)}"
            )

    return errors


def resolve_structured_text(text, schema):
    """Resolve all function references in text using the provided schema.

    Replaces {function_name(args...)} with evaluated results.
    Returns the resolved text string.
    """

    def replacer(match):
        func_name = match.group(1)
        args_str = match.group(2)

        if func_name not in FUNCTION_REGISTRY:
            return match.group(0)  # Leave unknown functions as-is

        func, min_args, max_args, _ = FUNCTION_REGISTRY[func_name]
        args = _ARG_PATTERN.findall(args_str) if args_str.strip() else []

        try:
            return func(schema, *args)
        except Exception:
            return match.group(0)

    return _FUNC_REF_PATTERN.sub(replacer, text)


def _human_readable(func_name, args):
    """Convert a function name and args into a human-readable label.

    Examples:
        entity_count, []           -> "entity count"
        field_count, ["donors"]    -> "field count of donors"
        field_type, ["donors", "sex"] -> "field type of donors > sex"
    """
    label = func_name.replace("_", " ")
    if args:
        label += " of " + " > ".join(args)
    return label


def segment_structured_text(text, schema):
    """Segment text into a mixed list of plain strings and structured element objects.

    Each structured element {function_name(args)} becomes an object with:
      - "expression": the raw function reference (e.g. "{entity_count()}")
      - "label": a human-readable description (e.g. "entity count")
      - "value": the resolved value from the schema

    Plain text between function references is kept as-is (strings).
    Returns (segments list, has_structured_elements bool).
    """
    segments = []
    last_end = 0

    for match in _FUNC_REF_PATTERN.finditer(text):
        # Add plain text before this match
        if match.start() > last_end:
            segments.append(text[last_end:match.start()])

        func_name = match.group(1)
        args_str = match.group(2)
        expression = match.group(0)
        args = _ARG_PATTERN.findall(args_str) if args_str.strip() else []

        # Resolve the value
        if func_name in FUNCTION_REGISTRY:
            func, min_args, max_args, _ = FUNCTION_REGISTRY[func_name]
            try:
                value = func(schema, *args)
            except Exception:
                value = expression
        else:
            value = expression

        label = _human_readable(func_name, args)
        segments.append({"expression": expression, "label": label, "value": value})
        last_end = match.end()

    # Add any trailing plain text
    if last_end < len(text):
        segments.append(text[last_end:])

    has_structured = any(isinstance(s, dict) for s in segments)
    return segments, has_structured


def get_function_signatures():
    """Return the function registry as a list of signature descriptions.

    Suitable for including in LLM prompts.
    """
    signatures = []
    for name, (_, min_args, max_args, desc) in sorted(FUNCTION_REGISTRY.items()):
        signatures.append(f"- {{{name}(...)}}: {desc}")
    return "\n".join(signatures)


def export_registry_json():
    """Export the function registry as a JSON-serializable dict.

    Suitable for sharing with the frontend as a contract.
    """
    return {
        name: {
            "min_args": min_args,
            "max_args": max_args,
            "description": desc,
        }
        for name, (_, min_args, max_args, desc) in FUNCTION_REGISTRY.items()
    }
