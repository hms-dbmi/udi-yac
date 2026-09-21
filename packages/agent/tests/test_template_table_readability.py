"""Every in-cell bar in a table template should also show its number.

An in-cell `bar`/`rect` encodes relative magnitude but not the value, so a column
drawn with a bar and no `text` mark leaves the number unreadable. That was raised
in review three separate times (templates 44, 46, 48), which is enough to pin.

Exemptions are expressed as properties of the spec rather than a list of template
indices, so they keep working as templates are added or reordered — and so a new
template that trips this has to either show its number or justify a new exemption.
"""

import json
import os

_AGENT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
_TEMPLATES = os.path.join(
    _AGENT_ROOT, "src", "udiagent", "data", "skills", "template_visualizations.json"
)

MAGNITUDE_MARKS = {"bar", "rect", "line", "point"}


def _templates():
    with open(_TEMPLATES) as f:
        return json.load(f)


def _row_representations(spec):
    reps = spec.get("representation")
    reps = reps if isinstance(reps, list) else [reps]
    return [r for r in reps if isinstance(r, dict) and r.get("mark") == "row"]


def _mappings(rep):
    mappings = rep.get("mapping") or []
    mappings = mappings if isinstance(mappings, list) else [mappings]
    return [m for m in mappings if isinstance(m, dict)]


def _column_of(mapping):
    """The table column a mapping targets: explicit `column`, else its `field`."""
    return mapping.get("column") or mapping.get("field")


def test_bar_columns_show_their_value():
    problems = []

    for index, template in enumerate(_templates()):
        try:
            spec = json.loads(template.get("spec_template", ""))
        except (json.JSONDecodeError, TypeError):
            continue

        reps = _row_representations(spec)
        if not reps:
            continue

        # A `field: "*"` text mark draws text in every column. It may live in a
        # different representation of the same table, so collect across all of
        # them before judging any single one.
        all_mappings = [m for rep in reps for m in _mappings(rep)]
        wildcard_text = any(
            m.get("mark") == "text" and m.get("field") == "*" for m in all_mappings
        )
        if wildcard_text:
            continue

        text_columns = {
            _column_of(m) for m in all_mappings if m.get("mark") == "text"
        }
        # A column given both `x` and `x2` is a min..max span; the endpoints are
        # shown as their own text columns, so the span itself needs no number.
        span_columns = {
            _column_of(m)
            for m in all_mappings
            if m.get("encoding") == "x2" and m.get("mark") in MAGNITUDE_MARKS
        }

        for mapping in all_mappings:
            if mapping.get("mark") not in MAGNITUDE_MARKS:
                continue
            column = _column_of(mapping)
            if column in text_columns or column in span_columns:
                continue
            # A percentage column accompanies explicit count columns and reads as
            # a proportion indicator rather than a value to look up.
            if isinstance(column, str) and "%" in column:
                continue
            problems.append(
                f"template {index} ({template.get('chart_type')}, {template.get('tags')}): "
                f"column {column!r} draws a {mapping.get('mark')} with no text mark, so its "
                f"value cannot be read"
            )

    assert not problems, "in-cell marks without a readable value:\n" + "\n".join(problems)


def test_text_marks_are_not_hidden_behind_their_bar():
    """Within a column, the text mapping must come after the bar.

    In-cell marks are absolutely positioned siblings, so the later mapping paints
    on top. Text declared before the bar in the same column is drawn underneath it
    and the number is invisible — which looks exactly like the bug above.
    """
    problems = []

    for index, template in enumerate(_templates()):
        try:
            spec = json.loads(template.get("spec_template", ""))
        except (json.JSONDecodeError, TypeError):
            continue

        for rep in _row_representations(spec):
            mappings = _mappings(rep)
            for column in {_column_of(m) for m in mappings}:
                in_column = [i for i, m in enumerate(mappings) if _column_of(m) == column]
                text_at = [i for i in in_column if mappings[i].get("mark") == "text"]
                bar_at = [
                    i for i in in_column if mappings[i].get("mark") in MAGNITUDE_MARKS
                ]
                if not text_at or not bar_at:
                    continue
                if min(text_at) < max(bar_at):
                    problems.append(
                        f"template {index}: in column {column!r} a text mark is declared before a "
                        f"{mappings[max(bar_at)].get('mark')} mark, so the bar paints over the number"
                    )

    assert not problems, "text hidden behind in-cell bars:\n" + "\n".join(problems)
