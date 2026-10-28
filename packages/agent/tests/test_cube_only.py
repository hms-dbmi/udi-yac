"""The `only` transformation and expand -> filter -> contract, server-side.

A pre-aggregated cube is read by marginal selection: the rows where exactly
the wanted dimensions are populated and every other dimension is null.
Filtering one therefore cannot be a prepended predicate — a per-species chart
reads rows where `island IS NULL`, so `island IN ('Biscoe')` on top of it is
unsatisfiable. The correct pipeline expands to a wider marginal, filters
there, and contracts back.

These assert the same numeric identities the toolkit's Arquero executor is
held to (packages/chat/.../cubeFilters.test.ts and
packages/grammar/test/cube-only.mjs), against the committed penguins cube —
so the two compilers agree by construction rather than by inspection.
"""

import csv
from pathlib import Path

import pytest

from udiagent.query import DuckDBConnector, QueryEngine, UnsupportedQueryError

_REPO_ROOT = Path(__file__).resolve().parents[3]
_CUBE_CSV = _REPO_ROOT / "sample-data" / "penguins_cube" / "penguins_cube.csv"

ENTITY = "penguin_counts"
DIMENSIONS = ["species", "island", "sex"]


@pytest.fixture(scope="module")
def cube_rows() -> list[dict]:
    with _CUBE_CSV.open(newline="", encoding="utf-8") as fh:
        rows = list(csv.DictReader(fh))
    # An empty dimension cell means "not part of this marginal" — null.
    for row in rows:
        for dim in DIMENSIONS:
            if row[dim] == "":
                row[dim] = None
        row["cnt"] = int(row["cnt"])
    return rows


@pytest.fixture(scope="module")
def engine() -> QueryEngine:
    connector = DuckDBConnector(views={ENTITY: str(_CUBE_CSV)})
    return QueryEngine(
        connector,
        table_map={ENTITY: ENTITY},
        entity_schemas={
            ENTITY: {
                "udi:cube": True,
                "udi:dimensions": DIMENSIONS,
                "udi:measures": ["cnt", "mean_body_mass_g"],
            }
        },
    )


def marginal(rows: list[dict], dims: list[str]) -> list[dict]:
    """The cells of one marginal, as the cube stores them."""
    return [
        r
        for r in rows
        if all((r[d] is not None) == (d in dims) for d in DIMENSIONS)
    ]


def run(engine, transformation, selections=None):
    return engine.run_query(
        source={"name": ENTITY, "source": str(_CUBE_CSV)},
        transformation=transformation,
        selections=selections,
    )["displayData"]


def test_only_selects_a_marginal(engine, cube_rows):
    result = run(engine, [{"only": ["species"]}])
    expected = {r["species"]: r["cnt"] for r in marginal(cube_rows, ["species"])}
    assert {r["species"]: r["cnt"] for r in result} == expected
    # Every other dimension is null in the selected rows, by definition.
    assert all(r["island"] is None and r["sex"] is None for r in result)


def test_only_empty_selects_the_grand_total(engine, cube_rows):
    result = run(engine, [{"only": []}])
    assert len(result) == 1
    assert result[0]["cnt"] == marginal(cube_rows, [])[0]["cnt"]


def test_only_accepts_a_bare_string(engine):
    assert run(engine, [{"only": "species"}]) == run(engine, [{"only": ["species"]}])


def test_only_resolves_dimensions_inline_without_configured_metadata():
    """The escape hatch for sources whose cube roles aren't configured."""
    bare = QueryEngine(
        DuckDBConnector(views={ENTITY: str(_CUBE_CSV)}), table_map={ENTITY: ENTITY}
    )
    rows = bare.run_query(
        source={"name": ENTITY, "source": str(_CUBE_CSV)},
        transformation=[{"only": ["species"], "dimensions": DIMENSIONS}],
    )["displayData"]
    assert len(rows) == 3


def test_only_without_dimensions_is_an_explicit_error():
    bare = QueryEngine(
        DuckDBConnector(views={ENTITY: str(_CUBE_CSV)}), table_map={ENTITY: ENTITY}
    )
    with pytest.raises(UnsupportedQueryError, match="cube dimensions"):
        bare.run_query(
            source={"name": ENTITY, "source": str(_CUBE_CSV)},
            transformation=[{"only": ["species"]}],
        )


def test_only_rejects_a_non_dimension_field(engine):
    with pytest.raises(UnsupportedQueryError, match="non-dimension"):
        run(engine, [{"only": ["bill_length_mm"]}])


def test_prepended_filter_on_a_marginal_is_empty(engine):
    """The defect this operator exists to fix, pinned so it can't come back.

    Filtering the species marginal by island asks for rows where island is
    both a value and null.
    """
    result = run(
        engine,
        [
            {
                "filter": {
                    "op": "==",
                    "left": {"field": "island"},
                    "right": {"literal": "Biscoe"},
                }
            },
            {"only": ["species"]},
        ],
    )
    assert result == []


def _expand_filter_contract(selection_field: str) -> list[dict]:
    return [
        {"only": ["species", selection_field]},
        {"filter": {"name": "sel"}},
        {"groupby": ["species"]},
        {"rollup": {"cnt": {"op": "sum", "field": "cnt"}}},
    ]


def test_expand_filter_contract_matches_the_joint_cells(engine, cube_rows):
    islands = ["Biscoe"]
    selections = {
        "sel": {
            "dataSourceKey": ENTITY,
            "type": "point",
            "selection": {"island": islands},
        }
    }
    result = run(engine, _expand_filter_contract("island"), selections)

    expected: dict[str, int] = {}
    for cell in marginal(cube_rows, ["species", "island"]):
        if cell["island"] not in islands:
            continue
        expected[cell["species"]] = expected.get(cell["species"], 0) + cell["cnt"]

    assert {r["species"]: r["cnt"] for r in result} == expected
    # ...and it genuinely narrows the data.
    total = sum(r["cnt"] for r in result)
    assert total < sum(r["cnt"] for r in marginal(cube_rows, ["species"]))


def test_selecting_every_value_reproduces_the_stored_marginal(engine, cube_rows):
    """Contraction is exact: summing the joint cells recovers the marginal
    the cube stores directly."""
    islands = [r["island"] for r in marginal(cube_rows, ["island"])]
    selections = {
        "sel": {
            "dataSourceKey": ENTITY,
            "type": "point",
            "selection": {"island": islands},
        }
    }
    result = run(engine, _expand_filter_contract("island"), selections)
    expected = {r["species"]: r["cnt"] for r in marginal(cube_rows, ["species"])}
    assert {r["species"]: r["cnt"] for r in result} == expected


def test_introspect_exposes_cube_roles_on_the_resource(engine):
    """The chat reads udi:cube / udi:dimensions off the RESOURCE, not its
    schema — otherwise a remote cube looks like an ordinary table and gets
    filtered row-wise."""
    from udiagent.query.introspect import introspect

    metadata = introspect(engine, "penguins_cube")
    resource = next(
        r for r in metadata["dataSchema"]["resources"] if r["name"] == ENTITY
    )
    assert resource["udi:cube"] is True
    assert resource["udi:dimensions"] == DIMENSIONS
    assert resource["udi:measures"] == ["cnt", "mean_body_mass_g"]
    # ...and they did not leak into the schema alongside primaryKey/foreignKeys.
    assert "udi:dimensions" not in resource["schema"]


def test_grand_total_contracts_to_one_row(engine, cube_rows):
    selections = {
        "sel": {
            "dataSourceKey": ENTITY,
            "type": "point",
            "selection": {"island": ["Biscoe"]},
        }
    }
    result = run(
        engine,
        [
            {"only": ["island"]},
            {"filter": {"name": "sel"}},
            {"rollup": {"count": {"op": "sum", "field": "cnt"}}},
        ],
        selections,
    )
    expected = next(
        r["cnt"] for r in marginal(cube_rows, ["island"]) if r["island"] == "Biscoe"
    )
    assert result == [{"count": expected}]
