#!/usr/bin/env python3
"""Convert a Cumulus Library study export into CSVs + a UDI datapackage.

A Cumulus export is a directory of Parquet files plus a `manifest.toml`:

    core__count_patient.cube.parquet     pre-aggregated powerset cube
    core__meta_date.meta.parquet         study metadata (not a cube)
    manifest.toml                        table + field documentation

Each `*.cube.parquet` is a **powerset cube**: one row per dimension-subset
combination, with the dimensions not participating in that row NULL and `cnt`
pre-aggregated over the matching source rows. This writes one CSV per Parquet
alongside the originals and emits a `datapackage.json` that tags the cubes with
`udi:cube` / `udi:dimensions` / `udi:measures`, so the chat reads them by
marginal selection instead of filtering them row-wise.

Table and field descriptions are carried over from the manifest — the export's
own documentation is better than anything inferred from the data.

RECONCILIATION. Cumulus `cnt` is a DISTINCT count (of patients, encounters, or
another FHIR resource), and a marginal's cells only sum back to the grand total
when each counted entity has exactly one value for that dimension. Two things
break that, and the conversion checks for both:

  * Small-cell suppression — Cumulus drops cells below a threshold (10), so a
    marginal can fall SHORT of the grand total. Filtered totals are then lower
    bounds, but summing is still the right operation.
  * Multi-valued dimensions — one patient can have allergies in several
    categories, so the category marginal EXCEEDS the grand total (346 vs 173
    in this export). Summing such a dimension double-counts.

An overshoot is proof the measure cannot be summed, so cubes that exhibit one
are tagged with a non-additive `udi:measure_aggregations`, and consumers
decline to re-aggregate them rather than render a plausible wrong number.
`--report` prints the evidence for every cube.

Needs duckdb (an optional agent extra); run from the repo root:

    uv run --project packages/agent --extra duckdb \
        python scripts/cumulus_to_csv.py sample-data/pcx/cube_examples_multiple
"""

from __future__ import annotations

import argparse
import csv
import json
import sys
import tomllib
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from gen_datapackage import _mark_cube, _profile_table, humanize  # noqa: E402

CUBE_SUFFIX = ".cube.parquet"
META_SUFFIX = ".meta.parquet"
MEASURE = "cnt"


def read_manifest(directory: Path) -> tuple[dict[str, str], dict[str, str], str]:
    """(table descriptions, field descriptions, study prefix) from manifest.toml."""
    path = directory / "manifest.toml"
    if not path.exists():
        return {}, {}, ""
    manifest = tomllib.loads(path.read_text(encoding="utf-8"))

    fields = {
        entry["name"]: entry.get("description", "")
        for entry in manifest.get("data_dictionary", [])
        if entry.get("name")
    }

    # Table docs live under stages.<stage>.tables; the stage name varies by
    # study ("build_core" here), so walk whatever stages exist.
    tables: dict[str, str] = {}
    for stage in manifest.get("stages", {}).values():
        for block in stage if isinstance(stage, list) else [stage]:
            for table in block.get("tables", []) if isinstance(block, dict) else []:
                if isinstance(table, dict) and table.get("name"):
                    tables[table["name"]] = table.get("description", "").strip()

    return tables, fields, manifest.get("study_prefix", "")


def default_udi_path(directory: Path) -> str:
    """Where consumers will serve this directory from.

    `sample-data/` is copied wholesale into each frontend's `public/data`, so a
    nested export keeps its subpath — using the leaf name alone would resolve
    every resource URL to a 404.
    """
    parts = directory.resolve().parts
    if "sample-data" in parts:
        tail = parts[parts.index("sample-data") + 1 :]
        return "./data/" + "/".join(tail) + "/"
    return f"./data/{directory.name}/"


def parquet_to_csv(con, parquet: Path, csv_path: Path) -> tuple[list[str], list[list[str]]]:
    """Write one Parquet as CSV; return (header, rows) as strings.

    NULL becomes an empty cell — which in a cube is exactly right: an empty
    dimension means "this row is not broken down by that dimension".
    """
    src = str(parquet).replace("'", "''")
    header = [c[0] for c in con.execute(f"DESCRIBE SELECT * FROM read_parquet('{src}')").fetchall()]
    raw = con.execute(f"SELECT * FROM read_parquet('{src}')").fetchall()
    rows = [["" if value is None else str(value) for value in row] for row in raw]
    with csv_path.open("w", newline="", encoding="utf-8") as fh:
        # csv.writer quotes values containing commas/quotes — several code
        # display names do (e.g. "Fracture of rib, left").
        writer = csv.writer(fh)
        writer.writerow(header)
        writer.writerows(rows)
    return header, rows


def reconcile(con, parquet: Path) -> tuple[int | None, dict[str, int]]:
    """(grand total, per-dimension marginal sum) for a cube.

    Comparing the two is what reveals whether `cnt` can be summed across a
    dimension at all — see the module docstring.
    """
    src = str(parquet).replace("'", "''")
    header = [c[0] for c in con.execute(f"DESCRIBE SELECT * FROM read_parquet('{src}')").fetchall()]
    dims = [c for c in header if c != MEASURE]
    if not dims:
        return None, {}
    all_null = " AND ".join(f'"{d}" IS NULL' for d in dims)
    total_row = con.execute(
        f"SELECT {MEASURE} FROM read_parquet('{src}') WHERE {all_null}"
    ).fetchone()
    if not total_row:
        return None, {}
    sums = {}
    for dim in dims:
        others = " AND ".join(f'"{d}" IS NULL' for d in dims if d != dim)
        where = f'"{dim}" IS NOT NULL' + (f" AND {others}" if others else "")
        sums[dim] = con.execute(
            f"SELECT COALESCE(SUM({MEASURE}), 0) FROM read_parquet('{src}') WHERE {where}"
        ).fetchone()[0]
    return total_row[0], sums


def max_overshoot(total: int | None, sums: dict[str, int]) -> float:
    """Largest fraction by which any marginal exceeds the grand total.

    Zero means every marginal reconciles or falls short (suppression only);
    anything above zero is a dimension the measure double-counts on.
    """
    if not total or not sums:
        return 0.0
    over = [(got - total) / total for got in sums.values() if got > total]
    return max(over) if over else 0.0


def build_resource(
    parquet: Path, csv_path: Path, header: list[str], rows: list[list[str]],
    is_cube: bool, table_docs: dict[str, str], field_docs: dict[str, str], strips: list[str],
    additive: bool = True,
) -> dict:
    table_name = parquet.name.replace(CUBE_SUFFIX, "").replace(META_SUFFIX, "")
    resource = _profile_table(humanize(table_name, strips), header, rows)
    resource["path"] = csv_path.name
    if table_docs.get(table_name):
        resource["description"] = table_docs[table_name]
    for field in resource["schema"]["fields"]:
        if field_docs.get(field["name"]):
            field["description"] = field_docs[field["name"]]
    if is_cube:
        _mark_cube(resource, [MEASURE])
        # How the measure re-aggregates when a marginal is contracted. `sum`
        # only where the data shows it can be summed; otherwise the honest
        # answer is that this is a distinct count, which consumers must refuse
        # to re-aggregate rather than double-count.
        resource["udi:measure_aggregations"] = {
            MEASURE: "sum" if additive else "count_distinct"
        }
    return resource


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("directory", help="Cumulus export directory (*.parquet + manifest.toml)")
    ap.add_argument("--name", help="package name (default: directory name)")
    ap.add_argument("--udi-path", help="udi:path consumers resolve resources against")
    ap.add_argument(
        "--strip",
        action="append",
        default=None,
        metavar="SUBSTR",
        help="substring removed from table names before humanizing (repeatable). "
        "Defaults to the manifest's '<study_prefix>__'.",
    )
    ap.add_argument("--skip-meta", action="store_true", help="convert only *.cube.parquet")
    ap.add_argument("--report", action="store_true", help="print per-cube reconciliation evidence")
    ap.add_argument(
        "--additive-tolerance",
        type=float,
        default=0.001,
        metavar="FRACTION",
        help="a marginal may exceed the grand total by this fraction and still "
        "count as summable (default 0.001). Absorbs data-quality noise — 3 of "
        "109745 encounters carry two classes — without excusing a genuinely "
        "multi-valued dimension, which overshoots by 100%% or more.",
    )
    args = ap.parse_args()

    import duckdb

    directory = Path(args.directory)
    if not directory.is_dir():
        sys.exit(f"not a directory: {directory}")

    table_docs, field_docs, prefix = read_manifest(directory)
    strips = args.strip if args.strip is not None else ([f"{prefix}__"] if prefix else [])
    name = args.name or directory.name
    udi_path = args.udi_path or default_udi_path(directory)

    parquets = sorted(directory.glob("*.parquet"))
    if not parquets:
        sys.exit(f"no .parquet files in {directory}")

    con = duckdb.connect()
    resources = []
    evidence: dict[str, tuple[int | None, dict[str, int], float]] = {}
    for parquet in parquets:
        is_cube = parquet.name.endswith(CUBE_SUFFIX)
        if not is_cube and args.skip_meta:
            continue
        csv_path = parquet.with_suffix("").with_suffix(".csv")
        header, rows = parquet_to_csv(con, parquet, csv_path)

        additive = True
        if is_cube:
            total, sums = reconcile(con, parquet)
            overshoot = max_overshoot(total, sums)
            additive = overshoot <= args.additive_tolerance
            evidence[parquet.name] = (total, sums, overshoot)

        resources.append(
            build_resource(
                parquet, csv_path, header, rows, is_cube, table_docs, field_docs, strips,
                additive,
            )
        )
        kind = "cube" if is_cube else "meta"
        note = "" if not is_cube or additive else "  NOT SUMMABLE"
        print(f"  {csv_path.name:<48} {len(rows):>7} rows  [{kind}]{note}")

    # No foreign-key inference: a pre-aggregated cube has no line-level keys,
    # and the dimension names these tables share are values, not identifiers.
    package = {
        "name": name,
        "resources": resources,
        "udi:name": name,
        "udi:path": udi_path,
    }
    out = directory / "datapackage.json"
    out.write_text(json.dumps(package, indent=2) + "\n", encoding="utf-8")
    cubes = sum(1 for r in resources if r.get("udi:cube"))
    summable = sum(
        1
        for r in resources
        if r.get("udi:measure_aggregations", {}).get(MEASURE) == "sum"
    )
    print(f"\n{out} — {len(resources)} tables ({cubes} cubes, {summable} summable)")

    if args.report:
        print("\nReconciliation — each dimension's marginal vs the grand total.")
        print("A shortfall is small-cell suppression; an excess means the measure")
        print("double-counts on that dimension and so cannot be summed.\n")
        for name, (total, sums, overshoot) in evidence.items():
            label = name.replace(CUBE_SUFFIX, "")
            if total is None:
                print(f"{label}\n  no grand-total row — cube has no all-null marginal\n")
                continue
            verdict = "summable" if overshoot <= args.additive_tolerance else "NOT SUMMABLE"
            print(f"{label}  (grand total {total}, max excess {overshoot:.1%}) — {verdict}")
            for dim, got in sums.items():
                delta = got - total
                mark = "excess" if delta > 0 else ("short" if delta < 0 else "exact")
                print(f"  {dim:<34} {got:>10} {mark:>7} {abs(delta) if delta else '':>8}")
            print()


if __name__ == "__main__":
    main()
