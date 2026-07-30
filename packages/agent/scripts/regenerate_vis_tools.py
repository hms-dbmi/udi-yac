"""Regenerate the visualization templates and the typed tool module.

Rebuilds, deterministically:
  1. the unified template set (line-item + data-cube, interleaved by chart type
     and tagged) -> data/skills/template_visualizations.json
  2. the combined typed tools (schema-independent, with TOOL_TAGS)
     -> generated_vis_tools.py

Usage:
    python scripts/regenerate_vis_tools.py
"""

import subprocess
import sys
from pathlib import Path

_repo_root = Path(__file__).resolve().parent.parent
_scripts = _repo_root / "scripts"
_skills = _repo_root / "src" / "udiagent" / "data" / "skills"
_templates = _skills / "template_visualizations.json"
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
        "Step 1: templates (line-item + data-cube)",
        [sys.executable, str(_scripts / "template_viz_generation.py"), "-o", str(_templates)],
    )
    _run(
        "Step 2: combined typed tools",
        [
            sys.executable,
            str(_generate_tools),
            "--templates", str(_templates),
            "--output", str(_tools_output),
        ],
    )
    print("\n=== Done ===")


if __name__ == "__main__":
    main()
