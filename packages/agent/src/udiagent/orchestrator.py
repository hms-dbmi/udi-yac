"""Orchestrator — routes user requests to the appropriate tool handlers."""

import copy
import json
import logging
from dataclasses import dataclass, field
from typing import Callable

import openai

from udiagent.skills import Skill, load_skills, render_template
from udiagent.grammar import load_grammar
from udiagent.messages import normalize_tool_calls, split_tool_calls
from udiagent.schema import parse_schema_from_dict, simplify_data_domains
from udiagent.structured_functions import (
    validate_structured_text,
    segment_structured_text,
    get_function_signatures,
)
from udiagent.tools import (
    ORCHESTRATOR_TOOLS,
    function_call_render_visualization,
)

logger = logging.getLogger(__name__)


_DEFAULT_BUDGET_MESSAGE = (
    "You've reached your free usage limit. Add your own OpenAI key in settings to continue."
)


@dataclass
class Usage:
    """Aggregated and per-operation token usage for a single ``Orchestrator.run()``."""

    prompt_tokens: int = 0
    completion_tokens: int = 0
    total_tokens: int = 0
    # Sub-counts broken out for cost visibility: cached input is billed at a
    # discount; reasoning tokens are a subset of ``completion_tokens``. Both
    # are 0 on providers/models that don't report them.
    cached_prompt_tokens: int = 0
    reasoning_tokens: int = 0
    operations: list[dict] = field(default_factory=list)

    def add(self, op: str, resp_usage) -> None:
        """Record usage from a ``chat.completions.create`` response."""
        if resp_usage is None:
            return
        prompt = int(getattr(resp_usage, "prompt_tokens", 0) or 0)
        completion = int(getattr(resp_usage, "completion_tokens", 0) or 0)
        total = int(
            getattr(resp_usage, "total_tokens", 0) or (prompt + completion)
        )
        p_details = getattr(resp_usage, "prompt_tokens_details", None)
        cached = int(getattr(p_details, "cached_tokens", 0) or 0)
        c_details = getattr(resp_usage, "completion_tokens_details", None)
        reasoning = int(getattr(c_details, "reasoning_tokens", 0) or 0)
        self.prompt_tokens += prompt
        self.completion_tokens += completion
        self.total_tokens += total
        self.cached_prompt_tokens += cached
        self.reasoning_tokens += reasoning
        self.operations.append(
            {
                "op": op,
                "prompt_tokens": prompt,
                "completion_tokens": completion,
                "total_tokens": total,
                "cached_prompt_tokens": cached,
                "reasoning_tokens": reasoning,
            }
        )


class BudgetExceededError(Exception):
    """Raised when an LLM call is refused for quota/rate-limit reasons.

    Carries the accumulated ``Usage`` at the moment of failure so callers can
    still log / bill for tokens spent before the refusal.
    """

    def __init__(self, message: str, usage: Usage | None = None):
        super().__init__(message)
        self.message = message
        self.usage = usage if usage is not None else Usage()


def _is_quota_error(err: openai.APIStatusError) -> bool:
    """Heuristic: does this OpenAI error mean the caller is out of budget?"""
    if getattr(err, "status_code", None) in (402, 429):
        return True
    code = getattr(err, "code", None)
    return code in ("insufficient_quota", "billing_hard_limit_reached")


def _call_with_budget_guard(fn, usage: "Usage", /, *args, **kwargs):
    """Invoke an OpenAI completion call, mapping quota/rate-limit errors to ``BudgetExceededError``.

    Non-quota ``APIStatusError``s propagate unchanged.
    """
    try:
        return fn(*args, **kwargs)
    except openai.RateLimitError as err:
        raise BudgetExceededError(_DEFAULT_BUDGET_MESSAGE, usage) from err
    except openai.APIStatusError as err:
        if _is_quota_error(err):
            raise BudgetExceededError(_DEFAULT_BUDGET_MESSAGE, usage) from err
        raise


def build_rebuff_toolcall(
    message: str,
    suggestions: list[str] | None = None,
    *,
    reason: str | None = None,
) -> dict:
    """Build a Rebuff tool_call dict without invoking an LLM.

    Matches the shape produced by ``Orchestrator._handle_rebuff`` so it can be
    returned directly alongside (or in place of) normal tool_calls.

    ``reason`` is an optional machine-readable discriminator (currently only
    ``"budget_exceeded"``) that lets the frontend distinguish a quota refusal
    from an ordinary rebuff and prompt the user for their own API key. The
    key is omitted entirely when ``reason`` is ``None`` so existing rebuffs
    keep their original payload shape.
    """
    arguments: dict = {
        "message": message,
        "suggestions": list(suggestions) if suggestions else [],
    }
    if reason is not None:
        arguments["reason"] = reason
    return {
        "name": "Rebuff",
        "arguments": arguments,
    }


@dataclass
class OrchestratorResult:
    """Result of an orchestration run."""

    tool_calls: list[dict] = field(default_factory=list)
    orchestrator_choice: str = "render-visualization"
    usage: Usage = field(default_factory=Usage)


class Orchestrator:
    """Routes user requests to visualization, filter, explanation, and other tool handlers.

    Args:
        agent: A ``UDIAgent`` instance.
        skills: Skill registry.  Loaded from bundled data if ``None``.
        tools: Tool definitions list.  Defaults to ``ORCHESTRATOR_TOOLS``.
        grammar: Preloaded grammar dict.  Auto-loaded if ``None``.
    """

    def __init__(
        self,
        agent,
        skills: dict[str, Skill] | None = None,
        tools: list[dict] | None = None,
        grammar: dict | None = None,
    ):
        self.agent = agent
        self.skills = skills if skills is not None else load_skills()
        self.tools = tools if tools is not None else ORCHESTRATOR_TOOLS
        self.grammar = grammar if grammar is not None else load_grammar("udi")

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def run(
        self,
        messages: list[dict],
        data_schema: str,
        data_domains: str,
        openai_api_key: str | None = None,
        budget_check: Callable[["Usage"], str | None] | None = None,
        session_id: str | None = None,
    ) -> OrchestratorResult:
        """Run the orchestrator on a user request.

        Args:
            messages: Chat history (OpenAI message format).
            data_schema: JSON string describing dataset entities and fields.
            data_domains: JSON string (or list) describing field domains.
            openai_api_key: Optional per-request OpenAI key override.
            budget_check: Optional callback invoked with the current ``Usage``.
                Return a non-empty string to short-circuit the run and produce
                a Rebuff tool_call carrying that message; return ``None`` to
                proceed. Invoked pre-flight and again after the top-level
                orchestration completion.
            session_id: Optional per-conversation ID used to group this run's
                LLM calls into a single LangFuse trace/session. No-op when
                LangFuse is disabled.

        Returns:
            An ``OrchestratorResult`` with tool_calls, orchestrator_choice, and usage.
        """
        with self.agent.trace(session_id=session_id):
            return self._run(
                messages,
                data_schema,
                data_domains,
                openai_api_key=openai_api_key,
                budget_check=budget_check,
            )

    def _run(
        self,
        messages: list[dict],
        data_schema: str,
        data_domains: str,
        openai_api_key: str | None = None,
        budget_check: Callable[["Usage"], str | None] | None = None,
    ) -> OrchestratorResult:
        usage = Usage()

        if budget_check is not None:
            refusal = budget_check(usage)
            if refusal:
                return OrchestratorResult(
                    tool_calls=[build_rebuff_toolcall(refusal)],
                    orchestrator_choice="rebuff",
                    usage=usage,
                )

        msgs = split_tool_calls(messages)
        try:
            tool_calls, choice = self._orchestrate_tool_calls(
                msgs,
                data_schema,
                data_domains,
                usage,
                openai_api_key=openai_api_key,
                budget_check=budget_check,
            )
        except BudgetExceededError as err:
            if budget_check is None:
                raise
            return OrchestratorResult(
                tool_calls=[build_rebuff_toolcall(err.message)],
                orchestrator_choice="rebuff",
                usage=err.usage,
            )
        return OrchestratorResult(
            tool_calls=tool_calls,
            orchestrator_choice=choice,
            usage=usage,
        )

    # ------------------------------------------------------------------
    # Tool dispatch handlers
    # ------------------------------------------------------------------

    def _handle_create_visualization(
        self,
        tool_args,
        messages,
        data_schema,
        data_domains,
        usage,
        openai_api_key=None,
    ):
        description = tool_args.get("description", "")
        if description:
            focused_messages = [
                msg for msg in messages if msg.get("role") != "user"
            ] + [{"role": "user", "content": description}]
        else:
            focused_messages = list(messages)

        result = function_call_render_visualization(
            self.agent,
            focused_messages,
            data_schema,
            self.grammar,
            usage=usage,
            openai_api_key=openai_api_key,
        )

        title = tool_args.get("title", "")
        if title:
            result["arguments"]["title"] = title

        return result

    def _handle_rebuff(
        self,
        tool_args,
        messages,
        data_schema,
        data_domains,
        usage,
        openai_api_key=None,
    ):
        available_capabilities = [
            f"{t['function']['name']}: {t['function']['description']}"
            for t in self.tools
            if t["function"]["name"] != "Rebuff"
        ]

        rebuff_skill = self.skills.get("rebuff")
        if rebuff_skill:
            rendered = render_template(
                rebuff_skill.instructions,
                {
                    "user_request": tool_args.get("user_request", ""),
                    "reason": tool_args.get("reason", ""),
                    "available_tools": "\n".join(
                        f"- {cap}" for cap in available_capabilities
                    ),
                },
            )
            gpt_client = self.agent._get_gpt_client(openai_api_key)
            msgs = normalize_tool_calls(copy.deepcopy(messages))
            msgs.insert(0, {"role": "system", "content": rendered})
            resp = _call_with_budget_guard(
                gpt_client.chat.completions.create,
                usage,
                model=self.agent.gpt_model_name,
                messages=msgs,
                temperature=0.0,
                max_completion_tokens=1024,
            )
            usage.add("rebuff", getattr(resp, "usage", None))
            try:
                response_data = json.loads(resp.choices[0].message.content)
            except (json.JSONDecodeError, IndexError):
                response_data = {
                    "message": f"Sorry, I cannot fulfill this request. {tool_args.get('reason', '')}",
                    "suggestions": [],
                }
        else:
            response_data = {
                "message": f"Sorry, I cannot fulfill this request. {tool_args.get('reason', '')}",
                "suggestions": [],
            }

        return {
            "name": "Rebuff",
            "arguments": response_data,
        }

    def _handle_free_text_explain(
        self,
        tool_args,
        messages,
        data_schema,
        data_domains,
        usage,
        openai_api_key=None,
    ):
        available_tools = "\n".join(
            f"- {t['function']['name']}: {t['function']['description']}"
            for t in self.tools
            if t["function"]["name"] not in ("Rebuff", "FreeTextExplain")
        )

        data_schema_simple = simplify_data_domains(data_domains)

        explain_skill = self.skills.get("free_text_explain")
        if explain_skill:
            rendered = render_template(
                explain_skill.instructions,
                {
                    "user_request": tool_args.get("user_request", ""),
                    "response_type": tool_args.get("response_type", "general"),
                    "available_tools": available_tools,
                    "data_schema": data_schema_simple,
                    "structured_functions": get_function_signatures(),
                },
            )
            gpt_client = self.agent._get_gpt_client(openai_api_key)
            msgs = normalize_tool_calls(copy.deepcopy(messages))
            msgs.insert(0, {"role": "system", "content": rendered})
            resp = _call_with_budget_guard(
                gpt_client.chat.completions.create,
                usage,
                model=self.agent.gpt_model_name,
                messages=msgs,
                temperature=0.0,
                max_completion_tokens=1024,
            )
            usage.add("free_text_explain", getattr(resp, "usage", None))
            text_response = resp.choices[0].message.content
        else:
            text_response = "I can help you explore and visualize data. Try asking for a specific chart or data summary."

        # Validate structured function references
        validation_errors = validate_structured_text(text_response)

        if not validation_errors:
            try:
                schema_dict = (
                    json.loads(data_schema)
                    if isinstance(data_schema, str)
                    else data_schema
                )
                schema_parsed = parse_schema_from_dict(schema_dict)
                text_segments, has_structured = segment_structured_text(
                    text_response, schema_parsed
                )
            except Exception:
                text_segments = [text_response]
                has_structured = False
        else:
            text_segments = [text_response]
            has_structured = False

        return {
            "name": "FreeTextExplain",
            "arguments": {
                "response_type": tool_args.get("response_type", "general"),
                "text": text_segments,
                "has_structured_elements": has_structured,
            },
        }

    def _handle_clarify_variable(
        self,
        tool_args,
        messages,
        data_schema,
        data_domains,
        usage,
        openai_api_key=None,
    ):
        try:
            schema_raw = (
                json.loads(data_schema) if isinstance(data_schema, str) else data_schema
            )
        except (json.JSONDecodeError, TypeError):
            schema_raw = {}

        field_meta = {}
        for resource in schema_raw.get("resources", []):
            entity_name = resource.get("name", "")
            for field_def in resource.get("schema", {}).get("fields", []):
                fname = field_def.get("name", "")
                field_meta[(entity_name, fname)] = {
                    "data_type": field_def.get("udi:data_type", "unknown"),
                    "description": field_def.get("description", "").strip(),
                }

        ambiguous_variables = tool_args.get("ambiguous_variables", [])
        for var in ambiguous_variables:
            for candidate in var.get("candidates", []):
                key = (candidate.get("entity", ""), candidate.get("field_name", ""))
                meta = field_meta.get(key, {})
                candidate["data_type"] = meta.get("data_type", "unknown")
                candidate["description"] = meta.get("description", "")

        return {
            "name": "ClarifyVariable",
            "arguments": {
                "message": tool_args.get("message", ""),
                "ambiguous_variables": ambiguous_variables,
            },
        }

    def _handle_filter_data(
        self,
        tool_args,
        messages,
        data_schema,
        data_domains,
        usage,
        openai_api_key=None,
    ):
        filter_obj = {
            "filterType": tool_args["filterType"],
            "intervalRange": tool_args.get("intervalRange", {"min": 0, "max": 0}),
            "pointValues": tool_args.get("pointValues", [""]),
        }
        return {
            "name": "FilterData",
            "arguments": {
                "title": tool_args.get("title", ""),
                "entity": tool_args["entity"],
                "field": tool_args["field"],
                "filter": filter_obj,
            },
        }

    # ------------------------------------------------------------------
    # Core orchestration logic
    # ------------------------------------------------------------------

    def _orchestrate_tool_calls(
        self,
        messages,
        data_schema,
        data_domains,
        usage,
        openai_api_key=None,
        budget_check: Callable[["Usage"], str | None] | None = None,
    ):
        msgs = normalize_tool_calls(copy.deepcopy(messages))

        orchestrate_skill = self.skills["orchestrate"]
        rendered = render_template(
            orchestrate_skill.instructions,
            {"data_domains": simplify_data_domains(data_domains)},
        )
        msgs.insert(0, {"role": "system", "content": rendered})

        gpt_client = self.agent._get_gpt_client(openai_api_key)
        resp = _call_with_budget_guard(
            gpt_client.chat.completions.create,
            usage,
            model=self.agent.gpt_model_name,
            messages=msgs,
            tools=self.tools,
            tool_choice="required",
            temperature=0.0,
            max_completion_tokens=1024,
        )
        usage.add("orchestrate", getattr(resp, "usage", None))

        # Post-orchestrate budget check: bail before expensive per-tool dispatch
        # (CreateVisualization can issue multiple inner completions).
        if budget_check is not None:
            refusal = budget_check(usage)
            if refusal:
                return [build_rebuff_toolcall(refusal)], "rebuff"

        choice = resp.choices[0]
        if not choice.message.tool_calls:
            return [], "render-visualization"

        tool_dispatch = {
            "Rebuff": self._handle_rebuff,
            "ClarifyVariable": self._handle_clarify_variable,
            "FreeTextExplain": self._handle_free_text_explain,
            "CreateVisualization": self._handle_create_visualization,
            "FilterData": self._handle_filter_data,
        }

        tool_calls = []
        has_vis = False
        has_filter = False
        has_rebuff = False
        has_clarify = False
        has_explain = False

        for tc in choice.message.tool_calls:
            tool_name = tc.function.name
            tool_args = json.loads(tc.function.arguments)

            handler = tool_dispatch.get(tool_name)
            if handler is None:
                logger.warning("Unknown tool: %s, skipping", tool_name)
                continue

            result = handler(
                tool_args,
                messages,
                data_schema,
                data_domains,
                usage,
                openai_api_key=openai_api_key,
            )
            tool_calls.append(result)

            if tool_name == "CreateVisualization":
                has_vis = True
            elif tool_name == "FilterData":
                has_filter = True
            elif tool_name == "Rebuff":
                has_rebuff = True
            elif tool_name == "ClarifyVariable":
                has_clarify = True
            elif tool_name == "FreeTextExplain":
                has_explain = True

        # Derive orchestrator_choice for backward compatibility
        if has_explain:
            orchestrator_choice = "explain"
        elif has_clarify:
            orchestrator_choice = "clarify-variable"
        elif has_rebuff:
            orchestrator_choice = "rebuff"
        elif has_vis and has_filter:
            orchestrator_choice = "both"
        elif has_filter:
            orchestrator_choice = "get-subset-of-data"
        else:
            orchestrator_choice = "render-visualization"

        return tool_calls, orchestrator_choice
