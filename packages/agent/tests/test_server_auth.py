"""Tests for the reference server's JWT startup safeguards."""

import pytest

from udiagent.server.auth import make_verify_jwt


@pytest.mark.parametrize("secret_key", ["", " \t\n "])
def test_missing_jwt_secret_is_rejected_outside_insecure_dev_mode(secret_key):
    with pytest.raises(RuntimeError, match="JWT_SECRET_KEY"):
        make_verify_jwt(
            secret_key=secret_key,
            algorithm="HS256",
            insecure_dev_mode=False,
        )
