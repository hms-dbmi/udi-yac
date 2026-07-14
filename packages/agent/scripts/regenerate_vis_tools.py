"""Regenerate the visualization templates and the combined typed tool module.

Rebuilds, deterministically and tag-aware:
  1a. line-item templates  -> data/skills/template_visualizations.json      (tags: line_item)
  1b. data-cube templates  -> data/skills/template_visualizations_cube.json (tags: data_cube)
  2.  combined typed tools -> generated_vis_tools.py (schema-independent, with TOOL_TAGS)

Usage:
    python scripts/regenerate_vis_tools.py
"""

import subprocess
import sys
from pathlib import Path

_repo_root = Path(__file__).resolve().parent.parent
_scripts = _repo_root / "scripts"
_skills = _repo_root / "src" / "udiagent" / "data" / "skills"
_line_item_templates = _skills / "template_visualizations.json"
_cube_templates = _skills / "template_visualizations_cube.json"
_generate_tools = _repo_root / "src" / "udiagent" / "generate_tools.py"
_tools_output = _repo_root / "src" / "udiagent" / "generated_vis_tools.py"


def _run(step, cmd):
    print(f"\n=== {step} ===")
    result = subprocess.run(cmd, cwd=str(_repo_root))
    if result.returncode != 0:
        print(f"ERROR: {step} failed", file=sys.stderr)
        sys.exit(1)


def main():
    _run(
        "Step 1a: line-item templates",
        [sys.executable, str(_scripts / "template_viz_generation.py"), "-o", str(_line_item_templates)],
    )
    _run(
        "Step 1b: data-cube templates",
        [sys.executable, str(_scripts / "template_viz_generation_cube.py"), "-o", str(_cube_templates)],
    )
    _run(
        "Step 2: combined typed tools",
        [
            sys.executable,
            str(_generate_tools),
            "--templates", str(_line_item_templates),
            "--cube-templates", str(_cube_templates),
            "--output", str(_tools_output),
        ],
    )
    print("\n=== Done ===")


if __name__ == "__main__":
    main()
