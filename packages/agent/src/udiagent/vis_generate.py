"""
Markdown-driven skills infrastructure for visualization spec generation.

Skills are .md files on disk (YAML frontmatter + LLM instructions).
A code-driven executor runs a plan (ordered list of skill names),
calling the LLM with each skill's instructions and passing a shared
context between them.
"""

import json
import logging
import re
import uuid
from pathlib import Path
from typing import Optional

import jsonschema

from udiagent.skills import Skill, load_skills, render_template, _package_data_path
from udiagent.grammar import load_grammar
from udiagent.schema import simplify_data_schema, simplify_data_domains

# A placeholder is `<NAME>`, where NAME is an uppercase-led token: `<E>`, `<F1:n>`,
# `<V2>`, `<MARGINAL:D1,D2>`, `<E1.r.E2.id.from>`.
#
# Deliberately narrow. The obvious `<[^>]+>` also matches from a `<` comparison
# operator in a spec (`"op": "<="`) all the way to the next `>` anywhere in the
# JSON (`"op": ">="`), so resolving it swallows everything in between and leaves
# unparseable output. Every scan for placeholders — resolution, validation, tool
# parameter extraction — must use this pattern.
PLACEHOLDER = r"<([A-Z][A-Za-z0-9_.,:]*)>"

# A binding key naming an entity rather than a field: `E`, `E1`, `E2`, `E3`, ...
# Open-ended because the number of tables a template joins is a property of the
# template, not of this module; a field key always carries a dot, so it can never
# match this.
_ENTITY_KEY = re.compile(r"E\d*")

# A dynamic-stratification grouping placeholder. Three spellings, one binding:
#
#   <GROUP:E1.F4>       the stratum expression for a single-valued stratifier
#   <GROUPTAG:E2.F>     per-row group index, for a stratifier a subject has
#                       SEVERAL of (a long multi-select table)
#   <GROUPLABEL:E2.F>   that index, reduced per subject, turned into a label
#
# All three read the SAME `GROUP` binding — one grouping per template, however
# many places the template has to spell it — so the model fills one parameter
# and the tweak widget edits one control.
_GROUPING_PLACEHOLDER = re.compile(r"GROUP(TAG|LABEL)?(\d*)(?::(.+))?$")
#: Just the binding key, for callers separating a grouping from a field binding.
_GROUP_BASE = re.compile(r"GROUP\d*")


def _grouping_parts(tag):
    """``"GROUPTAG2:E2.F"`` -> ``("TAG", "GROUP2", "E2.F")``; None if not one."""
    match = _GROUPING_PLACEHOLDER.fullmatch(tag)
    if not match:
        return None
    kind, number, field = match.groups()
    return kind, f"GROUP{number or ''}", (field or "").split(":")[0]

logger = logging.getLogger(__name__)

# Why the template path was abandoned. Named rather than inlined because these
# strings reach the caller as `meta["fallback_reason"]` and are what a log grep
# or a bug report is keyed on — and because every one of them used to be a bare
# `break` that left no trace at all.
#
#: No generated templates in this deployment. The only reason that still permits
#: freehand generation, because it is the only one where nothing else exists.
FALLBACK_NO_GENERATED_TOOLS = "no_generated_tools"
#: The model declined to call a tool, or the call itself failed.
FALLBACK_NO_TOOL_CALL = "no_tool_call"
#: The model named a tool that is not in the dispatch table.
FALLBACK_UNKNOWN_TOOL = "unknown_tool"
#: Bindings were still invalid after every attempt.
FALLBACK_VALIDATION_FAILED = "validation_failed"
#: Placeholder resolution raised — a template or schema bug, not a model mistake.
FALLBACK_INSTANTIATE_FAILED = "instantiate_failed"


# ---------------------------------------------------------------------------
# Few-shot example loading
# ---------------------------------------------------------------------------

_examples_cache: dict[str, Optional[str]] = {}


def _load_examples(
    examples_path: Optional[str] = None,
) -> str:
    """Load few-shot examples from a JSON file and format them for prompt injection.

    Each example is formatted as a query/spec pair. Results are cached by path.
    Returns empty string if file doesn't exist or is empty.
    """
    if examples_path is None:
        examples_path = str(_package_data_path() / "skills" / "template_visualizations.json")

    if examples_path in _examples_cache:
        return _examples_cache[examples_path]

    path = Path(examples_path)
    if not path.exists():
        _examples_cache[examples_path] = ""
        return ""

    try:
        data = json.loads(path.read_text())
    except (json.JSONDecodeError, OSError):
        _examples_cache[examples_path] = ""
        return ""

    if not data:
        _examples_cache[examples_path] = ""
        return ""

    lines = []
    for i, ex in enumerate(data, 1):
        query_templates = ex.get("query_templates", ex.get("query_template", ""))
        if isinstance(query_templates, list):
            query = "; ".join(query_templates)
        else:
            query = query_templates
        spec = ex.get("spec_template", "")
        if not query or not spec:
            continue
        lines.append(f"**Example {i}** (type: {ex.get('chart_type', 'unknown')})")
        lines.append(f"- Query: {query}")
        desc = ex.get("description", "")
        if desc:
            lines.append(f"- Description: {desc}")
        design = ex.get("design_considerations", "")
        if design:
            lines.append(f"- Design: {design}")
        tasks = ex.get("tasks", "")
        if tasks:
            lines.append(f"- Tasks: {tasks}")
        lines.append(f"- Spec: {spec}")
        lines.append("")

    result = "\n".join(lines)
    _examples_cache[examples_path] = result
    return result


# ---------------------------------------------------------------------------
# LLM call helpers
# ---------------------------------------------------------------------------


def _call_llm_with_tools(
    agent, messages, tools, config, usage=None, openai_api_key=None, req_id="-"
):
    """Call the LLM with function-calling tools. Returns (tool_name, arguments) or None.

    Quota / rate-limit errors are re-raised as ``BudgetExceededError`` so callers
    can short-circuit; other errors swallow to None to preserve the fallback path.

    Both failure modes log before returning None. They are worth telling apart:
    "the model looked at 62 tools and chose none" is a prompt or tool-description
    problem, while "the request blew up" is a network or API one — and to the
    caller they are the same `None`, which is how a swallowed traceback used to
    surface as a mysterious freehand chart.
    """
    from udiagent.orchestrator import _call_with_budget_guard, BudgetExceededError

    try:
        client = agent._get_gpt_client(openai_api_key)
        resp = _call_with_budget_guard(
            client.chat.completions.create,
            usage,
            model=agent.gpt_model_name,
            messages=messages,
            tools=tools,
            tool_choice="auto",
            temperature=0.0,
            max_completion_tokens=1024,
        )
        if usage is not None:
            usage.add("create_visualization", getattr(resp, "usage", None))
        choice = resp.choices[0]
        if choice.message.tool_calls:
            tc = choice.message.tool_calls[0]
            return tc.function.name, json.loads(tc.function.arguments)
        logger.warning(
            "[vis %s] model returned no tool call from %d offered "
            "(finish_reason=%s, content_chars=%d)",
            req_id,
            len(tools),
            getattr(choice, "finish_reason", None),
            len(choice.message.content or ""),
        )
    except BudgetExceededError:
        raise
    except Exception:
        logger.exception("[vis %s] tool-calling LLM request failed", req_id)
    return None


def _call_llm(
    agent,
    messages,
    grammar,
    config,
    usage=None,
    openai_api_key=None,
    op="create_visualization",
):
    """Call the LLM and return the raw spec string."""
    from udiagent.orchestrator import _call_with_budget_guard

    results, resp_usage = _call_with_budget_guard(
        agent.gpt_completions_guided_json,
        usage,
        messages=messages,
        json_schema=grammar["schema_string"],
        n=config.get("n", 1),
        openai_api_key=openai_api_key,
    )
    if usage is not None:
        usage.add(op, resp_usage)
    if results:
        result = results[0]
        if "arguments" in result and "spec" in result["arguments"]:
            return json.dumps(result["arguments"]["spec"])
        return json.dumps(result)
    return "{}"


def _parse_and_validate(spec_str, schema_dict, entity_fields=None):
    """Parse JSON string and validate against schema.

    When `entity_fields` ({entity name -> set of field names}) is provided,
    additionally checks that every representation mapping field exists in the
    transformation pipeline's output columns — the JSON schema can't catch a
    mapping that references a column the pipeline never produces.

    Returns (spec_dict | None, errors list).
    """
    try:
        spec_dict = json.loads(spec_str) if isinstance(spec_str, str) else spec_str
    except json.JSONDecodeError as e:
        return None, [f"JSON parse error: {e}"]

    errors = []
    try:
        jsonschema.validate(instance=spec_dict, schema=schema_dict)
    except jsonschema.ValidationError as e:
        errors.append(str(e.message))
    except jsonschema.SchemaError as e:
        errors.append(f"Schema error: {e.message}")

    if not errors and entity_fields:
        errors.extend(spec_mapping_errors(spec_dict, entity_fields))

    return spec_dict, errors


def entity_fields_from_schema(data_schema) -> dict:
    """{entity name -> set of field names} from a dataSchema JSON string/dict."""
    try:
        raw = (
            json.loads(data_schema) if isinstance(data_schema, str) else data_schema
        ) or {}
    except json.JSONDecodeError:
        return {}
    return {
        resource["name"]: {
            field["name"]
            for field in resource.get("schema", {}).get("fields", [])
            if "name" in field
        }
        for resource in raw.get("resources", [])
        if "name" in resource
    }


def spec_mapping_errors(spec_dict, entity_fields) -> list:
    """Verify each representation mapping.field exists in the pipeline output.

    Metadata-only column-flow walk mirroring both executors (the toolkit's
    Arquero DataSourcesStore and the server's SQL compiler): groupby defers,
    rollup narrows to group keys + aggregate outputs, derive/binby add
    columns, join unions, kde replaces with group keys + sample/density.
    """
    if not isinstance(spec_dict, dict):
        return []
    sources = spec_dict.get("source") or []
    if isinstance(sources, dict):
        sources = [sources]

    unknown = [
        s.get("name")
        for s in sources
        if isinstance(s, dict) and s.get("name") not in entity_fields
    ]
    if unknown:
        return [
            f"unknown source entity(ies) {unknown}; available entities: "
            f"{sorted(entity_fields)}"
        ]

    # Named-table environment (in/out), same convention as the executors.
    env = {
        s["name"]: set(entity_fields[s["name"]])
        for s in sources
        if isinstance(s, dict)
    }
    if not env:
        return []
    current_name = sources[0]["name"]
    current = set(env[current_name])
    pending_group = []

    def resolve_in(transform):
        in_name = transform.get("in")
        if isinstance(in_name, str) and in_name in env:
            return set(env[in_name])
        return set(current)

    for transform in spec_dict.get("transformation") or []:
        if not isinstance(transform, dict):
            continue
        if "groupby" in transform:
            gb = transform["groupby"]
            pending_group = [gb] if isinstance(gb, str) else list(gb)
            cols = resolve_in(transform)
        elif "rollup" in transform and isinstance(transform["rollup"], dict):
            cols = set(pending_group) | set(transform["rollup"].keys())
            pending_group = []
        elif "binby" in transform and isinstance(transform["binby"], dict):
            output = transform["binby"].get("output") or {}
            start = output.get("bin_start", "start")
            end = output.get("bin_end", "end")
            cols = resolve_in(transform) | {start, end}
            pending_group = [start, end]
        elif "derive" in transform and isinstance(transform["derive"], dict):
            cols = resolve_in(transform) | set(transform["derive"].keys())
        elif "join" in transform:
            in_names = transform.get("in")
            if isinstance(in_names, list) and len(in_names) == 2:
                cols = env.get(in_names[0], set()) | env.get(in_names[1], set())
            else:
                cols = set(current)
            pending_group = []
        elif "kde" in transform and isinstance(transform["kde"], dict):
            output = transform["kde"].get("output") or {}
            cols = set(pending_group) | {
                output.get("sample", "sample"),
                output.get("density", "density"),
            }
            pending_group = []
        else:  # filter / orderby: no column change
            cols = resolve_in(transform)

        current = cols
        out_name = transform.get("out")
        if out_name:
            env[out_name] = set(current)
            current_name = out_name
        elif current_name:
            env[current_name] = set(current)

    errors = []
    representation = spec_dict.get("representation")
    layers = (
        representation
        if isinstance(representation, list)
        else [representation]
        if representation
        else []
    )
    for layer in layers:
        if not isinstance(layer, dict):
            continue
        mappings = layer.get("mapping")
        mapping_list = (
            mappings if isinstance(mappings, list) else [mappings] if mappings else []
        )
        for mapping in mapping_list:
            if not isinstance(mapping, dict):
                continue
            field = mapping.get("field")
            if not field or field == "*":
                continue
            if field not in current:
                errors.append(
                    f"mapping field '{field}' (encoding "
                    f"'{mapping.get('encoding')}') does not exist in the "
                    f"transformed data; available columns: {sorted(current)}"
                )
    return errors


# ---------------------------------------------------------------------------
# Skill executor
# ---------------------------------------------------------------------------


def _resolve_placeholder(tag, bindings, schema):
    """Resolve a single <tag> placeholder using bindings and schema."""
    # Entity URL: E.url, E1.url, E2.url
    if tag.endswith(".url"):
        entity_key = tag[:-4]
        entity_name = bindings.get(entity_key, "")
        return schema.get("entities", {}).get(entity_name, {}).get("url", "")

    # Data-cube measure column: <M> resolves to entity E's measure from schema.
    if tag == "M":
        entity_name = bindings.get("E", "")
        entity = schema.get("entities", {}).get(entity_name, {})
        measures = entity.get("measures") or []
        return measures[0] if measures else ""

    # Data-cube marginal filter: <MARGINAL> (grand total) or <MARGINAL:D1,D2>.
    # Selects the pre-aggregated rows where the bound (active) dimensions are
    # non-null and every OTHER dimension of the cube is null. The full dimension
    # list comes from the per-request schema, so one template serves any cube.
    if tag == "MARGINAL" or tag.startswith("MARGINAL:"):
        _, _, active_spec = tag.partition(":")
        active_keys = [k for k in active_spec.split(",") if k]
        active = [bindings.get(k, "") for k in active_keys]
        entity_name = bindings.get("E", "")
        dims = schema.get("entities", {}).get(entity_name, {}).get("dimensions", [])
        # Each dimension is null-checked; && -chained into one structured Expr
        # object so the cube filter compiles to SQL server-side (a raw Arquero
        # string would be rejected by the query compiler). instantiate_template
        # strips the surrounding quotes so this injects as a JSON object.
        clauses = [
            {"op": "!=" if d in active else "==", "left": {"field": d}, "right": {"literal": None}}
            for d in dims
        ]
        expr = clauses[0] if clauses else {"literal": True}
        for clause in clauses[1:]:
            expr = {"op": "&&", "left": expr, "right": clause}
        return json.dumps(expr)

    # Relationship join keys: E1.r.E2.id.from, E1.r.E2.id.to
    if ".r." in tag and ".id." in tag:
        parts = tag.split(".")
        e1_name = bindings.get(parts[0], "")
        e2_name = bindings.get(parts[2], "")
        direction = parts[4]  # "from" or "to"
        for rel in schema.get("relationships", []):
            if rel["from_entity"] == e1_name and rel["to_entity"] == e2_name:
                return rel["from_field"] if direction == "from" else rel["to_field"]
            if rel["from_entity"] == e2_name and rel["to_entity"] == e1_name:
                return rel["to_field"] if direction == "from" else rel["from_field"]
        return ""

    # Dynamic stratification: <GROUP:E1.F4> resolves to the expression computing
    # a stratum column out of whatever field E1.F4 is bound to. Like <MARGINAL:…>
    # this resolves to a structured Expr object rather than a name, so
    # instantiate_template strips the quotes around it and it injects as JSON.
    #
    # The grouping is an *optional* binding: with none supplied this is the
    # identity, which is what keeps a stratified chart splitting by raw value.
    parts = _grouping_parts(tag)
    if parts is not None:
        from udiagent.stratify import (
            grouping_expr,
            membership_label_expr,
            membership_tag_expr,
            parse_grouping,
        )

        kind, group_key, field_key = parts
        field_name = bindings.get(field_key, "") if field_key else ""
        grouping = parse_grouping(bindings.get(group_key))
        if kind == "TAG":
            return json.dumps(membership_tag_expr(grouping, field_name))
        if kind == "LABEL":
            return json.dumps(membership_label_expr(grouping))
        return json.dumps(grouping_expr(grouping, field_name))

    # Strip type suffix: F:n -> F, E1.F:q -> E1.F
    base = tag.split(":")[0] if ":" in tag else tag

    # Literal data values (<V>, <V1>, ...) are model-supplied text rather than
    # column names, so they can legitimately contain quotes, backslashes or
    # newlines. Substitution happens on the raw spec JSON string, so escape them
    # or a value like 'Grade "III"' would produce unparseable JSON.
    if re.fullmatch(r"V\d*", base):
        value = bindings.get(base, "")
        return json.dumps(str(value))[1:-1]

    return bindings.get(base, "")


def instantiate_template(spec_template, bindings, schema):
    """Resolve all <placeholder> tags in a spec template.

    Args:
        spec_template: Template string with <E>, <F:n>, <E.url>, etc.
        bindings: Maps abstract names to real names, e.g. {"E": "donors", "F": "sex"}
        schema: Dict with "entities" (name -> {"url": ...}) and "relationships".

    Returns: Parsed spec dict.
    """
    spec = spec_template
    # The cube marginal filter resolves to a structured Expr object, not a
    # string; strip the quotes around its placeholder so it injects unquoted
    # ("filter": {...}) and stays valid JSON.
    spec = re.sub(r'"(<MARGINAL[^>"]*>)"', r"\1", spec)
    # Same for a stratifier grouping, which resolves to the derive expression
    # computing the stratum column.
    spec = re.sub(r'"(<GROUP(?:TAG|LABEL)?\d*(?::[^>"]*)?>)"', r"\1", spec)
    while True:
        match = re.search(PLACEHOLDER, spec)
        if not match:
            break
        resolved = _resolve_placeholder(match.group(1), bindings, schema)
        spec = spec.replace(match.group(0), resolved, 1)
    return _dedupe_sources(json.loads(spec))


def _dedupe_sources(spec):
    """Drop repeated `source` entries — identical name AND url.

    A template declares one source per ROLE (the event log, the table the
    stratifier lives in, the table the censoring status lives in), and two roles
    can resolve to the same table: pcx's Patient carries `age_at_diagnosis`
    beside `vital_status`. The resolved spec then names it twice, which says
    nothing extra — the pipeline refers to it by name — and it is not harmless:
    the browser executor keys its loaded tables by name, so the duplicate
    collapses and the spec looks like it is still waiting for a table that never
    arrives. Deduped here, at the point the placeholders collapse, so every
    consumer sees a spec that lists each table once.
    """
    sources = spec.get("source")
    if not isinstance(sources, list):
        return spec
    seen = set()
    unique = []
    for source in sources:
        key = json.dumps(source, sort_keys=True) if isinstance(source, dict) else source
        if key in seen:
            continue
        seen.add(key)
        unique.append(source)
    spec["source"] = unique
    return spec


def _encoded_placeholders(spec_template):
    """Placeholder names that end up drawn on some visual channel.

    The >50 cardinality cap below exists because a chart cannot legibly show
    hundreds of categories on an axis or in a legend. That reasoning only applies
    to fields that are actually *encoded*. A placeholder used solely as a grouping
    key — e.g. grouping an event log per patient id before rolling it up to one row
    each — is collapsed by the rollup and never rendered, so capping it would
    block a legitimate aggregation for a readability problem that cannot occur.
    """
    return set(_placeholder_encodings(spec_template))


def placeholder_encoding_info(spec_template):
    """What each placeholder is *drawn as*: ``{base: {encodings, declared_type}}``.

    One walk, two consumers. `validate_bindings` wants only the channel names, to
    decide what the cardinality cap applies to and which parameters are offerable
    as tweaks; the tool generator wants the declared type as well, to describe the
    parameter to the model. They were separate implementations, and when charts
    began splitting by a derived column only one of them learned to follow the
    derive — which left the stratifier parameter described as "any type field",
    indistinguishable from the join key beside it, and the model duly swapped the
    two. Hence one function.

    A mapping can be bound to a *derived* column rather than to a placeholder
    directly, which is how dynamic stratification works: the chart colours by a
    `stratum` column that a `derive` computes from the stratifier binding.
    Attributing that column's channel and type back to the placeholders inside the
    derive is what keeps the binding visible as something a reader can see the
    effect of changing. One level only, deliberately: chasing a chain of derives
    would make every intermediate column's inputs "encoded", which is true of the
    whole survival pipeline and says nothing useful.
    """
    info = {}
    try:
        spec = json.loads(spec_template)
    except (json.JSONDecodeError, TypeError):
        return info

    def record(base, channel, declared_type):
        entry = info.setdefault(base, {"encodings": [], "declared_type": None})
        if isinstance(channel, str) and channel not in entry["encodings"]:
            entry["encodings"].append(channel)
        if declared_type and entry["declared_type"] is None:
            entry["declared_type"] = declared_type

    reps = spec.get("representation", {})
    reps = reps if isinstance(reps, list) else [reps]
    #: Channel + declared type per drawn column name, for the derive walk below.
    drawn = {}
    for rep in reps:
        if not isinstance(rep, dict):
            continue
        mappings = rep.get("mapping", [])
        mappings = mappings if isinstance(mappings, list) else [mappings]
        for mapping in mappings:
            if not isinstance(mapping, dict):
                continue
            channel = mapping.get("encoding")
            declared_type = mapping.get("type")
            # `field` is what gets drawn; `column` only places a table column.
            for value in (mapping.get("field"), mapping.get("column")):
                if not isinstance(value, str):
                    continue
                if isinstance(channel, str):
                    entry = drawn.setdefault(value, {"encodings": [], "declared_type": None})
                    if channel not in entry["encodings"]:
                        entry["encodings"].append(channel)
                    if declared_type and entry["declared_type"] is None:
                        entry["declared_type"] = declared_type
                for placeholder in re.findall(PLACEHOLDER, value):
                    record(placeholder.split(":")[0], channel, declared_type)

    for transform in spec.get("transformation") or []:
        if not isinstance(transform, dict):
            continue
        derive = transform.get("derive")
        if not isinstance(derive, dict):
            continue
        for column, expression in derive.items():
            target = drawn.get(column)
            if not target or not target["encodings"]:
                continue
            for placeholder in re.findall(PLACEHOLDER, json.dumps(expression)):
                bases = [placeholder.split(":")[0]]
                # A `<GROUP:E1.F4>` tag carries the field it cuts *inside* it, so
                # the field is not a placeholder of its own here. Attribute to
                # both: the stratifier is every bit as drawn as the grouping is,
                # and it is the one the cardinality cap, the field-swap control
                # and the model's own parameter description care about.
                grouping_parts = _grouping_parts(placeholder)
                if grouping_parts is not None:
                    _kind, group_key, group_target = grouping_parts
                    # The binding, not the spelling: `<GROUPLABEL:…>` and
                    # `<GROUPTAG:…>` are two halves of one parameter.
                    bases = [group_key]
                    if group_target:
                        bases.append(group_target)
                for base in bases:
                    for channel in target["encodings"]:
                        record(base, channel, target["declared_type"])
    return info


def _placeholder_encodings(spec_template):
    """Which visual channels each placeholder is drawn on — a view over
    :func:`placeholder_encoding_info`, keeping the channel names so a tweakable
    parameter can be labelled by what it actually drives ("color", not "field4").
    """
    return {
        base: entry["encodings"]
        for base, entry in placeholder_encoding_info(spec_template).items()
    }


def _extract_xy_placeholders(spec_template):
    """Extract placeholder names used in x and y encodings from a spec template."""
    result = {}
    try:
        spec = json.loads(spec_template)
    except (json.JSONDecodeError, TypeError):
        return result

    rep = spec.get("representation", {})
    reps = rep if isinstance(rep, list) else [rep]
    for r in reps:
        mappings = r.get("mapping", [])
        if isinstance(mappings, dict):
            mappings = [mappings]
        for m in mappings:
            enc = m.get("encoding")
            field = m.get("field", "")
            if enc in ("x", "y") and enc not in result:
                match = re.fullmatch(PLACEHOLDER, field)
                if match:
                    result[enc] = match.group(1)
    return result


def _entity_for_binding_key(key, bindings):
    """The entity a field binding resolves against.

    A numbered `E1.`/`E2.`/`E3.` prefix names one table of a multi-table
    template; everything else resolves against the single entity `E`.
    """
    prefix, dot, _ = key.partition(".")
    if dot and _ENTITY_KEY.fullmatch(prefix) and prefix != "E":
        return bindings.get(prefix)
    return bindings.get("E")


def _placeholder_type_requirements(spec_template):
    """The field type each placeholder requires, `{placeholder: type}`.

    Two sources, in precedence order: a `:n`/`:q`/`:o` suffix on the placeholder,
    then the `type` declared on an encoding whose `field` is *exactly* that
    placeholder. A placeholder with neither is unconstrained, which is why
    templates spell the suffix out wherever the type matters (see the
    type-constraint notes in the template-authoring skill).
    """
    placeholder_types = {}
    for match in re.finditer(PLACEHOLDER, spec_template):
        ph = match.group(1)
        base = ph.split(":")[0] if ":" in ph else ph
        field_type = None
        if ":n" in ph:
            field_type = "nominal"
        elif ":q" in ph and ":q|o|n" not in ph:
            field_type = "quantitative"
        elif ":o" in ph:
            field_type = "ordinal"
        if field_type and base not in placeholder_types:
            placeholder_types[base] = field_type

    try:
        spec_parsed = json.loads(spec_template)
        rep = spec_parsed.get("representation", {})
        reps = rep if isinstance(rep, list) else [rep]
        for r in reps:
            mappings = r.get("mapping", [])
            if isinstance(mappings, dict):
                mappings = [mappings]
            for m in mappings:
                field = m.get("field", "")
                declared_type = m.get("type")
                ph_match = re.fullmatch(PLACEHOLDER, field)
                if ph_match and declared_type:
                    base = ph_match.group(1).split(":")[0]
                    if base not in placeholder_types:
                        placeholder_types[base] = declared_type
    except (json.JSONDecodeError, TypeError):
        pass

    return placeholder_types


def join_key_placeholders(spec_template):
    """Placeholder bases a template uses as a `join.on` key.

    Which of a table's columns is its *identifier* is the one thing a template
    knows and a bare type cannot say. Described as "nominal field." alongside
    the event-type column beside it, the two are interchangeable to the model,
    and it has swapped them — joining an event log to a status table on
    `event_type = vital_status`, which matches nothing and draws no line while
    every column named in the spec exists and has the right type.

    Reads `on` in both spellings the grammar allows: a pair of columns, or a
    single column shared by both sides.
    """
    keys = set()
    try:
        spec = json.loads(spec_template)
    except (json.JSONDecodeError, TypeError):
        return keys

    def add(value):
        if isinstance(value, str):
            match = re.fullmatch(PLACEHOLDER, value)
            if match:
                keys.add(match.group(1).split(":")[0])
        elif isinstance(value, list):
            for item in value:
                add(item)

    for step in spec.get("transformation") or []:
        if isinstance(step, dict) and isinstance(step.get("join"), dict):
            add(step["join"].get("on"))
    return keys


def value_field_pairs(spec_template):
    """``{value key: {field placeholder keys it is compared against}}``.

    A `<V*>` binding is a literal the model supplies — an event type, a status
    string — and it is only ever meaningful against the column it is tested on.
    Reading that pairing off the template is what lets validation check the value
    actually occurs in that column, which is the difference between a chart that
    is wrong and a chart that is empty.

    Walks the whole spec rather than a known list of transforms, because a
    comparison can sit in a `derive`, a `filter`, or nested inside either.
    """
    pairs = {}
    try:
        spec = json.loads(spec_template)
    except (json.JSONDecodeError, TypeError):
        return pairs

    def visit(node):
        if isinstance(node, dict):
            left, right = node.get("left"), node.get("right")
            if (
                node.get("op") in ("==", "!=")
                and isinstance(left, dict)
                and isinstance(right, dict)
            ):
                for a, b in ((left, right), (right, left)):
                    field, literal = a.get("field"), b.get("literal")
                    if not isinstance(field, str) or not isinstance(literal, str):
                        continue
                    field_match = re.fullmatch(PLACEHOLDER, field)
                    value_match = re.fullmatch(PLACEHOLDER, literal)
                    if not field_match or not value_match:
                        continue
                    value_key = value_match.group(1).split(":")[0]
                    if re.fullmatch(r"V\d*", value_key):
                        pairs.setdefault(value_key, set()).add(
                            field_match.group(1).split(":")[0]
                        )
            for child in node.values():
                visit(child)
        elif isinstance(node, list):
            for child in node:
                visit(child)

    visit(spec)
    return pairs


def _categorical_domains(data_domains):
    """``{(entity, field): [values]}`` for the columns that have a value list.

    Only categorical ("point") domains: an interval domain is a min/max, which
    says nothing about whether a particular string occurs. A high-cardinality
    column may carry no domain at all — the client drops those before sending —
    and a column that is simply absent here is left unchecked rather than
    reported as empty.
    """
    try:
        entries = (
            json.loads(data_domains)
            if isinstance(data_domains, str)
            else data_domains
        ) or []
    except (json.JSONDecodeError, TypeError):
        return {}
    if not isinstance(entries, list):
        return {}

    out = {}
    for entry in entries:
        if not isinstance(entry, dict) or entry.get("type") != "point":
            continue
        domain = entry.get("domain")
        values = domain.get("values") if isinstance(domain, dict) else None
        if not isinstance(values, list):
            continue
        out[(entry.get("entity"), entry.get("field"))] = [
            v for v in values if isinstance(v, str)
        ]
    return out


def grouping_targets(spec_template):
    """``{grouping binding key: field binding key}`` for a template's `<GROUP:…>` tags.

    A grouping is only meaningful against the field it cuts, so every consumer —
    validation, the tweakable descriptor, the preview exporter — needs to get
    from one to the other. Read off the template rather than passed around,
    because the pairing is a property of the template.
    """
    targets = {}
    for match in re.finditer(PLACEHOLDER, spec_template):
        tag = match.group(1)
        parts = _grouping_parts(tag)
        if parts is None:
            continue
        _kind, group_key, field_key = parts
        # TAG and LABEL name the same field; whichever carries it wins, and a
        # bare `<GROUP2>` with no field must not blank an entry already set.
        if field_key or group_key not in targets:
            targets[group_key] = field_key
    return targets


def shared_entities_for(tool_name):
    """Entity keys this tool allows on the same table as another entity.

    Read from the generated module rather than passed down from the caller, so
    a template's own declaration reaches validation without every call site
    having to carry it. Unknown tool, or no generated module: no exemptions,
    which is the stricter answer.
    """
    try:
        from udiagent.generated_vis_tools import TOOL_SHARED_ENTITIES
    except ImportError:
        return ()
    return tuple(TOOL_SHARED_ENTITIES.get(tool_name) or ())


def _binding_entity_key(field_key):
    """``"E3.F2"`` -> ``"E3"``; a bare ``"F2"`` -> ``"E"``. None if neither."""
    match = re.fullmatch(r"(E\d*)\.(F\d*|[A-Za-z]\w*)", field_key)
    if match:
        return match.group(1)
    if re.fullmatch(r"F\d*", field_key):
        return "E"
    return None


def validate_bindings(
    spec_template, bindings, schema, data_domains=None, shared_entities=()
):
    """Validate tool bindings against the schema before template instantiation.

    Returns list of error strings (empty = valid).

    `data_domains`, when supplied, additionally checks each `<V*>` literal
    against the column it is compared to. Optional because not every caller has
    domains — re-instantiating a stored chart has only the schema — and a
    missing domain means "unchecked", never "invalid".

    `shared_entities` names entity keys the template lets share a table with
    another entity (see `shared_entities_for`).
    """
    errors = []
    entities = schema.get("entities", {})
    entity_names = list(entities.keys())

    # Collect entity bindings (E, E1, E2, E3, ...). Numbered arbitrarily rather
    # than to a fixed pair: a template can bring in a third table (e.g. crossing
    # membership of two of them), and an unrecognised entity key would otherwise
    # fall through to the field checks below and be reported as a missing column.
    entity_bindings = {}
    for key, val in bindings.items():
        if _ENTITY_KEY.fullmatch(key):
            entity_bindings[key] = val

    # Check entities exist
    for key, name in entity_bindings.items():
        if name not in entities:
            errors.append(
                f"Entity '{name}' not found. Available: {', '.join(entity_names)}"
            )

    if errors:
        return errors

    # Check join entities are different — every pair, so a three-table template
    # cannot quietly cross a table with itself and report every subject as
    # belonging to both groups.
    #
    # Except where the template says otherwise. Crossing is not the only reason
    # to name a second table: the survival templates also read a per-subject
    # fact (the censoring status and its date) out of one, and there the same
    # table serving two roles is ordinary rather than degenerate — pcx's Patient
    # carries `age_at_diagnosis` and `vital_status` side by side. Blanket
    # distinctness made that request unsatisfiable, and the model answered it by
    # binding some other table, whose columns then held none of the values the
    # template compares against.
    shared = set(shared_entities)
    numbered = sorted(k for k in entity_bindings if k != "E")
    for i, key_a in enumerate(numbered):
        for key_b in numbered[i + 1 :]:
            if key_a in shared or key_b in shared:
                continue
            if entity_bindings[key_a] == entity_bindings[key_b]:
                errors.append(
                    f"entity{key_a[1:]} and entity{key_b[1:]} cannot be the same "
                    f"('{entity_bindings[key_a]}')"
                )
    if errors:
        return errors

    if "E1" in entity_bindings and "E2" in entity_bindings:
        # A declared relationship is only required when the template joins *on*
        # one. A template that binds its own join keys — two tables that share a
        # subject id without either referencing the other, as sibling tables of a
        # star schema do — supplies everything the join needs, and demanding a
        # relationship there would reject a perfectly well-defined join.
        if "E1.r.E2.id.from" in spec_template or "E1.r.E2.id.to" in spec_template:
            e1, e2 = entity_bindings["E1"], entity_bindings["E2"]
            has_rel = any(
                (r["from_entity"] == e1 and r["to_entity"] == e2)
                or (r["from_entity"] == e2 and r["to_entity"] == e1)
                for r in schema.get("relationships", [])
            )
            if not has_rel:
                errors.append(f"No relationship between '{e1}' and '{e2}'")

    encoded_placeholders = _encoded_placeholders(spec_template)

    # Check that x and y encodings don't resolve to the same field
    xy_placeholders = _extract_xy_placeholders(spec_template)
    if xy_placeholders.get("x") and xy_placeholders.get("y"):
        x_binding = xy_placeholders["x"].split(":")[0]
        y_binding = xy_placeholders["y"].split(":")[0]
        x_val = bindings.get(x_binding)
        y_val = bindings.get(y_binding)
        if x_val and y_val and x_val == y_val:
            errors.append(
                f"x and y encodings must use different fields: "
                f"both '{x_binding}' and '{y_binding}' are set to '{x_val}'"
            )

    placeholder_types = _placeholder_type_requirements(spec_template)

    # Fields this request supplies a grouping for, which exempts them from the
    # cardinality cap below.
    targets = grouping_targets(spec_template)
    grouped_field_keys = {
        field_key
        for group_key, field_key in targets.items()
        if field_key and str(bindings.get(group_key) or "").strip()
    }

    # Check fields exist on entities and types match
    for key, field_name in bindings.items():
        if _ENTITY_KEY.fullmatch(key):
            continue

        # <V*> binds a literal data value (an event type, a status string), not a
        # column, so the field-existence, type and cardinality checks below do not
        # apply. Only require that something was supplied — an empty value would
        # silently make a filter match nothing.
        if re.fullmatch(r"V\d*", key):
            if not str(field_name).strip():
                errors.append(
                    f"Value '{key}' is empty; supply the data value to match "
                    f"(e.g. one of the values present in the relevant column)."
                )
            continue

        # <GROUP*> binds a stratifier *grouping* — a JSON description of how to
        # combine the stratifier's values into a handful of named strata — rather
        # than a column, so none of the field checks below apply. It is optional:
        # an absent or empty grouping means "one stratum per value", which is
        # what every stratified chart does until someone regroups it.
        if _GROUP_BASE.fullmatch(key):
            from udiagent.stratify import (
                GroupingError,
                parse_grouping,
                validate_grouping,
            )

            try:
                grouping = parse_grouping(field_name)
            except GroupingError as exc:
                errors.append(str(exc))
                continue
            if grouping is None:
                continue
            # The type of the field being cut decides which kind of grouping is
            # even meaningful — cutting a string column at numeric thresholds
            # raises nowhere and silently lumps every row into one bucket.
            target_key = grouping_targets(spec_template).get(key, "")
            target_field = bindings.get(target_key)
            target_entity = _entity_for_binding_key(target_key, entity_bindings)
            target_type = None
            if target_field and target_entity in entities:
                info = entities[target_entity].get("fields", {}).get(target_field)
                if info is not None:
                    target_type = info["type"] if isinstance(info, dict) else info
            errors.extend(validate_grouping(grouping, target_type))
            continue

        entity_name = _entity_for_binding_key(key, entity_bindings)

        if not entity_name or entity_name not in entities:
            continue

        entity_fields = entities[entity_name].get("fields", {})

        if field_name not in entity_fields:
            available_by_type = {}
            for fn, finfo in entity_fields.items():
                ft = finfo["type"] if isinstance(finfo, dict) else finfo
                available_by_type.setdefault(ft, []).append(fn)
            avail_str = "; ".join(
                f"{t}: {', '.join(fs)}" for t, fs in available_by_type.items()
            )
            errors.append(
                f"Field '{field_name}' not found on entity '{entity_name}'. "
                f"Available fields — {avail_str}"
            )
            continue

        # Cube dimension bindings (D, D1, D2, ...) must name a declared
        # dimension of the cube, not the measure or an undeclared column.
        if re.fullmatch(r"D\d*", key.split(":")[0]):
            dims = entities[entity_name].get("dimensions")
            if dims is not None and field_name not in dims:
                errors.append(
                    f"Field '{field_name}' is not a dimension of cube "
                    f"'{entity_name}'. Available dimensions: {', '.join(dims)}"
                )
                continue

        field_info = entity_fields[field_name]
        actual_type = field_info["type"] if isinstance(field_info, dict) else field_info
        cardinality = (
            field_info.get("cardinality", 0) if isinstance(field_info, dict) else 0
        )

        expected_type = placeholder_types.get(key)
        if expected_type:
            # A temporal field is validly encoded on an ordinal axis (the grammar
            # has no temporal type), so it satisfies an ordinal requirement.
            compatible = actual_type == expected_type or (
                expected_type == "ordinal" and actual_type == "temporal"
            )
            if not compatible:
                matching = [
                    fn
                    for fn, fi in entity_fields.items()
                    if (fi["type"] if isinstance(fi, dict) else fi) == expected_type
                ]
                errors.append(
                    f"Field '{field_name}' is {actual_type} but template requires {expected_type}. "
                    f"Available {expected_type} fields: {', '.join(matching)}"
                )

        # Only cap fields that are actually drawn; a grouping key the pipeline
        # rolls up never reaches a visual channel. See _encoded_placeholders.
        # A field the request also supplies a *grouping* for is exempt: the chart
        # draws the handful of strata that grouping defines, not the field's own
        # domain, and combining an unwieldy domain into a few named groups is
        # exactly what the cap should be pushing a caller towards.
        if (
            (actual_type == "nominal" or actual_type == "ordinal")
            and cardinality > 50
            and key in encoded_placeholders
            and key not in grouped_field_keys
        ):
            errors.append(
                f"Field '{field_name}' has {cardinality} unique values, which is too many "
                f"for a visualization (max 50). Choose a different encoding or visualization."
            )

    # A continuous stratifier with no grouping is not a chart: it has no
    # categories to draw a curve for, so it would draw one per distinct value —
    # a thousand curves of one subject each, which renders, takes a while, and
    # says nothing. The cardinality cap does not catch this; it only applies to
    # nominal and ordinal fields.
    #
    # Last, and only where the template left the type open. A template that asks
    # for a nominal stratifier has already reported the better error above —
    # "this field is quantitative but the template requires nominal" says to pick
    # a different field, which is the actual fix there, where this would say to
    # supply cut points for a template that cannot use them.
    for group_key, field_key in targets.items():
        if not field_key or field_key in grouped_field_keys:
            continue
        if placeholder_types.get(field_key) not in (None, "quantitative"):
            continue
        field_name = bindings.get(field_key)
        entity_name = _entity_for_binding_key(field_key, entity_bindings)
        if not field_name or entity_name not in entities:
            continue
        info = entities[entity_name].get("fields", {}).get(field_name)
        actual = (info["type"] if isinstance(info, dict) else info) if info else None
        if actual == "quantitative":
            errors.append(
                f"Field '{field_name}' is quantitative, so it needs a grouping "
                f"saying where to cut it — otherwise every distinct value would be "
                f'its own stratum. Supply one, e.g. {{"type": "quantitative", '
                f'"cuts": [65]}}.'
            )

    # A membership template asks "did this subject ever appear with one of THESE
    # values", so the value sets are the question. Without them it is
    # `survival_presence` with extra steps, and with cut points it is asking a
    # numeric question of a column of names.
    if "GROUPTAG" in spec_template:
        from udiagent.stratify import GroupingError, grouping_kind, parse_grouping

        for group_key, field_key in targets.items():
            try:
                grouping = parse_grouping(bindings.get(group_key))
            except GroupingError:
                continue  # already reported by the per-binding check above
            column = bindings.get(field_key) or field_key
            if grouping is None:
                errors.append(
                    f"This chart splits by whether a subject ever appears with "
                    f"particular values of '{column}', so it needs a grouping "
                    f'naming them — e.g. {{"type": "nominal", "groups": '
                    f'[{{"label": "Methotrexate", "values": ["methotrexate"]}}]}}. '
                    f"To split by presence in the table as a whole, use the "
                    f"presence template instead."
                )
                continue
            try:
                if grouping_kind(grouping) != "nominal":
                    errors.append(
                        f"'{column}' holds names, not numbers, so this chart needs "
                        f"a nominal grouping listing the values that count as a "
                        f"match — cut points do not apply."
                    )
            except GroupingError:
                continue

    # One column cannot be both a table's record id and the column a literal is
    # matched against. Binding it to both says the join should match rows whose
    # id happens to equal 'Initial CNS Tumor' — no rows, an empty chart, and
    # every column named exists with the type asked for, so nothing else here
    # objects. Seen in the wild on the survival templates, where the two
    # parameters sat side by side and read identically.
    join_keys = join_key_placeholders(spec_template)
    for value_key, field_keys in value_field_pairs(spec_template).items():
        for field_key in sorted(field_keys):
            if field_key in join_keys:
                continue
            entity_key = _binding_entity_key(field_key)
            column = bindings.get(field_key)
            if not column or not entity_key:
                continue
            clash = sorted(
                key
                for key in join_keys
                if _binding_entity_key(key) == entity_key and bindings.get(key) == column
            )
            if clash:
                entity_name = entity_bindings.get(entity_key, entity_key)
                errors.append(
                    f"Column '{column}' on '{entity_name}' is bound both as the join "
                    f"key and as the column '{bindings.get(value_key)}' is matched "
                    f"against. It can only be one of those: bind the join key to the "
                    f"column holding the record id, and the other to the column that "
                    f"holds that value."
                )

    # A <V*> literal is only meaningful against the column it is tested on, and
    # nothing above checks that it occurs there: the type checks pass happily
    # when the event-log and subject-level tables are bound the wrong way round,
    # because both have a nominal column and a numeric one. What comes out is not
    # a wrong chart but an EMPTY one — every conditional the value feeds is false,
    # so no subject has a start or an end and the curve has nothing to draw.
    #
    # Checked last so a genuinely missing column is reported first, and only where
    # the caller supplied domains and the bound column actually has a value list.
    domains = _categorical_domains(data_domains) if data_domains else {}
    if domains:
        for value_key, field_keys in value_field_pairs(spec_template).items():
            value = bindings.get(value_key)
            if not isinstance(value, str) or not value.strip():
                continue
            for field_key in sorted(field_keys):
                field_name = bindings.get(field_key)
                entity_name = _entity_for_binding_key(field_key, entity_bindings)
                known = domains.get((entity_name, field_name))
                if not known or value in known:
                    continue
                # A near miss is worth naming as one: the model was told to copy
                # a value exactly, and "deceased" for "Deceased" is a different
                # mistake from having picked the wrong column entirely.
                lowered = {v.lower(): v for v in known}
                if value.lower() in lowered:
                    errors.append(
                        f"Value '{value}' does not appear in column "
                        f"'{field_name}' on '{entity_name}', but "
                        f"'{lowered[value.lower()]}' does — copy it exactly, "
                        f"including case."
                    )
                else:
                    sample = ", ".join(repr(v) for v in known[:8])
                    more = "" if len(known) <= 8 else f", … ({len(known)} in all)"
                    errors.append(
                        f"Value '{value}' does not appear in column "
                        f"'{field_name}' on '{entity_name}', which this template "
                        f"compares it against — so the comparison would match no "
                        f"rows and the chart would come out empty. Either pick a "
                        f"value that is in that column ({sample}{more}), or bind a "
                        f"different column."
                    )

    return errors


def unbound_placeholders(spec_template, param_map, bindings):
    """Tool parameters the template needs that `bindings` does not supply.

    `validate_bindings` only inspects the bindings it is given, and
    `_resolve_placeholder` substitutes `""` for one it cannot find — so an
    incomplete binding set instantiates to a spec with empty field names rather
    than to an error. That is fine when the caller is the LLM (every tool
    parameter is required in the tool schema) and not fine when it is a client
    re-binding a stored visualization against a newer set of templates.

    Returns the missing *parameter* names (what a caller sends), sorted.
    """
    required = set()
    for match in re.finditer(PLACEHOLDER, spec_template):
        base = match.group(1).split(":")[0]
        # A stratifier grouping is optional by construction: no grouping is the
        # default reading of every stratified chart, so an absent one is an
        # answer rather than an omission.
        if _GROUP_BASE.fullmatch(base):
            continue
        required.add(base)

    missing = []
    for param, placeholder in param_map.items():
        if placeholder in required and placeholder not in bindings:
            missing.append(param)
    return sorted(missing)


def template_tweakable_params(spec_template, param_map, bindings, schema):
    """The tool parameters a user may re-bind on an already-rendered spec.

    A parameter is offered when its placeholder is *encoded* — it reaches a
    visual channel, so a reader can see what changing it would change — and it
    is a real parameter of the tool. Both conditions are needed: a template can
    encode something that is not a parameter at all (a cube's `<M>` measure
    comes from the schema), and most parameters are structural plumbing that is
    never drawn (a subject id used only as a grouping key).

    Deliberately excluded: entity bindings (`<E*>`), because re-sourcing a chart
    is not a tweak, and literal values (`<V*>`), because changing which values a
    template filters on changes what the chart *means* rather than how it is cut.

    A stratifier *grouping* (`<GROUP:…>`) is offered too, and is the one
    parameter offered when it has no binding at all: "no grouping" is a real,
    and indeed the default, state of that control, so withholding it until
    someone has already grouped the chart would mean it could never be reached.
    Its descriptor names the field being cut and that field's type, because those
    decide which control a client draws — a list of values to combine, or cut
    points along a distribution.

    Each descriptor carries what a UI needs to render one control and send back a
    complete request: `{kind, param, placeholder, entity, type, encodings, label,
    value}`, plus `field`/`fieldType` on a grouping. `type` is the required field
    type, or None when unconstrained.
    """
    encodings_by_placeholder = _placeholder_encodings(spec_template)
    placeholder_types = _placeholder_type_requirements(spec_template)
    targets = grouping_targets(spec_template)
    entities = schema.get("entities", {}) if isinstance(schema, dict) else {}

    params = []
    for param, placeholder in param_map.items():
        if placeholder not in encodings_by_placeholder:
            continue
        if re.fullmatch(r"E\d*|V\d*", placeholder):
            continue
        channels = encodings_by_placeholder[placeholder]

        if _GROUP_BASE.fullmatch(placeholder):
            field_key = targets.get(placeholder, "")
            field_name = bindings.get(field_key, "")
            entity = _entity_for_binding_key(field_key, bindings)
            info = entities.get(entity, {}).get("fields", {}).get(field_name)
            field_type = (info["type"] if isinstance(info, dict) else info) if info else None
            params.append(
                {
                    "kind": "grouping",
                    "param": param,
                    "placeholder": placeholder,
                    "entity": entity,
                    "type": field_type,
                    "encodings": channels,
                    "label": "groups",
                    # The grouping object itself, or "" for not grouped. Passed
                    # through rather than stringified: the model now fills a
                    # typed object, and re-serialising it here would make the
                    # client parse back what it is about to send again.
                    "value": bindings.get(placeholder) or "",
                    "field": field_name,
                    "fieldType": field_type,
                }
            )
            continue

        if placeholder not in bindings:
            continue
        params.append(
            {
                "kind": "field",
                "param": param,
                "placeholder": placeholder,
                "entity": _entity_for_binding_key(placeholder, bindings),
                "type": placeholder_types.get(placeholder),
                "encodings": channels,
                "label": "/".join(channels) or param,
                "value": bindings[placeholder],
            }
        )
    return sorted(params, key=lambda d: d["param"])


def _load_generated_tools():
    """Load generated tool data.

    Returns ``(tool_defs, tool_dispatch, templates, tool_tags)`` or None.

    The generated module is schema-independent — the schema used for binding
    validation and template instantiation comes from the per-request
    ``data_schema`` (see ``_execute_generate``), not from this module.
    ``tool_tags`` maps each tool name to its template tags (e.g. ``line_item``,
    ``data_cube``) for per-request template selection.
    """
    try:
        from udiagent.generated_vis_tools import (
            TOOL_DEFS,
            TOOL_DISPATCH,
            TEMPLATES,
            TOOL_TAGS,
        )

        return TOOL_DEFS, TOOL_DISPATCH, TEMPLATES, TOOL_TAGS
    except ImportError:
        logger.exception(
            "generated_vis_tools is not importable; the template path is disabled "
            "and every visualization will be generated freehand"
        )
        return None


def _active_template_tags(request_schema):
    """Tags to select templates for this request: cube schemas get the
    ``data_cube`` templates, everything else the ``line_item`` templates."""
    from udiagent.schema import schema_is_cube

    return {"data_cube"} if schema_is_cube(request_schema) else {"line_item"}


def _tool_entity_arity(tool_def):
    """How many distinct tables a tool needs — its `entity*` parameter count.

    Read off the parameters rather than the template, because the parameters are
    what the model would have to fill and `_select_tools` has no template to hand.
    """
    properties = tool_def.get("function", {}).get("parameters", {}).get("properties", {})
    return sum(1 for name in properties if re.fullmatch(r"entity\d*", name))


def _select_tools(tool_defs, tool_tags, active_tags, request_schema=None):
    """Keep tools whose tags intersect ``active_tags`` (untagged tools always
    kept). Falls back to all tools if the selection would be empty.

    Also drops tools that need more tables than the data package has. That is
    not a guess at relevance — a three-table join template cannot bind a
    single-table package under any arguments — so removing it costs the model
    nothing and takes a whole class of impossible choice off the list. Tags and
    arity are the only filters here on purpose: anything that ranked templates by
    apparent relevance could hide the right one, and the logs should say whether
    selection is a problem before that trade is worth making.
    """
    selected = [
        d
        for d in tool_defs
        if not tool_tags.get(d["function"]["name"])
        or (set(tool_tags.get(d["function"]["name"], [])) & active_tags)
    ]

    entity_count = len((request_schema or {}).get("entities") or {})
    if entity_count:
        within_reach = [d for d in selected if _tool_entity_arity(d) <= entity_count]
        selected = within_reach or selected

    return selected or tool_defs


def _parse_request_schema(data_schema):
    """Parse the per-request ``data_schema`` into the structured form used by
    ``validate_bindings`` / ``instantiate_template``.

    Accepts a JSON string or an already-parsed dict. Returns an empty schema
    (no entities/relationships) if parsing fails, so the caller degrades to the
    single-shot fallback path instead of raising.
    """
    from udiagent.schema import parse_schema_from_dict

    try:
        raw = json.loads(data_schema) if isinstance(data_schema, str) else data_schema
        if not isinstance(raw, dict):
            raise TypeError("data_schema is not an object")
        return parse_schema_from_dict(raw)
    except (json.JSONDecodeError, TypeError, KeyError, AttributeError) as exc:
        # Worth a line of its own: an empty schema makes every field check in
        # `validate_bindings` a no-op rather than an error, so a malformed schema
        # looks exactly like a well-bound request until the chart comes out wrong.
        logger.warning(
            "data_schema could not be parsed (%s: %s); continuing with an empty "
            "schema, which disables binding validation",
            type(exc).__name__,
            exc,
        )
        return {"base_path": "./", "entities": {}, "relationships": []}


def _retry_turns(rejected):
    """The conversation turns telling the model what has already been refused.

    Every rejection, not just the newest. With only the latest error in view the
    model walks a cycle: it picks template A, is told A is wrong, picks B, is
    told B is wrong, and — having forgotten A — picks A again, so the third
    attempt re-makes the first mistake. Replaying the whole history is what lets
    it see that both candidates are spent and look for a third.

    Each rejection is a real `tool_calls` assistant turn plus a matching `tool`
    result, rather than a prose recap. That is the shape the model was trained
    on: it can see its own arguments as arguments and correct one of them, where
    a paraphrase reads as a fresh instruction to reinterpret — and the usual fix
    is a single argument out of fifteen, so keeping the rest verbatim is the
    whole point.
    """
    turns = []
    for index, (tool_name, tool_args, errors) in enumerate(rejected):
        call_id = f"call_retry_{index}_{uuid.uuid4().hex[:6]}"
        turns.append(
            {
                "role": "assistant",
                "content": None,
                "tool_calls": [
                    {
                        "id": call_id,
                        "type": "function",
                        "function": {
                            "name": tool_name,
                            "arguments": json.dumps(tool_args, default=str),
                        },
                    }
                ],
            }
        )
        turns.append(
            {
                "role": "tool",
                "tool_call_id": call_id,
                "content": (
                    "This tool call was rejected:\n"
                    + "\n".join(f"- {e}" for e in errors)
                ),
            }
        )
    turns.append(
        {
            "role": "user",
            "content": (
                "Call the tool again with those problems fixed. Keep every "
                "argument that was not named above exactly as it was. Do not "
                "repeat a call that has already been rejected above — if a "
                "template cannot work here, choose a different one."
            ),
        }
    )
    return turns


def _execute_generate(skill, context):
    """Execute the generate skill: try function-calling tools first, fall back to LLM."""
    agent = context["agent"]
    grammar = context["grammar"]
    config = context["config"]
    data_schema = context["data_schema"]
    data_schema_simple = simplify_data_schema(data_schema)

    # Parse the per-request schema into the structured form ({entities: {url,
    # fields}, relationships}) used to validate tool bindings and instantiate
    # template placeholders. Routing the request's own schema here (rather than
    # a schema baked into the generated tools) is what lets one agent serve
    # arbitrary datasets.
    request_schema = _parse_request_schema(data_schema)

    rid = context.get("req_id", "-")
    #: Why the template path was abandoned; None while it is still viable.
    fallback_reason = None
    #: The last thing validation objected to, for the message the user sees.
    failure_errors = []
    failure_tool = None
    #: Every (tool, args, errors) refused so far, replayed on each retry.
    rejected = []

    # --- Primary path: function-calling with generated tools ---
    generated = _load_generated_tools()
    if generated is None:
        fallback_reason = FALLBACK_NO_GENERATED_TOOLS
    else:
        tool_defs, tool_dispatch, templates, tool_tags = generated

        # Select the template subset for this request by tag (e.g. cube schemas
        # get the data-cube tools). Replaces a hard-coded active-set switch.
        active_tags = _active_template_tags(request_schema)
        selected_defs = _select_tools(tool_defs, tool_tags, active_tags, request_schema)
        logger.info(
            "[vis %s] template tools offered: count=%d of %d (tags=%s)",
            rid,
            len(selected_defs),
            len(tool_defs),
            sorted(active_tags),
        )

        system_msg = (
            "You are a data visualization assistant. The user wants a visualization "
            "from the available datasets. Select the most appropriate visualization "
            "tool and provide the correct arguments.\n\n"
            f"## Available Datasets\n\n{data_schema_simple}"
        )
        # Some tools take a literal data value (a `value*` parameter) rather than
        # only column names. The schema lists columns but not their contents, so
        # without domains the model would have to guess those values. Append them
        # when the caller supplied them.
        data_domains = context.get("data_domains")
        if data_domains:
            domains_simple = simplify_data_domains(data_domains)
            if domains_simple:
                system_msg += (
                    "\n\n## Column Values\n\n"
                    "Use these when a tool asks for a literal `value` — copy one "
                    "exactly rather than inventing it.\n\n"
                    f"{domains_simple}"
                )
        tool_messages = [{"role": "system", "content": system_msg}] + list(
            context["messages"]
        )

        openai_api_key = context.get("openai_api_key")
        usage = context.get("usage")
        result = _call_llm_with_tools(
            agent, tool_messages, selected_defs, config,
            usage=usage, openai_api_key=openai_api_key, req_id=rid,
        )
        # Three attempts rather than two. A rejected binding is usually one
        # argument out of fifteen — a miscased literal value, a stratifier that
        # needs cut points — and the error text says exactly which, so a second
        # correction is cheap next to what used to follow a third failure.
        for _attempt in range(3):
            if result is None:
                fallback_reason = FALLBACK_NO_TOOL_CALL
                break
            tool_name, tool_args = result
            logger.info(
                "[vis %s] attempt=%d model chose %s args=%s",
                rid,
                _attempt,
                tool_name,
                json.dumps(tool_args, sort_keys=True, default=str)[:600],
            )
            failure_tool = tool_name
            dispatch = tool_dispatch.get(tool_name)
            if dispatch is None:
                logger.warning(
                    "[vis %s] %s is not in the dispatch table (%d known tools)",
                    rid,
                    tool_name,
                    len(tool_dispatch),
                )
                fallback_reason = FALLBACK_UNKNOWN_TOOL
                break

            template_idx, param_map = dispatch
            bindings = {param_map[k]: v for k, v in tool_args.items() if k in param_map}
            validation_errors = validate_bindings(
                templates[template_idx],
                bindings,
                request_schema,
                data_domains,
                shared_entities_for(tool_name),
            )

            if validation_errors:
                failure_errors = validation_errors
                logger.warning(
                    "[vis %s] binding validation failed for %s "
                    "(attempt=%d, %d error(s)): %s",
                    rid,
                    tool_name,
                    _attempt,
                    len(validation_errors),
                    "; ".join(validation_errors)[:1000],
                )
                rejected.append((tool_name, tool_args, validation_errors))
                if _attempt < 2:
                    logger.info(
                        "[vis %s] retrying tool selection, %d rejection(s) in view",
                        rid,
                        len(rejected),
                    )
                    result = _call_llm_with_tools(
                        agent,
                        tool_messages + _retry_turns(rejected),
                        selected_defs,
                        config,
                        usage=usage,
                        openai_api_key=openai_api_key,
                        req_id=rid,
                    )
                    continue
                fallback_reason = FALLBACK_VALIDATION_FAILED
                break

            try:
                spec_dict = instantiate_template(
                    templates[template_idx], bindings, request_schema
                )
                spec_str = json.dumps(spec_dict)
                context["spec_str"] = spec_str
                context["gen_messages"] = tool_messages
                context["tool_used"] = tool_name
                context["tool_args"] = tool_args
                context["tweakable_params"] = template_tweakable_params(
                    templates[template_idx], param_map, bindings, request_schema
                )
                context["validation_retries"] = _attempt
                logger.info(
                    "[vis %s] instantiated %s (retries=%d, tweakable_params=%d)",
                    rid,
                    tool_name,
                    _attempt,
                    len(context["tweakable_params"]),
                )
                return context
            except Exception:
                # A template or schema bug rather than a model mistake, so the
                # traceback is the useful part: it names the placeholder that
                # would not resolve.
                logger.exception(
                    "[vis %s] instantiate_template failed for %s bindings=%s",
                    rid,
                    tool_name,
                    json.dumps(bindings, sort_keys=True, default=str)[:600],
                )
                fallback_reason = FALLBACK_INSTANTIATE_FAILED
                break

    # --- The template path did not produce a spec ---
    context["fallback_reason"] = fallback_reason

    # Freehand generation survives for exactly one reason: a deployment with no
    # templates at all, where it is the only thing there is. Everywhere else it
    # is worse than nothing. Its prompt carries every template's spec verbatim,
    # so what it produces is a convincing imitation of the pipeline it was shown
    # — right column names, wrong mechanics — and that ships to the reader as a
    # chart rather than as a failure.
    if fallback_reason != FALLBACK_NO_GENERATED_TOOLS:
        logger.warning(
            "[vis %s] no visualization built: reason=%s tool=%s errors=%s",
            rid,
            fallback_reason,
            failure_tool,
            "; ".join(failure_errors)[:1000] or "-",
        )
        context["generation_failed"] = {
            "reason": fallback_reason,
            "tool": failure_tool,
            "errors": list(failure_errors),
        }
        context["spec_str"] = "{}"
        context["gen_messages"] = list(context["messages"])
        context["tool_used"] = None
        context["tool_args"] = None
        context["tweakable_params"] = []
        return context

    # --- Fallback: single-shot LLM generation ---
    examples_path = config.get("examples_path")
    examples = _load_examples(examples_path)

    rendered = render_template(
        skill.instructions,
        {
            "data_schema": data_schema_simple,
            "examples": examples,
        },
    )

    gen_messages = [{"role": "system", "content": rendered}] + list(context["messages"])

    logger.warning(
        "[vis %s] FALLBACK: freehand generation, reason=%s (examples=%d chars)",
        rid,
        fallback_reason,
        len(examples),
    )
    spec_str = _call_llm(
        agent, gen_messages, grammar, config,
        usage=context.get("usage"),
        openai_api_key=context.get("openai_api_key"),
        op="create_visualization",
    )
    context["spec_str"] = spec_str
    context["gen_messages"] = gen_messages
    context["tool_used"] = None
    context["tool_args"] = None
    context["tweakable_params"] = []
    return context


def _execute_validate(skill, context):
    """Execute the validate skill: parse, validate, and correct via LLM."""
    # Nothing was generated, so there is nothing to repair. Running the
    # correction loop over the empty placeholder spec would spend two LLM calls
    # inventing one, which is the freehand path this deliberately replaced.
    if context.get("generation_failed"):
        return context

    agent = context["agent"]
    grammar = context["grammar"]
    config = context["config"]
    # Default matches generate_vis_spec's documented behavior; a 0 default
    # here silently disabled the correction loop in the server path.
    max_corrections = config.get("max_corrections", 2)
    spec_str = context.get("spec_str", "{}")
    gen_messages = context.get("gen_messages", list(context["messages"]))
    entity_fields = entity_fields_from_schema(context.get("data_schema"))

    spec_dict, errors = _parse_and_validate(
        spec_str, grammar["schema_dict"], entity_fields
    )

    examples_path = config.get("examples_path")
    examples = _load_examples(examples_path)

    corrections = 0
    while errors and corrections < max_corrections:
        rendered = render_template(
            skill.instructions,
            {
                "spec_str": spec_str
                if isinstance(spec_str, str)
                else json.dumps(spec_str),
                "errors": "; ".join(errors),
                "examples": examples,
            },
        )

        feedback_content = (
            spec_str if isinstance(spec_str, str) else json.dumps(spec_str)
        )
        gen_messages.append({"role": "assistant", "content": feedback_content})
        gen_messages.append({"role": "user", "content": rendered})

        spec_str = _call_llm(
            agent, gen_messages, grammar, config,
            usage=context.get("usage"),
            openai_api_key=context.get("openai_api_key"),
            op="create_visualization.validate",
        )
        spec_dict, errors = _parse_and_validate(
            spec_str, grammar["schema_dict"], entity_fields
        )
        corrections += 1

    context["spec_str"] = spec_str
    context["spec_dict"] = spec_dict
    context["valid"] = len(errors) == 0
    context["errors"] = errors
    context["corrections"] = corrections
    return context


# Map skill names to executor functions.
_SKILL_EXECUTORS = {
    "generate": _execute_generate,
    "validate": _execute_validate,
}


def run_skills(plan, context, registry):
    """Execute skills in plan order, threading context through each."""
    for skill_name in plan:
        if skill_name not in registry:
            raise ValueError(f"Unknown skill: {skill_name}")
        skill = registry[skill_name]

        executor_fn = _SKILL_EXECUTORS.get(skill_name)
        if executor_fn is not None:
            context = executor_fn(skill, context)
        else:
            rendered = render_template(skill.instructions, context)
            messages = [{"role": "system", "content": rendered}] + list(
                context["messages"]
            )
            spec_str = _call_llm(
                context["agent"],
                messages,
                context["grammar"],
                context["config"],
                usage=context.get("usage"),
                openai_api_key=context.get("openai_api_key"),
                op=f"create_visualization.{skill_name}",
            )
            context["spec_str"] = spec_str

    return context


# ---------------------------------------------------------------------------
# Public API (backwards compatible)
# ---------------------------------------------------------------------------


def generate_vis_spec(
    agent,
    messages,
    data_schema,
    grammar,
    config=None,
    usage=None,
    openai_api_key=None,
    data_domains=None,
):
    """Generate a visualization spec using the skills pipeline.

    Args:
        agent: UDIAgent instance
        messages: chat history (list of dicts with role/content)
        data_schema: JSON string describing available datasets
        grammar: dict from load_grammar()
        config: optional dict with keys:
            n: int (default 1)
            max_corrections: int (default 2)

    Returns: {"spec": dict|str, "valid": bool, "errors": list, "corrections": int}
    """
    if config is None:
        config = {}

    registry = load_skills()

    context = {
        "agent": agent,
        "messages": messages,
        "data_schema": data_schema,
        # Optional: lets tools that take a literal data value see the candidate
        # values instead of guessing. Keyword-only with a default so existing
        # callers keep working.
        "data_domains": data_domains,
        "grammar": grammar,
        "config": config,
        "spec_str": "{}",
        "spec_dict": None,
        "valid": False,
        "errors": [],
        "corrections": 0,
        "openai_api_key": openai_api_key,
        "usage": usage,
        # Ties every log line from this request together. uvicorn interleaves
        # requests, so timestamps alone do not, and the value comes back in
        # `meta` so a reported chart carries its own grep key.
        "req_id": uuid.uuid4().hex[:8],
    }

    plan = ["generate", "validate"]
    context = run_skills(plan, context, registry)

    spec = (
        context["spec_dict"]
        if context["spec_dict"] is not None
        else context["spec_str"]
    )
    if not isinstance(spec, str):
        spec = json.dumps(spec)

    return {
        "spec": spec,
        "valid": context["valid"],
        "errors": context["errors"],
        "corrections": context["corrections"],
        # Present only when no chart could be built. The caller turns this into
        # something the reader can act on instead of rendering an empty card.
        "failure": context.get("generation_failed"),
        "meta": {
            "tool_used": context.get("tool_used"),
            "tool_args": context.get("tool_args"),
            # None when a template produced this spec. Any other value means the
            # template path was abandoned, and says where — which `tool_used:
            # None` alone could not, since it also meant "no templates exist".
            "fallback_reason": context.get("fallback_reason"),
            "vis_req_id": context.get("req_id"),
            # Only advertise re-bindable parameters while the delivered spec is
            # still exactly `instantiate_template(template, bindings)`. A
            # correction pass replaces it with an LLM-repaired spec that the
            # bindings no longer describe, so re-instantiating from them would
            # quietly throw the repair away.
            "tweakable_params": (
                context.get("tweakable_params") or []
                if context["valid"] and not context["corrections"]
                else []
            ),
            "validation_retries": context.get("validation_retries", 0),
            "valid": context["valid"],
            "validation_errors": context["errors"],
            "corrections": context["corrections"],
        },
    }
