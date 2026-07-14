"""Server-side query layer: compiles UDI grammar transformation pipelines to
SQL and executes them against a configured backend (StarRocks, DuckDB).

This is "Compiler B" — the server analogue of the toolkit's Arquero executor
("Compiler A", packages/grammar/DataSourcesStore.ts), which defines the
reference semantics. Parity between the two is enforced by tests/goldens.
"""

from .engine import QueryEngine
from .connectors import DuckDBConnector, StarRocksConnector
from .errors import UnsupportedQueryError

__all__ = [
    "QueryEngine",
    "DuckDBConnector",
    "StarRocksConnector",
    "UnsupportedQueryError",
]
