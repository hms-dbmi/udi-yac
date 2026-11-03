"""A ``null`` in a column's domain does not make its value list a sample.

The client sends ``null`` among a column's values when the column holds one (a
cube's roll-up marker, a missing value) and counts it in ``distinct``. Every
reader used to drop it from the values only, which left a complete list one
short of ``distinct``, so it read as a sample. On a cube that is every column:
filter values went unchecked, linked values went untranslated, and the prompt
showed complete lists as "showing 2 of 3".

The fixture is cut down from a real request against a pcx survival cube, where
the model copied "CCG-99703." (with the period the value lookup had put after
it) into a filter, and the chat's notice caught what the agent let through.
"""

import json

from udiagent.filters import translate_linked_values, validate_operations
from udiagent.schema import (
    lookup_field_values,
    parse_schema_from_dict,
    point_domain_values,
    simplify_data_domains,
)

PROTOCOLS = ["ACNS0334: Regimen B", "CCG-99703", "ACNS0334: Regimen A", "PBTC026", "ACNS0334"]


def _cube(name, linked=None):
    resource = {
        "name": name,
        "udi:cube": True,
        "udi:dimensions": ["protocol_name_and_arm"],
        "udi:measures": ["cnt"],
        "schema": {
            "fields": [
                {"name": "protocol_name_and_arm", "udi:data_type": "nominal"},
                {"name": "cnt", "udi:data_type": "quantitative"},
            ]
        },
    }
    if linked:
        resource["udi:linked_dimensions"] = {"protocol_name_and_arm": linked}
    return resource


SCHEMA = parse_schema_from_dict(
    {
        "resources": [
            _cube("Efs"),
            _cube("Os", {"entity": "Efs", "field": "protocol_name_and_arm"}),
        ]
    }
)


def _point(entity, field, values, **extra):
    """A point domain as the chat sends it: ``distinct`` counts the ``null``."""
    domain = {"values": values, "distinct": len(values), **extra}
    return {"entity": entity, "field": field, "type": "point", "domain": domain}


DOMAINS = json.dumps(
    [_point(e, "protocol_name_and_arm", [*PROTOCOLS, None]) for e in ("Efs", "Os")]
)


def _add(entity, values):
    return {
        "op": "add",
        "title": "Protocol",
        "entity": entity,
        "field": "protocol_name_and_arm",
        "filterType": "point",
        "pointValues": values,
    }


def test_the_null_leaves_both_the_values_and_the_count():
    domain = {"values": ["a", "b", None], "distinct": 3}
    assert point_domain_values(domain) == (["a", "b"], 2)
    # A list the client really shortened still reads as shortened.
    assert point_domain_values({"values": ["a", None], "distinct": 40}) == (["a"], 39)
    assert point_domain_values({"values": [], "distinct": 665, "omitted": True}) == ([], 665)


def test_a_value_copied_with_a_period_is_rejected_on_a_cube_column():
    for entity in ("Os", "Efs"):
        ops = translate_linked_values(
            [_add(entity, ["ACNS0334", "CCG-99703.", "PBTC026."])], SCHEMA, DOMAINS
        )
        errors = validate_operations(ops, SCHEMA, DOMAINS, [])
        assert len(errors) == 2, errors
        assert "Value 'CCG-99703.' is not in" in errors[0]
        assert "Value 'PBTC026.' is not in" in errors[1]


def test_the_real_values_pass_on_a_cube_column():
    ops = [_add("Os", ["ACNS0334", "CCG-99703", "PBTC026"])]
    assert validate_operations(ops, SCHEMA, DOMAINS, []) == []


def test_a_shortened_list_is_still_not_checked():
    """A value missing from a sample may exist, so it must not be rejected."""
    domains = json.dumps(
        [_point("Os", "protocol_name_and_arm", ["ACNS0334", None], distinct=62)]
    )
    assert validate_operations([_add("Os", ["PBTC026"])], SCHEMA, domains, []) == []


def test_linked_values_translate_on_a_column_holding_a_null():
    """translate_linked_values reads the same lists, so it was off too."""
    shh = ["Medulloblastoma, SHH-activated and TP53-mutant"]
    linked = parse_schema_from_dict(
        {
            "resources": [
                {"name": "Event", "schema": {"fields": [{"name": "dx"}]}},
                _cube("Efs", {"entity": "Event", "field": "dx", "values": {"SHH": shh}}),
            ]
        }
    )
    domains = json.dumps(
        [
            _point("Event", "dx", [*shh, None]),
            _point("Efs", "protocol_name_and_arm", ["SHH", None]),
        ]
    )
    (op,) = translate_linked_values([_add("Efs", shh)], linked, domains)
    assert op["pointValues"] == ["SHH"]


def test_the_prompt_lists_a_short_column_with_a_null_in_full():
    rendered = simplify_data_domains(
        [_point("Efs", "efs_status", ["event", "event-free", None])]
    )
    assert "values: [event, event-free]" in rendered
    assert "showing" not in rendered


def test_lookup_quotes_each_value_with_nothing_after_the_last():
    answer = lookup_field_values(DOMAINS, "Os", "protocol_name_and_arm", contains="PBTC026")
    assert answer.endswith('"PBTC026"')
    assert "PBTC026." not in answer
    full = lookup_field_values(DOMAINS, "Os", "protocol_name_and_arm")
    # Complete, null aside: not "the 5 on record here" out of 6.
    assert "has 5 distinct values, all of them" in full
    assert full.endswith('"ACNS0334"')


def test_lookup_keeps_a_value_containing_a_comma_whole():
    arm = "ACNS0332: Regimen A (no carboplatin, no isotretinoin)"
    domains = [_point("Os", "protocol_name_and_arm", [arm, "ACNS0332"])]
    answer = lookup_field_values(domains, "Os", "protocol_name_and_arm", contains="acns0332")
    assert f'"{arm}", "ACNS0332"' in answer
