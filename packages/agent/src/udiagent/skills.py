"""Markdown-driven skills: Skill dataclass, skill loading, frontmatter
parsing, prompt-template rendering, and bundled-asset path lookup."""

import importlib.resources
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Optional


@dataclass
class Skill:
    """A skill loaded from a markdown file."""

    name: str
    description: str
    instructions: str


def _package_data_path() -> Path:
    """Return the path to the bundled data directory."""
    return importlib.resources.files("udiagent") / "data"


def _parse_frontmatter(text):
    """Parse YAML frontmatter from a markdown string.

    Returns (metadata dict, body string).
    """
    match = re.match(r"^---\s*\n(.*?)\n---\s*\n", text, re.DOTALL)
    if not match:
        return {}, text

    body = text[match.end() :]
    metadata = {}
    for line in match.group(1).splitlines():
        line = line.strip()
        if ":" in line:
            key, _, value = line.partition(":")
            metadata[key.strip()] = value.strip()
    return metadata, body


def load_skills(skills_dir: Optional[str | Path] = None) -> dict[str, Skill]:
    """Load all skill .md files from a directory.

    If *skills_dir* is ``None``, uses the bundled package data.
    Returns dict mapping skill name -> Skill instance.
    """
    if skills_dir is None:
        skills_path = _package_data_path() / "skills"
    else:
        skills_path = Path(skills_dir)

    if not skills_path.is_dir():
        return {}

    skills: dict[str, Skill] = {}
    for md_file in sorted(skills_path.glob("*.md")):
        text = md_file.read_text()
        metadata, body = _parse_frontmatter(text)
        name = metadata.get("name", md_file.stem)
        description = metadata.get("description", "")
        skills[name] = Skill(name=name, description=description, instructions=body)

    return skills


def render_template(instructions, variables):
    """Replace {{key}} placeholders in instructions with values from variables.

    Supports including arbitrary textual data in skill prompts.
    Unknown placeholders are left as-is.
    """

    def replacer(m):
        key = m.group(1).strip()
        if key in variables:
            return str(variables[key])
        return m.group(0)

    return re.sub(r"\{\{(.+?)\}\}", replacer, instructions)
