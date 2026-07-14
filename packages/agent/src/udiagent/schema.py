"""Data schema parsing and simplification utilities."""

import json


def parse_schema_from_dict(raw: dict) -> dict:
    """Parse a UDI data schema dict into a structured representation.

    Works with an in-memory dict (e.g. the per-request ``data_schema``) instead
    of a file path. This is the single source of truth for schema parsing;
    ``generate_tools.parse_schema`` loads a file and delegates here.

    Returns::

        {
            "base_path": str,
            "entities": {
                "name": {
                    "url": str,
                    "row_count": int,
                    "fields": {"field_name": {"type": str, "cardinality": int}},
                },
            },
            "relationships": [
                {
                    "from_entity": str, "to_entity": str,
                    "from_field": str, "to_field": str,
                    "from_cardinality": str, "to_cardinality": str,
                }
            ],
        }

    The ``url`` and ``relationships`` data is required by the visualization
    template instantiation/validation path (``vis_generate``) so that a single
    agent can resolve templates against whatever schema arrives per request.
    """
    base_path = raw.get("udi:path", "./")
    entities = {}
    relationships = []
    for resource in raw.get("resources", []):
        name = resource["name"]
        row_count = resource.get("udi:row_count", 0)
        url = base_path + resource.get("path", "")
        fields = {}
        for field in resource.get("schema", {}).get("fields", []):
            cardinality = field.get("udi:cardinality", 0)
            if cardinality == 0:
                continue
            fields[field["name"]] = {
                "type": field.get("udi:data_type", ""),
                "cardinality": cardinality,
            }
        entities[name] = {"url": url, "row_count": row_count, "fields": fields}

        for fk in resource.get("schema", {}).get("foreignKeys", []):
            card = fk.get("udi:cardinality", {})
            relationships.append(
                {
                    "from_entity": name,
                    "to_entity": fk["reference"]["resource"],
                    "from_field": fk["fields"][0],
                    "to_field": fk["reference"]["fields"][0],
                    "from_cardinality": card.get("from", "many"),
                    "to_cardinality": card.get("to", "one"),
                }
            )

    return {"base_path": base_path, "entities": entities, "relationships": relationships}


def simplify_data_schema(data_schema):
    """Simplify the data schema for better LLM consumption.

    Converts from JSON to a compact YAML-like text, resolves file paths,
    and removes empty tables and extra information.
    """
    try:
        schema = (
            json.loads(data_schema) if isinstance(data_schema, str) else data_schema
        )
    except (json.JSONDecodeError, TypeError):
        return data_schema

    base_path = schema.get("udi:path", "./")
    lines = ["tables:"]

    for resource in schema.get("resources", []):
        row_count = resource.get("udi:row_count", 0)
        if row_count == 0:
            continue

        name = resource.get("name", "")
        description = resource.get("description", "")
        path = base_path + resource.get("path", "")

        lines.append(f"  - name: {name}")
        lines.append(f"    path: {path}")
        if description:
            lines.append(f"    description: {description}")

        fields = resource.get("schema", {}).get("fields", [])
        columns = []
        for field in fields:
            if field.get("udi:cardinality", 0) == 0:
                continue
            col_name = field.get("name", "")
            col_type = field.get("udi:data_type")
            desc = field.get("description", "").strip()
            col_lines = [f"        - name: {col_name}"]
            col_lines.append(f"          type: {col_type}")
            if col_type == "nominal" or col_type == "ordinal":
                cardinality = field.get("udi:cardinality", 0)
                col_lines.append(f"          unique_values: {cardinality}")
            if desc:
                col_lines.append(f"          description: {desc}")
            columns.append("\n".join(col_lines))

        if columns:
            lines.append("    columns:")
            lines.extend(columns)

    return "\n".join(lines)


def simplify_data_domains(data_domains):
    """Simplify data domains for better LLM consumption.

    Accepts the raw domains list (or JSON string) and produces a compact
    YAML-like text grouped by entity, showing each field's type and a
    short domain summary (category count or numeric range).
    """
    try:
        domains = (
            json.loads(data_domains)
            if isinstance(data_domains, str)
            else data_domains
        )
    except (json.JSONDecodeError, TypeError):
        return data_domains if isinstance(data_domains, str) else str(data_domains)

    # Group by entity
    grouped: dict[str, list] = {}
    for entry in domains:
        entity = entry.get("entity", "unknown")
        grouped.setdefault(entity, []).append(entry)

    lines = ["entities:"]
    for entity, fields in sorted(grouped.items()):
        lines.append(f"  - name: {entity}")
        lines.append("    fields:")
        for f in fields:
            name = f.get("field", "")
            ftype = f.get("type", "")
            desc = f.get("fieldDescription", "").strip()
            domain = f.get("domain", {})

            lines.append(f"      - name: {name}")
            lines.append(f"        filter_type: {ftype}")
            if desc:
                lines.append(f"        description: {desc}")

            if ftype == "interval":
                dmin = domain.get("min", "")
                dmax = domain.get("max", "")
                lines.append(f"        range: [{dmin}, {dmax}]")
            elif ftype == "point":
                values = [v for v in domain.get("values", []) if v is not None]
                if len(values) <= 8:
                    vals_str = ", ".join(str(v) for v in values)
                    lines.append(f"        values: [{vals_str}]")
                else:
                    sample = ", ".join(str(v) for v in values[:5])
                    lines.append(
                        f"        values: [{sample}, ...] ({len(values)} unique)"
                    )

    return "\n".join(lines)
