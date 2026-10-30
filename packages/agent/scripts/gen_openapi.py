#!/usr/bin/env python
"""Write the server's OpenAPI spec to packages/agent/openapi.json.

The docs site renders the HTTP API reference from this file (starlight-openapi
in apps/site/astro.config.mjs). It is committed rather than built with the
site, which would need the server's dependencies, and committing it also puts
every API change in front of PR review.

The spec is FastAPI's own (`app.openapi()`), so describe an endpoint where it is
declared, in src/udiagent/server/app.py and src/udiagent/models.py, and regenerate.

Usage::

    python scripts/gen_openapi.py            # write
    python scripts/gen_openapi.py --check    # exit 1 if out of date (CI)
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

_AGENT_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(_AGENT_ROOT / "src"))

# Importing the app builds it, and ServerConfig refuses to start without a JWT
# setting. The spec does not depend on one; dotenv never overrides this.
os.environ["INSECURE_DEV_MODE"] = "1"

from udiagent.server.app import app  # noqa: E402

SPEC_PATH = _AGENT_ROOT / "openapi.json"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--check",
        action="store_true",
        help="exit 1 if openapi.json is out of date",
    )
    args = parser.parse_args()

    wanted = json.dumps(app.openapi(), indent=2, ensure_ascii=False) + "\n"
    current = SPEC_PATH.read_text() if SPEC_PATH.exists() else None
    relative = SPEC_PATH.relative_to(_AGENT_ROOT.parents[1])

    if args.check:
        if current == wanted:
            print("openapi.json is up to date")
            return 0
        print(
            f"out of date: {relative}\n\n"
            "The server's API changed without regenerating. Run:\n"
            "  uv run --project packages/agent --extra server python "
            "packages/agent/scripts/gen_openapi.py"
        )
        return 1

    if current == wanted:
        print("openapi.json already up to date")
    else:
        SPEC_PATH.write_text(wanted)
        print(f"wrote {relative}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
