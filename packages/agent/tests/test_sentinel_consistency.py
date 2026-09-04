"""gen_datapackage and the seed scripts must agree on what "no value" means.

A column of day-offsets sprinkled with "Not Available" is quantitative in the
database (the seeders null the sentinels) — so if the datapackage generator
does not apply the same rule, the package calls that column a category while
the database calls it a number, and the chart cannot plot ages.
"""

import importlib.util
from pathlib import Path

import pytest

_REPO_ROOT = Path(__file__).resolve().parents[3]
_GEN = _REPO_ROOT / "scripts" / "gen_datapackage.py"
_SEED = Path(__file__).resolve().parents[1] / "scripts" / "seed_starrocks.py"


def _load(path: Path, name: str):
    if not path.exists():
        pytest.skip(f"{path} not present (installed package, not the monorepo)")
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_null_sentinels_match():
    gen = _load(_GEN, "gen_datapackage")
    seed = _load(_SEED, "seed_starrocks")
    assert gen.NULL_SENTINELS == seed.DEFAULT_NULL_SENTINELS, (
        "scripts/gen_datapackage.py NULL_SENTINELS and "
        "packages/agent/scripts/seed_starrocks.py DEFAULT_NULL_SENTINELS "
        "have drifted; a column would be typed differently in the package "
        "than in the database."
    )


def test_numeric_with_sentinels_is_quantitative_in_both():
    """The pcx case: day offsets with a couple of 'Not Available' cells."""
    gen = _load(_GEN, "gen_datapackage")
    seed = _load(_SEED, "seed_starrocks")

    header = ["age_days"]
    rows = [["456"], ["Not Available"], ["1736"], ["not applicable"]]
    field = gen._profile_table("t", header, rows)["schema"]["fields"][0]
    assert field["udi:data_type"] == "quantitative"
    # Sentinels load as NULL, so they are not distinct values.
    assert field["udi:cardinality"] == 2

    is_sentinel = [v[0] for v in rows if seed._is_number(v[0])]
    assert is_sentinel == ["456", "1736"]


def test_a_real_category_column_with_a_sentinel_stays_nominal():
    gen = _load(_GEN, "gen_datapackage")
    rows = [["alive"], ["Not Reported"], ["deceased"]]
    field = gen._profile_table("t", ["status"], rows)["schema"]["fields"][0]
    assert field["udi:data_type"] == "nominal"
    assert field["udi:cardinality"] == 3, "sentinels are real categories here"
