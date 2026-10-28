"""A survival curve shows 5 years unless the request asks for another span.

Reported on the combined pcx package: "Compare overall survival by subtype across
all data" drew the full follow-up. The model set `time_horizon: "full"` for words
about which data, not how long, in 3 of 4 runs, and a tool description telling it
not to cut that only partly. So the agent drops a span the request never named.
"""

from unittest.mock import patch

import pytest

from udiagent.orchestrator import Orchestrator
from udiagent.vis_generate import _drop_unasked_horizon, _latest_user_text

_ARGS = {"entity": "Os", "dimension3": "subtype", "time_horizon": "full"}


@pytest.mark.parametrize(
    "request_text",
    [
        "Compare overall survival by subtype across all data",
        "Show event-free survival for the full data by protocol",
        "Show survival curves by diagnosis for the Cumulus data",
        "Overall survival for all patients",
        "",
    ],
)
def test_a_span_the_request_never_named_is_dropped(request_text):
    assert "time_horizon" not in _drop_unasked_horizon(_ARGS, request_text)


@pytest.mark.parametrize(
    "request_text",
    [
        "Show overall survival by diagnosis over the full follow-up",
        "Show 10-year overall survival by diagnosis",
        "Survival in the first 2 years",
        "What does survival look like at 18 months?",
        "Long-term survival by subtype",
        "Show survival as far as the data goes",
    ],
)
def test_a_span_the_request_names_is_kept(request_text):
    assert _drop_unasked_horizon(_ARGS, request_text) == _ARGS


def test_other_arguments_are_untouched():
    assert _drop_unasked_horizon({"entity": "Os"}, "across all data") == {"entity": "Os"}


def test_the_latest_user_message_is_the_request():
    messages = [
        {"role": "user", "content": "Show 10-year survival"},
        {"role": "assistant", "content": "Here it is."},
        {"role": "user", "content": [{"type": "text", "text": "Now across all data"}]},
    ]
    assert _latest_user_text(messages) == "Now across all data"


def test_the_orchestrator_checks_the_users_words_not_its_description():
    """The orchestrator hands generation its own description of the chart in
    place of the user's message, which may drop or invent a span."""
    orchestrator = Orchestrator.__new__(Orchestrator)
    orchestrator.agent = object()
    orchestrator.grammar = {}
    messages = [{"role": "user", "content": "Show 10-year survival by subtype"}]
    with patch("udiagent.orchestrator.function_call_render_visualization") as render:
        orchestrator._handle_create_visualization(
            {"description": "Overall survival curves by subtype"}, messages, "{}", None, None
        )
    assert render.call_args.kwargs["request_text"] == "Show 10-year survival by subtype"
    assert render.call_args.args[1][-1]["content"] == "Overall survival curves by subtype"
