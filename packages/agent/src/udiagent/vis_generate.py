"""
Markdown-driven skills infrastructure for visualization spec generation.

Skills are .md files on disk (YAML frontmatter + LLM instructions).
A code-driven executor runs a plan (ordered list of skill names),
calling the LLM with each skill's instructions and passing a shared
context between them.
"""

import json
import re
from pathlib import Path
from typing import Optional

import jsonschema

from udiagent.skills import Skill, load_skills, render_template, _package_data_path
from udiagent.grammar import load_grammar
from udiagent.schema import simplify_data_schema, simplify_data_domains


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
    agent, messages, tools, config, usage=None, openai_api_key=None
):
    """Call the LLM with function-calling tools. Returns (tool_name, arguments) or None.

    Quota / rate-limit errors are re-raised as ``BudgetExceededError`` so callers
    can short-circuit; other errors swallow to None to preserve the fallback path.
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
    except BudgetExceededError:
        raise
    except Exception:
        pass
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


def _parse_and_validate(spec_str, schema_dict):
    """Parse JSON string and validate against schema.

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

    return spec_dict, errors


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

    # Strip type suffix: F:n -> F, E1.F:q -> E1.F
    base = tag.split(":")[0] if ":" in tag else tag

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
    while True:
        match = re.search(r"<([^>]+)>", spec)
        if not match:
            break
        resolved = _resolve_placeholder(match.group(1), bindings, schema)
        spec = spec.replace(match.group(0), resolved, 1)
    return json.loads(spec)


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
                match = re.fullmatch(r"<([^>]+)>", field)
                if match:
                    result[enc] = match.group(1)
    return result


def validate_bindings(spec_template, bindings, schema):
    """Validate tool bindings against the schema before template instantiation.

    Returns list of error strings (empty = valid).
    """
    errors = []
    entities = schema.get("entities", {})
    entity_names = list(entities.keys())

    # Collect entity bindings (E, E1, E2)
    entity_bindings = {}
    for key, val in bindings.items():
        if key in ("E", "E1", "E2"):
            entity_bindings[key] = val

    # Check entities exist
    for key, name in entity_bindings.items():
        if name not in entities:
            errors.append(
                f"Entity '{name}' not found. Available: {', '.join(entity_names)}"
            )

    if errors:
        return errors

    # Check join entities are different
    if "E1" in entity_bindings and "E2" in entity_bindings:
        if entity_bindings["E1"] == entity_bindings["E2"]:
            errors.append(
                f"entity1 and entity2 cannot be the same ('{entity_bindings['E1']}')"
            )
            return errors

        # Check relationship exists
        e1, e2 = entity_bindings["E1"], entity_bindings["E2"]
        has_rel = any(
            (r["from_entity"] == e1 and r["to_entity"] == e2)
            or (r["from_entity"] == e2 and r["to_entity"] == e1)
            for r in schema.get("relationships", [])
        )
        if not has_rel:
            errors.append(f"No relationship between '{e1}' and '{e2}'")

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

    # Extract placeholder type requirements from spec_template
    placeholder_types = {}
    for match in re.finditer(r"<([^>]+)>", spec_template):
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

    # Source 2: declared "type" in encoding mappings
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
                ph_match = re.fullmatch(r"<([^>]+)>", field)
                if ph_match and declared_type:
                    base = ph_match.group(1).split(":")[0]
                    if base not in placeholder_types:
                        placeholder_types[base] = declared_type
    except (json.JSONDecodeError, TypeError):
        pass

    # Check fields exist on entities and types match
    for key, field_name in bindings.items():
        if key in ("E", "E1", "E2"):
            continue

        if key.startswith("E1."):
            entity_name = entity_bindings.get("E1")
        elif key.startswith("E2."):
            entity_name = entity_bindings.get("E2")
        else:
            entity_name = entity_bindings.get("E")

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

        field_info = entity_fields[field_name]
        actual_type = field_info["type"] if isinstance(field_info, dict) else field_info
        cardinality = (
            field_info.get("cardinality", 0) if isinstance(field_info, dict) else 0
        )

        expected_type = placeholder_types.get(key)
        if expected_type:
            if actual_type != expected_type:
                matching = [
                    fn
                    for fn, fi in entity_fields.items()
                    if (fi["type"] if isinstance(fi, dict) else fi) == expected_type
                ]
                errors.append(
                    f"Field '{field_name}' is {actual_type} but template requires {expected_type}. "
                    f"Available {expected_type} fields: {', '.join(matching)}"
                )

        if (actual_type == "nominal" or actual_type == "ordinal") and cardinality > 50:
            errors.append(
                f"Field '{field_name}' has {cardinality} unique values, which is too many "
                f"for a visualization (max 50). Choose a different encoding or visualization."
            )

    return errors


def _load_generated_tools():
    """Load generated tool data. Returns (tool_defs, tool_dispatch, templates, schema) or None."""
    try:
        from udiagent.generated_vis_tools import TOOL_DEFS, TOOL_DISPATCH, TEMPLATES, SCHEMA

        return TOOL_DEFS, TOOL_DISPATCH, TEMPLATES, SCHEMA
    except ImportError:
        return None


def _execute_generate(skill, context):
    """Execute the generate skill: try function-calling tools first, fall back to LLM."""
    agent = context["agent"]
    grammar = context["grammar"]
    config = context["config"]
    data_schema = context["data_schema"]
    data_schema_simple = simplify_data_schema(data_schema)

    # --- Primary path: function-calling with generated tools ---
    generated = _load_generated_tools()
    if generated is not None:
        tool_defs, tool_dispatch, templates, tool_schema = generated

        system_msg = (
            "You are a data visualization assistant. The user wants a visualization "
            "from the available datasets. Select the most appropriate visualization "
            "tool and provide the correct arguments.\n\n"
            f"## Available Datasets\n\n{data_schema_simple}"
        )
        tool_messages = [{"role": "system", "content": system_msg}] + list(
            context["messages"]
        )

        openai_api_key = context.get("openai_api_key")
        usage = context.get("usage")
        result = _call_llm_with_tools(
            agent, tool_messages, tool_defs, config,
            usage=usage, openai_api_key=openai_api_key,
        )
        for _attempt in range(2):
            if result is None:
                break
            tool_name, tool_args = result
            dispatch = tool_dispatch.get(tool_name)
            if dispatch is None:
                break

            template_idx, param_map = dispatch
            bindings = {param_map[k]: v for k, v in tool_args.items() if k in param_map}
            validation_errors = validate_bindings(
                templates[template_idx], bindings, tool_schema
            )

            if validation_errors:
                if _attempt == 0:
                    hint = "The previous tool call had errors:\n" + "\n".join(
                        f"- {e}" for e in validation_errors
                    )
                    retry_messages = tool_messages + [
                        {
                            "role": "assistant",
                            "content": f"Tool call: {tool_name}({json.dumps(tool_args)})",
                        },
                        {
                            "role": "user",
                            "content": hint
                            + "\n\nPlease select a corrected tool call.",
                        },
                    ]
                    result = _call_llm_with_tools(
                        agent, retry_messages, tool_defs, config,
                        usage=usage, openai_api_key=openai_api_key,
                    )
                    continue
                else:
                    break

            try:
                spec_dict = instantiate_template(
                    templates[template_idx], bindings, tool_schema
                )
                spec_str = json.dumps(spec_dict)
                context["spec_str"] = spec_str
                context["gen_messages"] = tool_messages
                context["tool_used"] = tool_name
                context["tool_args"] = tool_args
                context["validation_retries"] = _attempt
                return context
            except Exception:
                break

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
    return context


def _execute_validate(skill, context):
    """Execute the validate skill: parse, validate, and correct via LLM."""
    agent = context["agent"]
    grammar = context["grammar"]
    config = context["config"]
    max_corrections = config.get("max_corrections", 0)
    spec_str = context.get("spec_str", "{}")
    gen_messages = context.get("gen_messages", list(context["messages"]))

    spec_dict, errors = _parse_and_validate(spec_str, grammar["schema_dict"])

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
        spec_dict, errors = _parse_and_validate(spec_str, grammar["schema_dict"])
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
    agent, messages, data_schema, grammar, config=None, usage=None, openai_api_key=None
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
        "grammar": grammar,
        "config": config,
        "spec_str": "{}",
        "spec_dict": None,
        "valid": False,
        "errors": [],
        "corrections": 0,
        "openai_api_key": openai_api_key,
        "usage": usage,
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
        "meta": {
            "tool_used": context.get("tool_used"),
            "tool_args": context.get("tool_args"),
            "validation_retries": context.get("validation_retries", 0),
        },
    }
