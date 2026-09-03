"""The agent's grammar schema must stay identical to the toolkit's.

`packages/agent/src/udiagent/data/UDIGrammarSchema.json` is a hand-maintained
copy of `packages/grammar/UDIGrammarSchema.json`, which is generated from
GrammarTypes.ts (`pnpm --filter udi-toolkit build-schema`). Nothing but this
test keeps the two in step, and drift is silent: the agent would validate
generated specs against a grammar the executors no longer implement.
"""

from pathlib import Path

import pytest

_AGENT_COPY = (
    Path(__file__).resolve().parents[1]
    / "src"
    / "udiagent"
    / "data"
    / "UDIGrammarSchema.json"
)
_TOOLKIT_SOURCE = (
    Path(__file__).resolve().parents[3] / "packages" / "grammar" / "UDIGrammarSchema.json"
)


def test_agent_schema_matches_toolkit():
    if not _TOOLKIT_SOURCE.exists():
        pytest.skip("toolkit not present (installed package, not the monorepo)")
    assert _AGENT_COPY.read_text() == _TOOLKIT_SOURCE.read_text(), (
        f"{_AGENT_COPY} is out of date. Regenerate and copy it:\n"
        "  pnpm --filter udi-toolkit build-schema\n"
        "  cp packages/grammar/UDIGrammarSchema.json "
        "packages/agent/src/udiagent/data/UDIGrammarSchema.json"
    )
