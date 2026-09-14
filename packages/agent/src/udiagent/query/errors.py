class UnsupportedQueryError(ValueError):
    """A spec uses a construct the server-side compiler does not support
    (e.g. legacy raw Arquero expression strings, or ops after kde)."""


class DatabaseAuthError(PermissionError):
    """The database rejected the identity forwarded for this request.

    Distinct from UnsupportedQueryError: that one is per-visualization and gets
    reported inside a 200 response, whereas this fails the whole request with a
    403 — a credential problem is not a chart-shaped error.
    """
