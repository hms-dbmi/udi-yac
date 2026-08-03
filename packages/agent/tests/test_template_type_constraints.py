"""Guard the placeholder type constraints in the shipped visualization templates.

`validate_bindings` only enforces a field's type when the *spec* says so — via a
`:q`/`:n`/`:o` suffix on the placeholder, or the `type` declared on an encoding
whose `field` is precisely that placeholder. A placeholder that is typed only in
the human-readable `query_templates` prose, or only used as a rollup's `field` or
a mapping's `column`, is unconstrained: any column can bind to it.

That gap silently produced broken charts — `min()` of a nominal column plotted on
a quantitative axis, and a histogram binning a categorical field. Both looked like
rendering bugs. These tests pin the invariant so it can't come back unnoticed.
"""

import json
import os
import re

from udiagent.generate_tools import (
    _extract_encoding_info,
    _extract_placeholders,
    _get_field_type_for_placeholder,
)

_AGENT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
_TEMPLATES = os.path.join(
    _AGENT_ROOT, "src", "udiagent", "data", "skills", "template_visualizations.json"
)

# Ops whose input must be numeric for the result to be plottable on a
# quantitative axis. `count` is excluded: counting anything is valid.
NUMERIC_OPS = {"min", "max", "mean", "median", "sum", "stdev", "variance", "quantile"}

SUFFIX_TO_TYPE = {"n": "nominal", "q": "quantitative", "o": "ordinal"}


def _templates():
    with open(_TEMPLATES) as f:
        return json.load(f)


def _enforced_types(spec_template):
    """The requirements validate_bindings will actually apply."""
    types = {}
    for placeholder in _extract_placeholders(spec_template):
        base = placeholder.split(":")[0]
        field_type = _get_field_type_for_placeholder(placeholder)
        if field_type and base not in types:
            types[base] = field_type
    for base, info in _extract_encoding_info(spec_template).items():
        if base not in types and info.get("declared_type"):
            types[base] = info["declared_type"]
    return types


def _prose_types(query_templates):
    """Types the template author declared in the natural-language patterns."""
    if isinstance(query_templates, str):
        query_templates = [query_templates]
    types = {}
    for query in query_templates or []:
        for placeholder in re.findall(r"<([^>]+)>", query):
            base, _, suffix = placeholder.partition(":")
            # `q|o|n` is a deliberate "any type" hint, not a constraint.
            if suffix in SUFFIX_TO_TYPE:
                types.setdefault(base, SUFFIX_TO_TYPE[suffix])
    return types


def _numeric_aggregated_placeholders(spec):
    """Placeholders used as the `field` of a numeric-op rollup."""
    found = set()

    def walk(node):
        if isinstance(node, dict):
            for key, value in node.items():
                if key == "rollup" and isinstance(value, dict):
                    for aggregation in value.values():
                        if not isinstance(aggregation, dict):
                            continue
                        field = aggregation.get("field")
                        if aggregation.get("op") in NUMERIC_OPS and isinstance(field, str):
                            match = re.fullmatch(r"<([^>]+)>", field)
                            if match:
                                found.add(match.group(1).split(":")[0])
                walk(value)
        elif isinstance(node, list):
            for value in node:
                walk(value)

    walk(spec)
    return found


def test_prose_declared_types_are_enforced_by_the_spec():
    """A type promised in the query prose must be enforced by the spec."""
    gaps = []
    for index, template in enumerate(_templates()):
        spec_template = template.get("spec_template", "")
        enforced = _enforced_types(spec_template)
        present = {p.split(":")[0] for p in _extract_placeholders(spec_template)}
        for base, intended in _prose_types(template.get("query_templates")).items():
            if base not in present:
                continue
            if enforced.get(base) != intended:
                gaps.append(
                    f"template {index} ({template.get('chart_type')}): <{base}> is documented as "
                    f"{intended} but the spec enforces {enforced.get(base) or 'nothing'}"
                )
    assert not gaps, "placeholder types promised in prose but not enforced:\n" + "\n".join(gaps)


def test_numeric_aggregations_require_a_quantitative_field():
    """min/max/mean/median/sum must not be able to bind a non-numeric column.

    `<M>` is exempt: it resolves to the cube's declared measure from the schema
    rather than to a caller-supplied binding.
    """
    gaps = []
    for index, template in enumerate(_templates()):
        spec_template = template.get("spec_template", "")
        try:
            spec = json.loads(spec_template)
        except (json.JSONDecodeError, TypeError):
            continue
        enforced = _enforced_types(spec_template)
        for base in sorted(_numeric_aggregated_placeholders(spec)):
            if base == "M":
                continue
            if enforced.get(base) != "quantitative":
                gaps.append(
                    f"template {index} ({template.get('chart_type')}): <{base}> is numerically "
                    f"aggregated but constrained to {enforced.get(base) or 'nothing'}"
                )
    assert not gaps, "numeric aggregations over unconstrained fields:\n" + "\n".join(gaps)


def test_binby_requires_a_quantitative_field():
    """Binning a categorical column produces a meaningless histogram."""
    gaps = []
    for index, template in enumerate(_templates()):
        spec_template = template.get("spec_template", "")
        try:
            spec = json.loads(spec_template)
        except (json.JSONDecodeError, TypeError):
            continue
        enforced = _enforced_types(spec_template)
        for step in spec.get("transformation") or []:
            if not isinstance(step, dict) or "binby" not in step:
                continue
            binby = step.get("binby")
            if not isinstance(binby, dict):
                continue
            field = binby.get("field")
            if not isinstance(field, str):
                continue
            match = re.fullmatch(r"<([^>]+)>", field)
            if not match:
                continue
            base = match.group(1).split(":")[0]
            if enforced.get(base) != "quantitative":
                gaps.append(
                    f"template {index}: binby <{base}> constrained to "
                    f"{enforced.get(base) or 'nothing'}"
                )
    assert not gaps, "binby over unconstrained fields:\n" + "\n".join(gaps)
