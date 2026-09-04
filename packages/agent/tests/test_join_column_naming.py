"""A join must not leave two columns wearing the same name.

`SELECT * FROM a JOIN b` yields both copies of every shared column, and every
later reference to one fails — "Column 'organization_name' is ambiguous" on
StarRocks. Not even the join key is safe there: StarRocks' USING returns both
copies rather than coalescing them, so `research_id` was ambiguous too.

The compiler therefore names every joined column explicitly, following the
Arquero executor so both engines produce the same table: a key matched to a
column of its own name appears once, anything else on both sides becomes
`x_1` (left) and `x_2` (right).
"""

import json

import pytest

from udiagent.query.compiler import PipelineCompiler
from udiagent.query.connectors import DuckDBConnector
from udiagent.schema import parse_schema_from_dict
from udiagent.vis_generate import (
    entity_fields_from_schema,
    instantiate_template,
    join_column_renames,
    spec_mapping_errors,
)

COLUMNS = {
    "Event": ["organization_name", "research_id", "event_type"],
    "Patient": ["organization_name", "research_id", "sex"],
    "Lab": ["lab_id", "research_id", "value"],
}


def _compiler():
    connector = DuckDBConnector(views={})
    return PipelineCompiler(
        table_map={name: name.lower() for name in COLUMNS},
        dialect=connector.dialect,
        columns_of=lambda entity: COLUMNS[entity],
    )


def _join(left, right, on):
    compiled = _compiler().compile(
        [{"name": left, "source": "x"}, {"name": right, "source": "y"}],
        [{"join": {"on": on}, "in": [left, right], "out": "joined"}],
    )
    return compiled.sql


@pytest.mark.parametrize(
    "left,right,on,expected",
    [
        # Same-named key merges; the other shared column splits.
        (
            "Event",
            "Patient",
            ["research_id", "research_id"],
            ["organization_name_1", "research_id", "event_type",
             "organization_name_2", "sex"],
        ),
        # Only the key is shared: nothing to rename.
        (
            "Event",
            "Lab",
            ["research_id", "research_id"],
            ["organization_name", "research_id", "event_type", "lab_id", "value"],
        ),
    ],
)
def test_joined_column_names(left, right, on, expected):
    columns, names = _compiler()._join_columns(COLUMNS[left], COLUMNS[right], [tuple(on)])
    assert names == expected, names
    # Every emitted column is qualified and aliased, so nothing is ambiguous.
    assert columns.count(" AS ") == len(expected)
    assert len(set(names)) == len(names), "duplicate output name"


def test_differently_named_keys_keep_both_and_rename_collisions():
    """samples.donor.hubmap_id -> donors.hubmap_id: the keys are different
    columns, so neither merges, and a name on both sides still splits."""
    left = ["hubmap_id", "group_name"]  # donors
    right = ["donor.hubmap_id", "group_name"]  # samples
    _sql, names = _compiler()._join_columns(left, right, [("hubmap_id", "donor.hubmap_id")])
    assert names == ["hubmap_id", "group_name_1", "donor.hubmap_id", "group_name_2"]


def _unquoted(sql):
    """Quote characters differ per dialect; the names do not."""
    return sql.replace("`", "").replace('"', "")


def test_join_sql_is_unambiguous():
    sql = _unquoted(_join("Event", "Patient", ["research_id", "research_id"]))
    # The join itself no longer selects *, so no column arrives twice.
    assert "SELECT * FROM event" not in sql, sql
    assert "AS organization_name_1" in sql and "AS organization_name_2" in sql
    # The merged key is taken from one side only.
    assert sql.count("AS research_id") == 1, sql


def test_falls_back_when_columns_are_unknown():
    """Without introspection there is nothing to name the columns with; the
    old shape is kept rather than emitting a wrong list."""
    connector = DuckDBConnector(views={})
    compiler = PipelineCompiler(
        table_map={"Event": "event", "Patient": "patient"},
        dialect=connector.dialect,
        columns_of=None,
    )
    sql = compiler.compile(
        [{"name": "Event", "source": "x"}, {"name": "Patient", "source": "y"}],
        [{"join": {"on": "research_id"}, "in": ["Event", "Patient"], "out": "j"}],
    ).sql
    assert "USING (research_id)" in _unquoted(sql)


# --- the reference side -------------------------------------------------


def _package():
    def resource(name, columns, fk=None):
        schema = {
            "fields": [
                {"name": c, "udi:data_type": "nominal", "udi:cardinality": 3}
                for c in columns
            ],
            "foreignKeys": fk or [],
        }
        return {"name": name, "path": f"{name}.csv", "udi:row_count": 9, "schema": schema}

    return {
        "name": "pcx",
        "udi:path": "",
        "resources": [
            resource("Patient", ["organization_name", "research_id", "sex"]),
            resource(
                "Event",
                ["organization_name", "research_id", "event_type"],
                [
                    {
                        "fields": ["research_id"],
                        "reference": {"resource": "Patient", "fields": ["research_id"]},
                        "udi:cardinality": {"from": "many", "to": "one"},
                    }
                ],
            ),
        ],
    }


def test_template_placeholders_resolve_to_the_renamed_column():
    schema = parse_schema_from_dict(_package())
    template = json.dumps(
        {
            "source": [{"name": "<E1>", "source": "<E1.url>"}, {"name": "<E2>", "source": "<E2.url>"}],
            "transformation": [
                {
                    "join": {"on": ["<E1.r.E2.id.from>", "<E1.r.E2.id.to>"]},
                    "in": ["<E1>", "<E2>"],
                    "out": "j",
                },
                {"groupby": "<E2.F>"},
                {"rollup": {"n": {"op": "count"}}},
            ],
            "representation": {
                "mark": "bar",
                "mapping": [{"encoding": "y", "field": "<E2.F>", "type": "nominal"}],
            },
        }
    )
    bindings = {"E1": "Event", "E2": "Patient", "E2.F": "organization_name"}

    renames = join_column_renames(template, bindings, schema)
    assert renames["E2.organization_name"] == "organization_name_2"
    # The join key has the same name on both sides, so it merges and is not
    # renamed — a groupby on it stays valid.
    assert "E1.research_id" not in renames

    spec = instantiate_template(template, bindings, schema)
    assert spec["transformation"][1] == {"groupby": "organization_name_2"}
    assert spec["representation"]["mapping"][0]["field"] == "organization_name_2"
    # The join still matches on the real, input-side column names.
    assert spec["transformation"][0]["join"]["on"] == ["research_id", "research_id"]


def test_validator_rejects_the_pre_join_name():
    fields = entity_fields_from_schema(_package())
    spec = {
        "source": [{"name": "Event", "source": "e"}, {"name": "Patient", "source": "p"}],
        "transformation": [
            {"join": {"on": ["research_id", "research_id"]}, "in": ["Event", "Patient"], "out": "j"},
            {"groupby": "organization_name"},
            {"rollup": {"n": {"op": "count"}}},
        ],
        "representation": {
            "mark": "bar",
            "mapping": [{"encoding": "y", "field": "organization_name", "type": "nominal"}],
        },
    }
    errors = spec_mapping_errors(spec, fields)
    assert errors, "a column renamed by the join must not validate"
    assert "organization_name_1" in errors[0] and "organization_name_2" in errors[0]

    spec["transformation"][1]["groupby"] = "organization_name_2"
    spec["representation"]["mapping"][0]["field"] = "organization_name_2"
    assert spec_mapping_errors(spec, fields) == []
