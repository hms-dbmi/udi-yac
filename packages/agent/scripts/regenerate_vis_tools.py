"""
Regenerate template visualizations and typed tool definitions in one step.

Usage:
    python scripts/regenerate_vis_tools.py
    python scripts/regenerate_vis_tools.py --schema data/data_domains/hubmap_data_schema.json
"""

import argparse
import subprocess
import sys
from pathlib import Path

_repo_root = Path(__file__).resolve().parent.parent
_default_templates = _repo_root / "src" / "skills" / "template_visualizations.json"
_default_schema = _repo_root / "data" / "data_domains" / "hubmap_data_schema.json"
_default_tools_output = _repo_root / "src" / "generated_vis_tools.py"


def main():
    parser = argparse.ArgumentParser(
        description="Regenerate template visualizations and typed tool definitions.",
    )
    parser.add_argument(
        "--schema",
        type=str,
        default=str(_default_schema),
        help="Path to data schema JSON (default: data/data_domains/hubmap_data_schema.json)",
    )
    parser.add_argument(
        "--templates-output",
        type=str,
        default=str(_default_templates),
        help="Output path for template visualizations JSON",
    )
    parser.add_argument(
        "--tools-output",
        type=str,
        default=str(_default_tools_output),
        help="Output path for generated_vis_tools.py",
    )
    args = parser.parse_args()

    # Step 1: Generate template visualizations
    print("=== Step 1: Generating template visualizations ===")
    result = subprocess.run(
        [
            sys.executable,
            str(_repo_root / "scripts" / "template_viz_generation.py"),
            "-o", args.templates_output,
        ],
        cwd=str(_repo_root),
    )
    if result.returncode != 0:
        print("ERROR: template_viz_generation.py failed", file=sys.stderr)
        sys.exit(1)

    # Step 2: Generate typed tool definitions
    print("\n=== Step 2: Generating typed tool definitions ===")
    result = subprocess.run(
        [
            sys.executable,
            str(_repo_root / "src" / "generate_tools.py"),
            "--templates", args.templates_output,
            "--schema", args.schema,
            "--output", args.tools_output,
        ],
        cwd=str(_repo_root),
    )
    if result.returncode != 0:
        print("ERROR: generate_tools.py failed", file=sys.stderr)
        sys.exit(1)

    print("\n=== Done ===")


if __name__ == "__main__":
    main()
