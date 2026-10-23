# Benchmarking

The runner posts each benchmark item to a running server's `/v1/yac/benchmark`
endpoint, so **the server's configuration is what gets measured** — model, API
path, reasoning effort, temperature and output cap all come from its
environment (see [Reasoning models and the Responses API](library.md#reasoning-models-and-the-responses-api)).
Restart the server to benchmark another configuration.

## Step 0: Start the API server

Use `fastapi run`, not `dev`: the reloader can restart the server mid-run. The
runner sends a placeholder bearer token, so set `INSECURE_DEV_MODE=1`.

```bash
INSECURE_DEV_MODE=1 uv run --extra server fastapi run src/udiagent/server/app.py --port 8007 &
```

## Step 1: Run tiny benchmark (1 example)

```bash
uv run python -m udiagent.benchmark.runner --path ./data/benchmark_dqvis/tiny.jsonl
```

## Step 2: Run small benchmark (100 examples)

```bash
uv run python -m udiagent.benchmark.runner --path ./data/benchmark_dqvis/small.jsonl --workers 5 \
  --description "what this run is" --out ./out/small-gpt-5.4
```

Resume a run; items that failed or were refused (rate limit) are retried:

```bash
uv run python -m udiagent.benchmark.runner --path ./data/benchmark_dqvis/small.jsonl --workers 5 \
  --resume ./out/<RUN>/benchmark_results.json --out ./out/<RUN>
```

`--no-orchestrator` skips the routing call and goes straight to chart
generation, to measure that on its own. Use it only on visualization-only data
such as the DQVis fixtures: the server refuses items that expect any other
orchestrator choice, and those items are recorded as failures.

Each run writes `benchmark_results.json` and `benchmark_analysis.json`. The
analysis carries a `summary` — failures, tokens per item (prompt, cached, cache
write, completion, reasoning), cache-hit percentage, LLM calls per item, cost
(from `PRICES` in `benchmark/runner.py`; check them against OpenAI's pricing
page), latency per item (mean, p50, p95) and per LLM operation, and how often
the model asked a clarifying question — and its `metadata` records the model
and settings the server reported.

A clarifying question scores as a correct answer when the fields it offers
include one the expected answer used: the request really was ambiguous, and in
a blind review people rated those questions good. `clarify_percent` is the
share of items answered with a question and `clarify_credited_percent` the
share credited this way.

## Comparing models

The `*_vs_expected` scores compare against the fixtures' expected outputs, which
an older generator produced; read them relatively, not as accuracy. To compare
models against each other instead, run every configuration over the same items
— ideally 3+ repeats each — and compare with one as the baseline:

```bash
# Keep UDI_* settings out of .env: inline values win over it, but a setting
# left there leaks into every configuration that doesn't set its own.
run_config() {  # <label> [ENV=VALUE ...]
  local label=$1; shift
  env INSECURE_DEV_MODE=1 "$@" uv run --extra server fastapi run src/udiagent/server/app.py --port 8007 &
  local pid=$!
  until curl -sf -o /dev/null http://127.0.0.1:8007/v1/yac/examples; do sleep 1; done
  for p in data/benchmark_dqvis/small.jsonl data/benchmark.json; do
    uv run python -m udiagent.benchmark.runner -p "$p" --label "$label" --description "$r" \
      --out "out/bench/$label/$r/$(basename "${p%%.*}")"
  done
  kill $pid; wait $pid
}
for r in r0 r1 r2; do  # vary the order between repeats to spread out API-side load
  run_config gpt-5.4 GPT_MODEL_NAME=gpt-5.4
  run_config gpt-6-luna GPT_MODEL_NAME=gpt-6-luna UDI_REASONING_EFFORT=none
  run_config gpt-6.1-sol GPT_MODEL_NAME=gpt-6.1-sol UDI_OPENAI_API=responses \
    UDI_REASONING_EFFORT=low UDI_TEMPERATURE=omit UDI_MAX_COMPLETION_TOKENS=16384 \
    UDI_VIS_TOOL_CHOICE=required
done
uv run python -m udiagent.benchmark.runner -a compare --baseline gpt-5.4 \
  out/bench/*/*/*/benchmark_analysis.json > out/bench/compare.md
```

`compare` prints, per dataset, every run summary as mean ± sd across repeats,
then an **agreement** table: each configuration's outputs scored item by item
against the baseline's, with the baseline's output standing in for "expected"
in the usual rubric (orchestrator choice, filter, chart spec), plus how often
both picked the same visualization template. A clarifying question about a
field the baseline used counts as agreeing. The baseline's own column scores
its repeats against each other — the noise floor. Models are not deterministic
even at temperature 0, so read a candidate's agreement against that floor, not
against 1.0.
