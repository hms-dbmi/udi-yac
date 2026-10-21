"""Orchestrator — routes user requests to the appropriate tool handlers."""

import copy
import functools
import json
import logging
import time
from dataclasses import dataclass, field
from typing import Callable

import openai

from udiagent.skills import Skill, load_skills, render_template
from udiagent.filters import (
    APPLY_FILTER_OPERATIONS,
    APPLY_FILTER_OPERATIONS_TOOL,
    FILTER_RETRY_CLOSING,
    MAX_FILTER_ATTEMPTS,
    describe_filters,
    filter_failure_args,
    filter_summary,
    normalize_filters,
    operation_tool_calls,
    validate_operations,
)
from udiagent.grammar import load_grammar
from udiagent.messages import (
    GET_VISUALIZATION_SPEC,
    normalize_tool_calls,
    split_tool_calls,
    visualization_calls,
)
from udiagent.schema import (
    parse_schema_from_dict,
    simplify_data_domains,
    simplify_data_schema,
)
from udiagent.structured_functions import (
    validate_structured_text,
    segment_structured_text,
    get_function_signatures,
)
from udiagent.tools import (
    INTERNAL_ORCHESTRATOR_TOOLS,
    ORCHESTRATOR_TOOLS,
    function_call_render_visualization,
)
from udiagent.vis_generate import _parse_request_schema, _retry_turns

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
    # discount, and cache writes at a premium on models that charge for them
    # (GPT-5.6+); reasoning tokens are a subset of ``completion_tokens``. All
    # are 0 on providers/models that don't report them.
    cached_prompt_tokens: int = 0
    cache_write_tokens: int = 0
    reasoning_tokens: int = 0
    operations: list[dict] = field(default_factory=list)

    def add(self, op: str, resp_usage) -> None:
        """Record usage from a chat-completion shaped response (see ``UDIAgent.create_completion``)."""
        if resp_usage is None:
            return
        prompt = int(getattr(resp_usage, "prompt_tokens", 0) or 0)
        completion = int(getattr(resp_usage, "completion_tokens", 0) or 0)
        total = int(
            getattr(resp_usage, "total_tokens", 0) or (prompt + completion)
        )
        p_details = getattr(resp_usage, "prompt_tokens_details", None)
        cached = int(getattr(p_details, "cached_tokens", 0) or 0)
        cache_write = int(getattr(p_details, "cache_write_tokens", 0) or 0)
        c_details = getattr(resp_usage, "completion_tokens_details", None)
        reasoning = int(getattr(c_details, "reasoning_tokens", 0) or 0)
        self.prompt_tokens += prompt
        self.completion_tokens += completion
        self.total_tokens += total
        self.cached_prompt_tokens += cached
        self.cache_write_tokens += cache_write
        self.reasoning_tokens += reasoning
        self.operations.append(
            {
                "op": op,
                "prompt_tokens": prompt,
                "completion_tokens": completion,
                "total_tokens": total,
                "cached_prompt_tokens": cached,
                "cache_write_tokens": cache_write,
                "reasoning_tokens": reasoning,
                # Wall-clock seconds of the call, set by _call_with_budget_guard
                # (None for a call made outside it).
                "latency_s": self.__dict__.pop("_last_latency_s", None),
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
    start = time.perf_counter()
    try:
        resp = fn(*args, **kwargs)
    except openai.RateLimitError as err:
        raise BudgetExceededError(_DEFAULT_BUDGET_MESSAGE, usage) from err
    except openai.APIStatusError as err:
        if _is_quota_error(err):
            raise BudgetExceededError(_DEFAULT_BUDGET_MESSAGE, usage) from err
        raise
    if usage is not None:
        # ponytail: handed to the usage.add() that follows every guarded call
        # rather than threaded through each call site. Safe while one Usage
        # has one call in flight (calls within a run are sequential); a
        # concurrent caller would need the latency returned explicitly.
        # Not a dataclass field, so asdict() never reports it.
        usage._last_latency_s = round(time.perf_counter() - start, 3)
    return resp


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


_UNREADABLE_REPLY_MESSAGE = (
    "Something went wrong while I was working out how to answer that. "
    "Please try again, or rephrase your request."
)


def _tool_args(tc) -> dict | None:
    """A tool call's arguments, or None when they aren't a JSON object.

    A reply cut off at the output-token cap carries truncated arguments; a
    model can also, rarely, emit malformed ones. Either way the call is
    unusable, and it must not take the whole request down with it.
    """
    try:
        args = json.loads(tc.function.arguments)
    except (TypeError, json.JSONDecodeError):
        args = None
    if not isinstance(args, dict):
        logger.warning(
            "skipping %s: its arguments are not a JSON object (%d chars)",
            tc.function.name,
            len(tc.function.arguments or ""),
        )
        return None
    return args


@dataclass
class OrchestratorResult:
    """Result of an orchestration run."""

    tool_calls: list[dict] = field(default_factory=list)
    orchestrator_choice: str = "render-visualization"
    usage: Usage = field(default_factory=Usage)


#: How many times the orchestrator may look something up (a column's values, an
#: earlier chart's spec) before it has to decide. Two is enough to check a table and a column; more means it is not
#: converging, and a chart drawn on a good-enough guess beats another round trip.
MAX_VALUE_LOOKUPS = 2


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
        model: str | None = None,
        budget_check: Callable[["Usage"], str | None] | None = None,
        session_id: str | None = None,
        filters: list[dict] | None = None,
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
            filters: The active filters as the client holds them, edits and
                all (see ``udiagent.filters``). ``None`` means the caller did
                not say, which the prompt reports as no active filters.

        Returns:
            An ``OrchestratorResult`` with tool_calls, orchestrator_choice, and usage.
        """
        with self.agent.trace(session_id=session_id):
            return self._run(
                messages,
                data_schema,
                data_domains,
                openai_api_key=openai_api_key,
                model=model,
                budget_check=budget_check,
                filters=filters,
            )

    def run_visualization(
        self,
        messages: list[dict],
        data_schema: str,
        data_domains: str,
        openai_api_key: str | None = None,
        model: str | None = None,
        session_id: str | None = None,
    ) -> OrchestratorResult:
        """Build a chart for the latest user request, skipping the routing call.

        For callers that already know the request wants a visualization, such
        as visualization-only benchmarks measuring chart generation on its own.
        The latest non-blank user message stands in for the description the
        routing call would otherwise write.
        """
        description = next(
            (
                m["content"].strip()
                for m in reversed(messages)
                if m.get("role") == "user"
                and isinstance(m.get("content"), str)
                and m["content"].strip()
            ),
            "",
        )
        usage = Usage()
        with self.agent.trace(session_id=session_id, name="visualization-run"):
            tool_call = self._handle_create_visualization(
                {"description": description} if description else {},
                split_tool_calls(messages),
                data_schema,
                data_domains,
                usage,
                openai_api_key=openai_api_key,
                model=model,
            )
        return OrchestratorResult(
            tool_calls=[tool_call],
            orchestrator_choice="render-visualization",
            usage=usage,
        )

    def _run(
        self,
        messages: list[dict],
        data_schema: str,
        data_domains: str,
        openai_api_key: str | None = None,
        model: str | None = None,
        budget_check: Callable[["Usage"], str | None] | None = None,
        filters: list[dict] | None = None,
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
                model=model,
                budget_check=budget_check,
                filters=normalize_filters(filters),
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
        model=None,
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
            data_domains=data_domains,
            model=model,
        )

        return result

    def _reveal_visualization_spec(self, tool_args, messages):
        """Answer `GetVisualizationSpec`: the full spec the history left out.

        The spec is already in the request — the client echoes every chart back
        — it is only trimmed from what the model reads (see
        `messages.compact_visualization_history`). So this reads it back, and
        marks the chart revealed on `messages` (the orchestrator's own copy) so
        the handler that answers the turn sees the full spec too.
        """
        chart_id = (tool_args.get("chart_id") or "").strip()
        charts = list(visualization_calls(messages))
        for candidate, tool_call in charts:
            if candidate != chart_id:
                continue
            function = tool_call.get("function") or tool_call
            meta = function.get("meta")
            if isinstance(meta, dict):
                meta["spec_revealed"] = True
            arguments = function.get("arguments") or {}
            if isinstance(arguments, str):
                return arguments
            spec = arguments.get("spec", arguments)
            return spec if isinstance(spec, str) else json.dumps(spec)
        known = ", ".join(c for c, _ in charts) or "none"
        return f"No chart '{chart_id}' in this conversation. Charts: {known}."

    def _lookup_field_values(self, tool_args, data_domains):
        """Answer `ListFieldValues`: the values the prompt only sampled.

        The values are already in the request — the client sends every column's
        domain, capped for size — they are simply not all in the prompt. So this
        reads them back rather than fetching anything, which is what makes a
        sample honest: the rest is one call away and no round trip to the client
        is needed.
        """
        entity = (tool_args.get("entity") or "").strip()
        field = (tool_args.get("field") or "").strip()
        try:
            domains = (
                json.loads(data_domains)
                if isinstance(data_domains, str)
                else data_domains
            ) or []
        except (json.JSONDecodeError, TypeError):
            domains = []

        match = next(
            (
                d
                for d in domains
                if d.get("entity") == entity and d.get("field") == field
            ),
            None,
        )
        if match is None:
            known = sorted(
                {f"{d.get('entity')}.{d.get('field')}" for d in domains if d.get("field")}
            )
            return (
                f"No column '{field}' on '{entity}'. Columns with values on "
                f"record: {', '.join(known[:40]) or 'none'}."
            )

        domain = match.get("domain") or {}
        if match.get("type") == "interval":
            return (
                f"{entity}.{field} is numeric, ranging from "
                f"{domain.get('min')} to {domain.get('max')}."
            )

        values = [v for v in domain.get("values", []) if v is not None]
        distinct = domain.get("distinct", len(values))
        if not values:
            return (
                f"{entity}.{field} has {distinct} distinct values, too many to "
                f"list — it is an identifier or a date. Filter on a range, or "
                f"group by it, rather than naming values."
            )
        listed = ", ".join(str(v) for v in values)
        if len(values) < distinct:
            return (
                f"{entity}.{field} has {distinct} distinct values. The "
                f"{len(values)} on record here: {listed}."
            )
        return f"{entity}.{field} has {distinct} distinct values, all of them: {listed}."

    def _handle_rebuff(
        self,
        tool_args,
        messages,
        data_schema,
        data_domains,
        usage,
        openai_api_key=None,
        model=None,
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
                self.agent.create_completion,
                usage,
                gpt_client,
                model=model or self.agent.gpt_model_name,
                messages=msgs,
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
        model=None,
        current_filters=(),
    ):
        available_tools = "\n".join(
            f"- {t['function']['name']}: {t['function']['description']}"
            for t in self.tools
            if t["function"]["name"] not in ("Rebuff", "FreeTextExplain")
        )

        # "What fields are available?" is answered here, so this is the other
        # place that must read the schema rather than a sample of values. The
        # old name for this variable said schema and held domains, which is how
        # that went unnoticed.
        data_domains_simple = simplify_data_domains(data_domains)
        data_schema_simple = simplify_data_schema(data_schema)

        explain_skill = self.skills.get("free_text_explain")
        if explain_skill:
            rendered = render_template(
                explain_skill.instructions,
                {
                    "user_request": tool_args.get("user_request", ""),
                    "response_type": tool_args.get("response_type", "general"),
                    "available_tools": available_tools,
                    "data_schema": data_schema_simple,
                    "data_domains": data_domains_simple,
                    # "Which filters are on?" is answered here too, and the
                    # history only has the FilterData calls as first made.
                    "current_filters": describe_filters(list(current_filters)),
                    "structured_functions": get_function_signatures(),
                },
            )
            logger.info(
                "explain prompt: current filters=%s", filter_summary(list(current_filters))
            )
            logger.debug(
                "explain prompt current filters:\n%s", describe_filters(list(current_filters))
            )
            gpt_client = self.agent._get_gpt_client(openai_api_key)
            msgs = normalize_tool_calls(copy.deepcopy(messages))
            msgs.insert(0, {"role": "system", "content": rendered})
            resp = _call_with_budget_guard(
                self.agent.create_completion,
                usage,
                gpt_client,
                model=model or self.agent.gpt_model_name,
                messages=msgs,
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
        model=None,
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
        model=None,
        current_filters=(),
    ):
        """Turn the routed filter request into validated filter operations.

        A call of its own, with the schema, the domains and the current filter
        state in view, so the change can be checked against all three before
        it reaches the client. An invalid set is sent back with its errors,
        every earlier rejection included, as in visualization generation; one
        that never validates becomes a FreeTextExplain naming the problems
        rather than a filter that silently matches nothing.

        Returns one ``FilterData`` tool call per operation, or that message.
        """
        current = list(current_filters)
        request = (tool_args.get("request") or "").strip() or next(
            (
                m["content"]
                for m in reversed(messages)
                if m.get("role") == "user" and isinstance(m.get("content"), str)
            ),
            "",
        )
        rendered = render_template(
            self.skills["filter"].instructions,
            {
                "request": request,
                "current_filters": describe_filters(current),
                "data_schema": simplify_data_schema(data_schema),
                "data_domains": simplify_data_domains(data_domains),
            },
        )
        logger.info("filter prompt: current filters=%s", filter_summary(current))
        msgs = normalize_tool_calls(copy.deepcopy(messages))
        msgs.insert(0, {"role": "system", "content": rendered})
        schema = _parse_request_schema(data_schema)
        gpt_client = self.agent._get_gpt_client(openai_api_key)

        rejected = []
        errors = ["No filter change came back."]
        for _attempt in range(MAX_FILTER_ATTEMPTS):
            retry = (
                _retry_turns(rejected, closing=FILTER_RETRY_CLOSING) if rejected else []
            )
            resp = _call_with_budget_guard(
                self.agent.create_completion,
                usage,
                gpt_client,
                model=model or self.agent.gpt_model_name,
                messages=msgs + retry,
                tools=[APPLY_FILTER_OPERATIONS_TOOL],
                tool_choice="required",
                max_completion_tokens=1024,
            )
            usage.add("filter", getattr(resp, "usage", None))
            calls = resp.choices[0].message.tool_calls or []
            args = _tool_args(calls[0]) if calls else None
            if args is None:
                errors = ["No filter change came back."]
                continue
            operations = args.get("operations")
            errors = validate_operations(operations, schema, data_domains, current)
            if not errors:
                return operation_tool_calls(operations, current)
            rejected.append((APPLY_FILTER_OPERATIONS, args, errors))

        logger.warning(
            "filter change rejected after %d attempts: %s", MAX_FILTER_ATTEMPTS, errors
        )
        return {"name": "FreeTextExplain", "arguments": filter_failure_args(errors)}

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
        model=None,
        budget_check: Callable[["Usage"], str | None] | None = None,
        filters: list[dict] | None = None,
    ):
        filters = filters or []
        # The handlers below each read the history afresh, so a chart revealed
        # with GetVisualizationSpec is marked on this copy — never on the
        # caller's messages — and every later read then shows its full spec.
        messages = copy.deepcopy(messages)
        msgs = normalize_tool_calls(copy.deepcopy(messages))

        orchestrate_skill = self.skills["orchestrate"]
        # Both, and they are not interchangeable. The schema is the inventory of
        # what exists; the domains are a lossy sample of values, with the
        # highest-cardinality columns shortened or dropped by the client. This
        # prompt used to receive only the domains, so a table whose every column
        # was too long to send simply was not here — and the orchestrator told
        # the user it did not exist.
        rendered = render_template(
            orchestrate_skill.instructions,
            {
                "data_schema": simplify_data_schema(data_schema),
                "data_domains": simplify_data_domains(data_domains),
                "current_filters": describe_filters(filters),
            },
        )
        logger.info("orchestrate prompt: current filters=%s", filter_summary(filters))
        logger.debug("orchestrate prompt current filters:\n%s", describe_filters(filters))
        msgs.insert(0, {"role": "system", "content": rendered})

        gpt_client = self.agent._get_gpt_client(openai_api_key)

        # The model may ask for a column's full values, or an earlier chart's
        # full spec, before deciding. Those calls answer themselves and loop; every other tool is an outcome and
        # ends the turn. Bounded, because a model that keeps looking things up
        # is not converging and a chart is better than another lookup.
        for _lookup in range(MAX_VALUE_LOOKUPS + 1):
            resp = _call_with_budget_guard(
                self.agent.create_completion,
                usage,
                gpt_client,
                model=model or self.agent.gpt_model_name,
                messages=msgs,
                tools=self.tools,
                tool_choice="required",
                max_completion_tokens=1024,
            )
            usage.add("orchestrate", getattr(resp, "usage", None))

            pending = resp.choices[0].message.tool_calls or []
            lookups = [
                tc for tc in pending if tc.function.name in INTERNAL_ORCHESTRATOR_TOOLS
            ]
            if not lookups or _lookup == MAX_VALUE_LOOKUPS:
                if lookups and _lookup == MAX_VALUE_LOOKUPS:
                    logger.warning(
                        "orchestrator stopped looking up field values after %d "
                        "round(s); deciding on what it has",
                        MAX_VALUE_LOOKUPS,
                    )
                break

            msgs.append(
                {
                    "role": "assistant",
                    "content": None,
                    "tool_calls": [
                        {
                            "id": tc.id,
                            "type": "function",
                            "function": {
                                "name": tc.function.name,
                                "arguments": tc.function.arguments,
                            },
                        }
                        for tc in pending
                    ],
                }
            )
            for tc in pending:
                if tc in lookups:
                    args = _tool_args(tc) or {}
                    if tc.function.name == GET_VISUALIZATION_SPEC:
                        answer = self._reveal_visualization_spec(args, messages)
                        logger.info("visualization spec revealed: %s", args.get("chart_id"))
                    else:
                        answer = self._lookup_field_values(args, data_domains)
                        logger.info(
                            "field values looked up: %s.%s",
                            args.get("entity"),
                            args.get("field"),
                        )
                else:
                    # Asked for alongside a lookup. Tell the model to ask again
                    # once it has what it looked up, rather than acting on it now
                    # and returning two conflicting outcomes.
                    answer = (
                        "Not run — you also asked to look something up. "
                        "Call this again if you still want it."
                    )
                msgs.append(
                    {"role": "tool", "tool_call_id": tc.id, "content": answer}
                )

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
            "FreeTextExplain": functools.partial(
                self._handle_free_text_explain, current_filters=filters
            ),
            "CreateVisualization": self._handle_create_visualization,
            "FilterData": functools.partial(
                self._handle_filter_data, current_filters=filters
            ),
        }

        tool_calls = []
        unreadable = 0
        has_vis = False
        has_filter = False
        has_rebuff = False
        has_clarify = False
        has_explain = False

        for tc in choice.message.tool_calls:
            tool_name = tc.function.name
            tool_args = _tool_args(tc)
            if tool_args is None:
                unreadable += 1
                continue

            if tool_name in INTERNAL_ORCHESTRATOR_TOOLS:
                # Answered in the lookup loop above, and not an outcome of the
                # turn. Only reachable when the loop hit its bound.
                continue

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
                model=model,
            )
            # The filter step answers with one call per operation.
            tool_calls.extend(result if isinstance(result, list) else [result])

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

        if unreadable and not tool_calls:
            return [build_rebuff_toolcall(_UNREADABLE_REPLY_MESSAGE)], "rebuff"

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
