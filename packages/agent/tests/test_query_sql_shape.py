"""Shape checks on the SQL the compiler emits, with no database involved.

These pin the hazard that `SELECT *` creates: a relation that ends up holding
the same column name twice. DuckDB tolerates some of it (its USING dedups the
join key), StarRocks does not — every later reference fails with
"Column '<name>' is ambiguous" — so the parity suite's DuckDB-only leg missed
it entirely. Text assertions catch it for both dialects without a live server.
"""

import re

import pytest

from udiagent.query.compiler import PipelineCompiler
from udiagent.query.connectors import DuckDBDialect, StarRocksDialect

COLUMNS = {
    "donors": ["uuid", "hubmap_id", "group_name", "sex", "medical_history"],
    "samples": ["uuid", "sample_id", "group_name", "sample_category"],
}


@pytest.fixture(params=[DuckDBDialect, StarRocksDialect], ids=["duckdb", "starrocks"])
def compile_sql(request):
    dialect = request.param()

    def run(sources, transformation):
        compiler = PipelineCompiler(
            table_map={name: name for name in COLUMNS},
            dialect=dialect,
            columns_of=lambda entity: COLUMNS[entity],
        )
        return compiler.compile(sources, transformation).sql, dialect

    return run


def _select_lists(sql: str) -> list[str]:
    """The text between each SELECT and its FROM — good enough for these
    single-level CTEs, and it is the part a duplicate name shows up in."""
    return re.findall(r"SELECT (.*?) FROM ", sql)


def _output_names(select_list: str, quote: str) -> list[str]:
    """Column names the select list introduces: the alias of each item, or the
    last identifier it mentions. `l.*` contributes nothing, which is exactly
    the blind spot these tests exist for."""
    q = re.escape(quote)
    names = []
    for item in select_list.split(", "):
        alias = re.search(rf"AS {q}(.+?){q}$", item)
        if alias:
            names.append(alias.group(1))
            continue
        idents = re.findall(rf"{q}(.+?){q}", item)
        if idents:
            names.append(idents[-1])
    return names


def _assert_no_duplicate_outputs(sql: str, dialect) -> None:
    for select_list in _select_lists(sql):
        names = _output_names(select_list, dialect.quote_char)
        assert len(names) == len(set(names)), f"duplicate output column in: {select_list}"


def test_same_name_join_key_is_not_left_to_using(compile_sql):
    sql, dialect = compile_sql(
        [{"name": "donors", "source": "donors"}, {"name": "samples", "source": "samples"}],
        [
            {
                "join": {"on": ["group_name", "group_name"], "kind": "left"},
                "in": ["donors", "samples"],
                "out": "joined",
            },
            {"groupby": "group_name"},
            {"rollup": {"n": {"op": "count"}}},
        ],
    )
    # USING dedups on DuckDB and keeps both key columns on StarRocks; the
    # compiler must drop the right side's copy itself instead.
    assert "USING" not in sql
    q = dialect.quote_char
    join_select = _select_lists(sql)[0]
    assert f"r.{q}group_name{q}" not in join_select
    assert f"r.{q}sample_category{q}" in join_select
    _assert_no_duplicate_outputs(sql, dialect)


def test_unnest_overwrites_its_source_column(compile_sql):
    sql, dialect = compile_sql(
        [{"name": "donors", "source": "donors"}],
        [{"unnest": {"field": "medical_history", "separator": ","}}],
    )
    q = dialect.quote_char
    assert "UNNEST(" in sql
    # The original column must not be carried through next to the new one.
    unnest_select = _select_lists(sql)[0]
    assert f"l.{q}medical_history{q}" not in unnest_select
    assert f"AS {q}medical_history{q}" in unnest_select
    _assert_no_duplicate_outputs(sql, dialect)


def test_unnest_into_a_new_column_keeps_the_source(compile_sql):
    sql, dialect = compile_sql(
        [{"name": "donors", "source": "donors"}],
        [{"unnest": {"field": "medical_history", "separator": ",", "out": "condition"}}],
    )
    q = dialect.quote_char
    unnest_select = _select_lists(sql)[0]
    assert f"l.{q}medical_history{q}" in unnest_select
    assert f"AS {q}condition{q}" in unnest_select
    _assert_no_duplicate_outputs(sql, dialect)


def test_colliding_non_key_join_columns_are_suffixed(compile_sql):
    sql, dialect = compile_sql(
        [{"name": "donors", "source": "donors"}, {"name": "samples", "source": "samples"}],
        [
            {
                "join": {"on": ["group_name", "group_name"]},
                "in": ["donors", "samples"],
                "out": "joined",
            }
        ],
    )
    q = dialect.quote_char
    # Arquero renames a non-key name present on both sides; SQL must match or
    # the relation holds two columns called `uuid`.
    assert f"AS {q}uuid_1{q}" in sql
    assert f"AS {q}uuid_2{q}" in sql
    # The key itself is deduplicated instead, and keeps its name.
    assert f"AS {q}group_name_1{q}" not in sql
    _assert_no_duplicate_outputs(sql, dialect)


def test_modulo_never_emits_a_bare_percent(compile_sql):
    sql, dialect = compile_sql(
        [{"name": "donors", "source": "donors"}],
        [
            {
                "derive": {
                    "odd": {
                        "op": "%",
                        "left": {"field": "hubmap_id"},
                        "right": {"literal": 2},
                    }
                }
            }
        ],
    )
    # pymysql builds StarRocks statements with Python %-formatting, so a `%`
    # that isn't a placeholder raises "unsupported format character".
    assert "MOD(" in sql
    assert sql.replace(dialect.placeholder, "") .count("%") == 0


def test_derive_replacing_a_column_does_not_select_star(compile_sql):
    sql, dialect = compile_sql(
        [{"name": "donors", "source": "donors"}],
        [{"derive": {"sex": {"literal": "unknown"}}}],
    )
    assert "SELECT *," not in sql
    _assert_no_duplicate_outputs(sql, dialect)


def test_derive_adding_a_column_still_uses_select_star(compile_sql):
    sql, _ = compile_sql(
        [{"name": "donors", "source": "donors"}],
        [{"derive": {"flag": {"literal": 1}}}],
    )
    assert "SELECT *," in sql


def test_a_rollup_output_replaces_the_group_key_it_shadows(compile_sql):
    """The reported failure: a stratified survival curve whose stratifier was
    bound to the same column as the subject key.

    The template groups by the subject key and rolls the stratifier's baseline
    value back up under its own name, so the two collide. Arquero writes the
    rollup's columns onto the grouped table, so the output overwrites the key —
    one column, in the key's slot. Emitting both made every later reference
    fail with "Column 'research_id' is ambiguous" on StarRocks.
    """
    sql, dialect = compile_sql(
        [{"name": "donors", "source": "donors"}],
        [
            {"groupby": "group_name"},
            {
                "rollup": {
                    "first": {"op": "min", "field": "uuid"},
                    "group_name": {"op": "max", "field": "sex"},
                }
            },
        ],
    )
    _assert_no_duplicate_outputs(sql, dialect)
    # The aggregate takes the key's position, and GROUP BY is qualified so it
    # cannot bind to the alias that now shares that name.
    assert _select_lists(sql)[0].startswith("MAX(")
    assert "GROUP BY g." in sql


def test_a_plain_rollup_is_left_exactly_as_it_was(compile_sql):
    """No shadowing, no source alias — the common path's SQL is unchanged."""
    sql, _ = compile_sql(
        [{"name": "donors", "source": "donors"}],
        [{"groupby": "group_name"}, {"rollup": {"n": {"op": "count"}}}],
    )
    assert " g GROUP BY" not in sql
    assert "GROUP BY g." not in sql
