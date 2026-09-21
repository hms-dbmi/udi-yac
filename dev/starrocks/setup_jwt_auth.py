#!/usr/bin/env python3
"""Provision JWT authentication on the local StarRocks container.

Server-side JWT auth (StarRocks >= 3.5) lets the agent forward each caller's own
token to the database instead of sharing one service credential. This sets up
the local equivalent of a Keycloak realm so that path can be exercised without
an identity provider:

  * generates a throwaway RSA key and publishes it as a JWKS file inside the
    container's `fe/conf` (StarRocks accepts a local path there, which avoids
    having to make the container reach a host HTTP server);
  * creates two JWT-identified users with different grants, so per-user
    authorization is actually observable rather than merely configured.

    python dev/starrocks/setup_jwt_auth.py                # provision
    python dev/starrocks/setup_jwt_auth.py --token alice  # mint a token

Then: UDI_STARROCKS_JWT_TEST=1 uv run pytest tests/test_query_parity.py
"""

from __future__ import annotations

import argparse
import base64
import json
import pathlib
import subprocess
import sys
import time

CONTAINER = "udi-starrocks"
DATABASE = "udi_jwt_spike"
ISSUER = "https://idp.test"
AUDIENCE = "udi-yac"
PRINCIPAL_FIELD = "preferred_username"
# alice can read the database; bob is authenticated but granted nothing, which
# is what makes "the database decides" visible rather than theoretical.
USERS = {"alice": True, "bob": False}

_HERE = pathlib.Path(__file__).resolve().parent
KEY_PATH = _HERE / ".jwt" / "signing-key.pem"
JWKS_PATH = _HERE / ".jwt" / "jwks.json"


def _b64u(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode()


def ensure_key():
    """Create the signing key and its JWKS if they don't already exist."""
    from cryptography.hazmat.primitives import serialization
    from cryptography.hazmat.primitives.asymmetric import rsa

    if KEY_PATH.exists():
        return
    KEY_PATH.parent.mkdir(parents=True, exist_ok=True)
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    KEY_PATH.write_bytes(
        key.private_bytes(
            serialization.Encoding.PEM,
            serialization.PrivateFormat.PKCS8,
            serialization.NoEncryption(),
        )
    )
    numbers = key.public_key().public_numbers()
    as_bytes = lambda i: i.to_bytes((i.bit_length() + 7) // 8, "big")  # noqa: E731
    JWKS_PATH.write_text(
        json.dumps(
            {
                "keys": [
                    {
                        "kty": "RSA",
                        "use": "sig",
                        "alg": "RS256",
                        "kid": "dev-1",
                        "n": _b64u(as_bytes(numbers.n)),
                        "e": _b64u(as_bytes(numbers.e)),
                    }
                ]
            },
            indent=2,
        )
    )


def mint(principal: str, ttl: int = 3600) -> str:
    """A signed token for `principal`, valid for `ttl` seconds."""
    from jose import jwt

    ensure_key()
    now = int(time.time())
    return jwt.encode(
        {
            "sub": f"uuid-{principal}",
            PRINCIPAL_FIELD: principal,
            "iss": ISSUER,
            "aud": AUDIENCE,
            "iat": now,
            "exp": now + ttl,
        },
        KEY_PATH.read_text(),
        algorithm="RS256",
        headers={"kid": "dev-1"},
    )


def _sql(statement: str) -> str:
    result = subprocess.run(
        ["docker", "exec", CONTAINER, "mysql", "-h127.0.0.1", "-P9030", "-uroot",
         "-e", statement],
        capture_output=True, text=True,
    )
    if result.returncode != 0:
        raise SystemExit(f"StarRocks rejected the statement:\n{result.stderr.strip()}")
    return result.stdout


def provision():
    ensure_key()
    # fe/conf is the only place StarRocks resolves a bare jwks filename from.
    conf = subprocess.run(
        ["docker", "exec", CONTAINER, "bash", "-c",
         'find / -maxdepth 6 -type d -path "*fe/conf" 2>/dev/null | head -1'],
        capture_output=True, text=True,
    ).stdout.strip()
    if not conf:
        raise SystemExit(f"could not find fe/conf in {CONTAINER}; is it running?")
    subprocess.run(
        ["docker", "cp", str(JWKS_PATH), f"{CONTAINER}:{conf}/jwks.json"], check=True
    )

    properties = json.dumps({
        "jwks_url": "jwks.json",
        "principal_field": PRINCIPAL_FIELD,
        "required_issuer": ISSUER,
        "required_audience": AUDIENCE,
    })
    for user, granted in USERS.items():
        _sql(f"CREATE USER IF NOT EXISTS '{user}' "
             f"IDENTIFIED WITH authentication_jwt AS '{properties}'")
        if granted:
            # SELECT on the tables is enough; StarRocks has no DATABASE-level
            # USAGE privilege, and connecting with `database` set is allowed
            # once any privilege on it exists.
            _sql(f"GRANT SELECT ON ALL TABLES IN DATABASE {DATABASE} TO '{user}'")

    version = _sql("SELECT current_version()").split("\n")[1].strip()
    print(f"StarRocks {version}: JWT auth provisioned on database {DATABASE!r}")
    print(f"  granted:  {', '.join(u for u, g in USERS.items() if g)}")
    print(f"  no grant: {', '.join(u for u, g in USERS.items() if not g)}")
    print(f"  jwks:     {conf}/jwks.json")
    print("\nSeed the database first if you haven't:")
    print(f"  uv run --extra starrocks python packages/agent/scripts/seed_starrocks.py \\")
    print(f"      sample-data/penguins --database {DATABASE}")
    print("\nThen run the live test:")
    print("  UDI_STARROCKS_JWT_TEST=1 uv run --project packages/agent pytest \\")
    print("      packages/agent/tests/test_query_parity.py -k jwt")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--token", metavar="PRINCIPAL",
                        help="print a signed token for this principal and exit")
    args = parser.parse_args()
    if args.token:
        print(mint(args.token))
        sys.exit(0)
    provision()
