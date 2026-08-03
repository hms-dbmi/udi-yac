class UnsupportedQueryError(ValueError):
    """A spec uses a construct the server-side compiler does not support
    (e.g. legacy raw Arquero expression strings, or ops after kde)."""
