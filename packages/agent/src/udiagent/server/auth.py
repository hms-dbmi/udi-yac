"""JWT authentication for the UDIAgent server.

Two mutually exclusive modes:

* **Shared secret** (`JWT_SECRET_KEY`) — the server signs and verifies its own
  tokens. Standalone deployments.
* **External JWKS** (`JWT_JWKS_URL` + `JWT_AUDIENCE`) — tokens are issued by a
  host portal's identity provider (Keycloak, Globus, Auth0, Entra) and verified
  against its published keys. The embedded chat forwards the portal's token via
  its ``authToken`` config; nothing else in the request path changes.
"""

import time

from fastapi import Header, HTTPException

# How long a fetched key set is reused before being refreshed.
_JWKS_TTL_SECONDS = 300
# A token whose `kid` isn't in the cached key set triggers an early refresh —
# an identity provider may rotate without pre-publishing the new key. This is
# the floor between such refreshes, so a stream of unrecognized tokens can't be
# used to hammer the provider.
_JWKS_MIN_REFRESH_SECONDS = 10


def make_verify_jwt(
    secret_key: str,
    algorithm: str,
    insecure_dev_mode: bool,
    *,
    jwks_url: str = "",
    issuer: str = "",
    audience: str = "",
):
    """Return a FastAPI dependency that verifies JWT tokens.

    In insecure dev mode, verification is skipped entirely.

    Configuration consistency (secret-vs-JWKS exclusivity, the audience
    requirement, the asymmetric-algorithm requirement) is enforced by
    ``ServerConfig``, so every misconfiguration is reported at once at startup
    rather than one at a time from here.
    """
    secret_key = secret_key.strip()
    jwks_url = jwks_url.strip()
    issuer = issuer.strip()
    audience = audience.strip()

    import requests
    from jose import jwt, JWTError

    cache: dict = {"keys": None, "fetched": 0.0}

    def _knows_kid(kid) -> bool:
        keys = cache["keys"].get("keys") if isinstance(cache["keys"], dict) else None
        if kid is None or not keys:
            # Nothing to match on — let jose try every key in the set.
            return True
        return any(key.get("kid") == kid for key in keys)

    def _jwks(kid=None):
        now = time.monotonic()
        age = now - cache["fetched"]
        stale = (
            cache["keys"] is None
            or age > _JWKS_TTL_SECONDS
            or (not _knows_kid(kid) and age > _JWKS_MIN_REFRESH_SECONDS)
        )
        if stale:
            try:
                response = requests.get(jwks_url, timeout=10)
                response.raise_for_status()
                keys = response.json()
            except requests.RequestException:
                # Don't surface the IdP URL in a traceback.
                raise HTTPException(
                    status_code=503, detail="Identity provider unavailable"
                )
            cache["keys"] = keys
            cache["fetched"] = now
        return cache["keys"]

    def verify_jwt(authorization: str = Header(...)):
        if insecure_dev_mode:
            return {"dev_mode": True}
        if not authorization.startswith("Bearer "):
            raise HTTPException(status_code=401, detail="Invalid authorization header")

        token = authorization[len("Bearer "):]

        try:
            if jwks_url:
                # Unverified only to pick the key; the signature is still
                # checked against it below.
                key = _jwks(jwt.get_unverified_header(token).get("kid"))
            else:
                key = secret_key
            payload = jwt.decode(
                token,
                key,
                algorithms=[algorithm],
                audience=audience or None,
                issuer=issuer or None,
            )
            return payload
        except JWTError:
            raise HTTPException(status_code=401, detail="Invalid or expired token")

    return verify_jwt
