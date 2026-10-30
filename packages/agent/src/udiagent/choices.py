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
        "OPTIONAL — leave it out. The curve is always Kaplan-Meier, the standard "
        "estimator, unless the user explicitly asks for a different one. Set "
        "'basic' (events so far divided by the whole group) ONLY when the request "
        "itself asks for a crude, naive or cumulative-proportion curve; never "
        "choose it on your own judgement of the data."
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
        "OPTIONAL — leave it out. How many years of follow-up the survival curve "
        "shows; omitted, it is 5 years. Set it ONLY when the request names a "
        "different span of TIME ('10-year survival', 'the first 2 years'), or 'full' "
        "when it explicitly asks for the whole follow-up TIME ('all follow-up', 'as "
        "far as the data goes'). Words about which patients or data ('all data', "
        "'the full data', 'the whole cohort', 'all patients') are not a time span: "
        "leave it out for them."
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
        "OPTIONAL — leave it out. The 95% confidence band is always shown unless "
        "the user explicitly asks to hide it ('without confidence intervals', 'no "
        "CI band'). Set 'hide' ONLY for such a request; never hide it on your own "
        "judgement, e.g. because the chart looks busy or the groups are small."
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


@dataclass(frozen=True)
class TextLabel:
    """A template slot that only NAMES what a chart shows, in its title.

    Unlike a `Choice` it changes no computation, so it is deliberately not
    offered in the tweak panel: flipping "overall" to "event-free" there would
    relabel the chart without changing which events end its curves. It lives in
    a template's title/summary text, never in its spec, and is filled in on the
    server (`resolve_text_templates`) from the tool argument the model set.
    """

    #: Tool parameter name the model sends.
    param: str
    #: The text used when the model sends none.
    default: str
    #: option -> the text that replaces the placeholder.
    options: dict[str, str]
    #: Tool parameter description, for the model.
    description: str


#: Which survival endpoint a curve shows. The events that end a curve are data
#: values — an event-log template's `value2` list, a cube's event status
#: `value1` — which differ per dataset ("death", "Deceased", "event"), so the
#: endpoint cannot be read off them reliably. The model picks both from the same
#: request, so it is asked to name the one it built.
ENDPOINT = TextLabel(
    param="endpoint",
    default="Survival",
    options={
        "overall_survival": "Overall survival",
        "event_free_survival": "Event-free survival",
        "progression_free_survival": "Progression-free survival",
    },
    description=(
        "OPTIONAL. Names the survival endpoint in the chart title, and must match "
        "the events that end the curve (for a cube, what its time and status "
        "dimensions describe): 'overall_survival' when death alone ends the "
        "curve; 'progression_free_survival' for progression or death; "
        "'event_free_survival' for progression, recurrence, relapse, a second "
        "malignancy or death. Omit it when the end events are none of these; the "
        "title then just says 'Survival'."
    ),
)

#: Placeholder key -> its label. Written `<ENDPOINT>` in a title template.
LABELS: dict[str, TextLabel] = {"ENDPOINT": ENDPOINT}


def resolve_label(key: str, value) -> str:
    """The text a label placeholder resolves to. None/'' means its default."""
    label = LABELS[key]
    if not (isinstance(value, str) and value):
        return label.default
    if value not in label.options:
        raise ChoiceError(
            f"'{value}' is not a valid {label.param}; use one of "
            f"{', '.join(repr(o) for o in label.options)}."
        )
    return label.options[value]


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
