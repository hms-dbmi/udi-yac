"""Integration tests for POST /v1/yac/vis_instantiate.

Re-binding a generated chart re-resolves its template rather than rewriting the
finished spec. The distinction is the whole point of the endpoint, so the first
test pins it: a binding can appear in a groupby, in a derive expression and in the
heading, and all of them must move together. A client-side rename of the
representation would leave the derive pointing at a column the rollup no longer
emits, which is exactly how this broke before.

No LLM is involved, so these run offline with no key.
"""

import json
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

from udiagent.agent import UDIAgent

_REPO_ROOT = Path(__file__).resolve().parents[3]
_PCX_PACKAGE = _REPO_ROOT / "sample-data" / "pcx" / "datapackage.json"

def _survival_tool():
    """The baseline-stratified survival curve, looked up rather than hard-coded.

    Its axes are columns the template derives, and its one re-bindable parameter —
    the stratifier — is referenced from ten places, including a rollup output name. Inserting any template ahead of
    it renumbers it, so the name is resolved by suffix.
    """
    from udiagent.generated_vis_tools import TOOL_DISPATCH

    return next(n for n in TOOL_DISPATCH if n.endswith("_line_survival_baseline"))


_SURVIVAL_TOOL = _survival_tool()
_ARGS = {
    "entity1": "Event",
    "entity1_field1": "research_id",
    "entity1_field2": "event_type",
    "entity1_field3": "event_date",
    "entity1_field4": "organization_name",
    # The censoring source: who was still event-free when follow-up stopped.
    # Every survival template takes one, which is why the event log is entity1.
    "entity2": "Patient",
    "entity2_field1": "research_id",
    "entity2_field2": "vital_status",
    "entity2_field3": "vital_status_date",
    "value1": "Initial CNS Tumor",
    "value2": "Deceased",
    "value3": "alive",
}

_HEADERS = {"Authorization": "Bearer dev"}


@pytest.fixture()
def client():
    with patch.object(UDIAgent, "__init__", lambda self, **kwargs: None):
        import udiagent.server.app as server_app

        mock_agent = UDIAgent.__new__(UDIAgent)
        mock_agent.gpt_model = MagicMock(name="default_gpt_model")
        mock_agent.gpt_model_name = "test-model"
        server_app.agent = mock_agent
        server_app.orchestrator.agent = mock_agent

        from starlette.testclient import TestClient

        yield TestClient(server_app.app)


@pytest.fixture(scope="module")
def data_schema():
    if not _PCX_PACKAGE.exists():
        pytest.skip("sample-data/pcx is not present")
    return json.dumps(json.loads(_PCX_PACKAGE.read_text()))


def _post(client, data_schema, **overrides):
    args = {**_ARGS, **overrides}
    return client.post(
        "/v1/yac/vis_instantiate",
        json={"tool": _SURVIVAL_TOOL, "toolArgs": args, "dataSchema": data_schema},
        headers=_HEADERS,
    )


def test_rebinding_the_stratifier_moves_every_reference(client, data_schema):
    response = _post(client, data_schema, entity1_field4="cns_diagnosis_category")
    assert response.status_code == 200, response.text
    spec = response.json()["spec"]

    # Nothing anywhere still points at the old column — the check a rename can't pass.
    assert "organization_name" not in json.dumps(spec)

    # Grouped by subject alone, then by the stratum: the stratifier is read once
    # from the start event rather than joined into the per-subject key.
    groupbys = [t["groupby"] for t in spec["transformation"] if "groupby" in t]
    # Three: the censoring table reduced to one row per subject, then the event
    # log grouped by subject, then by the stratum. The stratifier is read once
    # from the start event rather than joined into the per-subject key.
    assert groupbys == ["research_id", "research_id", "cns_diagnosis_category"]

    # A tenth site, and the one that makes the rewrite approach hopeless: the
    # stratifier is also the *name of a rollup output column*. Rename the colour
    # field alone and the rollup keeps emitting the old name.
    # The per-subject rollup, named by what it emits: the censoring reduction is
    # a rollup too, and it comes first.
    rollup = next(
        t["rollup"]
        for t in spec["transformation"]
        if "rollup" in t and "start day" in t["rollup"]
    )
    assert "cns_diagnosis_category" in rollup

    # The derive a client-side rename cannot see: it neither walks `derive` blocks
    # nor the `concat` list inside one. Left stale, it references a column the
    # rollup above no longer emits, and the whole chart fails to transform.
    label = next(
        t["derive"]["final label"]
        for t in spec["transformation"]
        if "derive" in t and "final label" in t["derive"]
    )
    assert label["concat"][0] == {"field": "cns_diagnosis_category"}

    # The heading names the grouping variable, and stands in for the legend.
    assert spec["title"]["text"] == "cns_diagnosis_category"

    colours = [
        m["field"]
        for layer in spec["representation"]
        for m in layer["mapping"]
        if m["encoding"] == "color"
    ]
    # Six layers now carry the colour: the flat lead-in, the opening drop, the
    # curve, the run-out rule, the end label, and the censoring ticks.
    assert colours == ["cns_diagnosis_category"] * 6


def test_response_describes_the_parameters_it_accepts(client, data_schema):
    response = _post(client, data_schema)
    assert response.status_code == 200, response.text
    body = response.json()

    assert body["params"] == [
        {
            "param": "entity1_field4",
            "placeholder": "E1.F4",
            "entity": "Event",
            "type": "nominal",
            "encodings": ["color"],
            "label": "color",
            "value": "organization_name",
        }
    ]
    # Echoed back so a client can send them straight into the next tweak.
    assert body["toolArgs"] == _ARGS


def test_unknown_bindings_are_pruned_from_the_echo(client, data_schema):
    response = _post(client, data_schema, field9="whatever")
    assert response.status_code == 200, response.text
    assert "field9" not in response.json()["toolArgs"]


def test_unknown_template_is_a_404_naming_the_likely_cause(client, data_schema):
    response = client.post(
        "/v1/yac/vis_instantiate",
        json={"tool": "vis_999_nope", "toolArgs": _ARGS, "dataSchema": data_schema},
        headers=_HEADERS,
    )
    assert response.status_code == 404
    body = response.json()
    assert body["code"] == "unknown_template"
    assert "templates may have changed" in body["error"]
    assert "spec" not in body


@pytest.mark.parametrize(
    "field, expected",
    [
        # Declared quantitative, template requires nominal.
        ("event_date", "requires nominal"),
        ("no_such_column", "not found on entity 'Event'"),
        # The 50-cardinality cap applies to a user's choice too, not just the model's.
        ("research_id", "unique values"),
    ],
)
def test_invalid_stratifier_is_rejected_with_reader_grade_prose(
    client, data_schema, field, expected
):
    response = _post(client, data_schema, entity1_field4=field)
    assert response.status_code == 422
    body = response.json()
    assert body["code"] == "invalid_bindings"
    assert expected in body["error"]
    assert "spec" not in body


def test_incomplete_bindings_are_rejected_rather_than_silently_resolved(
    client, data_schema
):
    """An omitted parameter would otherwise substitute "" and build a broken spec."""
    args = {k: v for k, v in _ARGS.items() if k != "entity1_field3"}
    response = client.post(
        "/v1/yac/vis_instantiate",
        json={"tool": _SURVIVAL_TOOL, "toolArgs": args, "dataSchema": data_schema},
        headers=_HEADERS,
    )
    assert response.status_code == 422
    body = response.json()
    assert body["code"] == "missing_bindings"
    assert body["errors"] == ["entity1_field3"]
    assert "spec" not in body


def test_schema_without_entities_is_rejected(client):
    response = client.post(
        "/v1/yac/vis_instantiate",
        json={"tool": _SURVIVAL_TOOL, "toolArgs": _ARGS, "dataSchema": "{}"},
        headers=_HEADERS,
    )
    assert response.status_code == 400
    assert response.json()["code"] == "bad_schema"
