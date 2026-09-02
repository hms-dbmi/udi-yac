#!/usr/bin/env python3
"""Generate a UDI frictionless datapackage.json from a directory of CSVs.

Computes the `udi:` fields YAC expects (cardinality, unique, data_type,
overlapping_fields, row/column counts) and infers foreign keys from shared
key columns, so a folder of related CSVs becomes a queryable data package.

Stdlib only — run without installing anything:

    python3 scripts/gen_datapackage.py sample-data/pcx

Writes <dir>/datapackage.json. See sample-data/readme.md for the format.
Run `python3 scripts/gen_datapackage.py --selftest` to check the inference.
"""

import argparse
import csv
import json
import re
import sys
from pathlib import Path


def humanize(stem: str, strips: list[str]) -> str:
    """Turn a file stem into a readable table name.

    e.g. humanize("pcx_30_medical_therapy_level_deid", ["pcx_30_", "_level_deid"])
    -> "Medical Therapy". Strips are removed first, then _/-/space split, pure-digit
    tokens dropped, words title-cased. Falls back to the raw stem if nothing's left.
    """
    s = stem
    for strip in strips:
        s = s.replace(strip, "")
    words = [w for w in re.split(r"[_\-\s]+", s) if w and not w.isdigit()]
    return " ".join(w[:1].upper() + w[1:] for w in words) if words else stem


def _is_number(s: str) -> bool:
    s = s.strip()
    if not s:
        return False
    try:
        float(s)
    except ValueError:
        return False
    # float() accepts these but they aren't data values
    return s.lower() not in ("nan", "inf", "-inf", "+inf", "infinity")


def _profile_table(name: str, header: list[str], rows: list[list[str]]) -> dict:
    n = len(rows)
    fields = []
    # present[c] = set of row indices where column c is non-empty
    present = [set() for _ in header]
    for i, row in enumerate(rows):
        for c, cell in enumerate(row):
            if cell.strip():
                present[c].add(i)

    # overlapping_fields[c] = columns non-null together with c on some row
    overlaps = [set() for _ in header]
    for i in range(n):
        here = [c for c in range(len(header)) if i in present[c]]
        for c in here:
            overlaps[c].update(here)

    for c, col in enumerate(header):
        vals = [rows[i][c].strip() for i in present[c]]
        distinct = set(vals)
        card = len(distinct)
        is_num = card > 0 and all(_is_number(v) for v in vals)
        unique = card == n and len(vals) == n  # one distinct value on every row
        overlapping = [header[j] for j in range(len(header)) if j in overlaps[c]]
        fields.append(
            {
                "name": col,
                "type": "number" if is_num else "string",
                "description": "",
                "udi:cardinality": card,
                "udi:unique": unique,
                "udi:data_type": "quantitative" if is_num else "nominal",
                "udi:overlapping_fields": "all"
                if len(overlapping) == len(header)
                else overlapping,
            }
        )

    schema = {"fields": fields, "foreignKeys": []}
    pk = next((f["name"] for f in fields if f["udi:unique"]), None)
    if pk:
        schema["primaryKey"] = [pk]

    return {
        "name": name,
        "type": "table",
        "path": Path(name).name,  # placeholder; real filename set by caller
        "scheme": "file",
        "format": "csv",
        "mediatype": "text/csv",
        "encoding": "utf-8",
        "udi:row_count": n,
        "udi:column_count": len(header),
        "schema": schema,
    }


def _infer_foreign_keys(resources: list[dict]) -> None:
    """Link tables on shared columns that are unique in at least one table.

    Single-column keys only; a table where the shared column is unique can serve
    as the parent (many->one). A column unique in NO table is left unlinked —
    declare those by hand.

    When the column is unique in SEVERAL tables the widest key space wins (most
    distinct values, then name order to stay deterministic). Two one-row-per-key
    tables are genuinely ambiguous in direction, but the covering side is the
    safer parent, and refusing to choose is worse than choosing: it used to drop
    the column entirely, taking with it the unambiguous links from every *other*
    table. Pruning pcx's demographics table to its cohort did exactly that —
    `research_id` became unique in Demographics as well as Patient, and all five
    of the package's foreign keys silently disappeared.
    """
    cols_by_table = {r["name"]: {f["name"] for f in r["schema"]["fields"]} for r in resources}
    unique_cols = {
        r["name"]: {f["name"] for f in r["schema"]["fields"] if f["udi:unique"]}
        for r in resources
    }
    # Distinct-value counts per (table, column), for the tiebreak below.
    cardinality = {
        (r["name"], f["name"]): f["udi:cardinality"]
        for r in resources
        for f in r["schema"]["fields"]
    }
    shared = {c for a in cols_by_table.values() for c in a}
    shared = {c for c in shared if sum(c in cols for cols in cols_by_table.values()) >= 2}

    for col in sorted(shared):
        parents = [name for name, u in unique_cols.items() if col in u]
        if not parents:
            continue
        parent = max(parents, key=lambda name: (cardinality[(name, col)], name))
        for r in resources:
            if r["name"] == parent or col not in cols_by_table[r["name"]]:
                continue
            r["schema"]["foreignKeys"].append(
                {
                    "fields": [col],
                    "reference": {"fields": [col], "resource": parent},
                    "udi:cardinality": {"from": "many", "to": "one"},
                }
            )


def _annotate_cube(res: dict, measure: str) -> None:
    """Mark a resource as a pre-aggregated marginal cube.

    A cube row is a count (or other measure) over whichever dimensions are
    non-null; a null dimension means the row aggregates over it, so the same
    table holds the grand total, every one-way marginal, and every combination.
    Consumers need to know which column is the measure and which are dimensions
    — it cannot be inferred, since a dimension is just a nullable column — so it
    is declared here and read back through the schema by the `<M>` and
    `<MARGINAL:...>` placeholders.
    """
    names = [f["name"] for f in res["schema"]["fields"]]
    if measure not in names:
        sys.exit(f"{res['name']}: --measure {measure!r} is not a column (has: {', '.join(names)})")
    res["udi:cube"] = True
    res["udi:measures"] = [measure]
    res["udi:dimensions"] = [n for n in names if n != measure]
    for field in res["schema"]["fields"]:
        if field["name"] == measure:
            field["description"] = "Cube measure: the aggregated value for this row."
        else:
            field["description"] = (
                f"Cube dimension: {field['name']}. Null when the row aggregates "
                "over this dimension."
            )


def build_package(
    csv_dir: Path, name: str, udi_path: str, strips: list[str], measure: str | None = None
) -> dict:
    resources = []
    for path in sorted(csv_dir.glob("*.csv")):
        with path.open(newline="", encoding="utf-8") as fh:
            reader = csv.reader(fh)
            header = next(reader)
            rows = [r for r in reader if any(cell.strip() for cell in r)]
        # name is the entity key (FK refs, source resolver, agent specs) — must be unique
        res = _profile_table(humanize(path.stem, strips), header, rows)
        res["path"] = path.name
        if measure:
            _annotate_cube(res, measure)
        resources.append(res)

    if not resources:
        sys.exit(f"no .csv files found in {csv_dir}")

    names = [r["name"] for r in resources]
    if len(set(names)) != len(names):
        sys.exit(f"table names collide after humanizing: {names} — adjust --strip")

    if not measure:
        _infer_foreign_keys(resources)
    return {
        "name": name,
        "resources": resources,
        "udi:name": name,
        "udi:path": udi_path,
    }


def _selftest() -> None:
    import io

    assert humanize("pcx_30_medical_therapy_level_deid", ["pcx_30_", "_level_deid"]) == (
        "Medical Therapy"
    ), humanize("pcx_30_medical_therapy_level_deid", ["pcx_30_", "_level_deid"])
    assert humanize("donors", []) == "Donors"
    assert humanize("123", []) == "123"  # all-digit -> fall back to raw stem

    def prof(rows_csv, name="t"):
        r = list(csv.reader(io.StringIO(rows_csv)))
        return _profile_table(name, r[0], r[1:])

    parent = prof("id,x\n1,a\n2,b\n3,\n", "parent")
    child = prof("id,y\n1,q\n1,r\n2,s\n", "child")
    idf = parent["schema"]["fields"][0]
    assert idf["udi:cardinality"] == 3 and idf["udi:unique"], idf
    assert idf["udi:data_type"] == "quantitative", idf  # 1,2,3 -> numeric
    xf = parent["schema"]["fields"][1]
    assert xf["udi:cardinality"] == 2 and not xf["udi:unique"], xf  # empty 3rd row
    # x is only non-null with id on rows 0,1 -> overlaps {id,x}, which is all cols
    assert xf["udi:overlapping_fields"] == "all", xf
    assert parent["schema"]["primaryKey"] == ["id"], parent["schema"]

    _infer_foreign_keys([parent, child])
    assert parent["schema"]["foreignKeys"] == [], parent["schema"]["foreignKeys"]
    assert child["schema"]["foreignKeys"] == [
        {
            "fields": ["id"],
            "reference": {"fields": ["id"], "resource": "parent"},
            "udi:cardinality": {"from": "many", "to": "one"},
        }
    ], child["schema"]["foreignKeys"]

    # Two tables in which the key is unique, plus a third where it is not: the
    # wider key space is the parent, and the narrow unique table becomes a child
    # of it rather than the whole column being abandoned. This is the pcx shape —
    # Patient (69 ids) / Demographics (65) / Event (many rows per id) — and it
    # regressed to zero foreign keys when the ambiguity was treated as fatal.
    wide = prof("id,x\n1,a\n2,b\n3,c\n", "wide")
    narrow = prof("id,y\n1,q\n2,r\n", "narrow")
    many = prof("id,z\n1,m\n1,n\n2,o\n", "many")
    _infer_foreign_keys([narrow, wide, many])
    assert wide["schema"]["foreignKeys"] == [], wide["schema"]["foreignKeys"]
    for table in (narrow, many):
        assert table["schema"]["foreignKeys"] == [
            {
                "fields": ["id"],
                "reference": {"fields": ["id"], "resource": "wide"},
                "udi:cardinality": {"from": "many", "to": "one"},
            }
        ], (table["name"], table["schema"]["foreignKeys"])

    print("selftest OK")


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("csv_dir", nargs="?", help="directory containing the CSVs")
    ap.add_argument("--name", help="package name (default: directory name)")
    ap.add_argument(
        "--udi-path",
        help="udi:path consumers resolve resources against (default: ./data/<dir>/)",
    )
    ap.add_argument(
        "--strip",
        action="append",
        default=[],
        metavar="SUBSTR",
        help="substring to remove from file names before humanizing table names "
        "(repeatable), e.g. --strip pcx_30_ --strip _level_deid",
    )
    ap.add_argument(
        "--measure",
        help="treat the directory as a pre-aggregated marginal CUBE: this column is "
        "the measure, every other column a dimension (null = aggregated over). "
        "Skips foreign-key inference, which is meaningless for a cube.",
    )
    ap.add_argument("-o", "--out", help="output path (default: <dir>/datapackage.json)")
    ap.add_argument("--selftest", action="store_true", help="run inference self-check and exit")
    args = ap.parse_args()

    if args.selftest:
        _selftest()
        return
    if not args.csv_dir:
        ap.error("csv_dir is required")

    csv_dir = Path(args.csv_dir)
    name = args.name or csv_dir.name
    udi_path = args.udi_path or f"./data/{csv_dir.name}/"
    out = Path(args.out) if args.out else csv_dir / "datapackage.json"

    pkg = build_package(csv_dir, name, udi_path, args.strip, args.measure)
    out.write_text(json.dumps(pkg, indent=2) + "\n", encoding="utf-8")

    fks = sum(len(r["schema"]["foreignKeys"]) for r in pkg["resources"])
    print(f"{out} — {len(pkg['resources'])} tables, {fks} foreign key(s) inferred")
    for r in pkg["resources"]:
        for fk in r["schema"]["foreignKeys"]:
            print(f"  {r['name']}.{fk['fields'][0]} -> {fk['reference']['resource']}")


if __name__ == "__main__":
    main()
