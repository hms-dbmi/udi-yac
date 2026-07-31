"""Tests for the structured expression AST builders (Expr)."""

from udi_grammar_py import Chart, Expr


def test_expr_node_shapes():
    assert Expr.field("age") == {"field": "age"}
    assert Expr.lit(1) == {"literal": 1}
    assert Expr.lit(None) == {"literal": None}
    assert Expr.agg("count") == {"agg": "count"}
    assert Expr.agg("max", "n") == {"agg": "max", "field": "n"}
    assert Expr.rank() == {"window": "rank"}
    assert Expr.not_null("f") == {
        "op": "!=",
        "left": {"field": "f"},
        "right": {"literal": None},
    }


def test_expr_nested_conditional():
    # legacy: "d.rank == 1 ? 'yes' : 'no'"
    node = Expr.cond(
        Expr.binop("==", Expr.field("rank"), Expr.lit(1)),
        Expr.lit("yes"),
        Expr.lit("no"),
    )
    assert node == {
        "if": {"op": "==", "left": {"field": "rank"}, "right": {"literal": 1}},
        "then": {"literal": "yes"},
        "else": {"literal": "no"},
    }


def test_expr_in_chart_spec():
    spec = (
        Chart()
        .source("donors", "donors.csv")
        .filter(Expr.not_null("age"))
        .derive({"rank": Expr.rank()})
        .to_dict()
    )
    assert spec["transformation"][0]["filter"] == Expr.not_null("age")
    assert spec["transformation"][1]["derive"] == {"rank": {"window": "rank"}}
