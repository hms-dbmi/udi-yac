"""The agent ships its own copy of the grammar schema, generated in
packages/grammar from GrammarTypes.ts. Freehand specs are validated against the
copy, so a stale one rejects grammar the toolkit runs (a new Expr function) or
accepts grammar it no longer does. Refresh it with:

    cp packages/grammar/UDIGrammarSchema.json packages/agent/src/udiagent/data/
"""

import json
from pathlib import Path

import pytest

_HERE = Path(__file__).resolve().parent
_CANONICAL = _HERE.parents[1] / "grammar" / "UDIGrammarSchema.json"
_BUNDLED = _HERE.parent / "src" / "udiagent" / "data" / "UDIGrammarSchema.json"


@pytest.mark.skipif(not _CANONICAL.exists(), reason="not in the monorepo")
def test_bundled_grammar_schema_matches_the_toolkit():
    assert json.loads(_BUNDLED.read_text()) == json.loads(_CANONICAL.read_text())
