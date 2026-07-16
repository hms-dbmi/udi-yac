"""Data schema parsing and simplification utilities."""

import json


def parse_schema_from_dict(raw: dict) -> dict:
    """Parse a data schema dict into the structure expected by structured_functions.

    Similar to generate_tools.parse_schema but works with an in-memory dict
    instead of a file path.
    """
    entities = {}
    for resource in raw.get("resources", []):
        name = resource["name"]
        row_count = resource.get("udi:row_count", 0)
        fields = {}
        for field in resource.get("schema", {}).get("fields", []):
            cardinality = field.get("udi:cardinality", 0)
            if cardinality == 0:
                continue
            fields[field["name"]] = {
                "type": field.get("udi:data_type", ""),
                "cardinality": cardinality,
            }
        entities[name] = {"row_count": row_count, "fields": fields}
    return {"entities": entities}


def derive_relationships(schema: dict) -> list[dict]:
    """Entity relationships from a data package dict: direct foreign keys,
    plus derived sibling links between entities that share a parent (star
    schema) — the same shared-parent bridge the chat's getEntityRelationship
    applies, so the LLM can reference any relationship the UI can filter on.

    Returns [{from_entity, from_field, to_entity, to_field, kind, via?}]
    where kind is 'direct' (with optional 'cardinality') or 'sibling'.
    """
    direct: list[dict] = []
    for resource in schema.get("resources", []):
        name = resource.get("name")
        if not name:
            continue
        for fk in resource.get("schema", {}).get("foreignKeys", []) or []:
            fields = fk.get("fields") or []
            ref = fk.get("reference") or {}
            ref_fields = ref.get("fields") or []
            if not fields or not ref_fields or not ref.get("resource"):
                continue
            card = fk.get("udi:cardinality") or {}
            direct.append(
                {
                    "from_entity": name,
                    "from_field": fields[-1],
                    "to_entity": ref["resource"],
                    "to_field": ref_fields[-1],
                    "kind": "direct",
                    "cardinality": f"{card.get('from', 'many')}-to-{card.get('to', 'one')}",
                }
            )

    # Sibling bridge: children of the same parent share its key domain, so
    # their FK columns relate directly (ponytail: one shared parent, no
    # multi-hop paths through intermediate tables — see sample-data/readme.md).
    by_parent: dict[str, list[dict]] = {}
    for rel in direct:
        by_parent.setdefault(rel["to_entity"], []).append(rel)
    siblings: list[dict] = []
    seen: set[tuple] = set()
    for parent, children in by_parent.items():
        for i, a in enumerate(children):
            for b in children[i + 1 :]:
                if a["from_entity"] == b["from_entity"]:
                    continue
                key = tuple(sorted((a["from_entity"], b["from_entity"]))) + (parent,)
                if key in seen:
                    continue
                seen.add(key)
                siblings.append(
                    {
                        "from_entity": a["from_entity"],
                        "from_field": a["from_field"],
                        "to_entity": b["from_entity"],
                        "to_field": b["from_field"],
                        "kind": "sibling",
                        "via": parent,
                    }
                )
    return direct + siblings


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

    relationships = derive_relationships(schema)
    if relationships:
        lines.append("relationships:")
        for rel in relationships:
            link = (
                f"{rel['from_entity']}.{rel['from_field']} -> "
                f"{rel['to_entity']}.{rel['to_field']}"
            )
            if rel["kind"] == "direct":
                lines.append(f"  - {link} ({rel['cardinality']})")
            else:
                lines.append(
                    f"  - {link} (siblings — both reference {rel['via']}; "
                    f"join or filter across them on these keys)"
                )

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
