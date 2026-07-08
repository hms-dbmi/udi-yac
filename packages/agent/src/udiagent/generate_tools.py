"""
Meta codegen script: reads template visualizations + a data schema and generates
typed OpenAI function-calling tool definitions (data only, no Python builder code).

Usage:
    python src/generate_tools.py \
        --templates src/skills/template_visualizations.json \
        --schema data/data_domains/hubmap_data_schema.json \
        --output src/generated_vis_tools.py
"""

import argparse
import json
import pprint
import re
from pathlib import Path


# ---------------------------------------------------------------------------
# Schema parsing
# ---------------------------------------------------------------------------

def parse_schema(schema_path: str) -> dict:
    """Parse a UDI data schema into a structured representation.

    Returns:
        {
            "base_path": str,
            "entities": {
                "name": {
                    "url": str,
                    "row_count": int,
                    "fields": { "field_name": {"type": str, "cardinality": int} },
                },
            },
            "relationships": [
                {
                    "from_entity": str, "to_entity": str,
                    "from_field": str, "to_field": str,
                    "from_cardinality": str, "to_cardinality": str,
                }
            ]
        }
    """
    with open(schema_path) as f:
        raw = json.load(f)

    base_path = raw.get("udi:path", "./")
    entities = {}
    relationships = []

    for resource in raw.get("resources", []):
        name = resource["name"]
        row_count = resource.get("udi:row_count", 0)
        path = resource.get("path", "")
        url = base_path + path

        fields = {}
        for field in resource.get("schema", {}).get("fields", []):
            cardinality = field.get("udi:cardinality", 0)
            if cardinality == 0:
                continue
            fields[field["name"]] = {
                "type": field.get("udi:data_type", ""),
                "cardinality": cardinality,
            }

        entities[name] = {
            "url": url,
            "row_count": row_count,
            "fields": fields,
        }

        for fk in resource.get("schema", {}).get("foreignKeys", []):
            card = fk.get("udi:cardinality", {})
            relationships.append({
                "from_entity": name,
                "to_entity": fk["reference"]["resource"],
                "from_field": fk["fields"][0],
                "to_field": fk["reference"]["fields"][0],
                "from_cardinality": card.get("from", "many"),
                "to_cardinality": card.get("to", "one"),
            })

    return {"base_path": base_path, "entities": entities, "relationships": relationships}


# ---------------------------------------------------------------------------
# Constraint evaluation (entity-level only, used to skip inapplicable tools)
# ---------------------------------------------------------------------------

def _eval_entity_constraints(constraints: list[str], entity_info: dict, prefix: str = "E") -> bool:
    """Check if an entity satisfies constraints like 'E.c > 0'."""
    row_count = entity_info["row_count"]
    for constraint in constraints:
        c = constraint.strip()
        m = re.match(rf'^{re.escape(prefix)}\.c\s*(<=|>=|<|>|==)\s*(\d+)$', c)
        if m:
            op, val = m.group(1), int(m.group(2))
            if op == '<=' and not (row_count <= val):
                return False
            if op == '>=' and not (row_count >= val):
                return False
            if op == '<' and not (row_count < val):
                return False
            if op == '>' and not (row_count > val):
                return False
            if op == '==' and not (row_count == val):
                return False
    return True


# ---------------------------------------------------------------------------
# Template analysis
# ---------------------------------------------------------------------------

def _extract_placeholders(template_str: str) -> set[str]:
    """Extract all <placeholder> names from a template string."""
    return set(re.findall(r'<([^>]+)>', template_str))


def _derive_tool_name(template: dict, index: int) -> str:
    """Derive a meaningful tool name from chart_type + description keywords."""
    chart_type = template.get("chart_type", "chart").lower()
    desc = template.get("description", "").lower()

    suffixes = []

    # Detect join/cross-entity
    if "join" in desc or "related entity" in desc:
        suffixes.append("join")

    # Detect aggregation
    agg_keywords = ["count", "average", "mean", "median", "minimum", "maximum",
                     "total", "sum", "frequency", "proportion", "percentage"]
    for kw in agg_keywords:
        if kw in desc:
            suffixes.append({"minimum": "min", "maximum": "max", "average": "avg",
                             "mean": "avg", "total": "sum", "frequency": "freq",
                             "proportion": "proportion", "percentage": "pct"}.get(kw, kw))
            break

    # Detect layout/style modifiers
    if "horizontal" in desc:
        suffixes.append("horiz")
    elif "vertical" in desc:
        suffixes.append("vert")
    if "stacked" in desc:
        suffixes.append("stacked")
    if "grouped" in desc or "side-by-side" in desc:
        suffixes.append("grouped")
    if "normalized" in desc:
        suffixes.append("normalized")
    if "color" in desc or "colored" in desc:
        suffixes.append("by_color")
    if "cumulative" in desc or "cdf" in desc:
        suffixes.append("cdf")
    if "density" in desc or "kde" in desc:
        suffixes.append("density")
    if "distribution" in desc and "cdf" not in suffixes and "density" not in suffixes:
        suffixes.append("distribution")
    if "ranked" in desc or "rank" in desc:
        suffixes.append("ranked")
    if "sorted" in desc or "ordered" in desc:
        suffixes.append("sorted")
    if "raw data" in desc or "raw" in desc:
        suffixes.append("raw")
    if "null" in desc:
        suffixes.append("null")
    if "non-null" in desc:
        suffixes.append("nonnull")
    if "min and max" in desc or "min/max" in desc:
        suffixes.append("range")
    if "distinct" in desc:
        suffixes.append("distinct")
    if "most frequent" in desc:
        suffixes.append("mode")

    suffix = "_".join(suffixes) if suffixes else "basic"
    name = f"vis_{index:03d}_{chart_type}_{suffix}"
    return re.sub(r'[^a-z0-9_]', '', name)


def _build_tool_description(template: dict) -> str:
    """Build a rich description from template metadata."""
    parts = []
    if template.get("chart_type"):
        parts.append(f"[{template['chart_type']}]")
    if template.get("description"):
        parts.append(template["description"])
    if template.get("design_considerations"):
        parts.append(f"Design: {template['design_considerations']}")
    if template.get("tasks"):
        parts.append(f"Tasks: {template['tasks']}")
    query_templates = template.get("query_templates", [])
    if isinstance(query_templates, str):
        query_templates = [query_templates]
    if query_templates:
        parts.append(f"Query patterns: {'; '.join(query_templates)}")
    return " ".join(parts)


def _get_field_type_for_placeholder(placeholder: str) -> str | None:
    """:n -> nominal, :q -> quantitative, :o -> ordinal, :q|o|n -> any"""
    if ":n" in placeholder:
        return "nominal"
    elif ":q" in placeholder and ":q|o|n" not in placeholder:
        return "quantitative"
    elif ":o" in placeholder:
        return "ordinal"
    return None


def _extract_encoding_info(spec_template: str) -> dict[str, dict]:
    """Extract encoding roles and declared types for each placeholder from a spec template.

    Parses the spec_template JSON and walks the representation mappings to find
    which visual encoding (x, y, color, theta, etc.) each placeholder is used in,
    and what data type the encoding declares.

    Returns: dict mapping placeholder base (e.g. "F1", "E2.F") to
             {"encodings": ["x", ...], "declared_type": "nominal" | "quantitative" | None}
    """
    info: dict[str, dict] = {}
    try:
        spec = json.loads(spec_template)
    except (json.JSONDecodeError, TypeError):
        return info

    rep = spec.get("representation", {})
    reps = rep if isinstance(rep, list) else [rep]
    for r in reps:
        mappings = r.get("mapping", [])
        if isinstance(mappings, dict):
            mappings = [mappings]
        for m in mappings:
            encoding = m.get("encoding", "")
            field = m.get("field", "")
            declared_type = m.get("type")  # "nominal", "quantitative", "ordinal"
            # Match fields that are a single placeholder like "<F1>" or "<E2.F>"
            match = re.fullmatch(r'<([^>]+)>', field)
            if match and encoding:
                ph = match.group(1)
                base = ph.split(":")[0] if ":" in ph else ph
                if base not in info:
                    info[base] = {"encodings": [], "declared_type": None}
                if encoding not in info[base]["encodings"]:
                    info[base]["encodings"].append(encoding)
                if declared_type and info[base]["declared_type"] is None:
                    info[base]["declared_type"] = declared_type
    return info


_ENCODING_LABELS = {
    "x": "x-axis",
    "y": "y-axis",
    "color": "color",
    "theta": "angle/size",
    "radius": "radius",
    "radius2": "outer radius",
    "opacity": "opacity",
    "size": "size",
    "text": "text label",
    "xOffset": "x-axis sub-group",
    "yOffset": "y-axis sub-group",
}


def _build_field_description(field_type: str | None, encoding_info: dict | None) -> str:
    """Build a descriptive string for a field parameter.

    Args:
        field_type: Type from placeholder suffix (:n, :q, :o) or None.
        encoding_info: {"encodings": [...], "declared_type": str|None} from spec template.
    """
    # Prefer placeholder suffix type, fall back to declared type from encoding
    resolved_type = field_type
    if not resolved_type and encoding_info:
        resolved_type = encoding_info.get("declared_type")
    type_str = resolved_type or "any type"

    encodings = encoding_info.get("encodings", []) if encoding_info else []
    if encodings:
        labels = [_ENCODING_LABELS.get(e, e) for e in encodings]
        return f"{type_str} field, encodes {', '.join(labels)}."
    return f"{type_str} field."


# ---------------------------------------------------------------------------
# Tool generation (single entity templates)
# ---------------------------------------------------------------------------

def _generate_single_entity_tool(
    template: dict, index: int, schema: dict
) -> tuple[dict, dict] | None:
    """Generate tool definition + param map for a single-entity template.

    Returns (tool_def, param_map) or None if no valid entities exist.
    """
    constraints = template.get("constraints", [])
    spec_template = template.get("spec_template", "")
    placeholders = _extract_placeholders(spec_template)

    # Check at least one entity satisfies constraints
    valid = any(
        _eval_entity_constraints(constraints, info, "E")
        for info in schema["entities"].values()
    )
    if not valid:
        return None

    tool_name = _derive_tool_name(template, index)
    description = _build_tool_description(template)
    encoding_info = _extract_encoding_info(spec_template)

    properties = {
        "entity": {"type": "string", "description": "The data entity (table) to visualize."},
    }
    required = ["entity"]
    param_map = {"entity": "E"}

    # Determine field parameters from placeholders
    seen = set()
    for ph in sorted(placeholders):
        if ph in ("E", "E.url"):
            continue
        m = re.match(r'(F\d*)', ph)
        if not m:
            continue
        base = m.group(1)  # F, F1, F2, F3
        param_name = {"F": "field", "F1": "field1", "F2": "field2", "F3": "field3"}.get(base)
        if not param_name or param_name in seen:
            continue
        seen.add(param_name)

        field_type = _get_field_type_for_placeholder(ph)
        properties[param_name] = {
            "type": "string",
            "description": _build_field_description(field_type, encoding_info.get(base)),
        }
        required.append(param_name)
        param_map[param_name] = base

    tool_def = {
        "type": "function",
        "function": {
            "name": tool_name,
            "description": description[:1024],
            "parameters": {
                "type": "object",
                "properties": properties,
                "required": required,
                "additionalProperties": False,
            },
        },
    }
    return tool_def, param_map


# ---------------------------------------------------------------------------
# Tool generation (join/two-entity templates)
# ---------------------------------------------------------------------------

def _generate_join_entity_tool(
    template: dict, index: int, schema: dict
) -> tuple[dict, dict] | None:
    """Generate tool definition + param map for a two-entity join template.

    Returns (tool_def, param_map) or None if no valid entity pairs exist.
    """
    constraints = template.get("constraints", [])
    spec_template = template.get("spec_template", "")
    placeholders = _extract_placeholders(spec_template)

    # Check at least one valid entity pair exists (either direction)
    has_valid_pair = False
    for rel in schema["relationships"]:
        e1 = schema["entities"].get(rel["from_entity"])
        e2 = schema["entities"].get(rel["to_entity"])
        if not e1 or not e2:
            continue
        # Check forward direction
        if _eval_entity_constraints(constraints, e1, "E1") and \
           _eval_entity_constraints(constraints, e2, "E2"):
            has_valid_pair = True
            break
        # Check reverse direction
        if _eval_entity_constraints(constraints, e2, "E1") and \
           _eval_entity_constraints(constraints, e1, "E2"):
            has_valid_pair = True
            break
    if not has_valid_pair:
        return None

    tool_name = _derive_tool_name(template, index)
    description = _build_tool_description(template)
    encoding_info = _extract_encoding_info(spec_template)

    properties = {
        "entity1": {"type": "string", "description": "The primary data entity (table)."},
        "entity2": {"type": "string", "description": "The secondary data entity (table) to join with."},
    }
    required = ["entity1", "entity2"]
    param_map = {"entity1": "E1", "entity2": "E2"}

    seen = set()
    for ph in sorted(placeholders):
        if ph in ("E1", "E1.url", "E2", "E2.url", "E1.r.E2.id.from", "E1.r.E2.id.to"):
            continue

        if ph.startswith("E1.F"):
            param_name = "entity1_field"
            m = re.match(r'E1\.(F\d*)', ph)
            base = "E1." + m.group(1) if m else "E1.F"
        elif ph.startswith("E2.F"):
            param_name = "entity2_field"
            m = re.match(r'E2\.(F\d*)', ph)
            base = "E2." + m.group(1) if m else "E2.F"
        else:
            continue

        if param_name in seen:
            continue
        seen.add(param_name)

        field_type = _get_field_type_for_placeholder(ph)
        properties[param_name] = {
            "type": "string",
            "description": _build_field_description(field_type, encoding_info.get(base)),
        }
        required.append(param_name)
        param_map[param_name] = base

    tool_def = {
        "type": "function",
        "function": {
            "name": tool_name,
            "description": description[:1024],
            "parameters": {
                "type": "object",
                "properties": properties,
                "required": required,
                "additionalProperties": False,
            },
        },
    }
    return tool_def, param_map


# ---------------------------------------------------------------------------
# Main generation
# ---------------------------------------------------------------------------

def generate(templates_path: str, schema_path: str, output_path: str):
    """Generate the typed vis tools module (data only, no builder code)."""
    with open(templates_path) as f:
        templates = json.load(f)

    schema = parse_schema(schema_path)

    tool_defs = []
    spec_templates = []
    tool_dispatch = {}
    tool_name_set = {}

    for i, template in enumerate(templates):
        spec_template = template.get("spec_template", "")
        placeholders = _extract_placeholders(spec_template)
        is_join = "E1" in placeholders or "E2" in placeholders

        if is_join:
            result = _generate_join_entity_tool(template, i, schema)
        else:
            result = _generate_single_entity_tool(template, i, schema)

        if result is None:
            continue

        tool_def, param_map = result
        tool_name = tool_def["function"]["name"]

        # Handle duplicate names
        if tool_name in tool_name_set:
            tool_name = f"{tool_name}_{i}"
            tool_def["function"]["name"] = tool_name
        tool_name_set[tool_name] = i

        template_idx = len(spec_templates)
        spec_templates.append(spec_template)
        tool_defs.append(tool_def)
        tool_dispatch[tool_name] = (template_idx, param_map)

    # Build schema for runtime (URLs, field metadata, and relationships)
    schema_data = {
        "entities": {
            name: {
                "url": info["url"],
                "fields": {
                    fname: {"type": finfo["type"], "cardinality": finfo["cardinality"]}
                    for fname, finfo in info["fields"].items()
                },
            }
            for name, info in schema["entities"].items()
        },
        "relationships": schema["relationships"],
    }

    output = [
        '"""',
        'Auto-generated visualization tool definitions.',
        '',
        f'Generated from: {Path(templates_path).resolve().relative_to(Path.cwd())}',
        f'Schema: {Path(schema_path).resolve().relative_to(Path.cwd())}',
        f'Tools: {len(tool_defs)}',
        '',
        'DO NOT EDIT — regenerate with: python src/generate_tools.py',
        '"""',
        '',
        '',
        '# Schema metadata (entity URLs and relationships)',
        f'SCHEMA = {pprint.pformat(schema_data, width=120)}',
        '',
        '',
        '# Spec template strings (indexed by position)',
        f'TEMPLATES = {pprint.pformat(spec_templates, width=120)}',
        '',
        '',
        '# OpenAI function-calling tool definitions',
        f'TOOL_DEFS = {pprint.pformat(tool_defs, width=120)}',
        '',
        '',
        '# Dispatch: tool name -> (template_index, param_to_binding_map)',
        f'TOOL_DISPATCH = {pprint.pformat(tool_dispatch, width=120)}',
        '',
    ]

    Path(output_path).write_text("\n".join(output))
    print(f"Generated {len(tool_defs)} tools -> {output_path}")


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Generate typed visualization tools from templates + schema")
    parser.add_argument("--templates", default="src/skills/template_visualizations.json", help="Path to template visualizations JSON")
    parser.add_argument("--schema", default="data/data_domains/hubmap_data_schema.json", help="Path to data schema JSON")
    parser.add_argument("--output", default="src/generated_vis_tools.py", help="Output Python module path")
    args = parser.parse_args()
    generate(args.templates, args.schema, args.output)
