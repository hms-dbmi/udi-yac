---
name: rebuff
description: Generate a rebuff response when the user's request cannot be fulfilled by any available tool
---

# Rebuff Response

The user made a request that cannot be fulfilled by any available tool. Generate a helpful rebuff response.

## User Request

{{user_request}}

## Reason

{{reason}}

## Available Tools

{{available_tools}}

## Instructions

Respond with a JSON object containing exactly three keys:

1. **"message"**: A polite, clear statement explaining that this specific request is not currently supported. Be specific about *why* it cannot be done.
2. **"capabilities"**: A brief summary of what the system *can* do, organized by category (e.g., visualization, data filtering). Derive this from the available tools listed above.
3. **"suggestions"**: An array of 2-3 example queries the user could try instead, based on the available tools. Make them concrete and realistic.

Respond with only the JSON object. Do not include any explanation or markdown formatting.
