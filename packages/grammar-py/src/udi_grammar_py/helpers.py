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
    def concat(parts):
        """String-concatenate the parts, in order; numbers are stringified.

        For labels that combine values, since a text mark draws a single field.
        Round or scale numbers beforehand — there is no formatting here.
        """
        return {"concat": list(parts)}

    @staticmethod
    def log(arg):
        """Natural logarithm. Guard the argument: log(0) is an error in SQL."""
        return {"fn": "log", "args": [arg]}

    @staticmethod
    def exp(arg):
        """e to the power of the argument. With `log`, a running product is
        ``exp(sum(log(x)))`` over a rolling window."""
        return {"fn": "exp", "args": [arg]}

    @staticmethod
    def lower(arg):
        """Lower-case a string; null stays null."""
        return {"fn": "lower", "args": [arg]}

    @staticmethod
    def contains(text, search):
        """True when `text` contains `search` (case-sensitive; wrap both in
        ``lower`` to ignore case). A null on either side is false."""
        return {"fn": "contains", "args": [text, search]}

    @staticmethod
    def not_null(field):
        """Common filter: ``d['field'] != null``."""
        return {"op": "!=", "left": {"field": field}, "right": {"literal": None}}
