"""Choice placeholders: a template slot that picks one of a fixed set of computations.

A field binding swaps which column a chart reads; a choice swaps *how* it computes
something — here, which survival estimator draws the curve, how much of the
follow-up it shows, and whether it carries a confidence band. Like a stratifier
grouping it is optional (absent means the default) and it resolves to structure
rather than a name: `instantiate_template` strips the quotes around the
placeholder and the chosen expression is injected in its place.

Each choice is offered as a dropdown in the dashboard's tweak panel, and as an
optional enum parameter the model can set when a request names one ("crude
survival", "10-year survival").
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


#: The two survival estimators. Both curves are derived by every survival
#: template (see `_kaplan_meier` in scripts/template_viz_generation.py), so the
#: choice resolves to nothing but a flag saying which one to draw — 1 for
#: Kaplan-Meier — which the template also reads to show the confidence band
#: only under the estimator it belongs to.
ESTIMATOR = Choice(
    param="estimator",
    default="kaplan_meier",
    options={
        # The running product: censored subjects leave the number at risk.
        "kaplan_meier": ("Kaplan-Meier", _lit(1)),
        # Events so far over the whole group: censored subjects stay in the
        # denominator after their follow-up ends, so this sits above the
        # Kaplan-Meier curve wherever a censoring precedes a later event, and
        # equals it when nothing is censored.
        "basic": ("Basic (events / cohort)", _lit(0)),
    },
    description=(
        "OPTIONAL. How the survival curve is estimated. Omit it for 'kaplan_meier', "
        "the standard estimator, which drops censored subjects from the number at "
        "risk. 'basic' divides events so far by the whole group instead — only when "
        "the request asks for a crude, naive or cumulative-proportion curve."
    ),
    label="estimator",
)

#: Stands in for "no cut" under the `full` horizon: further out than any
#: follow-up, so the window filter keeps every row and the curve is never
#: reported as cut. A number rather than null so the comparisons that use it
#: need no null handling in either executor.
HORIZON_FULL_YEARS = 1_000_000

#: How much of the follow-up a survival curve shows, in years. Five by default:
#: past it most cohorts have only a handful of subjects left at risk, and the
#: steps they draw are noise the eye still reads as findings. The estimate is
#: always taken over the whole follow-up and only then cut, so the curve inside
#: the window is the same whatever the window.
HORIZON = Choice(
    param="time_horizon",
    default="5",
    options={
        **{
            str(years): (f"{years} year{'s' if years > 1 else ''}", _lit(years))
            for years in (1, 2, 3, 5, 10)
        },
        "full": ("Full follow-up", _lit(HORIZON_FULL_YEARS)),
    },
    description=(
        "OPTIONAL. How many years of follow-up the survival curve shows. Omit it for "
        "the default of 5 years. Set it only when the request names a different span "
        "('10-year survival', 'the first 2 years'), or 'full' when it asks for the "
        "whole follow-up ('all follow-up', 'as far as the data goes')."
    ),
    label="time span",
)

#: Whether a Kaplan-Meier curve carries its 95% confidence band. The resolved
#: value is a 1/0 flag the template multiplies into the band's visibility; the
#: band is computed either way (see `_kaplan_meier`).
CONFIDENCE_BAND = Choice(
    param="confidence_band",
    default="show",
    options={
        "show": ("Show 95% CI", _lit(1)),
        "hide": ("Hide", _lit(0)),
    },
    description=(
        "OPTIONAL. Whether the survival curve shows its 95% confidence band. Omit "
        "it to show the band; 'hide' only when the request asks for the curve "
        "without confidence intervals. The band is drawn for Kaplan-Meier only."
    ),
    label="confidence band",
)

#: Placeholder key -> its choice. A placeholder is `<KEY>`, e.g. `<ESTIMATOR>`.
CHOICES: dict[str, Choice] = {
    "ESTIMATOR": ESTIMATOR,
    "HORIZON": HORIZON,
    "CI": CONFIDENCE_BAND,
}


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
