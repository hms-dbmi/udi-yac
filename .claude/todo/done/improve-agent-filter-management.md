# Improve agent filter management and add per-subject filter scope

Fixes #41

## Description

Filters today can only be *added* by the agent. The agent never sees the user's edits, removals or chart brushes, and nothing checks that a filter is valid. Filters also only work row by row within their own table. "Patients with at least one Medulloblastoma Group 3 event" can't be expressed for an Event chart: filtering Event to Group 3 drops those patients' other events. Charts on other tables already get patient-level semantics through an implicit semi-join, so the behaviour is inconsistent and invisible.

This feature makes filter management a dedicated, validated agent step that sees and edits the full filter state. It also adds a **scope** to filters: row-level (today's behaviour) or per-subject, with `any`, `all` or `none`. Per-subject scope reuses the semi-join machinery both executors already have.

## Requirements

### Filter state reaches the agent
- [ ] The completions request carries the active filter set: chat, host and chart-brush filters. Each entry has a stable `id`, its `origin` (`chat` | `host` | `chart`), `entity`, `field`, type, values or range, and scope.
- [ ] The request reflects user edits and removals made in the UI, not the original tool-call arguments.
- [ ] The orchestrator prompt states the current filters from that structured state. The inaccurate claims in `orchestrate.md` (lines 12 and 18) are removed or corrected.

### Filter operations
- [ ] The agent can **add**, **modify** (by id) and **remove** (by id) filters, and can **clear** all chat filters.
- [ ] The agent may modify or remove only `chat`-origin filters. Brush and host filters are visible but read-only to it.
- [ ] The chat client applies the operations to `dataFiltersStore`. A modify updates the filter in place (same id, same chip), and a remove drops its chip.
- [ ] Replaying a session or conversation reproduces the same final filter state. Operations are recorded in message history, so `syncFiltersFromMessages` can rebuild the set; it is no longer add-only.

### Dedicated filter step with validation
- [ ] Filter changes are produced by a separate filter LLM call. The orchestrator routes to it, and it receives the schema, the domains and the current filter state.
- [ ] Every operation is validated before it reaches the client:
  - the entity and field exist;
  - point values are in the field's domain, and interval bounds are numeric with min ≤ max;
  - modify and remove ids exist and are `chat` filters;
  - the scope's subject has a resolvable relationship.
- [ ] An invalid result is retried with the validation errors fed back, up to a bounded count, mirroring vis generation (`vis_generate.py` `_retry_turns`). After the final failure the user gets a clear message, never a silently wrong filter.

### Per-subject filter scope
- [ ] A filter has an optional `scope`. It is `rows` by default, which is today's behaviour, or a subject entity (e.g. `Patient`) with `match` set to `any`, `all` or `none`.
- [ ] With a subject scope, **same-table** charts keep *every* row belonging to a matching subject. Example: Event filtered with "Group 3, scope Patient, any" keeps all events of the 34 patients who ever had a Group 3 event.
- [ ] Cross-table charts honour the filter's `match` instead of always using `any`.
- [ ] `none` ("patients who never had …") is supported in both the Arquero executor (`DataSourcesStore.ts`) and the SQL compiler (`compiler.py`).
- [ ] Parity goldens in `test_query_parity.py` cover `any`, `all` and `none`, for same-table and cross-table scope.
- [ ] The filter chip and the chat filter widget show the scope in words, e.g. "Patients with any event where …". The user can change it with a single control: rows | any | all | none.
- [ ] Session export and import round-trip the scope. Older sessions without a scope load as `rows`.

### Tests
- [ ] Agent: unit tests for operation validation and the retry loop, plus an orchestrator test where a follow-up message ("only patients who ever had Group 3") modifies an existing filter instead of adding a second one.
- [ ] Chat: store tests for add, modify, remove and clear operations, rebuilding from messages, and scope round-tripping. Component tests for the scope control.
- [ ] Benchmark/rubric (`udiagent/benchmark/runner.py`) accepts the new filter shape.

## Non-goals / follow-ups

- **Derived (temporary) columns**: a per-subject computed column such as `ever_group3` or the count of progression events, usable by filters and charts. It would be more general than scope (counts, "first event", thresholds) but has to flow through the schema, domains, both compilers and the UI. Leave it to a follow-up spec.
- General boolean filter expressions (OR across filters, nested quantifiers).
- Multi-hop relationships (only a direct FK or a shared parent resolves today; `query/README.md:426-427`).

## Notes

- Issue: https://github.com/hms-dbmi/udi-yac/issues/41
- Motivating example (PCX `line-level-oct`): `Event.cns_integrated_diagnosis = "Medulloblastoma, Group 3"`. 53 events across 34 patients, and 91 patients have more than one distinct diagnosis across their events.
- Reuse, don't rebuild:
  - **Semi-join with `match`:** `DataSourcesStore.ts:276-318` and `compiler.py:337-421` (`match:'all'` → `GROUP BY … HAVING`). Same-table subject scope is that same semi-join with origin = target table, joined on the subject key.
  - **Relationship resolution:** `getEntityRelationship` (`dataPackageStore.ts:286-340`).
  - **Filter injection:** `getNamedFilters` / `updateSpecFilters` (`dashboardStore.ts:653-789`).
  - **Validation and retry pattern:** `validate_bindings` and the retry loop in `vis_generate.py`.
  - **Value lookup:** `ListFieldValues` (`tools.py:238-266`).
- Current shapes:
  - Tool: `FilterData` (`tools.py:181-236`), handled by `_handle_filter_data` (`orchestrator.py:550-574`).
  - Request: `YACCompletionRequest` (`server/models.py:6-12`).
  - Client: `constructQueryBody` (`completions.ts:33-55`). `syncSelectionsBackToMessages` and `generateFilterMessage` have no production callers; reuse or delete them.
- Filter ids today:
  - chat: `message-filter-{msg}-{tool}`
  - host: `host-filter-{id}`
  - brush: the chart uuid, or `${uuid}::${field}` for point brushes

  Operations need ids that survive edits.
- Known adjacent bug worth fixing on the way: cross-table ids are always compared as strings (`DataSourcesStore.ts:276-287`), so numeric keys miss.
- Risk: richer operations give the agent more ways to be wrong. Validation, retry, and keeping scope to a single enum are the mitigations.
