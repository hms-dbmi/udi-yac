"""Orchestrator tool definitions and visualization/filter business logic."""

import copy
import json
import logging

from udiagent.messages import normalize_tool_calls
from udiagent.schema import simplify_data_domains

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Top-level tool definitions (declarative registry)
# ---------------------------------------------------------------------------

ORCHESTRATOR_TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "Rebuff",
            "description": (
                "Use this tool when the user's request CANNOT be fulfilled by any "
                "other available tool. For example: requests about topics unrelated "
                "to the loaded data, requests for unsupported chart types, or "
                "requests that require capabilities the system does not have."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "user_request": {
                        "type": "string",
                        "description": "The original user query that cannot be fulfilled.",
                    },
                    "reason": {
                        "type": "string",
                        "description": "A brief explanation of why the request cannot be fulfilled.",
                    },
                },
                "required": ["user_request", "reason"],
                "additionalProperties": False,
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "ClarifyVariable",
            "description": (
                "Use this tool when the user's request references an ambiguous variable "
                "that could match multiple fields or entities in the dataset. For example, "
                "'age' might match 'age_value' in donors or 'sample_age' in samples. "
                "Returns a clarification request with candidate variables for the user "
                "to choose from."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "message": {
                        "type": "string",
                        "description": "A natural-language explanation of what is ambiguous and why clarification is needed.",
                    },
                    "ambiguous_variables": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                "query_term": {
                                    "type": "string",
                                    "description": "The term from the user's request that is ambiguous.",
                                },
                                "candidates": {
                                    "type": "array",
                                    "items": {
                                        "type": "object",
                                        "properties": {
                                            "field_name": {
                                                "type": "string",
                                                "description": "The actual field name in the schema.",
                                            },
                                            "entity": {
                                                "type": "string",
                                                "description": "The dataset entity this field belongs to.",
                                            },
                                        },
                                        "required": ["field_name", "entity"],
                                        "additionalProperties": False,
                                    },
                                    "description": "Candidate fields that could match the ambiguous term.",
                                },
                            },
                            "required": ["query_term", "candidates"],
                            "additionalProperties": False,
                        },
                        "description": "List of ambiguous variables with their candidate matches.",
                    },
                },
                "required": ["message", "ambiguous_variables"],
                "additionalProperties": False,
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "FreeTextExplain",
            "description": (
                "Use this tool when the user asks an informational question — about "
                "available functionality, datasets, or general system capabilities — "
                "that does NOT require generating a visualization or filtering data. "
                "For example: 'what can I do?', 'what data is available?', 'how many "
                "tables are there?', 'what types of charts can you make?'"
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "user_request": {
                        "type": "string",
                        "description": "The original informational question from the user.",
                    },
                    "response_type": {
                        "type": "string",
                        "enum": ["capabilities", "data_summary", "general"],
                        "description": (
                            "The category of explanation needed: 'capabilities' for what the "
                            "system can do, 'data_summary' for information about loaded datasets, "
                            "'general' for other informational questions."
                        ),
                    },
                },
                "required": ["user_request", "response_type"],
                "additionalProperties": False,
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "CreateVisualization",
            "description": (
                "Create a data visualization. Supports: bar charts (vertical/horizontal, "
                "with count/min/max/avg/median/sum aggregations), stacked and grouped bar "
                "charts, scatterplots, heatmaps, histograms, CDF line charts, pie/donut "
                "charts, dot strips, density curves, and data tables. Can visualize a "
                "single entity or join two related entities. The specific visualization "
                "type will be automatically selected based on the data and request."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "description": {
                        "type": "string",
                        "description": "A brief natural-language description of what visualization to create.",
                    },
                    "title": {
                        "type": "string",
                        "description": "A short, informative title for the chart (e.g. 'Donor Count by Sex', 'Height vs Weight'). Do NOT include the value of the filter since that can change dynamically later.",
                    },
                },
                "required": ["description", "title"],
                "additionalProperties": False,
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "FilterData",
            "description": (
                "Filter the dataset to a subset of rows. Use for categorical filters "
                "(e.g. filter to Female donors) or numeric range filters (e.g. filter "
                "to age > 50). Call this tool multiple times for multiple filters."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "title": {
                        "type": "string",
                        "description": "A short, informative title for the filter (e.g. 'Donor Sex', 'Donor Age', 'Sample Assay Type').",
                    },
                    "entity": {
                        "type": "string",
                        "description": "The entity (table) to filter.",
                    },
                    "field": {
                        "type": "string",
                        "description": "The field to filter on.",
                    },
                    "filterType": {
                        "type": "string",
                        "enum": ["point", "interval"],
                        "description": "Type of filter: 'point' for categorical values, 'interval' for numeric ranges.",
                    },
                    "intervalRange": {
                        "type": "object",
                        "properties": {
                            "min": {"type": "number", "description": "Minimum value."},
                            "max": {"type": "number", "description": "Maximum value."},
                        },
                        "required": ["min", "max"],
                        "additionalProperties": False,
                        "description": "Range for interval filters. Required when filterType is 'interval'.",
                    },
                    "pointValues": {
                        "type": "array",
                        "items": {"type": "string"},
                        "minItems": 1,
                        "description": "Values to filter for. Required when filterType is 'point'.",
                    },
                },
                "required": ["entity", "field", "filterType"],
                "additionalProperties": False,
            },
        },
    },
]


# ---------------------------------------------------------------------------
# Visualization rendering functions
# ---------------------------------------------------------------------------


def function_call_render_visualization(
    agent, messages, data_schema, grammar, usage=None, openai_api_key=None
):
    """Visualization generation via the skills pipeline."""
    from udiagent.vis_generate import generate_vis_spec

    msgs = normalize_tool_calls(copy.deepcopy(messages))
    result = generate_vis_spec(
        agent=agent,
        messages=msgs,
        data_schema=data_schema,
        grammar=grammar,
        usage=usage,
        openai_api_key=openai_api_key,
    )
    return {
        "name": "RenderVisualization",
        "arguments": {"spec": result["spec"]},
        "meta": result.get("meta"),
    }
