# How the agent works

This page follows one chat message through the agent: how the request is routed,
how a chart is built from a template, how filters are changed, and what the
client gets back. Code references are to `packages/agent/src/udiagent/`.

## Design principles

- **Stateless.** Everything a turn needs travels with the request: the message
  history, the data schema, the column values and the active filters. The server
  keeps no session state, so any replica can serve any turn, and a client can
  restore a saved conversation by sending its history again.
- **Any dataset.** The schema arrives with every request (see
  [One agent, any schema](library.md#one-agent-any-schema)). Nothing is
  generated or configured per dataset.
- **Charts from templates.** The model picks a chart template and names the
  columns to bind. It does not write chart specs, so the delivered spec is
  always one the template's author tested.
- **Prompts as Markdown.** Each LLM step's instructions live in
  `data/skills/*.md` (YAML frontmatter plus a prompt body), loaded by
  `load_skills()`.

## A request, end to end

```
POST /v1/yac/completions  {messages, dataSchema, dataDomains, filters}
  → Orchestrator.run()
    → routing call: the model picks one or more tools
      ↺ ListFieldValues / GetVisualizationSpec answer themselves and loop
    → each chosen tool's handler runs (most make one more LLM call)
  ← [tool calls]  plus X-Usage-* headers
```

1. **Routing.** `Orchestrator.run()` sends the history to the model with the
   `orchestrate` prompt. That prompt carries a summary of the schema, a sample of
   each column's values (`dataDomains`, which the client caps for size) and the
   current filters. The model must call at least one tool
   (`tool_choice: "required"`).
2. **Lookups.** Two tools are internal and never reach the client.
   `ListFieldValues` returns a column's full value list when the prompt only
   showed a sample. `GetVisualizationSpec` returns an earlier chart's full spec
   (see [Chart history](#chart-history)). Their answers go back to the model,
   which then decides. This loop runs at most twice.
3. **Dispatch.** Every other tool call is an outcome, and its handler builds
   what the client receives:

| Tool chosen           | Handler does                                                                                              | Client receives                           |
| --------------------- | --------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| `CreateVisualization` | Builds a chart from a template ([below](#charts-from-templates))                                          | `RenderVisualization` with a spec         |
| `FilterData`          | Turns the request into validated filter operations ([below](#filters))                                    | One `FilterData` per operation            |
| `FreeTextExplain`     | Answers a question about the data or the system, with the schema, the values and the filters in view      | `FreeTextExplain` with text segments      |
| `ClarifyVariable`     | Adds each candidate field's type and description from the schema                                          | `ClarifyVariable` with candidates to pick |
| `Rebuff`              | Explains why the request can't be served and suggests what can                                            | `Rebuff` with a message and suggestions   |
| `OfferIssueReport`    | Offered only when the client supports issue reports and the server records them ([below](#issue-reports)) | `OfferIssueReport` with a draft summary   |

The model may pick several tools in one turn, for example a filter and a chart.
The response is a JSON list of `{name, arguments, meta?}` objects, one per
outcome. `orchestrator_choice` in `OrchestratorResult` (`render-visualization`,
`get-subset-of-data`, `both`, `explain`, …) summarizes the turn for logs and
benchmarks.

Token use is added up across every LLM call in the turn and returned as
`X-Usage-*` response headers. A server can refuse a turn that would exceed a
quota through the `app.state.budget_check` hook. The refusal comes back as an
ordinary `Rebuff`, with HTTP 200.

## Charts from templates

Chart templates are partial grammar specs with placeholders. The model never
sees the specs: each template is offered as a typed function-calling tool whose
parameters are the things to bind (`entity`, `field`, `value`, …). Both the
templates and the tools are generated
([below](#regenerating-template-visualizations-and-tool-definitions)).

1. **Selection.** Templates are tagged by data shape. A schema that marks a
   resource as a pre-aggregated cube gets the `data_cube` templates, any other
   schema gets the `line_item` ones (see
   [Template sets and tags](library.md#visualization-template-sets-and-tags)).
   Templates that need more tables than the package has are dropped too.
2. **Binding.** The model picks one template and names the tables, columns and
   literal values to use.
3. **Validation.** `validate_bindings` checks the choice against the request's
   schema and values: that the columns exist and have the type the template
   needs, that literal values occur in the column, that a field drawn on an axis
   has no more than 500 categories, and so on. Its errors are written for a
   reader and name the valid alternatives.
4. **Retry.** A rejected choice goes back to the model with every earlier
   rejection, and the model chooses again. After three attempts the agent gives
   up. It then answers with a `FreeTextExplain` that names the problem rather
   than drawing a chart that would be wrong. One exception: if the chart groups
   by a field with too many categories to draw, the agent returns that field's
   value-count table instead.
5. **Instantiation.** `instantiate_template` replaces each placeholder with its
   binding. Placeholder resolution lives only in
   `vis_generate._resolve_placeholder`. Tables are `<E>`, `<E1>`, … and fields
   are `<E1.F2>`. A cube's measure is `<M>`, and `<MARGINAL:D1,D2>` selects the
   cube rows aggregated over every other dimension. Join keys come from the
   schema's relationships.
6. **Spec validation.** The result is checked against the grammar's JSON
   Schema. A spec that fails is sent back to the model for repair, at most twice.

Freehand generation, where the model writes a whole spec, is used only when the
agent has no templates at all.

### Provenance and re-binding

A `RenderVisualization` call carries its provenance in `meta`: `tool_used` and
`tool_args` (the template and its bindings), and `tweakable_params` (the
bindings a reader may change). The chat draws a dropdown for each tweakable
parameter. Changing one calls `POST /v1/yac/vis_instantiate`, which resolves the
template again with the new binding. No LLM call is involved. Re-resolving the
template is exact by construction: a binding can appear in `derive`
expressions, group-bys and the title, and rewriting the finished spec would
miss some of them.

Besides field bindings, a template can expose:

- **Choices** (`choices.py`): optional enum parameters that pick how something
  is computed. The survival templates use `<ESTIMATOR>` (the estimator),
  `<HORIZON>` (how many years to show) and `<CI>` (the confidence band). The
  model can set them when a request names one ("10-year survival"), and readers
  get them as dropdowns.
- **Labels** (`choices.LABELS`, e.g. `<ENDPOINT>`): optional enums that only
  fill the chart title. They are deliberately not offered as dropdowns, since
  changing one would relabel the chart without changing what it computes.

### Dynamic stratification

A stratified chart, such as survival curves split by sex, splits by a
`stratum` column it derives rather than by the field itself. The strata can
therefore be groups of values (`stratify.py`). A **grouping** is either named
groups of a nominal field's values, with everything else in "Other", or
ascending cut points for a quantitative field, up to 10 strata. The model
writes one when a request names particular values ("white versus everyone
else", "over 65"), and readers can re-cut it in the chat. Without a grouping, a
nominal field's own values are the strata. A quantitative stratifier must be
cut.

When a subject can have several values of the stratifier (a table with one row
per drug given, say), the template matches per subject before labelling, so
every subject lands in exactly one curve.

## Filters

The client sends the active filters with every request (`filters`): the ones
the agent made, the ones the embedding page set, and chart brushes, as the user
last edited them. The history can't stand in for this, because it holds only
the agent's past `FilterData` calls as first made.

When the routing call picks `FilterData`, a separate call turns the request
into operations with the `ApplyFilterOperations` tool. Each operation adds,
modifies, removes or clears filters. The operations are validated against the
schema, the column values and the current filters. A rejected set is retried
with every earlier rejection in view, at most three times. A set that never
validates becomes a `FreeTextExplain` naming the problem, rather than a filter
that silently matches nothing. Each operation comes back as one `FilterData`
call. A filter can have a scope (a subject table and `any`/`all`/`none`): it
then keeps every row of the subjects that match.

## Chart history

The client echoes every earlier chart back in the history with its full spec.
Before the model reads the history, `normalize_tool_calls` replaces each
template-made chart's spec with a short description: its `chart_id`, template
and bindings. Charts drawn freehand keep their spec. Long specs made follow-up
requests reverse-engineer the template call, and the model misread derived
columns as options to set. When a question needs the full spec, the model calls
`GetVisualizationSpec(chart_id)`. That chart's spec then stays in view for the
rest of the turn.

## Issue reports

When the client sends `issueReporting: true` and LangFuse is configured, the
model may offer an issue report when the user asks to report a problem or says
a result is wrong. The user reviews and sends the report. `POST
/v1/yac/issue_report` stores it in LangFuse with the session export, filed
under the conversation's trace session, and optionally notifies
`UDI_ISSUE_REPORT_WEBHOOK_URL` (see
[Server Environment Variables](server.md#server-environment-variables)).

## Server-side data

By default the browser loads a data package's CSV files and computes column
values itself. A package can instead live in a database: the agent compiles the
grammar's `transformation` pipeline to SQL and runs it against StarRocks or
DuckDB (`POST /v1/yac/query`), and serves the schema and values from
`GET /v1/yac/metadata`. See [Server-side data](../src/udiagent/query/README.md).

## Regenerating template visualizations and tool definitions

The vis pipeline uses two generated artifacts:

- `src/udiagent/data/skills/template_visualizations.json`: the template specs
- `src/udiagent/generated_vis_tools.py`: typed OpenAI function-calling tool
  definitions

Templates are authored in `scripts/template_viz_generation.py`. To regenerate
both artifacts in one step:

```bash
uv pip install -e ".[codegen]"
uv run python scripts/regenerate_vis_tools.py
```

By default this uses `data/data_domains/hubmap_data_schema.json` as the schema. To use a different schema:

```bash
uv run python scripts/regenerate_vis_tools.py --schema data/data_domains/SenNet_domains.json
```
