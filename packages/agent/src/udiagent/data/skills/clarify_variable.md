---
name: clarify_variable
description: Generate a clarification request when the user references ambiguous variables
---

# Clarify Variable

The user's request references one or more ambiguous variables that could match multiple fields or entities in the dataset. Generate a clarification response.

## User Request

{{user_request}}

## Ambiguous Terms

{{ambiguous_terms}}

## Data Schema

{{data_schema}}

## Instructions

Respond with a JSON object containing exactly two keys:

1. **"message"**: A polite, natural-language explanation of what is ambiguous and why clarification is needed. Be specific about which terms are ambiguous and what the possible interpretations are.
2. **"ambiguous_variables"**: An array of objects, one per ambiguous term. Each object must have:
   - `"query_term"`: The term from the user's request that is ambiguous
   - `"candidates"`: An array of candidate matches, each with only:
     - `"field_name"`: The actual field name in the schema
     - `"entity"`: Which dataset entity (table) this field belongs to
   Do NOT include data_type or description — those are added automatically from the schema.

Respond with only the JSON object. Do not include any explanation or markdown formatting.
