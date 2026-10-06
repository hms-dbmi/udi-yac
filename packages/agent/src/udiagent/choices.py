"""Choice placeholders: a template slot that picks one of a fixed set of computations.

A field binding swaps which column a chart reads; a choice swaps *how* it computes
something — here, which survival estimator draws the curve. Like a stratifier
grouping it is optional (absent means the default) and it resolves to structure
rather than a name: `instantiate_template` strips the quotes around the
placeholder and the chosen expression is injected in its place.

Each choice is offered as a dropdown in the dashboard's tweak panel, and as an
optional enum parameter the model can set when a request names one ("crude
survival", "Kaplan-Meier").
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class Choice:
    #: Tool parameter name the model and the tweak panel send.
    param: str
    #: The option used when none is supplied.
    default: str
    #: option -> (label shown in the tweak panel, resolved expression)
    options: dict[str, tuple[str, dict]]
    #: Tool parameter description, for the model.
    description: str
    #: Tweak-panel label.
    label: str


def _lit(value):
    return {"literal": value}


def _field(name):
    return {"field": name}


def _op(op, left, right):
    return {"op": op, "left": left, "right": right}


#: The two survival estimators. Both read columns every survival template
#: derives (see `_kaplan_meier` in scripts/template_viz_generation.py), so the
#: choice costs nothing but the expression that picks between them.
ESTIMATOR = Choice(
    param="estimator",
    default="kaplan_meier",
    options={
        # The running product, forced to 0 once a factor has been 0 (the last
        # subject at risk had the event), where log(0) could not be taken.
        "kaplan_meier": (
            "Kaplan-Meier",
            {
                "if": _op(">", _field("km exhausted so far"), _lit(0)),
                "then": _lit(0),
                "else": _op("*", _field("km product"), _lit(100)),
            },
        ),
        # Events so far over the whole group: censored subjects stay in the
        # denominator after their follow-up ends, so this sits above the
        # Kaplan-Meier curve wherever a censoring precedes a later event, and
        # equals it when nothing is censored.
        "basic": (
            "Basic (events / cohort)",
            _op(
                "*",
                _op("-", _lit(1), _op("/", _field("events so far"), _field("subjects"))),
                _lit(100),
            ),
        ),
    },
    description=(
        "OPTIONAL. How the survival curve is estimated. Omit it for 'kaplan_meier', "
        "the standard estimator, which drops censored subjects from the number at "
        "risk. 'basic' divides events so far by the whole group instead — only when "
        "the request asks for a crude, naive or cumulative-proportion curve."
    ),
    label="estimator",
)

#: Placeholder key -> its choice. A placeholder is `<KEY>`, e.g. `<ESTIMATOR>`.
CHOICES: dict[str, Choice] = {"ESTIMATOR": ESTIMATOR}


class ChoiceError(ValueError):
    pass


def resolve_choice(key: str, value) -> dict:
    """The expression a choice placeholder resolves to. None/'' means default."""
    choice = CHOICES[key]
    option = value if isinstance(value, str) and value else choice.default
    if option not in choice.options:
        raise ChoiceError(
            f"'{option}' is not a valid {choice.param}; use one of "
            f"{', '.join(repr(o) for o in choice.options)}."
        )
    return choice.options[option][1]
