"""Issue reports: the /v1/yac/issue_report endpoint and the OfferIssueReport tool.

A report is only worth accepting if something records it, so both halves are
gated on LangFuse: the endpoint refuses without it, and the orchestrator is only
told it may offer a report when the client asked *and* LangFuse is on.
"""

import contextlib
import json
import logging
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest
from starlette.testclient import TestClient

from udiagent.agent import UDIAgent
from udiagent.orchestrator import Orchestrator, OrchestratorResult, Usage

REPORT = {
    "description": "patient-note-should-not-be-logged",
    "contact": "patient-contact-should-not-be-logged",
    "source": "menu",
    "session": {"version": 1, "conversation": {"messages": []}},
}


@pytest.fixture
def server(request):
    """The real app over a stub agent; ``langfuse`` is the client it holds."""
    with patch.object(UDIAgent, "__init__", lambda self, **kwargs: None):
        import udiagent.server.app as server_app

        agent = UDIAgent.__new__(UDIAgent)
        agent.gpt_model = MagicMock()
        agent.gpt_model_name = "gpt-test"
        agent._langfuse_client = getattr(request, "param", MagicMock())
        server_app.agent = agent
        server_app.orchestrator.agent = agent
        yield server_app, TestClient(server_app.app)


def _post(client, body=REPORT, conversation_id="conv-1"):
    return client.post(
        "/v1/yac/issue_report",
        content=body if isinstance(body, bytes) else json.dumps(body),
        headers={"Authorization": "Bearer dev", "X-Conversation-Id": conversation_id},
    )


def test_report_is_filed_under_the_conversations_session(server):
    server_app, client = server
    with patch.object(
        server_app.agent, "record_issue_report", return_value="trace-123"
    ) as record:
        resp = _post(client)

    assert resp.status_code == 200
    assert resp.json() == {"traceId": "trace-123"}
    record.assert_called_once_with(
        description=REPORT["description"],
        contact=REPORT["contact"],
        source="menu",
        session=REPORT["session"],
        session_id="conv-1",
    )


@pytest.mark.parametrize("server", [None], indirect=True)
def test_without_langfuse_the_report_is_refused_not_dropped(server):
    _, client = server
    resp = _post(client)
    assert resp.status_code == 503
    assert "LangFuse" in resp.json()["error"]


def test_oversized_report_is_rejected(server):
    server_app, client = server
    with patch.object(server_app, "MAX_ISSUE_REPORT_BYTES", 100):
        resp = _post(client)
    assert resp.status_code == 413


@pytest.mark.parametrize(
    "body",
    [
        {k: v for k, v in REPORT.items() if k != "description"},
        {**REPORT, "description": ""},
        {**REPORT, "source": "email"},
        b"not json",
    ],
)
def test_invalid_report_is_a_422(server, body):
    _, client = server
    resp = _post(client, body)
    assert resp.status_code == 422
    assert resp.json()["error"] == "Invalid issue report."


def test_report_contents_never_reach_the_log(server, caplog):
    server_app, client = server
    with (
        patch.object(server_app.agent, "record_issue_report", return_value="t"),
        caplog.at_level(logging.INFO, logger=server_app.__name__),
    ):
        _post(client, conversation_id="patient-conversation-id")

    logs = "\n".join(r.getMessage() for r in caplog.records)
    assert "source=menu" in logs
    for secret in (REPORT["description"], REPORT["contact"], "patient-conversation-id"):
        assert secret not in logs


def test_record_issue_report_attaches_the_session_as_json():
    agent = UDIAgent.__new__(UDIAgent)
    agent._langfuse_client = MagicMock()
    agent._langfuse_client.get_current_trace_id.return_value = "trace-9"

    with patch("langfuse.LangfuseMedia") as media:
        trace_id = agent.record_issue_report(
            description="d", contact=None, source="chat", session={"a": 1}, session_id="c"
        )

    assert trace_id == "trace-9"
    media.assert_called_once_with(content_bytes=b'{"a": 1}', content_type="application/json")
    span_input = agent._langfuse_client.update_current_span.call_args.kwargs["input"]
    assert span_input["description"] == "d"
    assert span_input["session"] is media.return_value


def test_record_issue_report_is_a_no_op_without_langfuse():
    agent = UDIAgent.__new__(UDIAgent)
    assert agent.langfuse_enabled is False
    assert (
        agent.record_issue_report(
            description="d", contact=None, source="menu", session={}, session_id=None
        )
        is None
    )


# ---------------------------------------------------------------------------
# Completions: who gets to offer a report
# ---------------------------------------------------------------------------

COMPLETION = {"messages": [{"role": "user", "content": "hi"}], "dataSchema": "{}", "dataDomains": "[]"}


@pytest.mark.parametrize(
    ("client_flag", "langfuse", "offered"),
    [(True, MagicMock(), True), (True, None, False), (False, MagicMock(), False)],
)
def test_completions_offers_reports_only_when_client_and_server_can(
    client_flag, langfuse, offered
):
    with patch.object(UDIAgent, "__init__", lambda self, **kwargs: None):
        import udiagent.server.app as server_app

        agent = UDIAgent.__new__(UDIAgent)
        agent.gpt_model = MagicMock()
        agent.gpt_model_name = "gpt-test"
        agent._langfuse_client = langfuse
        server_app.agent = agent
        server_app.orchestrator.agent = agent

        calls = []

        def fake_run(**kwargs):
            calls.append(kwargs)
            return OrchestratorResult(tool_calls=[], orchestrator_choice="explain", usage=Usage())

        with patch.object(server_app.orchestrator, "run", fake_run):
            resp = TestClient(server_app.app).post(
                "/v1/yac/completions",
                json={**COMPLETION, "issueReporting": client_flag},
                headers={"Authorization": "Bearer dev"},
            )

    assert resp.status_code == 200
    assert calls[0]["issue_reporting"] is offered


# ---------------------------------------------------------------------------
# Orchestrator: the tool is only on offer when asked for
# ---------------------------------------------------------------------------


def _orchestrate(issue_reporting, tool_args):
    sent_tools = []
    call = SimpleNamespace(
        id="c1",
        function=SimpleNamespace(name="OfferIssueReport", arguments=json.dumps(tool_args)),
    )

    def create(**kwargs):
        sent_tools.append([t["function"]["name"] for t in kwargs["tools"]])
        return SimpleNamespace(
            choices=[SimpleNamespace(message=SimpleNamespace(tool_calls=[call], content=None))],
            usage=None,
        )

    client = SimpleNamespace(chat=SimpleNamespace(completions=SimpleNamespace(create=create)))
    agent = SimpleNamespace(
        gpt_model_name="test-model",
        _get_gpt_client=lambda _key=None: client,
        trace=lambda **_kw: contextlib.nullcontext(),
    )
    result = Orchestrator(agent=agent).run(
        [{"role": "user", "content": "this chart is wrong"}],
        json.dumps({"resources": []}),
        "[]",
        issue_reporting=issue_reporting,
    )
    return sent_tools[0], result


def test_tool_is_sent_and_its_offer_returned_when_enabled():
    args = {"message": "Report this?", "summary": "Chart is wrong.", "user_requested": False}
    tools, result = _orchestrate(True, args)

    assert "OfferIssueReport" in tools
    assert result.tool_calls == [{"name": "OfferIssueReport", "arguments": args}]
    assert result.orchestrator_choice == "offer-issue-report"


def test_tool_is_not_sent_when_disabled():
    tools, _ = _orchestrate(False, {"message": "", "summary": "", "user_requested": False})
    assert "OfferIssueReport" not in tools
