"""
Convert the large benchmark_dqvis.json (or .json.gz) into a compact JSONL layout.

Output structure under <output-dir>/benchmark_dqvis/:
    schemas.json   — {dataset_key: {dataSchema, dataDomains}} for each unique dataset
    full.jsonl     — one compact JSON object per line (no schema/domains duplication)
    small.jsonl    — ~100 items (stratified sample)
    medium.jsonl   — ~1000 items (stratified sample)
    large.jsonl    — ~10000 items (stratified sample)

Usage:
    python src/convert_benchmark_to_jsonl.py --input data/benchmark_dqvis.json.gz
    python src/convert_benchmark_to_jsonl.py --input data/benchmark_dqvis.json --output-dir data
"""

import argparse
import gzip
import json
import os
import random

import ijson


def open_input(path):
    """Open a JSON file, transparently handling .gz compression."""
    if path.endswith(".gz"):
        return gzip.open(path, "rb")
    return open(path, "rb")


def extract_dataset_key(data_schema_str):
    """Parse the dataSchema JSON string and return the dataset key (udi:name or name)."""
    schema = json.loads(data_schema_str)
    return schema.get("udi:name", schema.get("name"))


def strip_overlapping_fields(data_schema_str):
    """Remove udi:overlapping_fields from every field in every resource of a dataSchema JSON string."""
    schema = json.loads(data_schema_str)
    for resource in schema.get("resources", []):
        for field in resource.get("schema", {}).get("fields", []):
            field.pop("udi:overlapping_fields", None)
    return json.dumps(schema, separators=(",", ":"))


def pass1_extract_schemas(input_path):
    """
    Pass 1: Stream through every item and collect the unique
    {dataSchema, dataDomains} pairs keyed by dataset name.
    """
    schemas = {}       # cleaned schemas for output
    raw_schemas = {}   # raw strings for consistency checking
    count = 0
    with open_input(input_path) as f:
        for item in ijson.items(f, "item"):
            count += 1
            ds_str = item["input"]["dataSchema"]
            dd_str = item["input"]["dataDomains"]
            key = extract_dataset_key(ds_str)

            if key not in schemas:
                raw_schemas[key] = {"dataSchema": ds_str, "dataDomains": dd_str}
                schemas[key] = {
                    "dataSchema": strip_overlapping_fields(ds_str),
                    "dataDomains": dd_str,
                }
                print(f"  Found dataset: {key}")
            else:
                # Verify consistency against raw (pre-cleaning) values
                if raw_schemas[key]["dataSchema"] != ds_str:
                    raise ValueError(f"dataSchema mismatch for {key} at item {count}")
                if raw_schemas[key]["dataDomains"] != dd_str:
                    raise ValueError(f"dataDomains mismatch for {key} at item {count}")

            if count % 5000 == 0:
                print(f"  Pass 1: {count} items scanned ...")

    print(f"  Pass 1 complete: {count} items, {len(schemas)} unique datasets")
    return schemas, count


def pass2_write_jsonl(input_path, output_path, schemas):
    """
    Pass 2: Stream items again and write compact JSONL.
    Each line has dataSchema/dataDomains stripped, replaced by dataset_key.
    """
    count = 0
    with open_input(input_path) as f_in, open(output_path, "w") as f_out:
        for item in ijson.items(f_in, "item"):
            count += 1
            ds_str = item["input"]["dataSchema"]
            key = extract_dataset_key(ds_str)

            # Build compact item
            compact_input = {
                k: v
                for k, v in item["input"].items()
                if k not in ("dataSchema", "dataDomains")
            }
            compact_input["dataset_key"] = key

            compact_item = {"input": compact_input, "expected": item["expected"]}
            f_out.write(json.dumps(compact_item, separators=(",", ":")) + "\n")

            if count % 5000 == 0:
                print(f"  Pass 2: {count} items written ...")

    print(f"  Pass 2 complete: {count} items written to {output_path}")
    return count


def pass3_generate_subsets(full_jsonl_path, output_dir, subsets):
    """
    Pass 3: Read full.jsonl and generate stratified random subsets.
    Stratified by dataset_key so each subset has proportional representation.
    """
    # Load all lines grouped by dataset_key
    by_dataset = {}
    all_lines = []
    with open(full_jsonl_path, "r") as f:
        for line_num, line in enumerate(f):
            all_lines.append(line)
            item = json.loads(line)
            key = item["input"]["dataset_key"]
            if key not in by_dataset:
                by_dataset[key] = []
            by_dataset[key].append(line_num)

    total = len(all_lines)
    print(f"  Pass 3: {total} total items across {len(by_dataset)} datasets")

    rng = random.Random(42)

    for subset_name, target_size in subsets.items():
        target_size = min(target_size, total)
        selected_indices = set()

        # Stratified sampling: proportional to dataset size
        for key, indices in by_dataset.items():
            proportion = len(indices) / total
            n_for_key = max(1, round(proportion * target_size))
            n_for_key = min(n_for_key, len(indices))
            selected_indices.update(rng.sample(indices, n_for_key))

        # If we have too few, add random ones; if too many, trim
        remaining = list(set(range(total)) - selected_indices)
        if len(selected_indices) < target_size:
            extra = rng.sample(remaining, min(target_size - len(selected_indices), len(remaining)))
            selected_indices.update(extra)
        elif len(selected_indices) > target_size:
            selected_indices = set(rng.sample(list(selected_indices), target_size))

        # Write in original order
        sorted_indices = sorted(selected_indices)
        subset_path = os.path.join(output_dir, f"{subset_name}.jsonl")
        with open(subset_path, "w") as f:
            for idx in sorted_indices:
                f.write(all_lines[idx])

        print(f"  {subset_name}.jsonl: {len(sorted_indices)} items")


def main():
    parser = argparse.ArgumentParser(
        description="Convert benchmark JSON to compact JSONL format"
    )
    parser.add_argument(
        "--input",
        default="data/benchmark_dqvis.json",
        help="Path to the input benchmark JSON file (supports .gz)",
    )
    parser.add_argument(
        "--output-dir",
        default="data",
        help="Parent directory for output (default: data). Creates benchmark_dqvis/ subdirectory.",
    )
    args = parser.parse_args()

    out_dir = os.path.join(args.output_dir, "benchmark_dqvis")
    os.makedirs(out_dir, exist_ok=True)

    schemas_path = os.path.join(out_dir, "schemas.json")
    full_jsonl_path = os.path.join(out_dir, "full.jsonl")

    # Pass 1: Extract unique schemas
    print("Pass 1: Extracting unique schemas ...")
    schemas, total_count = pass1_extract_schemas(args.input)

    # Write schemas.json
    with open(schemas_path, "w") as f:
        json.dump(schemas, f, separators=(",", ":"))
    schema_size = os.path.getsize(schemas_path)
    print(f"  schemas.json: {schema_size / 1024:.0f} KB ({len(schemas)} datasets)")

    # Pass 2: Write compact JSONL
    print("Pass 2: Writing compact JSONL ...")
    pass2_write_jsonl(args.input, full_jsonl_path, schemas)
    full_size = os.path.getsize(full_jsonl_path)
    print(f"  full.jsonl: {full_size / 1024 / 1024:.0f} MB")

    # Pass 3: Generate subsets
    print("Pass 3: Generating subsets ...")
    subsets = {"small": 100, "medium": 1000, "large": 10000}
    pass3_generate_subsets(full_jsonl_path, out_dir, subsets)

    print("\nDone! Output directory:", out_dir)


if __name__ == "__main__":
    main()
