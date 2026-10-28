#!/usr/bin/env python3
"""Limit the pcx line-level tables to one data cohort, optionally at one site.

A patient's cohort is `data_type_cohort` on the demographics table (`radiant` or
`cbtn-non-radiant`) and their site is its `organization_name`. Every table keeps
only the rows whose `research_id` belongs to a patient in the cohort (and site),
less any `--drop` columns; row order and the data dictionary are copied
unchanged. Stdlib only:

    python3 filter_cohort.py <source-dir> <dest-dir> [--cohort radiant]
        [--site "Seattle Children's Hospital"] [--drop column ...]

This package was built with:

    python3 sample-data/pcx/combined_oct_28/filter_cohort.py \
        sample-data/pcx/line-level-kai/prelim_30_deid_tables \
        sample-data/pcx/combined_oct_28 \
        --site "Seattle Children's Hospital" \
        --drop data_type_cohort protocol_name protocol_arm
"""

import argparse
import csv
import shutil
from pathlib import Path

DEMOGRAPHICS = "pcx_30_demographics_deid.csv"
COHORT_COLUMN = "data_type_cohort"
SITE_COLUMN = "organization_name"
KEY = "research_id"


def cohort_ids(source: Path, cohort: str, site: str | None) -> set[str]:
    with open(source / DEMOGRAPHICS, newline="") as f:
        rows = list(csv.DictReader(f))
    for column, value in ((COHORT_COLUMN, cohort), (SITE_COLUMN, site)):
        values = {r[column] for r in rows}
        if value is not None and value not in values:
            raise SystemExit(f"no {column} '{value}'; {DEMOGRAPHICS} has {sorted(values)}")
    return {
        r[KEY]
        for r in rows
        if r[COHORT_COLUMN] == cohort and (site is None or r[SITE_COLUMN] == site)
    }


def filter_table(path: Path, dest: Path, ids: set[str], drop: set[str]) -> tuple[int, int]:
    with open(path, newline="") as f:
        reader = csv.DictReader(f)
        if KEY not in (reader.fieldnames or []):
            raise SystemExit(f"{path.name} has no {KEY} column")
        rows = list(reader)
        fields = [f for f in reader.fieldnames if f not in drop]
    kept = [{f: r[f] for f in fields} for r in rows if r[KEY] in ids]
    with open(dest / path.name, "w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fields, lineterminator="\n")
        writer.writeheader()
        writer.writerows(kept)
    return len(rows), len(kept)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("source", type=Path, help="directory of pcx_30_*_deid.csv tables")
    parser.add_argument("dest", type=Path, help="directory to write the filtered tables to")
    parser.add_argument("--cohort", default="radiant", help="data_type_cohort to keep")
    parser.add_argument("--site", help="organization_name to keep (default: every site)")
    parser.add_argument("--drop", nargs="*", default=[], help="columns to leave out")
    args = parser.parse_args()

    args.dest.mkdir(parents=True, exist_ok=True)
    ids = cohort_ids(args.source, args.cohort, args.site)
    print(f"{len(ids)} patients in the '{args.cohort}' cohort" + (f" at {args.site}" if args.site else ""))
    for path in sorted(args.source.glob("pcx_30_*.csv")):
        before, after = filter_table(path, args.dest, ids, set(args.drop))
        print(f"  {path.name}: {before} -> {after} rows")
    dictionary = args.source / "data_dictionary.csv"
    if dictionary.exists():
        shutil.copy2(dictionary, args.dest / dictionary.name)


if __name__ == "__main__":
    main()
