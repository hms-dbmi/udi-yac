---
name: rebuff
description: Generate a rebuff response when the user's request cannot be fulfilled by any available tool
---

# Rebuff Response

The user made a request that cannot be fulfilled by any available tool. Tell them so.

## Available Tools

{{available_tools}}

## Instructions

Reply in one or two short sentences: say that this request is not supported and, specifically, why. If one of the available tools above covers a close alternative, you may name it in a few words. Do not list the system's capabilities and do not suggest example queries.

Respond with plain text only: no JSON, no headings, no lists, no code blocks.

## Reason

{{reason}}

## User Request

{{user_request}}
