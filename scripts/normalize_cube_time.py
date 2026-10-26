#!/usr/bin/env python3
"""Copy a marginal cube, making its time dimension numeric.

A survival curve needs a numeric time axis, and the grammar has no way to get
there from a string: Arquero coerces `'11' * 1` to 11 but DuckDB rejects
`VARCHAR * INTEGER` outright, so a stringly-typed month column cannot be plotted
without breaking parity between the two executors.

Two things stand between this cube's month column and being numeric:

  * a top-coded bucket (`>=60`), which is remapped to its lower bound. That is a
    modelling choice — it plots "60 or more months" AT 60 — and it is why this is
    a flag rather than a default.
  * a not-applicable bucket, whose rows are dropped. Their follow-up time is
    unknown, so they cannot be placed on a time axis at all. They cannot be
    nulled either: in a cube a null dimension already means "this row aggregates
    over that dimension", so an unknown value has no spelling.

Rows where the time dimension is NULL are untouched, so every marginal that
aggregates over time keeps its original counts. Marginals that DO break out time
lose the dropped rows, which is correct — those patients are not analysable on a
time axis — but it means the cube's grand total is no longer the sum of a
time-active marginal. Templates take their denominator from the marginal they
select, so they stay internally consistent.

Stdlib only:

    python3 scripts/normalize_cube_time.py \\
        sample-data/pcx/cube_pcx_30 sample-data/pcx_efs_cube \\
        --time-column event_free_survival_months --top-coded '>=60=60' \\
        --drop 'Not Applicable'
"""

import argparse
import csv
import shutil
import sys
from pathlib import Path


def normalize(src: Path, dest: Path, column: str, remap: dict, drop: set) -> None:
    dest.mkdir(parents=True, exist_ok=True)
    csvs = sorted(src.glob("*.csv"))
    if not csvs:
        sys.exit(f"no .csv files in {src}")

    for path in csvs:
        with path.open(newline="", encoding="utf-8") as fh:
            reader = csv.DictReader(fh)
            if reader.fieldnames is None or column not in reader.fieldnames:
                sys.exit(
                    f"{path.name}: no column {column!r} "
                    f"(has: {', '.join(reader.fieldnames or [])})"
                )
            fieldnames = reader.fieldnames
            rows = list(reader)

        kept, remapped, dropped = [], 0, 0
        for row in rows:
            value = row[column]
            if value in drop:
                dropped += 1
                continue
            if value in remap:
                row[column] = remap[value]
                remapped += 1
            kept.append(row)

        out = dest / path.name
        with out.open("w", newline="", encoding="utf-8") as fh:
            writer = csv.DictWriter(fh, fieldnames=fieldnames)
            writer.writeheader()
            writer.writerows(kept)

        # Report whether the column is now usable as a time axis, rather than
        # assuming the two rules covered everything in it.
        leftovers = sorted(
            {
                r[column]
                for r in kept
                if r[column] != "" and not _is_number(r[column])
            }
        )
        print(f"{path.name}: {len(rows)} rows -> {len(kept)} ({dropped} dropped)")
        print(f"  {remapped} rows remapped in {column!r}")
        if leftovers:
            print(
                f"  !! still non-numeric in {column!r}: {leftovers} — "
                "the column stays nominal and will not plot as time"
            )
        else:
            print(f"  {column!r} is now numeric wherever it is set")
        print(f"  wrote {out}")


def _is_number(s: str) -> bool:
    try:
        float(s)
    except ValueError:
        return False
    return True


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("src", type=Path, help="cube directory to copy from")
    ap.add_argument("dest", type=Path, help="directory to write the copy into")
    ap.add_argument("--time-column", required=True, help="the dimension to make numeric")
    ap.add_argument(
        "--top-coded",
        action="append",
        default=[],
        metavar="LABEL=VALUE",
        help="remap a top-coded bucket to a number, e.g. --top-coded '>=60=60' (repeatable)",
    )
    ap.add_argument(
        "--drop",
        action="append",
        default=[],
        metavar="LABEL",
        help="drop rows whose time value is this label (repeatable)",
    )
    args = ap.parse_args()

    remap = {}
    for item in args.top_coded:
        label, sep, value = item.rpartition("=")
        if not sep or not label:
            sys.exit(f"--top-coded expects LABEL=VALUE, got {item!r}")
        if not _is_number(value):
            sys.exit(f"--top-coded {item!r}: {value!r} is not a number")
        remap[label] = value

    if not args.src.is_dir():
        sys.exit(f"not a directory: {args.src}")
    normalize(args.src, args.dest, args.time_column, remap, set(args.drop))


if __name__ == "__main__":
    main()
