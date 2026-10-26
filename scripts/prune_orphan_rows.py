#!/usr/bin/env python3
"""Drop rows from a CSV whose key does not appear in a parent CSV.

A source export often carries a whole registry in one table while the rest of
the package covers a cohort — pcx ships 2571 demographics rows for 69 patients.
Those extra rows are not harmless: every count, cardinality and domain computed
over that table describes a population none of the other tables can join to, so
a chart of `gender` silently answers a different question than a chart of
anything else. Pruning them makes the package internally consistent, and has to
happen BEFORE gen_datapackage.py so the metadata it derives is consistent too.

Stdlib only — run without installing anything:

    python3 scripts/prune_orphan_rows.py \\
        sample-data/pcx/pcx_30_demographics_deid.csv \\
        sample-data/pcx/pcx_30_patient_level_deid.csv \\
        --key research_id

Rewrites the child CSV in place, preserving column order and row order.
Idempotent: running it again reports 0 dropped, so it is safe to leave in a
refresh chain that re-runs after every re-import.
"""

import argparse
import csv
import sys
from pathlib import Path


def read_keys(path: Path, key: str) -> set[str]:
    """The set of values of `key` in `path`."""
    with path.open(newline="") as handle:
        reader = csv.DictReader(handle)
        if reader.fieldnames is None or key not in reader.fieldnames:
            sys.exit(
                f"{path}: no column {key!r} (has: {', '.join(reader.fieldnames or [])})"
            )
        return {row[key] for row in reader}


def prune(child: Path, parent: Path, key: str, dry_run: bool) -> int:
    """Keep only child rows whose `key` is present in parent. Returns rows dropped."""
    keep_keys = read_keys(parent, key)

    with child.open(newline="") as handle:
        reader = csv.DictReader(handle)
        if reader.fieldnames is None or key not in reader.fieldnames:
            sys.exit(
                f"{child}: no column {key!r} "
                f"(has: {', '.join(reader.fieldnames or [])})"
            )
        fieldnames = reader.fieldnames
        rows = list(reader)

    kept = [row for row in rows if row[key] in keep_keys]
    dropped = len(rows) - len(kept)

    print(f"{child.name}: {len(rows)} rows -> {len(kept)} ({dropped} dropped)")
    print(f"  matched against {len(keep_keys)} distinct {key} in {parent.name}")
    # Parent keys with no child row are reported but never invented: this prunes,
    # it does not backfill, and a caller comparing the two counts should know the
    # kept total can be short of the parent's.
    orphan_parents = keep_keys - {row[key] for row in kept}
    if orphan_parents:
        print(
            f"  note: {len(orphan_parents)} {key} in {parent.name} have no "
            f"{child.name} row; nothing was added for them"
        )

    if dropped and not dry_run:
        # newline="" so the writer controls line endings, matching csv's contract.
        with child.open("w", newline="") as handle:
            writer = csv.DictWriter(handle, fieldnames=fieldnames)
            writer.writeheader()
            writer.writerows(kept)
        print(f"  wrote {child}")
    elif dry_run:
        print("  --dry-run: not written")

    return dropped


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Drop CSV rows whose key is absent from a parent CSV."
    )
    parser.add_argument("child", type=Path, help="CSV to prune (rewritten in place)")
    parser.add_argument("parent", type=Path, help="CSV whose keys are kept")
    parser.add_argument(
        "--key", default="research_id", help="Shared key column (default: research_id)"
    )
    parser.add_argument(
        "--dry-run", action="store_true", help="Report what would change, write nothing"
    )
    args = parser.parse_args()

    for path in (args.child, args.parent):
        if not path.is_file():
            sys.exit(f"not a file: {path}")

    prune(args.child, args.parent, args.key, args.dry_run)


if __name__ == "__main__":
    main()
