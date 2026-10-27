"""The HTTP endpoints' logic, for any web framework.

A host that serves the chat from its own backend (Flask, Django, ...) calls
these instead of porting the reference server's handlers: each takes the parsed
JSON request body, returns the JSON response body, and raises ``EndpointError``
for a failure the client acts on. ``udiagent.server.app`` is a thin FastAPI
layer over the same functions, so a host and the reference server cannot drift.

A Flask route, for example::

    from udiagent.api import EndpointError, vis_instantiate

    @app.post('/v1/yac/vis_instantiate')
    def yac_vis_instantiate():
        try:
            return jsonify(vis_instantiate(request.get_json(silent=True) or {}))
        except EndpointError as e:
            return jsonify(e.body()), e.status
"""

import logging

from pydantic import ValidationError

from udiagent.models import YACVisInstantiateRequest, YACVisInstantiateResponse
from udiagent.vis_generate import (
    _load_generated_tools,
    _parse_request_schema,
    instantiate_template,
    shared_entities_for,
    template_tweakable_params,
    unbound_placeholders,
    validate_bindings,
)

logger = logging.getLogger(__name__)


class EndpointError(Exception):
    """A failure to answer with ``status`` and ``body()``.

    ``code`` is what the chat acts on: on ``unknown_template`` it drops a
    chart's tweak controls.
    """

    def __init__(
        self, status: int, code: str, message: str, errors: list[str] | None = None
    ):
        super().__init__(message)
        self.status = status
        self.code = code
        self.errors = errors

    def body(self) -> dict:
        """The JSON error body: ``{code, error}``, plus ``errors`` when there are several."""
        body = {"code": self.code, "error": str(self)}
        if self.errors is not None:
            body["errors"] = self.errors
        return body


def vis_instantiate(body: dict | YACVisInstantiateRequest) -> dict:
    """Re-instantiate a template-generated chart with new bindings.

    The logic of ``POST /v1/yac/vis_instantiate``. No LLM call, so it needs no
    agent and no OpenAI key.

    Args:
        body: The request body: ``tool``, ``toolArgs`` and ``dataSchema``
            (see ``YACVisInstantiateRequest``).

    Returns:
        The response body, shaped as ``YACVisInstantiateResponse``.

    Raises:
        EndpointError: ``bad_request`` (422), ``bad_schema`` (400),
            ``unknown_template`` (404), ``missing_bindings`` or
            ``invalid_bindings`` (422), ``instantiate_failed`` (500) or
            ``templates_unavailable`` (503).
    """
    try:
        request = YACVisInstantiateRequest.model_validate(body)
    except ValidationError as exc:
        errors = [
            f"{'.'.join(map(str, e['loc'])) or 'body'}: {e['msg']}"
            for e in exc.errors(include_url=False)
        ]
        raise EndpointError(422, "bad_request", "Invalid request body.", errors) from exc

    generated = _load_generated_tools()
    if generated is None:
        raise EndpointError(
            503,
            "templates_unavailable",
            "This agent has no generated visualization templates.",
        )
    _tool_defs, tool_dispatch, templates, _tool_tags = generated

    entry = tool_dispatch.get(request.tool)
    if entry is None:
        raise EndpointError(
            404,
            "unknown_template",
            f"Unknown visualization template '{request.tool}'. The agent's "
            "templates may have changed since this chart was created.",
        )
    template_idx, param_map = entry
    spec_template = templates[template_idx]

    schema = _parse_request_schema(request.dataSchema)
    if not schema.get("entities"):
        # _parse_request_schema degrades to an empty schema by design, which
        # would validate nothing and instantiate an unusable spec.
        raise EndpointError(
            400,
            "bad_schema",
            "dataSchema has no entities; send the data package descriptor.",
        )

    bindings = {
        param_map[k]: v for k, v in request.toolArgs.items() if k in param_map
    }

    missing = unbound_placeholders(spec_template, param_map, bindings)
    if missing:
        raise EndpointError(
            422,
            "missing_bindings",
            "Missing bindings for this template: " + ", ".join(missing),
            missing,
        )

    errors = validate_bindings(
        spec_template, bindings, schema, shared_entities=shared_entities_for(request.tool)
    )
    if errors:
        # errors[0] is already reader-grade prose naming the valid alternatives.
        raise EndpointError(422, "invalid_bindings", errors[0], errors)

    try:
        spec = instantiate_template(spec_template, bindings, schema)
    except Exception as exc:  # noqa: BLE001 - reported, not swallowed
        logger.warning("vis_instantiate failed for %s: %s", request.tool, exc)
        raise EndpointError(
            500,
            "instantiate_failed",
            f"Could not build a spec from template '{request.tool}'.",
        ) from exc

    # Through the response model, as FastAPI's response_model does, so every
    # host sends the documented shape (a param's absent optionals as nulls).
    return YACVisInstantiateResponse(
        spec=spec,
        toolArgs={k: v for k, v in request.toolArgs.items() if k in param_map},
        params=template_tweakable_params(spec_template, param_map, bindings, schema),
    ).model_dump()
