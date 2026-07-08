"""UDI Grammar schema loading."""

import importlib.resources
import json
from pathlib import Path
from typing import Optional


def load_grammar(grammar_name: str = "udi", base_path: Optional[str | Path] = None) -> dict:
    """Load a grammar definition by name.

    If *base_path* is ``None``, uses the bundled package data.
    Returns {"schema_dict": ..., "schema_string": ..., "system_prompt": ...}
    """
    if base_path is None:
        base = importlib.resources.files("udiagent") / "data"
    else:
        base = Path(base_path)

    if grammar_name == "udi":
        schema_dict = json.loads((base / "UDIGrammarSchema.json").read_text())
        schema_string = (base / "UDIGrammarSchema_spec_string.json").read_text()
        system_prompt = (
            "You are a helpful assistant that creates data visualizations using "
            "the UDI Grammar specification. Generate a valid UDI Grammar JSON spec "
            "based on the user's request and the provided data schema."
        )
        return {
            "schema_dict": schema_dict,
            "schema_string": schema_string,
            "system_prompt": system_prompt,
        }
    else:
        raise ValueError(f"Unknown grammar: {grammar_name}")
