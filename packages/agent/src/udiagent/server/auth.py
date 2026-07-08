"""JWT authentication for the UDIAgent server."""

from fastapi import Header, HTTPException


def make_verify_jwt(secret_key: str, algorithm: str, insecure_dev_mode: bool):
    """Return a FastAPI dependency that verifies JWT tokens.

    In insecure dev mode, verification is skipped entirely.
    """
    from jose import jwt, JWTError

    def verify_jwt(authorization: str = Header(...)):
        if insecure_dev_mode:
            return {"dev_mode": True}
        if not authorization.startswith("Bearer "):
            raise HTTPException(status_code=401, detail="Invalid authorization header")

        token = authorization[len("Bearer "):]

        try:
            payload = jwt.decode(token, secret_key, algorithms=[algorithm])
            return payload
        except JWTError:
            raise HTTPException(status_code=401, detail="Invalid or expired token")

    return verify_jwt
