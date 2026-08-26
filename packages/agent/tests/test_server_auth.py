"""Tests for the reference server's JWT verification and startup safeguards."""

import base64
from datetime import datetime, timedelta, timezone

import pytest
import requests
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from fastapi import HTTPException
from jose import jwt
from pydantic import ValidationError

from udiagent.server import auth
from udiagent.server.auth import make_verify_jwt
from udiagent.server.config import ServerConfig

JWKS_URL = "https://idp.example/realms/udi/protocol/openid-connect/certs"
AUDIENCE = "udi-yac"
ISSUER = "https://idp.example/realms/udi"


def _generate_key():
    """A throwaway 2048-bit RSA key for signing test tokens.

    Generated per session rather than checked in: OpenSSL-backed keygen costs
    ~20ms a key, and committed PEMs trip secret scanners.
    """
    return rsa.generate_private_key(public_exponent=65537, key_size=2048)


IDP_KEY = _generate_key()
OTHER_KEY = _generate_key()


# ---------------------------------------------------------------------------
# Startup safeguards
#
# These now live in ServerConfig rather than make_verify_jwt, so that every
# misconfiguration is reported at once at startup. `_config` passes each field
# explicitly so the ambient environment (conftest, a developer's shell) can't
# influence the result.
# ---------------------------------------------------------------------------


def _config(**overrides):
    base = dict(
        jwt_secret_key="",
        jwt_algorithm="HS256",
        jwt_jwks_url="",
        jwt_audience="",
        jwt_issuer="",
        insecure_dev_mode=False,
    )
    return ServerConfig(**{**base, **overrides})


@pytest.mark.parametrize("secret_key", ["", " \t\n "])
def test_missing_jwt_secret_is_rejected_outside_insecure_dev_mode(secret_key):
    with pytest.raises(ValidationError, match="JWT_SECRET_KEY"):
        _config(jwt_secret_key=secret_key)


@pytest.mark.parametrize("secret_key", ["", " \t\n "])
def test_missing_jwt_secret_is_allowed_in_insecure_dev_mode(secret_key):
    _config(jwt_secret_key=secret_key, insecure_dev_mode=True)


def test_secret_and_jwks_url_are_mutually_exclusive():
    with pytest.raises(ValidationError, match="mutually exclusive"):
        _config(
            jwt_secret_key="a-secret",
            jwt_algorithm="RS256",
            jwt_jwks_url=JWKS_URL,
            jwt_audience=AUDIENCE,
        )


@pytest.mark.parametrize(
    "algorithm",
    [
        pytest.param("HS256", id="symmetric"),
        pytest.param("none", id="none"),
        pytest.param("NONE", id="none-uppercased"),
        pytest.param("PS256", id="unsupported-by-jose"),
        pytest.param("EdDSA", id="eddsa-unsupported-by-jose"),
        pytest.param("", id="empty"),
        pytest.param("   ", id="whitespace-only"),
        pytest.param("RS256; DROP", id="garbage"),
        pytest.param("HS 256", id="inner-whitespace"),
    ],
)
def test_jwks_url_rejects_algorithms_outside_the_allowlist(algorithm):
    with pytest.raises(ValidationError):
        _config(
            jwt_algorithm=algorithm, jwt_jwks_url=JWKS_URL, jwt_audience=AUDIENCE
        )


@pytest.mark.parametrize("algorithm", ["none", "None", "NONE", "  none  "])
def test_none_algorithm_is_rejected_in_shared_secret_mode(algorithm):
    """`none` must never reach jose, in either mode."""
    with pytest.raises(ValidationError, match="must not be 'none'"):
        _config(jwt_secret_key="a-secret", jwt_algorithm=algorithm)


@pytest.mark.parametrize("algorithm", ["RS256", " RS256 ", "rs256", "\trs256\n"])
def test_jwks_algorithm_is_stripped_and_normalized(algorithm, idp):
    """A padded or lowercased env value still verifies a real RS256 token."""
    config = _config(
        jwt_algorithm=algorithm,
        jwt_jwks_url=JWKS_URL,
        jwt_issuer=ISSUER,
        jwt_audience=AUDIENCE,
    )
    assert config.jwt_algorithm == "RS256"
    verify = make_verify_jwt(
        config.jwt_secret_key,
        config.jwt_algorithm,
        config.insecure_dev_mode,
        jwks_url=config.jwt_jwks_url,
        issuer=config.jwt_issuer,
        audience=config.jwt_audience,
    )
    assert verify(f"Bearer {_sign(IDP_KEY)}")["sub"] == "test-user"


@pytest.mark.parametrize("audience", ["", " \t\n "])
def test_jwks_url_requires_an_audience(audience):
    with pytest.raises(ValidationError, match="JWT_AUDIENCE"):
        _config(jwt_algorithm="RS256", jwt_jwks_url=JWKS_URL, jwt_audience=audience)


def test_jwks_config_is_allowed_in_insecure_dev_mode():
    _config(jwt_jwks_url=JWKS_URL, insecure_dev_mode=True)


def test_every_problem_is_reported_at_once():
    """One boot, one error list — not one problem per restart."""
    with pytest.raises(ValidationError) as excinfo:
        _config(
            jwt_secret_key="a-secret",
            jwt_jwks_url=JWKS_URL,
            jwt_algorithm="HS256",
            langfuse_host="https://langfuse.example",
        )
    message = str(excinfo.value)
    assert "mutually exclusive" in message
    assert "asymmetric algorithm" in message
    assert "JWT_AUDIENCE" in message
    assert "LANGFUSE_PUBLIC_KEY" in message


def test_partial_langfuse_config_is_rejected():
    with pytest.raises(ValidationError, match="LangFuse is configured but incomplete"):
        _config(insecure_dev_mode=True, langfuse_host="https://langfuse.example")


def test_complete_langfuse_config_is_accepted():
    _config(
        insecure_dev_mode=True,
        langfuse_host="https://langfuse.example",
        langfuse_public_key="pk-test",
        langfuse_secret_key="sk-test",
    )


def test_missing_query_backends_file_is_rejected(tmp_path):
    with pytest.raises(ValidationError, match="not a readable file"):
        _config(
            insecure_dev_mode=True,
            udi_query_backends=str(tmp_path / "nope.json"),
        )


@pytest.mark.parametrize(
    "raw,expected",
    [("1", True), ("true", True), ("yes", True), ("0", False), ("", False)],
)
def test_insecure_dev_mode_accepts_common_spellings(monkeypatch, raw, expected):
    """`INSECURE_DEV_MODE=true` used to crash the server with a ValueError."""
    monkeypatch.setenv("INSECURE_DEV_MODE", raw)
    monkeypatch.setenv("JWT_SECRET_KEY", "a-secret")
    assert ServerConfig().insecure_dev_mode is expected


@pytest.mark.parametrize(
    "raw,expected",
    [
        ("*", ["*"]),
        ("https://a.example", ["https://a.example"]),
        ("https://a.example,https://b.example", ["https://a.example", "https://b.example"]),
        (" https://a.example , https://b.example ", ["https://a.example", "https://b.example"]),
        ("https://a.example,,", ["https://a.example"]),
    ],
)
def test_cors_origins_parsing(raw, expected):
    """Declared as a string, not list[str] — pydantic-settings would try to
    JSON-decode a complex type and choke on the `*` default."""
    assert _config(insecure_dev_mode=True, udi_cors_origins=raw).cors_origins == expected


def test_cors_defaults_to_any_origin():
    assert _config(insecure_dev_mode=True).cors_origins == ["*"]


def test_blank_env_value_falls_back_to_the_default(monkeypatch):
    """CI templates interpolate "" for an unset variable."""
    monkeypatch.setenv("GPT_MODEL_NAME", "")
    monkeypatch.setenv("UDI_METADATA_TTL_SECONDS", "  ")
    config = ServerConfig(insecure_dev_mode=True)
    assert config.gpt_model_name == "gpt-5.4"
    assert config.udi_metadata_ttl_seconds == 3600.0


# ---------------------------------------------------------------------------
# External JWKS verification
# ---------------------------------------------------------------------------


def _b64u_int(value: int) -> str:
    raw = value.to_bytes((value.bit_length() + 7) // 8, "big")
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode()


def _jwks_of(key, kid: str) -> dict:
    numbers = key.public_key().public_numbers()
    return {
        "keys": [
            {
                "kty": "RSA",
                "kid": kid,
                "use": "sig",
                "alg": "RS256",
                "n": _b64u_int(numbers.n),
                "e": _b64u_int(numbers.e),
            }
        ]
    }


def _sign(key, kid: str | None = "idp-key", **claims) -> str:
    payload = {
        "sub": "test-user",
        "aud": AUDIENCE,
        "iss": ISSUER,
        "exp": datetime.now(timezone.utc) + timedelta(hours=1),
    }
    payload.update(claims)
    headers = {"kid": kid} if kid else None
    pem = key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption(),
    ).decode()
    return jwt.encode(payload, pem, algorithm="RS256", headers=headers)


@pytest.fixture
def idp(monkeypatch):
    """A stub identity provider serving a JWKS, counting fetches.

    Mutate ``idp["jwks"]`` to simulate a key rotation.
    """
    state = {"jwks": _jwks_of(IDP_KEY, "idp-key"), "calls": []}

    class _Response:
        def raise_for_status(self):
            pass

        def json(self):
            return state["jwks"]

    def fake_get(url, **kwargs):
        state["calls"].append(url)
        return _Response()

    monkeypatch.setattr(requests, "get", fake_get)
    return state


@pytest.fixture
def verify(idp):
    return make_verify_jwt(
        secret_key="",
        algorithm="RS256",
        insecure_dev_mode=False,
        jwks_url=JWKS_URL,
        issuer=ISSUER,
        audience=AUDIENCE,
    )


def test_externally_issued_token_is_accepted(verify, idp):
    payload = verify(f"Bearer {_sign(IDP_KEY)}")
    assert payload["sub"] == "test-user"
    assert idp["calls"] == [JWKS_URL]


def test_token_without_a_kid_is_accepted(verify):
    assert verify(f"Bearer {_sign(IDP_KEY, kid=None)}")["sub"] == "test-user"


def test_jwks_is_cached_across_requests(verify, idp):
    verify(f"Bearer {_sign(IDP_KEY)}")
    verify(f"Bearer {_sign(IDP_KEY)}")
    assert len(idp["calls"]) == 1


def test_jwks_is_refetched_once_the_cache_expires(verify, idp, monkeypatch):
    verify(f"Bearer {_sign(IDP_KEY)}")
    monkeypatch.setattr(auth, "_JWKS_TTL_SECONDS", -1)
    verify(f"Bearer {_sign(IDP_KEY)}")
    assert len(idp["calls"]) == 2


def test_unknown_kid_refetches_and_accepts_a_rotated_key(verify, idp, monkeypatch):
    verify(f"Bearer {_sign(IDP_KEY)}")

    # The provider rotates without having pre-published the new key: the cache
    # is still within its TTL, but holds only the retired key.
    idp["jwks"] = _jwks_of(OTHER_KEY, "rotated-key")
    monkeypatch.setattr(auth, "_JWKS_MIN_REFRESH_SECONDS", -1)

    payload = verify(f"Bearer {_sign(OTHER_KEY, kid='rotated-key')}")
    assert payload["sub"] == "test-user"
    assert len(idp["calls"]) == 2


def test_unknown_kid_refetch_is_throttled(verify, idp):
    verify(f"Bearer {_sign(IDP_KEY)}")

    # Same unknown kid, but within _JWKS_MIN_REFRESH_SECONDS of the last fetch:
    # rejected without going back to the provider.
    for _ in range(3):
        with pytest.raises(HTTPException) as excinfo:
            verify(f"Bearer {_sign(OTHER_KEY, kid='unknown-key')}")
        assert excinfo.value.status_code == 401
    assert len(idp["calls"]) == 1


@pytest.mark.parametrize(
    "claims",
    [
        pytest.param({"aud": "some-other-client"}, id="wrong-audience"),
        pytest.param({"iss": "https://evil.example"}, id="wrong-issuer"),
        pytest.param(
            {"exp": datetime.now(timezone.utc) - timedelta(hours=1)}, id="expired"
        ),
    ],
)
def test_invalid_claims_are_rejected(verify, claims):
    with pytest.raises(HTTPException) as excinfo:
        verify(f"Bearer {_sign(IDP_KEY, **claims)}")
    assert excinfo.value.status_code == 401


def test_token_signed_by_another_key_is_rejected(verify):
    with pytest.raises(HTTPException) as excinfo:
        verify(f"Bearer {_sign(OTHER_KEY)}")
    assert excinfo.value.status_code == 401


@pytest.mark.parametrize(
    "header",
    [
        pytest.param("not-a-bearer-token", id="no-bearer-prefix"),
        pytest.param("Bearer garbage", id="malformed-token"),
        pytest.param("Bearer ", id="empty-token"),
    ],
)
def test_malformed_authorization_headers_are_rejected(verify, header):
    with pytest.raises(HTTPException) as excinfo:
        verify(header)
    assert excinfo.value.status_code == 401


@pytest.mark.parametrize(
    "failure",
    [
        pytest.param(requests.ConnectionError("no route to host"), id="unreachable"),
        pytest.param(requests.Timeout("timed out"), id="timeout"),
        pytest.param(requests.HTTPError("500 Server Error"), id="http-error"),
    ],
)
def test_unreachable_identity_provider_is_a_503(monkeypatch, failure):
    def fake_get(url, **kwargs):
        raise failure

    monkeypatch.setattr(requests, "get", fake_get)
    verify = make_verify_jwt(
        secret_key="",
        algorithm="RS256",
        insecure_dev_mode=False,
        jwks_url=JWKS_URL,
        audience=AUDIENCE,
    )
    with pytest.raises(HTTPException) as excinfo:
        verify(f"Bearer {_sign(IDP_KEY)}")
    assert excinfo.value.status_code == 503


# ---------------------------------------------------------------------------
# Config wiring (mirrors how server/app.py builds the dependency)
# ---------------------------------------------------------------------------


def test_config_from_env_wires_external_idp(monkeypatch, idp):
    monkeypatch.setenv("INSECURE_DEV_MODE", "0")
    monkeypatch.delenv("JWT_SECRET_KEY", raising=False)
    monkeypatch.setenv("JWT_JWKS_URL", JWKS_URL)
    monkeypatch.setenv("JWT_ALGORITHM", "RS256")
    monkeypatch.setenv("JWT_AUDIENCE", AUDIENCE)
    monkeypatch.setenv("JWT_ISSUER", ISSUER)

    config = ServerConfig.from_env()
    verify = make_verify_jwt(
        config.jwt_secret_key,
        config.jwt_algorithm,
        config.insecure_dev_mode,
        jwks_url=config.jwt_jwks_url,
        issuer=config.jwt_issuer,
        audience=config.jwt_audience,
    )

    assert verify(f"Bearer {_sign(IDP_KEY)}")["sub"] == "test-user"
    assert idp["calls"] == [JWKS_URL]


def test_config_defaults_to_shared_secret_when_no_jwks_url(monkeypatch):
    monkeypatch.delenv("JWT_JWKS_URL", raising=False)
    monkeypatch.delenv("JWT_AUDIENCE", raising=False)
    monkeypatch.delenv("JWT_ISSUER", raising=False)

    config = ServerConfig.from_env()
    assert (config.jwt_jwks_url, config.jwt_audience, config.jwt_issuer) == ("", "", "")


# ---------------------------------------------------------------------------
# Shared-secret mode is unchanged
# ---------------------------------------------------------------------------


def test_shared_secret_token_still_verifies():
    verify = make_verify_jwt(
        secret_key="a-secret",
        algorithm="HS256",
        insecure_dev_mode=False,
    )
    token = jwt.encode({"sub": "test-user"}, "a-secret", algorithm="HS256")
    assert verify(f"Bearer {token}")["sub"] == "test-user"

    with pytest.raises(HTTPException) as excinfo:
        verify("Bearer garbage")
    assert excinfo.value.status_code == 401


def test_shared_secret_mode_never_contacts_a_jwks_endpoint(monkeypatch):
    def fail(*args, **kwargs):
        raise AssertionError("shared-secret mode must not fetch a JWKS")

    monkeypatch.setattr(requests, "get", fail)
    verify = make_verify_jwt(
        secret_key="a-secret",
        algorithm="HS256",
        insecure_dev_mode=False,
    )
    token = jwt.encode({"sub": "test-user"}, "a-secret", algorithm="HS256")
    assert verify(f"Bearer {token}")["sub"] == "test-user"


def test_insecure_dev_mode_skips_verification_entirely():
    verify = make_verify_jwt(
        secret_key="",
        algorithm="HS256",
        insecure_dev_mode=True,
    )
    assert verify("Bearer anything")["dev_mode"] is True
