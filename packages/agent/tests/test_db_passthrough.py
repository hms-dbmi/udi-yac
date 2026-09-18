"""JWT passthrough to the query backend.

Everything here is offline: pymysql is monkeypatched, so the connection cache,
the identity resolution and the error mapping are exercised without a database.
The live half — that StarRocks actually accepts the forwarded token — is in
test_query_parity.py behind UDI_STARROCKS_JWT_TEST.
"""

import base64
import json
import pathlib
import time

import pytest

from udiagent.query import DatabaseAuthError, use_db_token
from udiagent.query.connectors import (
    _MAX_CONNECTIONS,
    _OpenIDConnectClient,
    _lenenc,
    StarRocksConnector,
)


def make_token(principal="alice", exp_in=600, field="preferred_username"):
    def seg(d):
        return base64.urlsafe_b64encode(json.dumps(d).encode()).rstrip(b"=").decode()

    claims = {"sub": f"uuid-{principal}", field: principal}
    if exp_in is not None:
        claims["exp"] = int(time.time()) + exp_in
    return f"{seg({'alg': 'RS256'})}.{seg(claims)}.signature"


class FakeConn:
    """Stands in for a pymysql connection."""

    def __init__(self, user, password):
        self.user = user
        self.password = password
        self.closed = False

    def close(self):
        self.closed = True


@pytest.fixture
def fake_connect(monkeypatch):
    """Capture every connect, so tests can assert on identity and lifetime."""
    opened = []

    def _connect(user, password):
        conn = FakeConn(user, password)
        opened.append(conn)
        return conn

    monkeypatch.setattr(StarRocksConnector, "_connect", lambda self, u, p: _connect(u, p))
    return opened


def connector(**kwargs):
    kwargs.setdefault("jwt_passthrough", True)
    kwargs.setdefault("principal_field", "preferred_username")
    return StarRocksConnector(host="db.invalid", **kwargs)


# ── identity resolution ──────────────────────────────────────────────────────


def test_principal_and_token_come_from_the_request():
    c = connector()
    with use_db_token(make_token("alice")):
        key, user, password, expires_at = c._identity()
    assert key == "alice"
    assert user == "alice"
    assert password.count(".") == 2  # the raw compact JWT, forwarded verbatim
    assert expires_at > time.time()


def test_principal_field_is_configurable():
    c = connector(principal_field="sub")
    with use_db_token(make_token("alice")):
        assert c._identity()[0] == "uuid-alice"


def test_no_token_is_refused_rather_than_downgraded():
    """The whole point of passthrough: never fall back to a shared credential."""
    c = connector()
    with pytest.raises(DatabaseAuthError, match="no bearer token"):
        c._identity()


def test_a_configured_user_is_the_dev_mode_fallback():
    c = connector(user="root", password="secret")
    assert c._identity() == ("", "root", "secret", None)


def test_token_without_the_principal_claim_is_refused():
    c = connector()
    with use_db_token(make_token("alice", field="email")):
        with pytest.raises(DatabaseAuthError, match="preferred_username"):
            c._identity()


def test_malformed_token_is_refused():
    c = connector()
    with use_db_token("not-a-jwt"):
        with pytest.raises(DatabaseAuthError, match="malformed"):
            c._identity()


def test_expired_token_is_refused():
    c = connector()
    with use_db_token(make_token("alice", exp_in=-60)):
        with pytest.raises(DatabaseAuthError, match="expired"):
            c._identity()


def test_passthrough_off_ignores_the_context_token():
    c = StarRocksConnector(host="db.invalid", user="root", password="pw")
    with use_db_token(make_token("alice")):
        assert c._identity() == ("", "root", "pw", None)


def test_use_db_token_restores_the_previous_value():
    c = connector()
    with use_db_token(make_token("alice")):
        with use_db_token(make_token("bob")):
            assert c._identity()[0] == "bob"
        assert c._identity()[0] == "alice"
    with pytest.raises(DatabaseAuthError):
        c._identity()


# ── connection cache ─────────────────────────────────────────────────────────


def test_one_principal_reuses_one_connection(fake_connect):
    c = connector()
    for _ in range(3):
        with use_db_token(make_token("alice")):
            key, user, pw, exp = c._identity()
            c._get(key, user, pw, exp)
    assert len(fake_connect) == 1
    assert list(c._conns) == ["alice"]


def test_distinct_principals_get_distinct_connections(fake_connect):
    c = connector()
    for who in ("alice", "bob"):
        with use_db_token(make_token(who)):
            c._get(*c._identity())
    assert [conn.user for conn in fake_connect] == ["alice", "bob"]
    assert sorted(c._conns) == ["alice", "bob"]


def test_cache_is_bounded_and_closes_what_it_evicts(fake_connect):
    c = connector()
    for i in range(_MAX_CONNECTIONS + 1):
        with use_db_token(make_token(f"user{i:03d}")):
            c._get(*c._identity())
    assert len(c._conns) == _MAX_CONNECTIONS
    # user000 was least recently used, so it went — and its socket was closed,
    # not merely dropped on the floor.
    assert "user000" not in c._conns
    assert fake_connect[0].closed is True
    assert fake_connect[-1].closed is False


def test_eviction_is_least_recently_used(fake_connect):
    c = connector()
    for i in range(_MAX_CONNECTIONS):
        with use_db_token(make_token(f"user{i:03d}")):
            c._get(*c._identity())
    # Touch the oldest so it is no longer the LRU.
    with use_db_token(make_token("user000")):
        c._get(*c._identity())
    with use_db_token(make_token("newcomer")):
        c._get(*c._identity())
    assert "user000" in c._conns
    assert "user001" not in c._conns


def test_connection_is_recycled_once_its_token_expires(fake_connect):
    c = connector()
    with use_db_token(make_token("alice")):
        c._get(*c._identity())
    first = c._conns["alice"].conn
    # StarRocks does not re-check exp mid-session, so the connector must.
    c._conns["alice"].expires_at = time.time() - 1
    with use_db_token(make_token("alice")):
        c._get(*c._identity())
    assert first.closed is True
    assert c._conns["alice"].conn is not first
    assert len(fake_connect) == 2


def test_a_refreshed_token_extends_the_session(fake_connect):
    c = connector()
    with use_db_token(make_token("alice", exp_in=60)):
        c._get(*c._identity())
    original = c._conns["alice"].expires_at
    with use_db_token(make_token("alice", exp_in=3600)):
        c._get(*c._identity())
    assert c._conns["alice"].expires_at > original
    assert len(fake_connect) == 1  # extended, not reconnected


def test_idle_connections_are_reaped(fake_connect, monkeypatch):
    c = connector()
    with use_db_token(make_token("alice")):
        c._get(*c._identity())
    idle = c._conns["alice"].conn
    c._conns["alice"].last_used -= 10_000
    with use_db_token(make_token("bob")):
        c._get(*c._identity())
    assert idle.closed is True
    assert "alice" not in c._conns


# ── auth plugin wire format ──────────────────────────────────────────────────


def test_lenenc_matches_the_mysql_encoding():
    assert _lenenc(5) == b"\x05"
    assert _lenenc(250) == b"\xfa"
    assert _lenenc(251) == b"\xfc\xfb\x00"
    assert _lenenc(1 << 16) == b"\xfd\x00\x00\x01"


def test_auth_plugin_sends_capability_byte_then_lenenc_token():
    """The framing is undocumented; StarRocks 3.5 rejects every other shape."""
    written = []

    class FakeCon:
        password = b"x" * 300  # long enough to exercise the 2-byte length form

        def write_packet(self, data):
            written.append(data)

        def _read_packet(self):
            class Pkt:
                def check_error(self):
                    pass

            return Pkt()

    _OpenIDConnectClient(FakeCon()).authenticate(None)
    assert written == [b"\x01" + b"\xfc\x2c\x01" + b"x" * 300]


# ── server wiring ────────────────────────────────────────────────────────────


def _client(engine):
    """A TestClient with one query backend registered, cleaned up by the caller."""
    from starlette.testclient import TestClient

    import udiagent.server.app as server_app

    server_app.app.state.query_engines = {"pkg": engine}
    server_app.app.state.metadata_caches = {}
    return TestClient(server_app.app, raise_server_exceptions=False), server_app


@pytest.fixture
def server():
    import udiagent.server.app as server_app

    yield server_app
    server_app.app.state.query_engines = {}
    server_app.app.state.metadata_caches = {}


class RefusingConnector:
    """A backend that rejects whatever identity it is handed."""

    from udiagent.query.connectors import StarRocksDialect

    dialect = StarRocksDialect()
    jwt_passthrough = True

    def execute(self, sql, params=None):
        raise DatabaseAuthError("the database rejected these credentials")


_SAMPLE = pathlib.Path(__file__).resolve().parents[3] / "sample-data"


class RecordingConnector:
    """A real DuckDB backend that also records the token visible to execute().

    Delegating to a real connector rather than returning canned rows means the
    metadata path — DESCRIBE, COUNT, the stats pass, SELECT DISTINCT — actually
    runs, so this proves the token reaches every query introspection issues, not
    just the one the engine issues.
    """

    jwt_passthrough = False

    def __init__(self):
        from udiagent.query import DuckDBConnector

        self._inner = DuckDBConnector(
            views={"penguins": str(_SAMPLE / "penguins.csv")}
        )
        self.dialect = self._inner.dialect
        self.seen = []

    def execute(self, sql, params=None):
        from udiagent.query.connectors import _db_token

        self.seen.append(_db_token.get())
        return self._inner.execute(sql, params)


def test_database_auth_failure_is_a_403_that_leaks_nothing(server):
    from udiagent.query import QueryEngine

    engine = QueryEngine(RefusingConnector(), table_map={"penguins": "penguins"})
    client, _ = _client(engine)

    response = client.post(
        "/v1/yac/query",
        headers={"Authorization": "Bearer dev"},
        json={
            "package": "pkg",
            "queries": [{"vizId": "v1", "source": {"name": "penguins"}}],
        },
    )
    assert response.status_code == 403
    body = response.json()
    # Not swallowed into a per-viz 200, and no principal, host or traceback.
    assert "results" not in body
    assert body["error"] == (
        "The database rejected your credentials for this dataset."
    )
    assert "rejected these credentials" not in json.dumps(body)


@pytest.mark.parametrize("endpoint", ["query", "metadata"])
def test_the_request_token_reaches_the_connector(server, endpoint):
    """The token has to survive handler -> QueryEngine -> compiler -> connector.

    conftest forces INSECURE_DEV_MODE, so verify_jwt attaches no raw token of
    its own; override the dependency to supply one and assert on the value that
    lands in the connector.
    """
    from udiagent.server.auth import RAW_TOKEN_CLAIM
    from udiagent.query import QueryEngine

    connector = RecordingConnector()
    client, server_app = _client(QueryEngine(connector, table_map={"penguins": "penguins"}))
    token = make_token("alice")
    server_app.app.dependency_overrides[server_app.verify_jwt] = lambda: {
        "sub": "uuid-alice",
        RAW_TOKEN_CLAIM: token,
    }
    try:
        if endpoint == "query":
            response = client.post(
                "/v1/yac/query",
                json={
                    "package": "pkg",
                    "queries": [{"vizId": "v1", "source": {"name": "penguins"}}],
                },
            )
        else:
            response = client.get("/v1/yac/metadata?package=pkg")
    finally:
        server_app.app.dependency_overrides.clear()

    assert response.status_code == 200
    assert connector.seen, "the connector was never reached"
    assert set(connector.seen) == {token}


def test_the_context_token_does_not_leak_between_requests(server):
    from udiagent.query.connectors import _db_token

    connector = RecordingConnector()
    from udiagent.query import QueryEngine

    client, _ = _client(QueryEngine(connector, table_map={"penguins": "penguins"}))
    client.post(
        "/v1/yac/query",
        headers={"Authorization": "Bearer dev"},
        json={"package": "pkg", "queries": [{"vizId": "v1", "source": {"name": "penguins"}}]},
    )
    assert _db_token.get() is None


# ── backend configuration ────────────────────────────────────────────────────


def test_duckdb_cannot_do_passthrough():
    import udiagent.server.app as server_app

    with pytest.raises(ValueError, match="not supported on duckdb"):
        server_app._engine_from_config({"type": "duckdb", "jwtPassthrough": True})


def test_passthrough_without_a_fallback_user_is_rejected_in_dev_mode():
    """conftest sets INSECURE_DEV_MODE, so this is the configuration a developer
    actually hits. It must fail at startup rather than 403 on every query."""
    import udiagent.server.app as server_app

    assert server_app.config.insecure_dev_mode
    with pytest.raises(ValueError, match="fallback connection.user"):
        server_app._engine_from_config(
            {
                "type": "starrocks",
                "jwtPassthrough": True,
                "connection": {"host": "db.invalid"},
            }
        )


def test_passthrough_with_a_fallback_user_is_accepted_in_dev_mode():
    import udiagent.server.app as server_app

    engine = server_app._engine_from_config(
        {
            "type": "starrocks",
            "jwtPassthrough": True,
            "principalField": "preferred_username",
            "connection": {"host": "db.invalid", "user": "root"},
        }
    )
    assert engine.connector.jwt_passthrough is True
    assert engine.connector._principal_field == "preferred_username"


def test_a_broken_backend_is_skipped_not_fatal(tmp_path, monkeypatch):
    """One misconfigured package must not take the whole server down."""
    import udiagent.server.app as server_app

    config = tmp_path / "backends.json"
    config.write_text(
        json.dumps(
            {
                "bad": {"type": "duckdb", "jwtPassthrough": True},
                "good": {"type": "duckdb", "database": ":memory:"},
            }
        )
    )
    monkeypatch.setattr(server_app.config, "udi_query_backends", str(config))
    assert sorted(server_app._load_query_engines()) == ["good"]
