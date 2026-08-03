"""Tests for sentinel-aware CSV ingestion in the StarRocks seed script:
placeholder strings ("Not Reported", ...) become NULL in otherwise-numeric
columns so they seed as numeric types (enabling interval domains and
brushing), while categorical columns keep them as real values."""

import sys
from pathlib import Path

_SCRIPTS = Path(__file__).resolve().parents[1] / "scripts"
sys.path.insert(0, str(_SCRIPTS))

from seed_starrocks import DEFAULT_NULL_SENTINELS, read_csv  # noqa: E402


def _write_csv(tmp_path: Path, text: str) -> Path:
    path = tmp_path / "t.csv"
    path.write_text(text)
    return path


def _entry(path: Path, quantitative=None) -> dict:
    return {"csv_path": path, "quantitative": quantitative}


def test_numeric_column_with_sentinels_becomes_numeric_with_nulls(tmp_path):
    path = _write_csv(
        tmp_path,
        "start_date,category\n"
        "10,Not Reported\n"
        "Not Available,alpha\n"
        "-3.5,Not Applicable\n"
        "Not Reported,beta\n",
    )
    header, rows, quantitative = read_csv(_entry(path))

    assert quantitative == {"start_date"}
    start = [r[0] for r in rows]
    assert start == ["10", None, "-3.5", None]
    # Categorical column KEEPS sentinel strings as real category values.
    assert [r[1] for r in rows] == ["Not Reported", "alpha", "Not Applicable", "beta"]


def test_column_with_genuine_strings_stays_varchar(tmp_path):
    # One real (non-sentinel) string among numbers -> VARCHAR, nothing nulled.
    path = _write_csv(tmp_path, "v\n1\n2\npending review\n")
    _, rows, quantitative = read_csv(_entry(path))
    assert quantitative == set()
    assert [r[0] for r in rows] == ["1", "2", "pending review"]


def test_all_sentinel_column_uses_datapackage_hint(tmp_path):
    path = _write_csv(tmp_path, "v\nNot Reported\nNot Available\n")
    # Without a hint: no numeric evidence -> VARCHAR, values kept.
    _, rows, quantitative = read_csv(_entry(path))
    assert quantitative == set()
    assert [r[0] for r in rows] == ["Not Reported", "Not Available"]
    # With the datapackage typing it quantitative -> numeric, all NULL.
    _, rows, quantitative = read_csv(_entry(path, quantitative={"v"}))
    assert quantitative == {"v"}
    assert [r[0] for r in rows] == [None, None]


def test_custom_sentinels_extend_defaults(tmp_path):
    path = _write_csv(tmp_path, "v\n1\nPENDING\n")
    sentinels = frozenset(DEFAULT_NULL_SENTINELS | {"pending"})
    _, rows, quantitative = read_csv(_entry(path), sentinels)
    assert quantitative == {"v"}
    assert [r[0] for r in rows] == ["1", None]


def test_sentinel_matching_is_case_insensitive(tmp_path):
    path = _write_csv(tmp_path, "v\n1\nNOT REPORTED\nnot available\n")
    _, rows, quantitative = read_csv(_entry(path))
    assert quantitative == {"v"}
    assert [r[0] for r in rows] == ["1", None, None]
