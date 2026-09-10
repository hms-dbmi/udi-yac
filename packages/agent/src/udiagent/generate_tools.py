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

from udiagent.vis_generate import PLACEHOLDER


# ---------------------------------------------------------------------------
# Schema parsing
# ---------------------------------------------------------------------------

def parse_schema(schema_path: str) -> dict:
    """Parse a UDI data schema file into a structured representation.

    Thin file-loading wrapper around :func:`udiagent.schema.parse_schema_from_dict`,
    which is the single source of truth for schema parsing (see it for the
    returned structure).
    """
    from udiagent.schema import parse_schema_from_dict

    with open(schema_path) as f:
        raw = json.load(f)
    return parse_schema_from_dict(raw)


# ---------------------------------------------------------------------------
# Template analysis
# ---------------------------------------------------------------------------

#: A dynamic-stratification grouping tag, `<GROUP:E1.F4>` — the part after the
#: first colon names the field placeholder it cuts.
_GROUP_TAG = re.compile(r"(GROUP\d*)(?::(.+))?$")

#: The grouping parameter, declared as a real object rather than JSON inside a
#: string. Models are markedly worse at emitting a valid JSON document as a
#: string value than at filling typed fields, and these tools already ask for
#: fourteen other arguments — this was the one most likely to come back
#: malformed, and a malformed one costs the whole tool call.
#:
#: Each field carries its own description, so the shape no longer has to be
#: spelled out in prose that competed with the tool description for the 1024
#: character budget.
_GROUPING_SCHEMA = {
    "type": "object",
    "description": (
        "OPTIONAL. Combine the stratifier's values into a few named strata. Omit "
        "it entirely for one stratum per distinct value, which is usually what "
        "you want. Supply it when the request compares GROUPS of values rather "
        "than every value ('white versus all other races'), or splits a number "
        "at a threshold ('over 65'). At most 10 strata."
    ),
    "properties": {
        "type": {
            "type": "string",
            "enum": ["nominal", "quantitative"],
            "description": (
                "'nominal' to combine named values, 'quantitative' to cut a "
                "number at thresholds. Must match the stratifier column's type."
            ),
        },
        "groups": {
            "type": "array",
            "description": (
                "Nominal only. One entry per stratum. Values not listed in any "
                "group fall into 'other'."
            ),
            "items": {
                "type": "object",
                "properties": {
                    "label": {
                        "type": "string",
                        "description": "What this stratum is called in the legend.",
                    },
                    "values": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": (
                            "Column values in this stratum, copied EXACTLY as "
                            "they appear in the data, including case. A value "
                            "may appear in only one group."
                        ),
                    },
                },
                "required": ["label", "values"],
            },
        },
        "other": {
            "type": ["string", "null"],
            "description": (
                "Nominal only. Label for values no group claims; null to leave "
                "them out of the chart entirely. Defaults to 'Other'."
            ),
        },
        "cuts": {
            "type": "array",
            "items": {"type": "number"},
            "description": (
                "Quantitative only. Ascending thresholds; N cuts make N+1 "
                "buckets, each half-open on the right — a cut at 65 puts 65 in "
                "the upper bucket."
            ),
        },
    },
    "required": ["type"],
}


def _extract_placeholders(template_str: str) -> set[str]:
    """Extract all <placeholder> names from a template string.

    A `<GROUP:E1.F4>` tag also contributes the field placeholder it names, so
    that field gets a parameter of its own even in a template that mentions it
    nowhere else. Without this a stratifier reached only through its grouping
    would resolve to an empty column name rather than failing.
    """
    found = set(re.findall(PLACEHOLDER, template_str))
    for placeholder in list(found):
        match = _GROUP_TAG.fullmatch(placeholder)
        if match and match.group(2):
            found.add(match.group(2))
    return found


def _best_placeholders(placeholders) -> list[str]:
    """One spelling per placeholder base, preferring the one carrying a type.

    A template mentions the same binding both ways — `<E2.F:n>` where the type
    matters and `<E2.F>` everywhere else — and both come back from
    `_extract_placeholders`. Walking them in sorted order let the bare spelling
    claim the parameter first and the typed one be skipped, so the parameter was
    described as "any type field" even though `validate_bindings` goes on to
    enforce the suffix. The description was advertising freedom the binding does
    not have, which for the survival tools left eleven parameters looking alike.
    """
    best: dict[str, str] = {}
    for placeholder in sorted(placeholders):
        base = placeholder.split(":")[0]
        if base not in best or (":" in placeholder and ":" not in best[base]):
            best[base] = placeholder
    return sorted(best.values())


def _derive_tool_name(template: dict, index: int) -> str:
    """Derive a meaningful tool name from chart_type + description keywords."""
    chart_type = template.get("chart_type", "chart").lower()
    desc = template.get("description", "").lower()

    suffixes = []

    # An explicit name from the template author wins. The derivation below is a
    # convenience, not a contract: it reads keywords out of prose written for the
    # model, so a description that has to name a sibling template ("prefer the
    # baseline variant when...") would otherwise inherit that sibling's suffix.
    hint = (template.get("name_hint") or "").strip()
    if hint:
        return re.sub(r"[^a-z0-9_]", "", f"vis_{index:03d}_{chart_type}_{hint}".lower())

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
    if "survival" in desc:
        suffixes.append("survival")
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


#: OpenAI's limit on a function description. Enforced here rather than by a
#: slice at the call site so the budget can be spent deliberately.
DESCRIPTION_LIMIT = 1024


def _fit(text: str, budget: int) -> str:
    """`text` trimmed to `budget`, cut at a sentence end where one is close.

    Better a section that stops early than one that stops mid-word: a truncated
    clause reads as an instruction the model then tries to follow.
    """
    if len(text) <= budget:
        return text
    clipped = text[:budget]
    stop = max(clipped.rfind(". "), clipped.rfind("? "), clipped.rfind("! "))
    if stop > budget * 0.6:
        return clipped[: stop + 1]
    return clipped.rstrip() + "…"


def _build_tool_description(template: dict) -> str:
    """Build a rich description from template metadata, within the API's limit.

    Budgeted rather than concatenated-then-sliced. The old form let
    `design_considerations` — the longest and least discriminating section —
    consume the whole allowance, so a template whose prose ran long lost the end
    of its own `description` mid-word. The description is what the model selects
    on, so it is the one part that must always survive intact; everything after
    it is added only as far as it fits.
    """
    head = f"[{template['chart_type']}] " if template.get("chart_type") else ""
    description = (template.get("description") or "").strip()
    if len(head) + len(description) > DESCRIPTION_LIMIT:
        # Caught at authoring time rather than silently clipped at request time,
        # which is how a template ended up telling the model it "REQUIRES" a
        # parameter in a sentence the model never saw.
        print(
            f"⚠ description for {template.get('name_hint') or template.get('chart_type')} "
            f"is {len(description)} chars and will be cut at {DESCRIPTION_LIMIT}; "
            f"move detail into design_considerations."
        )
    parts = [head + description if description else head.strip()]

    extras = []
    if template.get("design_considerations"):
        extras.append(f"Design: {template['design_considerations']}")
    if template.get("tasks"):
        extras.append(f"Tasks: {template['tasks']}")
    query_templates = template.get("query_templates", [])
    if isinstance(query_templates, str):
        query_templates = [query_templates]
    if query_templates:
        extras.append(f"Query patterns: {'; '.join(query_templates)}")

    out = parts[0]
    for extra in extras:
        remaining = DESCRIPTION_LIMIT - len(out) - 1
        # Not worth a fragment: a two-word "Design:" stub tells the model less
        # than leaving the section out.
        if remaining < 80:
            break
        out = f"{out} {_fit(extra, remaining)}"
    return _fit(out, DESCRIPTION_LIMIT)


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
    """Encoding roles and declared types per placeholder base.

    Delegates to :func:`udiagent.vis_generate.placeholder_encoding_info`, which is
    the same walk `validate_bindings` uses. It used to be a second copy that read
    only the representation mappings, and when charts began splitting by a derived
    `stratum` column the copies diverged: the stratifier stopped being described as
    a nominal field that encodes colour, becoming "any type field." next to a join
    key described the same way — and the model started binding one to the other.

    Returns: dict mapping placeholder base (e.g. "F1", "E2.F") to
             {"encodings": ["x", ...], "declared_type": "nominal" | ... | None}
    """
    from udiagent.vis_generate import placeholder_encoding_info

    return placeholder_encoding_info(spec_template)


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


def _add_grouping_param(
    properties: dict, param_map: dict, seen: set, group_key: str
) -> None:
    """Register the optional grouping parameter for one `<GROUP*>` placeholder.

    Deliberately absent from the tool's `required` list — the only parameter that
    is. Every other one names something the template cannot resolve without, but
    a grouping's absence is itself an answer: one stratum per value, which is
    what a stratified chart does until someone asks for something else. Making it
    required would force the model to invent a grouping for every survival curve.
    """
    param_name = "grouping" if group_key == "GROUP" else f"grouping{group_key[5:]}"
    if param_name in seen:
        return
    seen.add(param_name)
    properties[param_name] = dict(_GROUPING_SCHEMA)
    param_map[param_name] = group_key


def _extract_field_roles(spec_template: str) -> dict[str, str]:
    """What each field placeholder is FOR: ``{placeholder base: role sentence}``.

    A type and an encoding are not always enough to tell two parameters apart.
    The survival templates ask each table for its record id and, right beside
    it, for the column a literal is matched against — both nominal, neither
    encoded, and so described identically ("nominal field."). The model has
    swapped them, joining an event log to a status table on
    `event_type = vital_status`: nothing matches, every curve is empty, and
    validation sees only columns that exist with the types asked for. Reading
    the role off the template is what makes the two parameters distinguishable
    at the point the model fills them in.
    """
    from udiagent.vis_generate import join_key_placeholders, value_field_pairs

    roles = {}
    for base in join_key_placeholders(spec_template):
        roles[base] = (
            "the JOIN KEY on this table: the column holding the shared record id "
            "(e.g. a subject or patient id). Both sides of a join must name "
            "columns holding the SAME identifiers, or nothing matches"
        )
    targets: dict[str, set[str]] = {}
    for value_key, fields in value_field_pairs(spec_template).items():
        for base in fields:
            targets.setdefault(base, set()).add(value_key)
    for base, value_keys in targets.items():
        # A join key that is also value-matched keeps the join wording: getting
        # the join wrong empties the chart, which is the worse failure.
        if base in roles:
            continue
        params = ", ".join(f"value{key[1:]}" for key in sorted(value_keys))
        roles[base] = f"the column whose values {params} name"
    return roles


def _build_field_description(
    field_type: str | None, encoding_info: dict | None, role: str | None = None
) -> str:
    """Build a descriptive string for a field parameter.

    Args:
        field_type: Type from placeholder suffix (:n, :q, :o) or None.
        encoding_info: {"encodings": [...], "declared_type": str|None} from spec template.
        role: What the template uses the binding for (see `_extract_field_roles`).
    """
    # Prefer placeholder suffix type, fall back to declared type from encoding
    resolved_type = field_type
    if not resolved_type and encoding_info:
        resolved_type = encoding_info.get("declared_type")
    type_str = resolved_type or "any type"

    encodings = encoding_info.get("encodings", []) if encoding_info else []
    text = f"{type_str} field"
    if encodings:
        labels = [_ENCODING_LABELS.get(e, e) for e in encodings]
        text += f", encodes {', '.join(labels)}"
    if role:
        text += f" — {role}"
    return text + "."


# ---------------------------------------------------------------------------
# Tool generation (single entity templates)
# ---------------------------------------------------------------------------

def _generate_single_entity_tool(
    template: dict, index: int
) -> tuple[dict, dict]:
    """Generate tool definition + param map for a single-entity template.

    Schema-independent: the tool exposes free-form ``entity``/``field`` string
    parameters that the model fills in from the per-request data schema at
    runtime, so a single agent serves any dataset.
    """
    spec_template = template.get("spec_template", "")
    placeholders = _extract_placeholders(spec_template)

    tool_name = _derive_tool_name(template, index)
    description = _build_tool_description(template)
    encoding_info = _extract_encoding_info(spec_template)
    field_roles = _extract_field_roles(spec_template)

    properties = {
        "entity": {"type": "string", "description": "The data entity (table) to visualize."},
    }
    required = ["entity"]
    param_map = {"entity": "E"}

    # Determine field/dimension parameters from placeholders. F* are line-item
    # fields; D* are data-cube dimensions (the measure <M> and the <MARGINAL:…>
    # filter are resolved from the schema at runtime, so they get no param).
    seen = set()
    for ph in _best_placeholders(placeholders):
        if ph in ("E", "E.url"):
            continue
        group = _GROUP_TAG.fullmatch(ph)
        if group:
            _add_grouping_param(properties, param_map, seen, group.group(1))
            continue
        m = re.match(r'(F\d*|D\d*|V\d*)', ph)
        if not m:
            continue
        base = m.group(1)  # F, F1..F4 / D, D1..D3 / V, V1..V3
        param_name = {
            "F": "field", "F1": "field1", "F2": "field2", "F3": "field3", "F4": "field4",
            "D": "dimension", "D1": "dimension1", "D2": "dimension2", "D3": "dimension3",
            "V": "value", "V1": "value1", "V2": "value2", "V3": "value3",
        }.get(base)
        if not param_name or param_name in seen:
            continue
        seen.add(param_name)

        field_type = _get_field_type_for_placeholder(ph)
        # Deliberately NOT named `description`: that holds the *tool* description
        # built above, and shadowing it here used to leak the last parameter's
        # blurb ("any type field.") out as the tool's own description — leaving
        # every single-entity tool with nothing for the model to select on.
        param_description = _build_field_description(
            field_type, encoding_info.get(base), field_roles.get(base)
        )
        if base.startswith("D"):
            param_description = "cube " + param_description.replace("field", "dimension", 1)
        elif base.startswith("V"):
            # <V*> is a literal data value, not a column. Say so explicitly: the
            # obvious failure is the model passing a column name here, which would
            # make the comparison it feeds match nothing.
            param_description = (
                "A literal data VALUE to match (not a column name) — one of the "
                "values actually present in the relevant column, copied exactly, "
                "including case and spacing."
            )
        properties[param_name] = {
            "type": "string",
            "description": param_description,
        }
        required.append(param_name)
        param_map[param_name] = base

    tool_def = {
        "type": "function",
        "function": {
            "name": tool_name,
            # Already budgeted by _build_tool_description.
            "description": description,
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
    template: dict, index: int
) -> tuple[dict, dict]:
    """Generate tool definition + param map for a two-entity join template.

    Schema-independent (see :func:`_generate_single_entity_tool`). Whether a
    given entity pair actually has a joining relationship is checked at runtime
    by ``validate_bindings`` against the per-request schema.
    """
    spec_template = template.get("spec_template", "")
    placeholders = _extract_placeholders(spec_template)

    tool_name = _derive_tool_name(template, index)
    description = _build_tool_description(template)
    encoding_info = _extract_encoding_info(spec_template)
    field_roles = _extract_field_roles(spec_template)

    # One entity parameter per numbered entity the template actually mentions,
    # rather than a fixed pair: a template can bring in a third table (crossing
    # membership of two of them), and a `<E3>` with no parameter behind it would
    # resolve to an empty table name instead of failing.
    entity_keys = sorted(
        {ph.split(".")[0] for ph in placeholders if re.fullmatch(r"E\d+(\..*)?", ph)}
    )
    entity_descriptions = {
        "E1": "The primary data entity (table).",
        "E2": "The secondary data entity (table) to join with.",
    }
    # Entities the template lets share a table with another. Worth saying out
    # loud: the model is otherwise told every entity must be distinct, and a
    # schema that keeps two of these roles on one table (the survival censoring
    # status beside the stratifier, both per-subject facts) then looks
    # unchartable, so it binds some other table and the values stop matching.
    shared = set(template.get("shared_entities") or [])
    properties = {}
    required = []
    param_map = {}
    for key in entity_keys:
        param = f"entity{key[1:]}"
        description = entity_descriptions.get(
            key, f"An additional data entity (table) to join with ({param})."
        )
        if key in shared:
            description += (
                " MAY be the same table as another entity here, when one table "
                "carries both roles."
            )
        properties[param] = {"type": "string", "description": description}
        required.append(param)
        param_map[param] = key

    skip = {"E1.r.E2.id.from", "E1.r.E2.id.to"}
    skip.update(entity_keys)
    skip.update(f"{key}.url" for key in entity_keys)

    seen = set()
    for ph in _best_placeholders(placeholders):
        if ph in skip:
            continue

        # One parameter per *numbered* field, so a template can take several from
        # the same side of a join. Collapsing every `E1.F*` onto one name would
        # keep only the first and leave the rest unbound — which resolves to an
        # empty field name rather than an error.
        group = _GROUP_TAG.fullmatch(ph)
        if group:
            _add_grouping_param(properties, param_map, seen, group.group(1))
            continue

        m = re.match(r'(E\d+)\.(F\d*)', ph)
        if m:
            param_name = f"entity{m.group(1)[1:]}_field{m.group(2)[1:]}"
            base = f"{m.group(1)}.{m.group(2)}"
        elif re.match(r'V\d*$', ph.split(":")[0]):
            # A join template can need literal values too — a survival curve
            # stratified across tables still has to name its start and end events.
            base = ph.split(":")[0]
            param_name = "value" + base[1:]
        else:
            continue

        if param_name in seen:
            continue
        seen.add(param_name)

        if base.startswith("V"):
            param_description = (
                "A literal data VALUE to match (not a column name) — one of the "
                "values actually present in the relevant column, copied exactly, "
                "including case and spacing."
            )
        else:
            field_type = _get_field_type_for_placeholder(ph)
            param_description = _build_field_description(
                field_type, encoding_info.get(base), field_roles.get(base)
            )
        properties[param_name] = {"type": "string", "description": param_description}
        required.append(param_name)
        param_map[param_name] = base

    tool_def = {
        "type": "function",
        "function": {
            "name": tool_name,
            # Already budgeted by _build_tool_description.
            "description": description,
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

def _rel_to_cwd(path: str) -> str:
    """Path relative to cwd if possible, else the bare filename (stable in-tree)."""
    resolved = Path(path).resolve()
    try:
        return str(resolved.relative_to(Path.cwd()))
    except ValueError:
        return resolved.name


def generate(template_sources, output_path: str):
    """Generate the typed vis tools module (data only, no builder code).

    ``template_sources`` is a list of ``(templates_path, default_tags)``. All
    sources are combined into one module; each tool records the tags of its
    template (its own ``tags`` field, or the source's ``default_tags``) in
    ``TOOL_TAGS``, which drives per-request template selection.

    The output is **schema-independent**: tool parameters are free-form
    ``entity``/``field``/``dimension`` strings, and every template produces a
    tool unconditionally. Applicability to a specific dataset is enforced at
    runtime by ``vis_generate.validate_bindings`` against the per-request
    schema, so one generated module serves arbitrary schemas.
    """
    tool_defs = []
    spec_templates = []
    tool_dispatch = {}
    tool_tags = {}
    tool_shared_entities = {}
    tool_name_set = {}
    sources_used = []
    counter = 0

    for templates_path, default_tags in template_sources:
        with open(templates_path) as f:
            templates = json.load(f)
        sources_used.append(_rel_to_cwd(templates_path))

        for template in templates:
            spec_template = template.get("spec_template", "")
            placeholders = _extract_placeholders(spec_template)
            # Any numbered entity means more than one table, whatever the count.
            is_join = any(re.fullmatch(r"E\d+", ph) for ph in placeholders)

            if is_join:
                tool_def, param_map = _generate_join_entity_tool(template, counter)
            else:
                tool_def, param_map = _generate_single_entity_tool(template, counter)

            tool_name = tool_def["function"]["name"]

            # Handle duplicate names
            if tool_name in tool_name_set:
                tool_name = f"{tool_name}_{counter}"
                tool_def["function"]["name"] = tool_name
            tool_name_set[tool_name] = counter

            template_idx = len(spec_templates)
            spec_templates.append(spec_template)
            tool_defs.append(tool_def)
            tool_dispatch[tool_name] = (template_idx, param_map)
            tool_tags[tool_name] = list(template.get("tags") or default_tags)
            tool_shared_entities[tool_name] = list(
                template.get("shared_entities") or []
            )
            counter += 1

    output = [
        '"""',
        'Auto-generated visualization tool definitions.',
        '',
        f'Generated from: {", ".join(sources_used)}',
        f'Tools: {len(tool_defs)}',
        '',
        'Schema-independent: tool params are free-form strings resolved against the',
        'per-request data schema at runtime (see vis_generate._execute_generate).',
        'TOOL_TAGS maps each tool to its template tags for per-request selection.',
        '',
        'DO NOT EDIT — regenerate with: python scripts/regenerate_vis_tools.py',
        '"""',
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
        '',
        '# Tags per tool name (drives per-request template selection)',
        f'TOOL_TAGS = {pprint.pformat(tool_tags, width=120)}',
        '',
        '',
        '# Entity keys per tool name that may share a table with another entity',
        '# (validate_bindings otherwise requires every entity to be distinct)',
        f'TOOL_SHARED_ENTITIES = {pprint.pformat(tool_shared_entities, width=120)}',
        '',
    ]

    Path(output_path).write_text("\n".join(output))
    print(f"Generated {len(tool_defs)} tools -> {output_path}")


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Generate schema-independent typed visualization tools from templates"
    )
    parser.add_argument(
        "--templates",
        default="src/udiagent/data/skills/template_visualizations.json",
        help="Path to the unified template visualizations JSON (line-item + data-cube, tagged)",
    )
    parser.add_argument(
        "--output",
        default="src/udiagent/generated_vis_tools.py",
        help="Output Python module path",
    )
    args = parser.parse_args()

    # Tags come from each template's own ``tags`` field (line_item / data_cube +
    # chart type); the source-level default is only a fallback for untagged rows.
    generate([(args.templates, [])], args.output)
