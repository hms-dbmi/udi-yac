class Op:
    @staticmethod
    def count():
        return {"op": "count"}

    @staticmethod
    def frequency():
        return {"op": "frequency"}

    @staticmethod
    def mean(field):
        return {"op": "mean", "field": field}

    @staticmethod
    def min(field):
        return {"op": "min", "field": field}

    @staticmethod
    def max(field):
        return {"op": "max", "field": field}

    @staticmethod
    def median(field):
        return {"op": "median", "field": field}

    @staticmethod
    def sum(field):
        return {"op": "sum", "field": field}


def rolling(expression):
    return {"rolling": {"expression": expression}}


class Expr:
    """Builders for the structured expression AST used by derive/filter.

    Mirrors the toolkit's ``Expr`` union in GrammarTypes.ts: each node carries
    a distinct discriminant key (field | literal | op | if | agg | window) so
    the same spec compiles to Arquero (client) or SQL (server).

    Note this is separate from ``Op`` (rollup aggregates): ``Op`` reduces rows
    per group; ``Expr.agg`` broadcasts a group aggregate back to every row.
    """

    @staticmethod
    def field(name):
        return {"field": name}

    @staticmethod
    def lit(value):
        return {"literal": value}

    @staticmethod
    def binop(op, left, right):
        return {"op": op, "left": left, "right": right}

    @staticmethod
    def cond(if_, then, else_):
        return {"if": if_, "then": then, "else": else_}

    @staticmethod
    def agg(op, field=None):
        node = {"agg": op}
        if field is not None:
            node["field"] = field
        return node

    @staticmethod
    def rank():
        return {"window": "rank"}

    @staticmethod
    def not_null(field):
        """Common filter: ``d['field'] != null``."""
        return {"op": "!=", "left": {"field": field}, "right": {"literal": None}}
