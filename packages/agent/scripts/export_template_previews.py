"""Export renderable previews of every visualization template.

The template studio (``apps/template-studio``) renders each of the agent's
visualization templates live against a sample data package. Templates are
partial specs full of placeholders (``<E>``, ``<F:n>``, ``<M>``,
``<MARGINAL:D1,D2>``, ``<E1.r.E2.id.from>``) and the logic that resolves them
lives only in Python (``udiagent.vis_generate``). Rather than reimplement that
in TypeScript — and inevitably drift from it — this script resolves the
templates here and writes a JSON the frontend just reads.

Resolution is deliberately done with the *production* functions
(``validate_bindings`` + ``instantiate_template``), with this script supplying
only the bindings that the LLM would normally choose. Bindings are found by
type-directed search: candidate fields are filtered to the type each
placeholder requires, then the first combination that ``validate_bindings``
accepts wins. That is the same brute-force-until-valid strategy the agent's
own tests use.

Usage (from packages/agent):
    python scripts/export_template_previews.py --out ../../apps/template-studio/public/template_previews.json
"""

from __future__ import annotations

import argparse
import collections
import csv
import hashlib
import itertools
import json
import os
import re
import sys

# Import the real pipeline rather than reimplementing any of it.
sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "src"))

from udiagent.generate_tools import (  # noqa: E402
    _extract_encoding_info,
    _extract_placeholders,
    _get_field_type_for_placeholder,
)
from udiagent.schema import parse_schema_from_dict  # noqa: E402
from udiagent.vis_generate import (  # noqa: E402
    _ENTITY_KEY,
    _active_template_tags,
    _load_generated_tools,
    instantiate_template,
    validate_bindings,
)

_AGENT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
_REPO_ROOT = os.path.dirname(os.path.dirname(_AGENT_ROOT))
_DEFAULT_TEMPLATES = os.path.join(
    _AGENT_ROOT, "src", "udiagent", "data", "skills", "template_visualizations.json"
)
# The toolkit's schema is the canonical one (generated from GrammarTypes.ts). The
# agent bundles its own copy for runtime validation, but that copy has drifted
# behind — validating previews against it reports failures for grammar features
# that are actually supported, so prefer the toolkit's when it is present.
_GRAMMAR_SCHEMA = os.path.join(_REPO_ROOT, "packages", "grammar", "UDIGrammarSchema.json")
_AGENT_GRAMMAR_SCHEMA = os.path.join(
    _AGENT_ROOT, "src", "udiagent", "data", "UDIGrammarSchema.json"
)
_SAMPLE_DATA = os.path.join(_REPO_ROOT, "sample-data")

# Cap the binding search per (template, data package). Type filtering keeps the
# real search far below this; the cap only guards against a pathological schema.
_MAX_ATTEMPTS = 4000

# Field names that resolve to valid-but-useless charts (one bar per row, etc.).
_ID_LIKE = re.compile(r"(^|_)(id|uuid|doi)($|_)|uuid|_id$", re.IGNORECASE)


def template_key(spec_template: str) -> str:
    """Stable identity for a template, used to key review state.

    Deliberately *not* the generated tool name: ``_derive_tool_name`` embeds the
    template's positional index (``vis_017_table_sorted``) and is derived from
    the mutable ``description``, so inserting, reordering or re-describing a
    template renames it. Hashing the spec means a review stays attached to the
    exact spec that was reviewed — and correctly orphans when that spec changes,
    which is the signal a reviewer wants.
    """
    return hashlib.sha256(spec_template.encode("utf-8")).hexdigest()[:12]


def _required_types(spec_template: str) -> dict[str, str]:
    """Required data type per binding key, mirroring ``validate_bindings``.

    Placeholder type suffixes (``:n``/``:q``/``:o``) win over the type declared
    on the encoding, matching the precedence in vis_generate.
    """
    types: dict[str, str] = {}
    for placeholder in _extract_placeholders(spec_template):
        base = placeholder.split(":")[0]
        field_type = _get_field_type_for_placeholder(placeholder)
        if field_type and base not in types:
            types[base] = field_type
    for base, info in _extract_encoding_info(spec_template).items():
        if base not in types and info.get("declared_type"):
            types[base] = info["declared_type"]
    return types


def _needs_cube(spec_template: str) -> bool:
    """Whether the template only makes sense against a pre-aggregated cube.

    ``<M>`` and ``<MARGINAL...>`` are resolved from the schema's measures and
    dimensions; against a tidy table they silently resolve to empty strings and
    produce a spec with blank field names, so these must be pre-filtered.
    """
    return any(
        placeholder == "M" or placeholder.startswith("MARGINAL")
        for placeholder in _extract_placeholders(spec_template)
    )


_STATS_SAMPLE_ROWS = 20000
_STATS_CACHE: dict[str, dict[str, dict[str, dict]]] = {}


def _column_stats(pkg: dict) -> dict[str, dict[str, dict]]:
    """Per-column null fraction and dominant-value share, read from the CSVs.

    The schema alone cannot tell a useful field from a useless one: a column can
    be nominal with cardinality 2 and still be 97% empty, which renders as one
    giant "null" bar and tells a reviewer nothing. Only the data shows that, so
    sample it. Cached per data package and capped at ``_STATS_SAMPLE_ROWS`` —
    this runs over every resource, one of which is ~8 MB.
    """
    cached = _STATS_CACHE.get(pkg["id"])
    if cached is not None:
        return cached

    stats: dict[str, dict[str, dict]] = {}
    pkg_dir = os.path.dirname(pkg["path"])

    for resource in pkg["raw"].get("resources", []):
        name = resource.get("name")
        path = os.path.join(pkg_dir, resource.get("path", ""))
        if not name or not os.path.isfile(path):
            continue

        delimiter = "\t" if path.endswith((".tsv", ".tab")) else ","
        counters: dict[str, collections.Counter] = {}
        total = 0
        try:
            with open(path, newline="", encoding="utf-8", errors="replace") as f:
                reader = csv.DictReader(f, delimiter=delimiter)
                for row in reader:
                    if total >= _STATS_SAMPLE_ROWS:
                        break
                    total += 1
                    for column, value in row.items():
                        if column is None:
                            continue
                        counters.setdefault(column, collections.Counter())[
                            (value or "").strip()
                        ] += 1
        except OSError:
            continue

        if total == 0:
            continue

        entity_stats: dict[str, dict] = {}
        for column, counter in counters.items():
            blanks = counter.get("", 0)
            non_blank = total - blanks
            most_common = [(v, c) for v, c in counter.most_common() if v != ""]
            top_share = (most_common[0][1] / non_blank) if most_common and non_blank else 1.0
            entity_stats[column] = {
                "null_frac": blanks / total,
                "top_share": top_share,
                "distinct": len(most_common),
            }
        stats[name] = entity_stats

    _STATS_CACHE[pkg["id"]] = stats
    return stats


def _rotate(items: list, offset: int) -> list:
    """Rotate a list so different templates start from a different candidate.

    Deterministic: the offset is the template's index, so re-running the export
    reproduces the same choices, but neighbouring templates don't all collapse
    onto whichever field happens to sort first.
    """
    if not items:
        return items
    k = offset % len(items)
    return items[k:] + items[:k]


def _is_uninformative(stats: dict | None) -> bool:
    """Whether a column would render as a single dominant bar.

    Mostly-empty or near-constant columns are technically valid bindings but show
    a reviewer nothing about the template — which is what made the first version
    of this exporter pick things like a 97%-null unit column.
    """
    if not stats:
        return False
    return stats["null_frac"] > 0.4 or stats["top_share"] > 0.9 or stats["distinct"] < 2


def _field_rank(name: str, field_type: str, cardinality: int, stats: dict | None) -> tuple:
    """Sort key preferring fields that make a legible example chart."""
    # Strongest signal first: a column with nothing to show is always a last
    # resort, whatever its type or cardinality.
    uninformative = 1 if _is_uninformative(stats) else 0
    id_like = 1 if _ID_LIKE.search(name) else 0
    if field_type in ("nominal", "ordinal"):
        # A handful of categories reads well; 40 bars does not.
        legible = 0 if 2 <= cardinality <= 12 else 1
        return (uninformative, id_like, legible, cardinality, name)
    if field_type == "quantitative":
        # Prefer genuinely continuous fields over near-constant ones.
        legible = 0 if cardinality >= 10 else 1
        return (uninformative, id_like, legible, -cardinality, name)
    return (uninformative, id_like, 0, cardinality, name)


def _candidate_fields(
    entity: dict,
    key: str,
    required_type: str | None,
    entity_stats: dict[str, dict] | None = None,
    variation: int = 0,
    excluded: frozenset[str] = frozenset(),
) -> list[str]:
    """Fields on ``entity`` that could legally bind to ``key``, best first.

    ``variation`` rotates the top tier so that consecutive templates don't all
    bind to the same column. Only the equally-good candidates are rotated, so
    variety never costs quality.

    ``excluded`` drops names that are valid on this entity but break downstream —
    see the join-collision handling in ``_search_bindings``.
    """
    candidates = []
    dimensions = entity.get("dimensions")
    is_dimension_key = re.fullmatch(r"D\d*", key) is not None

    for name, info in entity.get("fields", {}).items():
        if name in excluded:
            continue
        field_type = info["type"] if isinstance(info, dict) else info
        cardinality = info.get("cardinality", 0) if isinstance(info, dict) else 0

        # Cube dimension placeholders must name a declared dimension.
        if is_dimension_key and dimensions is not None and name not in dimensions:
            continue
        if required_type:
            compatible = field_type == required_type or (
                required_type == "ordinal" and field_type == "temporal"
            )
            if not compatible:
                continue
        # validate_bindings rejects these outright; skip rather than waste attempts.
        if field_type in ("nominal", "ordinal") and cardinality > 50:
            continue
        stats = (entity_stats or {}).get(name)
        candidates.append((_field_rank(name, field_type, cardinality, stats), name))

    candidates.sort()
    if not candidates:
        return []

    # Rotate within the best-ranked group only. Rank[0] is the "uninformative"
    # flag and rank[1..2] the id/legibility tiers, so grouping on that prefix
    # keeps rotation inside a set of genuinely interchangeable columns.
    best_tier = candidates[0][0][:3]
    good = [name for rank, name in candidates if rank[:3] == best_tier]
    rest = [name for rank, name in candidates if rank[:3] != best_tier]
    return _rotate(good, variation) + rest


def _entity_rank(name: str, entity: dict) -> tuple:
    """Prefer entities that actually have rows, then larger ones."""
    return (0 if entity.get("row_count", 0) > 0 else 1, -entity.get("row_count", 0), name)


def _blank_bindings(spec: dict) -> list[str]:
    """Find spec fields that resolved to an empty string.

    A placeholder the resolver cannot satisfy becomes ``""`` rather than raising,
    which yields a spec that renders as an empty chart. Treat that as a failed
    preview instead of shipping a broken one.
    """
    blanks: list[str] = []

    def walk(node, path: str):
        if isinstance(node, dict):
            for key, value in node.items():
                if key in ("field", "source", "name", "out") and value == "":
                    blanks.append(f"{path}.{key}")
                walk(value, f"{path}.{key}")
        elif isinstance(node, list):
            for i, value in enumerate(node):
                walk(value, f"{path}[{i}]")

    walk(spec, "$")
    return blanks


def _post_join_collisions(spec: dict, collisions: frozenset[str]) -> list[str]:
    """Columns the spec uses that the join has renamed out from under it.

    Arquero suffixes columns present in both joined tables (``hubmap_id`` ->
    ``hubmap_id_1``/``_2``). Referencing the bare name *after* the join therefore
    fails. The join step's own ``on`` keys are exempt: they are consumed by the
    join itself, while a later ``groupby`` on the same name is not.

    Some shipped templates join and then group by the join key, which is
    unrenderable against any schema whose two tables share that column name — a
    real limitation of the template, worth reporting rather than papering over.
    """
    if not collisions:
        return []

    def strings(node) -> list[str]:
        if isinstance(node, str):
            return [node]
        if isinstance(node, dict):
            return [s for v in node.values() for s in strings(v)]
        if isinstance(node, list):
            return [s for v in node for s in strings(v)]
        return []

    used: list[str] = []
    for step in spec.get("transformation") or []:
        if isinstance(step, dict) and "join" in step:
            continue
        used.extend(strings(step))
    used.extend(strings(spec.get("representation")))

    return sorted({name for name in used if name in collisions})


def _grammar_error(spec: dict, grammar: dict | None) -> str:
    """Validate a spec against the UDI grammar, returning '' when it conforms.

    Advisory only — never used to reject a preview. Several shipped templates do
    not validate against the schema, so gating on this would hide them from the
    very tool meant to review them. Surfacing it as a warning is the point.
    """
    if grammar is None:
        return ""
    try:
        import jsonschema

        jsonschema.validate(spec, grammar)
    except Exception as exc:  # noqa: BLE001 - message is shown to the reviewer
        return str(exc).split("\n", 1)[0]
    return ""


def _template_grammar_error(spec_template: str, grammar: dict | None) -> str:
    """Advisory grammar check of the raw, unresolved template string."""
    try:
        parsed = json.loads(spec_template)
    except (json.JSONDecodeError, TypeError) as exc:
        return f"template is not valid JSON: {exc}"
    return _grammar_error(parsed, grammar)


def _declared_binding(
    spec_template: str,
    declared: dict,
    parsed_schema: dict,
) -> tuple[dict[str, str] | None, dict | None, list[str]]:
    """Try a template's own `preview_bindings` instead of searching.

    Some templates only mean anything against particular columns *and values* — a
    survival curve pairs two named event types, so a type-directed search would
    happily pick three legible columns and draw an empty curve. When a template
    declares its intended binding, use exactly that: it either applies to this
    data package or the template genuinely doesn't fit it, and saying so is more
    useful than a preview that renders but means nothing.
    """
    entities = parsed_schema.get("entities", {})
    # A multi-table template declares E1/E2/E3...; a single-entity one declares E.
    # Each field binding is checked against the entity its own key names, so a join
    # template is reported against the right table rather than an arbitrary one.
    # Numbered open-endedly: a template that crosses membership of two other tables
    # brings a third, and an unrecognised entity key would be reported as a missing
    # *column* on entity `None` rather than as the table it is.
    entity_keys = [k for k in declared if _ENTITY_KEY.fullmatch(k)]
    for key in entity_keys:
        if declared[key] not in entities:
            available = ", ".join(sorted(entities)) or "none"
            return None, None, [
                f"Template previews against entity '{declared[key]}', which this data "
                f"package does not have (has: {available}). It is written for a "
                f"specific table shape."
            ]

    def _entity_for(key: str) -> str | None:
        prefix, dot, _ = key.partition(".")
        if dot and prefix != "E" and _ENTITY_KEY.fullmatch(prefix):
            return declared.get(prefix)
        return declared.get("E")

    # <V*> declares a literal data value, not a column, so it must not be checked
    # against the entity's field list.
    missing = []
    for key, value in declared.items():
        if _ENTITY_KEY.fullmatch(key) or re.fullmatch(r"V\d*", key):
            continue
        owner = _entity_for(key)
        if owner is None or value not in entities.get(owner, {}).get("fields", {}):
            missing.append(f"{key}={value!r} (on {owner})")
    if missing:
        return None, None, [
            "The data package is missing the column(s) this template previews with: "
            f"{', '.join(missing)}."
        ]

    errors = validate_bindings(spec_template, declared, parsed_schema)
    if errors:
        return None, None, errors

    try:
        spec = instantiate_template(spec_template, declared, parsed_schema)
    except (json.JSONDecodeError, TypeError) as exc:
        return None, None, [f"Template did not instantiate to valid JSON: {exc}"]

    blanks = _blank_bindings(spec)
    if blanks:
        return None, None, [f"Placeholders resolved to empty strings at: {', '.join(blanks)}"]

    return dict(declared), spec, []


def _search_bindings(
    spec_template: str,
    binding_keys: list[str],
    parsed_schema: dict,
    stats: dict[str, dict[str, dict]] | None = None,
    variation: int = 0,
) -> tuple[dict[str, str] | None, dict | None, list[str]]:
    """Find bindings that instantiate ``spec_template`` into a valid spec.

    Returns ``(bindings, spec, errors)``. On failure ``bindings``/``spec`` are
    None and ``errors`` explains the closest failure, for display in the UI.

    ``variation`` (the template's index) rotates the entity and field candidate
    order so the previews as a whole exercise a spread of the data package's
    columns instead of binding every template to the same one. It is a rotation,
    not randomness, so the export stays reproducible.
    """
    entities = parsed_schema.get("entities", {})
    relationships = parsed_schema.get("relationships", [])
    required_types = _required_types(spec_template)
    entity_keys = [k for k in binding_keys if k in ("E", "E1", "E2")]
    field_keys = [k for k in binding_keys if k not in ("E", "E1", "E2")]
    wants_cube = _needs_cube(spec_template)

    ranked_entities = sorted(entities.items(), key=lambda kv: _entity_rank(*kv))
    if wants_cube:
        ranked_entities = [
            (name, e) for name, e in ranked_entities if e.get("measures") and e.get("dimensions")
        ]
        if not ranked_entities:
            return None, None, ["Data package has no pre-aggregated cube entity (needs udi:measures + udi:dimensions)."]

    # Candidate entity assignments.
    if "E1" in entity_keys and "E2" in entity_keys:
        entity_assignments = []
        for rel in relationships:
            for e1, e2 in ((rel["from_entity"], rel["to_entity"]), (rel["to_entity"], rel["from_entity"])):
                if e1 in entities and e2 in entities and {"E1": e1, "E2": e2} not in entity_assignments:
                    entity_assignments.append({"E1": e1, "E2": e2})
        if not entity_assignments:
            return None, None, ["Data package has no relationship between two entities, which this template joins across."]
        entity_assignments = _rotate(entity_assignments, variation)
    elif entity_keys:
        # Rotate so templates spread across the package's tables rather than all
        # landing on the largest one.
        entity_assignments = _rotate(
            [{entity_keys[0]: name} for name, _ in ranked_entities], variation
        )
    else:
        entity_assignments = [{}]

    attempts = 0
    last_errors: list[str] = ["No valid field binding found for this data package."]

    for entity_binding in entity_assignments:
        # Columns present on BOTH joined entities are unusable. Arquero's join
        # renames collisions (`data_access_level` -> `data_access_level_1` /
        # `_2`), so a spec that groups by the bare name finds no such column and
        # the chart fails at render time with a confusing message. Skip them
        # rather than emit a preview that cannot draw.
        collisions: frozenset[str] = frozenset()
        if "E1" in entity_binding and "E2" in entity_binding:
            e1_fields = set(entities.get(entity_binding["E1"], {}).get("fields", {}))
            e2_fields = set(entities.get(entity_binding["E2"], {}).get("fields", {}))
            collisions = frozenset(e1_fields & e2_fields)

        # Which entity does each field key hang off?
        def owner(key: str) -> str:
            if key.startswith("E1."):
                return entity_binding.get("E1", "")
            if key.startswith("E2."):
                return entity_binding.get("E2", "")
            return entity_binding.get("E", entity_binding.get("E1", ""))

        candidate_lists = []
        for key in field_keys:
            entity_name = owner(key)
            entity = entities.get(entity_name, {})
            candidates = _candidate_fields(
                entity,
                key.split(".")[-1],
                required_types.get(key),
                (stats or {}).get(entity_name),
                # Offset per key as well as per template, so a template binding
                # three fields doesn't start all three from the same column.
                variation + field_keys.index(key),
                collisions,
            )
            if not candidates:
                required = required_types.get(key) or "any"
                last_errors = [
                    f"Entity '{entity_name}' has no {required} field usable for placeholder <{key}>."
                ]
                candidate_lists = None
                break
            candidate_lists.append(candidates)
        if candidate_lists is None:
            continue

        for combo in itertools.product(*candidate_lists) if field_keys else [()]:
            # Distinct fields per entity — two encodings on the same column is
            # never the example chart a reviewer wants (and x==y is rejected).
            per_entity: dict[str, set] = {}
            clash = False
            for key, field in zip(field_keys, combo):
                bucket = per_entity.setdefault(owner(key), set())
                if field in bucket:
                    clash = True
                    break
                bucket.add(field)
            if clash:
                continue

            attempts += 1
            if attempts > _MAX_ATTEMPTS:
                return None, None, last_errors

            bindings = dict(entity_binding)
            bindings.update(dict(zip(field_keys, combo)))

            errors = validate_bindings(spec_template, bindings, parsed_schema)
            if errors:
                last_errors = errors
                continue

            try:
                spec = instantiate_template(spec_template, bindings, parsed_schema)
            except (json.JSONDecodeError, TypeError) as exc:
                last_errors = [f"Template did not instantiate to valid JSON: {exc}"]
                continue

            blanks = _blank_bindings(spec)
            if blanks:
                last_errors = [f"Placeholders resolved to empty strings at: {', '.join(blanks)}"]
                continue

            renamed = _post_join_collisions(spec, collisions)
            if renamed:
                last_errors = [
                    f"After joining '{entity_binding.get('E1')}' and "
                    f"'{entity_binding.get('E2')}' the column(s) {', '.join(renamed)} exist on both "
                    f"tables, so the join renames them (e.g. {renamed[0]}_1/{renamed[0]}_2) and this "
                    f"template's later reference to the bare name cannot resolve."
                ]
                continue

            return bindings, spec, []

    return None, None, last_errors


def _discover_data_packages(explicit: list[str]) -> list[dict]:
    """Resolve ``--data-package`` args, or auto-discover under sample-data/."""
    entries = []
    if explicit:
        for item in explicit:
            name, _, path = item.partition("=")
            if not path:
                path, name = name, os.path.basename(os.path.dirname(name))
            entries.append((name, os.path.abspath(path)))
    else:
        for child in sorted(os.listdir(_SAMPLE_DATA)):
            candidate = os.path.join(_SAMPLE_DATA, child, "datapackage.json")
            if os.path.isfile(candidate):
                entries.append((child, candidate))

    packages = []
    for name, path in entries:
        with open(path) as f:
            raw = json.load(f)
        parsed = parse_schema_from_dict(raw)
        active_tags = sorted(_active_template_tags(parsed))
        packages.append(
            {
                "id": name,
                "path": path,
                "raw": raw,
                "parsed": parsed,
                "activeTags": active_tags,
            }
        )
    return packages


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--templates", default=_DEFAULT_TEMPLATES)
    parser.add_argument(
        "--data-package",
        action="append",
        default=[],
        metavar="NAME=PATH",
        help="datapackage.json to preview against (repeatable). Defaults to every "
        "sample-data/*/datapackage.json.",
    )
    parser.add_argument("--out", required=True)
    parser.add_argument(
        "--grammar",
        default=_GRAMMAR_SCHEMA,
        help="UDI grammar schema used to validate resolved specs ('' to skip).",
    )
    args = parser.parse_args()

    with open(args.templates) as f:
        templates_raw = f.read()
    templates = json.loads(templates_raw)

    grammar = None
    grammar_path = args.grammar
    if grammar_path and not os.path.isfile(grammar_path):
        grammar_path = _AGENT_GRAMMAR_SCHEMA
    if grammar_path:
        with open(grammar_path) as f:
            grammar = json.load(f)

    # Tool metadata: name + which binding keys the LLM would supply. Mirroring
    # the dispatch map keeps previews faithful to the runtime path.
    _tool_defs, tool_dispatch, generated_templates, tool_tags = _load_generated_tools()
    dispatch_by_index = {index: (name, param_map) for name, (index, param_map) in tool_dispatch.items()}
    tool_descriptions = {d["function"]["name"]: d["function"].get("description", "") for d in _tool_defs}

    packages = _discover_data_packages(args.data_package)
    if not packages:
        print("no data packages found; nothing to export", file=sys.stderr)
        return 1

    out_templates = []
    stats = {pkg["id"]: {"ok": 0, "shape_mismatch": 0, "unsupported": 0} for pkg in packages}

    for index, template in enumerate(templates):
        spec_template = template.get("spec_template", "")
        tool_name, param_map = dispatch_by_index.get(index, (None, {}))
        binding_keys = sorted(set(param_map.values()))
        tags = list(template.get("tags") or [])

        previews = {}
        for pkg in packages:
            # A cube template against a tidy package (or vice versa) is a shape
            # mismatch, not a bug — the agent would never offer it for this
            # schema. Report it distinctly so reviewers can tell the two apart.
            if tags and not (set(tags) & set(pkg["activeTags"])):
                previews[pkg["id"]] = {
                    "status": "shape_mismatch",
                    "reason": (
                        f"Template is tagged {tags} but this data package selects "
                        f"{pkg['activeTags']} templates."
                    ),
                }
                stats[pkg["id"]]["shape_mismatch"] += 1
                continue

            declared = template.get("preview_bindings") or None
            if declared:
                bindings, spec, errors = _declared_binding(
                    spec_template, declared, pkg["parsed"]
                )
            else:
                bindings, spec, errors = _search_bindings(
                    spec_template,
                    binding_keys,
                    pkg["parsed"],
                    _column_stats(pkg),
                    variation=index,
                )
            if spec is not None:
                previews[pkg["id"]] = {
                    "status": "ok",
                    "bindings": bindings,
                    "spec": spec,
                    # Advisory: the resolved spec renders, but may not conform to
                    # the grammar schema. Shown as a warning, not an error.
                    "grammarError": _grammar_error(spec, grammar),
                }
                stats[pkg["id"]]["ok"] += 1
            else:
                previews[pkg["id"]] = {"status": "unsupported", "reason": " ".join(errors)}
                stats[pkg["id"]]["unsupported"] += 1

        out_templates.append(
            {
                "key": template_key(spec_template),
                "index": index,
                "toolName": tool_name,
                "toolDescription": tool_descriptions.get(tool_name, ""),
                "bindingKeys": binding_keys,
                "chartType": template.get("chart_type"),
                "chartComplexity": template.get("chart_complexity"),
                "tags": tags,
                "description": template.get("description", ""),
                "designConsiderations": template.get("design_considerations", ""),
                "tasks": template.get("tasks", ""),
                "taskTypes": template.get("task_types") or [],
                "queryTemplates": template.get("query_templates") or [],
                "reviewHint": template.get("review_hint", ""),
                "specTemplate": spec_template,
                # Whether the *unresolved* template conforms to the grammar. Two
                # shipped templates do not; the studio flags them so the drift is
                # visible rather than silently tolerated.
                "templateGrammarError": _template_grammar_error(spec_template, grammar),
                "previews": previews,
            }
        )

    payload = {
        # Consumed by the studio to warn when previews are stale relative to the
        # templates file, so a reviewer never approves a spec that has moved on.
        "templatesHash": hashlib.sha256(templates_raw.encode("utf-8")).hexdigest()[:12],
        "grammarSchema": os.path.relpath(grammar_path, _REPO_ROOT) if grammar_path else "",
        "templateCount": len(templates),
        "dataPackages": [
            {
                "id": pkg["id"],
                "name": pkg["raw"].get("name", pkg["id"]),
                "title": pkg["raw"].get("title", ""),
                # Path the frontend fetches the package from; sample-data/ is
                # synced to the app's public/data on dev and build.
                "datapackageUrl": f"/data/{pkg['id']}/datapackage.json",
                "activeTags": pkg["activeTags"],
                "isCube": any(e.get("is_cube") for e in pkg["parsed"]["entities"].values()),
                "entities": {
                    name: {
                        "rowCount": entity.get("row_count", 0),
                        "fieldCount": len(entity.get("fields", {})),
                        "isCube": bool(entity.get("is_cube")),
                        "dimensions": entity.get("dimensions") or [],
                        "measures": entity.get("measures") or [],
                    }
                    for name, entity in pkg["parsed"]["entities"].items()
                },
            }
            for pkg in packages
        ],
        "templates": out_templates,
    }

    os.makedirs(os.path.dirname(os.path.abspath(args.out)), exist_ok=True)
    with open(args.out, "w") as f:
        json.dump(payload, f, indent=2, sort_keys=False)
        f.write("\n")

    print(f"exported {len(out_templates)} templates → {args.out}")
    for pkg_id, counts in stats.items():
        print(
            f"  {pkg_id}: {counts['ok']} renderable, "
            f"{counts['shape_mismatch']} shape mismatch, {counts['unsupported']} unsupported"
        )
    non_conforming = [t["index"] for t in out_templates if t["templateGrammarError"]]
    if non_conforming:
        print(
            f"  warning: {len(non_conforming)} template(s) do not conform to "
            f"{os.path.relpath(grammar_path, _REPO_ROOT)}: {non_conforming}"
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
