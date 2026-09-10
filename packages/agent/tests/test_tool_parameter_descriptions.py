"""A tool parameter must describe the binding the validator will enforce.

The bug this file exists for. When stratified charts began splitting by a
derived `stratum` column, the stratifier stopped appearing in any representation
mapping. `vis_generate._placeholder_encodings` was taught to follow the derive;
`generate_tools._extract_encoding_info`, a second copy of the same walk, was not.
So `entity2_field` — the stratifier, the entire point of the chart — went from

    "nominal field, encodes color."   to   "any type field."

leaving it the vaguest parameter on the tool, sitting beside a join key
(`entity2_field1`) described the same way. The model swapped the two, bound the
stratifier to a 914-value id column, and every stratified survival request failed.

Nothing caught it, because nothing asserted that a description tells the truth
about the binding. These do.
"""

import re

import pytest

from udiagent.vis_generate import (
    _load_generated_tools,
    _placeholder_type_requirements,
    placeholder_encoding_info,
)

_TYPE_WORD = {"nominal": "nominal", "quantitative": "quantitative", "ordinal": "ordinal"}


@pytest.fixture(scope="module")
def generated():
    loaded = _load_generated_tools()
    assert loaded is not None
    return loaded


def test_every_parameter_advertises_the_type_validation_enforces(generated):
    """A description saying "any type field" for a binding `validate_bindings`
    requires to be nominal is not a harmless omission: it invites exactly the
    call that will then be rejected, and the model has no other signal to go on.
    """
    tool_defs, dispatch, templates, _tags = generated
    by_name = {d["function"]["name"]: d["function"] for d in tool_defs}

    mismatches = []
    for name, (index, param_map) in dispatch.items():
        required = _placeholder_type_requirements(templates[index])
        properties = by_name[name]["parameters"]["properties"]
        for param, placeholder in param_map.items():
            expected = required.get(placeholder)
            if not expected or param not in properties:
                continue
            description = properties[param].get("description", "")
            if _TYPE_WORD[expected] not in description:
                mismatches.append(f"{name}.{param} ({placeholder}) wants "
                                  f"{expected}, says {description!r}")
    assert not mismatches, "descriptions disagree with validation:\n" + "\n".join(
        mismatches[:20]
    )


def test_no_survival_parameter_is_left_untyped(generated):
    """The survival tools ask for up to fifteen arguments. If several say only
    "any type field" the model is guessing, which is what it was observed doing.
    """
    tool_defs, dispatch, _templates, _tags = generated
    by_name = {d["function"]["name"]: d["function"] for d in tool_defs}

    vague = []
    for name in dispatch:
        if "survival" not in name:
            continue
        for param, spec in by_name[name]["parameters"]["properties"].items():
            if not re.match(r"(entity\d*_)?field\d*$", param):
                continue
            if "any type" in spec.get("description", ""):
                vague.append(f"{name}.{param}")
    assert not vague, "untyped survival parameters: " + ", ".join(vague)


def test_the_stratifier_is_the_parameter_that_says_it_draws_the_colour(generated):
    """The one discriminator between the stratifier and the join key beside it.

    Both are nominal columns on the same joined table, so type alone cannot
    separate them — "encodes color" is what says which one becomes the curves.
    """
    tool_defs, dispatch, templates, _tags = generated
    by_name = {d["function"]["name"]: d["function"] for d in tool_defs}

    for suffix, stratifier_param, stratifier_placeholder in (
        ("_line_survival_related", "entity2_field", "E2.F"),
        ("_line_survival_related_numeric", "entity2_field", "E2.F"),
        ("_line_survival_baseline", "entity1_field4", "E1.F4"),
    ):
        name = next(n for n in dispatch if n.endswith(suffix))
        index, param_map = dispatch[name]

        # The template really does draw it, through the stratum derive.
        info = placeholder_encoding_info(templates[index])
        assert "color" in info.get(stratifier_placeholder, {}).get("encodings", []), (
            f"{suffix}: {stratifier_placeholder} is not reachable from a drawn column"
        )

        properties = by_name[name]["parameters"]["properties"]
        assert "encodes color" in properties[stratifier_param]["description"], (
            f"{suffix}: {stratifier_param} no longer says it drives the colour"
        )
        # And it is the ONLY field parameter that does, or it discriminates
        # nothing.
        colour_params = [
            p
            for p, spec in properties.items()
            if "encodes color" in spec.get("description", "")
        ]
        assert colour_params == [stratifier_param], (
            f"{suffix}: expected only {stratifier_param} to encode colour, "
            f"got {colour_params}"
        )


def test_the_numeric_stratifier_is_described_as_quantitative(generated):
    """Its `:q` suffix must beat the derived stratum column's nominal type —
    the label the chart draws is a string, but the column being cut is a number,
    and the model is binding the column.
    """
    tool_defs, dispatch, _templates, _tags = generated
    by_name = {d["function"]["name"]: d["function"] for d in tool_defs}
    name = next(n for n in dispatch if n.endswith("_line_survival_related_numeric"))
    description = by_name[name]["parameters"]["properties"]["entity2_field"]["description"]
    assert description.startswith("quantitative field"), description


def test_the_two_encoding_walks_are_one_walk(generated):
    """`generate_tools` must not grow a second copy of this logic again."""
    from udiagent.generate_tools import _extract_encoding_info

    _defs, dispatch, templates, _tags = generated
    for name in list(dispatch)[:12]:
        index, _pm = dispatch[name]
        assert _extract_encoding_info(templates[index]) == placeholder_encoding_info(
            templates[index]
        )


def test_no_table_offers_two_fields_the_model_cannot_tell_apart(generated):
    """Within one entity, no two required field parameters may read identically.

    This is the invariant behind the swap that keeps happening. The survival
    templates ask each table for its record id AND for the column a literal is
    matched against; both nominal, neither encoded, so both were described
    "nominal field." and the model duly bound `event_type` to the join key —
    joining an event log to a status table on a column of event names. Nothing
    downstream objects: every column exists with the right type, the join simply
    matches nothing and the chart draws no line.

    Scoped per entity on purpose. `entity1_field1` and `entity3_field1` may well
    both be "the join key on this table" — the parameter name already says which
    table, and forcing those apart would mean inventing differences that are not
    there. It is two fields of the SAME table that must be distinguishable.

    Fails 10 times against the commit that introduced it.
    """
    tool_defs, _dispatch, _templates, _tags = generated
    for tool in tool_defs:
        fn = tool["function"]
        required = set(fn["parameters"]["required"])
        by_entity: dict[tuple[str, str], list[str]] = {}
        for name, spec in fn["parameters"]["properties"].items():
            match = re.fullmatch(r"(entity\d*)_(field\d*)", name)
            if not match or name not in required:
                continue
            by_entity.setdefault((match.group(1), spec["description"]), []).append(name)
        clashes = {k: v for k, v in by_entity.items() if len(v) > 1}
        assert not clashes, f"{fn['name']}: {clashes}"


def test_a_join_key_parameter_says_it_is_a_join_key(generated):
    """The role has to reach the model, not just the template author."""
    tool_defs, dispatch, templates, _tags = generated
    from udiagent.vis_generate import join_key_placeholders

    by_name = {d["function"]["name"]: d["function"] for d in tool_defs}
    name = next(n for n in dispatch if n.endswith("_line_survival_related"))
    index, param_map = dispatch[name]
    keys = join_key_placeholders(templates[index])
    assert keys == {"E1.F1", "E2.F1", "E3.F1"}, keys

    props = by_name[name]["parameters"]["properties"]
    for param, placeholder in param_map.items():
        if placeholder in keys:
            assert "JOIN KEY" in props[param]["description"], param
    # And the column a value is matched against says *that* instead.
    assert "value1, value2" in props["entity1_field2"]["description"]
    assert "value3" in props["entity3_field2"]["description"]
