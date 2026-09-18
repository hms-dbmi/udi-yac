"""Backend connectors. Each bundles a DB-API-ish `execute` returning rows as
dicts, plus the dialect details the compiler needs (identifier quoting, bind
placeholder, median).

DuckDB doubles as the parity-test backend; StarRocks is the production OLAP
target (MySQL wire protocol via pymysql). Both dependencies are optional
extras — imports are lazy.
"""

from __future__ import annotations

import base64
import contextlib
import json
import math
import re
import threading
import time
from collections import OrderedDict
from contextvars import ContextVar
from dataclasses import dataclass
from typing import Any

from .errors import DatabaseAuthError


class Dialect:
    quote_char = '"'
    placeholder = "?"

    def quote(self, identifier: str) -> str:
        if not identifier:
            raise ValueError("empty identifier")
        q = self.quote_char
        return f"{q}{identifier.replace(q, q + q)}{q}"

    def median(self, column_sql: str) -> str:
        return f"MEDIAN({column_sql})"


class DuckDBDialect(Dialect):
    pass


class StarRocksDialect(Dialect):
    quote_char = "`"
    placeholder = "%s"

    def median(self, column_sql: str) -> str:
        # ponytail: PERCENTILE_APPROX is approximate; exact medians on
        # StarRocks need a two-pass approach if precision ever matters.
        return f"PERCENTILE_APPROX({column_sql}, 0.5)"


def _normalize_value(value: Any) -> Any:
    """Make DB values JSON-friendly and parity-comparable."""
    if isinstance(value, float) and math.isnan(value):
        return None
    # duckdb DECIMAL -> Decimal; date/datetime -> isoformat strings
    type_name = type(value).__name__
    if type_name == "Decimal":
        return float(value)
    if type_name in ("date", "datetime", "time", "Timestamp"):
        return value.isoformat()
    return value


_IDENT_RE = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")


# ── per-request database identity (JWT passthrough) ──────────────────────────
# Bounds on the per-user connection cache. Module constants rather than
# settings, matching the _JWKS_* precedent in server/auth.py.
_MAX_CONNECTIONS = 32
_IDLE_SECONDS = 300.0

# Error codes that mean "the database refused this identity" rather than "the
# query was bad". 1044/1045 access denied, 1698 rejected by the auth plugin,
# 2059 the client could not load the plugin the server asked for, and 5203 is
# StarRocks' own privilege error — raised at CONNECT when the identity has no
# rights on `connection.database`. Verified against starrocks 3.5.21.
#
# Only consulted on the connect path. A privilege error raised by a *query*
# stays a per-visualization error, so one unreadable table does not fail a whole
# dashboard's batch.
_AUTH_ERRNOS = frozenset({1044, 1045, 1698, 2059, 5203})

_db_token: ContextVar[str | None] = ContextVar("udi_db_token", default=None)


@contextlib.contextmanager
def use_db_token(token: str | None):
    """Bind the caller's raw JWT for the duration of one request.

    A contextvar rather than a parameter because `connector.execute` is reached
    from three independent places — `QueryEngine._execute`, the compiler's binby
    probe, and introspect's DESCRIBE/DISTINCT passes — so threading a token
    through would change five signatures across three modules.

    Set this in the request handler, never in a FastAPI dependency: sync
    dependencies run through `anyio.to_thread.run_sync` in a *copied* context,
    so a `.set()` there never reaches the handler.
    """
    reset = _db_token.set(token)
    try:
        yield
    finally:
        _db_token.reset(reset)


def _jwt_claims(token: str) -> dict:
    """Claims from a compact JWT, WITHOUT verifying the signature.

    `verify_jwt` already checked it against the JWKS and StarRocks checks it
    again at connect, so verifying a third time here would buy nothing and would
    drag python-jose — a `[server]` dependency — into the `[starrocks]` extra.
    """
    try:
        payload = token.split(".")[1]
        # base64url without padding; restore it before decoding.
        return json.loads(base64.urlsafe_b64decode(payload + "=" * (-len(payload) % 4)))
    except Exception as exc:  # noqa: BLE001 - any malformed token is one error
        raise DatabaseAuthError("malformed bearer token") from exc


# The plugin StarRocks asks for when a user is IDENTIFIED WITH
# authentication_jwt. Note the spelling: the StarRocks docs write it hyphenated
# ("authentication_openid-connect_client", the MySQL CLI flag), but the name on
# the wire is all underscores. Verified against starrocks 3.5.21.
_OIDC_PLUGIN = "authentication_openid_connect_client"


def _lenenc(n: int) -> bytes:
    """MySQL length-encoded integer. A real JWT exceeds the 1-byte form."""
    if n < 251:
        return bytes([n])
    if n < 1 << 16:
        return b"\xfc" + n.to_bytes(2, "little")
    if n < 1 << 24:
        return b"\xfd" + n.to_bytes(3, "little")
    return b"\xfe" + n.to_bytes(8, "little")


class _OpenIDConnectClient:
    """Client half of `authentication_openid_connect_client`, which pymysql
    does not ship.

    The reply is one capability byte followed by the length-encoded ID token.
    That framing is not documented; it was established empirically against
    StarRocks 3.5.21 — the alternatives (raw token, NUL-terminated, bare
    length-encoded) are all rejected with "Invalid serialized unsecured/JWS/JWE
    object". The JWT rides in `password`; pymysql encodes that latin1, which is
    lossless for a base64url-ASCII token.
    """

    def __init__(self, con):
        self._con = con

    def authenticate(self, pkt):
        token = self._con.password
        self._con.write_packet(b"\x01" + _lenenc(len(token)) + token)
        reply = self._con._read_packet()
        reply.check_error()
        return reply


@dataclass
class _Entry:
    """One cached connection. `expires_at` is wall-clock (the JWT's `exp`);
    `last_used` is monotonic. They are not interchangeable."""

    conn: Any
    expires_at: float | None
    last_used: float


class DuckDBConnector:
    """In-process DuckDB. `views` maps entity/table names to CSV/Parquet file
    paths registered as views — handy for tests and file-backed packages."""

    dialect = DuckDBDialect()
    # Part of the connector contract: DuckDB has no users, so it can never
    # authenticate a caller's token. Callers branch on this rather than
    # isinstance-checking a connector type.
    jwt_passthrough = False

    def __init__(self, database: str = ":memory:", views: dict[str, str] | None = None):
        import duckdb  # lazy: optional extra

        # A seeded file DB is only READ by the query engine (seeding uses its own
        # connection), so open it read-only. DuckDB's default read-write handle
        # takes an EXCLUSIVE lock, which collides whenever more than one handle
        # opens the file — e.g. `fastapi dev` imports the app in both the reload
        # supervisor and the worker, and each would try to lock it. Read-only
        # handles share fine. :memory: and views-backed connectors must stay
        # writable (they CREATE VIEW), so only lock down the plain file case.
        read_only = database != ":memory:" and not views
        self._conn = duckdb.connect(database, read_only=read_only)
        for name, path in (views or {}).items():
            if not _IDENT_RE.match(name):
                raise ValueError(f"invalid view name: {name!r}")
            # DDL can't take bound parameters; inline the escaped path.
            escaped = str(path).replace("'", "''")
            self._conn.execute(
                f'CREATE OR REPLACE VIEW "{name}" AS '
                f"SELECT * FROM read_csv_auto('{escaped}')"
            )

    def execute(self, sql: str, params: list | None = None) -> list[dict]:
        cursor = self._conn.execute(sql, params or [])
        columns = [d[0] for d in cursor.description]
        return [
            {c: _normalize_value(v) for c, v in zip(columns, row)}
            for row in cursor.fetchall()
        ]


class StarRocksConnector:
    """StarRocks over the MySQL wire protocol (pymysql, `[starrocks]` extra).

    Two identity modes, chosen at construction:

    * **Service credential** (default) — one long-lived connection shared by
      every caller, authenticated with the configured user/password. Unchanged
      from the original behaviour.
    * **JWT passthrough** (`jwt_passthrough=True`) — the caller's own token,
      bound for the request by `use_db_token`, is forwarded as the password.
      StarRocks authenticates it against the same JWKS the agent used and
      applies that user's own grants, so authorization lives in the database
      rather than in this process. One cached connection per principal.

    Both modes share one cache and one lock. Connections are long-lived and so
    must survive idle timeouts: every execute pings with reconnect and retries
    once if the socket died mid-query. pymysql connections are not thread-safe
    and FastAPI runs sync endpoints in a threadpool, so the lock serializes
    access.

    **Revocation ceiling**: MySQL binds identity at CONNECT time and StarRocks
    does not re-check `exp` mid-session, so a cached connection is recycled once
    the token that opened it expires. A grant revoked inside a live session is
    therefore not seen until the connection is recycled — at most one token
    lifetime, or `_IDLE_SECONDS` of inactivity, whichever comes first.

    ponytail: one lock across all identities and one connection each — per-entry
    locks or a real pool when multi-user concurrency actually bites.
    """

    dialect = StarRocksDialect()

    def __init__(
        self,
        host: str,
        port: int = 9030,
        user: str = "",
        password: str = "",
        database: str | None = None,
        *,
        jwt_passthrough: bool = False,
        principal_field: str = "sub",
        **kwargs: Any,
    ):
        self.jwt_passthrough = jwt_passthrough
        self._principal_field = principal_field
        # Service credential. Empty user means "no fallback": under passthrough
        # a request without a token is then refused rather than silently
        # downgraded to a shared account.
        self._user = user
        self._password = password
        # Never log this — it holds a password in service-credential mode.
        self._connect_args: dict[str, Any] = {
            "host": host,
            "port": port,
            "database": database,
            **kwargs,
        }
        self._lock = threading.Lock()
        self._conns: OrderedDict[str, _Entry] = OrderedDict()

    # ── identity ─────────────────────────────────────────────────────────────

    def _identity(self) -> tuple[str, str, str, float | None]:
        """(cache key, db user, db password, expiry) for the current request."""
        token = _db_token.get() if self.jwt_passthrough else None
        if token is None:
            if self.jwt_passthrough and not self._user:
                raise DatabaseAuthError(
                    "this dataset authenticates each user against the database; "
                    "no bearer token was supplied"
                )
            return "", self._user or "root", self._password, None

        claims = _jwt_claims(token)
        principal = claims.get(self._principal_field)
        if not isinstance(principal, str) or not principal:
            raise DatabaseAuthError(
                f"token carries no usable {self._principal_field!r} claim"
            )
        exp = float(claims["exp"]) if claims.get("exp") else None
        if exp is not None and time.time() >= exp:
            # Defence in depth: verify_jwt already rejects expired tokens with a
            # 401, so this should be unreachable. Without it, an expired token
            # would ride an existing cached session for that same principal —
            # _get only knows the expiry of the token that OPENED the socket.
            raise DatabaseAuthError("bearer token has expired")
        return principal, principal, token, exp

    # ── connection cache (all of these assume the lock is held) ──────────────

    def _connect(self, user: str, password: str):
        import pymysql  # lazy: optional extra
        import pymysql.cursors

        try:
            return pymysql.connect(
                user=user,
                password=password,
                cursorclass=pymysql.cursors.DictCursor,
                autocommit=True,
                # Harmless when not using JWTs: pymysql only consults the map if
                # the server actually asks for that plugin.
                auth_plugin_map={_OIDC_PLUGIN: _OpenIDConnectClient},
                **self._connect_args,
            )
        except pymysql.err.OperationalError as exc:
            if exc.args and exc.args[0] in _AUTH_ERRNOS:
                raise DatabaseAuthError(
                    "the database rejected these credentials"
                ) from exc
            raise

    def _drop(self, key: str) -> None:
        entry = self._conns.pop(key, None)
        if entry is not None:
            try:
                entry.conn.close()
            except Exception:  # noqa: BLE001 - already going away
                pass

    def _get(self, key: str, user: str, password: str, expires_at: float | None):
        # Reap idle entries on the way past; no background thread.
        cutoff = time.monotonic() - _IDLE_SECONDS
        for idle in [k for k, e in self._conns.items() if e.last_used < cutoff]:
            self._drop(idle)

        entry = self._conns.get(key)
        if (
            entry is not None
            and entry.expires_at is not None
            and time.time() >= entry.expires_at
        ):
            # The token that opened this session has expired. Recycle it so the
            # current (freshly verified) token re-authenticates.
            self._drop(key)
            entry = None

        if entry is None:
            entry = _Entry(self._connect(user, password), expires_at, time.monotonic())
            self._conns[key] = entry
            while len(self._conns) > _MAX_CONNECTIONS:
                self._drop(next(iter(self._conns)))  # LRU is first
        else:
            # Reused socket, fresh token: a re-authenticated user extends the
            # session rather than being cut off at the old token's expiry.
            if expires_at is not None and (
                entry.expires_at is None or expires_at > entry.expires_at
            ):
                entry.expires_at = expires_at

        self._conns.move_to_end(key)
        entry.last_used = time.monotonic()
        return entry

    # ── public API ───────────────────────────────────────────────────────────

    def execute(self, sql: str, params: list | None = None) -> list[dict]:
        import pymysql

        key, user, password, expires_at = self._identity()
        with self._lock:
            entry = self._get(key, user, password, expires_at)
            try:
                # Reconnects transparently if the connection timed out idle.
                entry.conn.ping(reconnect=True)
                rows = self._run(entry.conn, sql, params)
            except (pymysql.err.InterfaceError, pymysql.err.OperationalError):
                # Socket died between ping and query — reconnect and retry once,
                # with the CURRENT request's credentials rather than whatever
                # opened the dead connection.
                self._drop(key)
                entry = self._get(key, user, password, expires_at)
                rows = self._run(entry.conn, sql, params)
        return [{c: _normalize_value(v) for c, v in row.items()} for row in rows]

    @staticmethod
    def _run(conn, sql: str, params: list | None) -> list[dict]:
        with conn.cursor() as cursor:
            cursor.execute(sql, params or [])
            return cursor.fetchall()
