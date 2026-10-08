"""
This file is for benchmarking the performance of the UDI Agent.
At a high level it will open a benchmark.json file that includes a list of inputs and expected outputs.
It will then run the UDI Agent on each input and compare the output to the expected output
and record the types of errors made.

It also includes the option to run with different information ablated, such as field descriptions.
"""

from collections import defaultdict
from datetime import datetime
from itertools import combinations, product
import json
import requests
import argparse
import statistics
import sys
import uuid
from jsonschema import validate, ValidationError
import copy
import os
import threading
import time
from concurrent.futures import ThreadPoolExecutor, as_completed

from udiagent.grammar import load_grammar

PORT = 8007
JSONL_SCHEMAS_FILENAME = "schemas.json"
timestamp = datetime.now().strftime("%Y-%m-%d_%H-%M-%S")
RESULT_FILENAME = "./out/" + timestamp + "/benchmark_results.json"
ANALYSIS_FILENAME = "./out/" + timestamp + "/benchmark_analysis.json"

run_id = str(uuid.uuid4())


def load_benchmark_data(path, limit=None):
    """Load benchmark data from .json or .jsonl files.

    For .jsonl files, loads the sibling schemas.json and injects
    dataSchema/dataDomains back into each item so downstream code
    sees the same structure as the original JSON format.
    """
    if path.endswith(".jsonl"):
        return _load_benchmark_jsonl(path, limit=limit)
    else:
        with open(path, "r") as f:
            data = json.load(f)
        if limit:
            data = data[:limit]
        return data


def _load_benchmark_jsonl(path, limit=None):
    """Load a compact JSONL benchmark file, reconstituting shared schemas."""
    schemas_path = os.path.join(os.path.dirname(path), JSONL_SCHEMAS_FILENAME)
    with open(schemas_path, "r") as f:
        schemas = json.load(f)

    # Pre-load schema strings so all items share the same string objects in memory
    schema_cache = {}
    for key, val in schemas.items():
        schema_cache[key] = (val["dataSchema"], val["dataDomains"])

    items = []
    with open(path, "r") as f:
        for line in f:
            if limit and len(items) >= limit:
                break
            item = json.loads(line)
            dataset_key = item["input"].pop("dataset_key")
            ds, dd = schema_cache[dataset_key]
            item["input"]["dataSchema"] = ds
            item["input"]["dataDomains"] = dd
            items.append(item)

    print(f"Loaded {len(items)} items from {path}")
    return items


def run_benchmark(
    benchmark_file,
    no_orchestrator=False,
    max_workers=5,
    resume_path=None,
    limit=None,
    label=None,
    description=None,
):
    benchmark_data = load_benchmark_data(benchmark_file, limit=limit)

    results = collect_results(
        benchmark_data,
        no_orchestrator=no_orchestrator,
        max_workers=max_workers,
        resume_path=resume_path,
        benchmark_file=benchmark_file,
        label=label,
        description=description,
    )
    analysis = analyze_results(results)
    return


def save_data_to_file(data, path):
    # ensure the directory exists
    os.makedirs(os.path.dirname(path), exist_ok=True)
    try:
        with open(path, "w") as f:
            json.dump(data, f, indent=2)
        print(f"Data successfully saved to {path}")
    except Exception as e:
        print(f"Failed to save data to {path}: {e}")


def collect_results(
    benchmark_data,
    no_orchestrator=False,
    max_workers=5,
    resume_path=None,
    benchmark_file=None,
    label=None,
    description=None,
):
    # Load existing results if resuming. Only successful items carry over, so a
    # resume retries everything that failed (None) or was refused (429).
    if resume_path:
        with open(resume_path) as f:
            existing = json.load(f)
        for i, item in enumerate(existing["results"]):
            if _succeeded(item):
                benchmark_data[i] = item
        skipped = sum(1 for item in benchmark_data if _succeeded(item))
        print(
            f"Resumed from {resume_path}: {skipped}/{len(benchmark_data)} items already completed"
        )

    if description is None:
        # Prompt only when someone is there to answer; scripted runs get "".
        description = (
            input("Enter a description for this benchmark run: ")
            if sys.stdin.isatty()
            else ""
        )

    lock = threading.Lock()
    completed = 0
    total = len(benchmark_data)
    start_time = time.time()

    benchmark_results = {
        "metadata": {
            "run_id": run_id,
            "timestamp": timestamp,
            "description": description,
            "no_orchestrator": no_orchestrator,
            "data_path": benchmark_file,
            "workers": max_workers,
            # Filled from the server's echo once an item succeeds.
            "label": label,
            "model": None,
            "llm_settings": None,
        },
        "results": benchmark_data,
    }

    def process_item(index, item):
        nonlocal completed
        if _succeeded(item):  # already completed (resume)
            with lock:
                completed += 1
            return
        start = time.perf_counter()
        output = fetch_agent_output(
            item["input"], item["expected"], no_orchestrator=no_orchestrator
        )
        item["latency_s"] = round(time.perf_counter() - start, 3)
        item["output"] = output
        with lock:
            completed += 1
            elapsed = time.time() - start_time
            print(f"Completed {completed}/{total} ({elapsed:.1f}s elapsed)")
            save_data_to_file(benchmark_results, RESULT_FILENAME)

    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        futures = [
            executor.submit(process_item, i, item)
            for i, item in enumerate(benchmark_data)
        ]
        for future in as_completed(futures):
            future.result()  # raise any exceptions

    metadata = benchmark_results["metadata"]
    served = next((i["output"] for i in benchmark_data if _succeeded(i)), None)
    if served:
        metadata["model"] = served.get("model")
        metadata["llm_settings"] = served.get("llm_settings")
    metadata["label"] = metadata["label"] or metadata["model"]

    # Final save
    save_data_to_file(benchmark_results, RESULT_FILENAME)
    return benchmark_results


def _succeeded(item):
    """Whether the server answered this item (a refusal arrives as a bare list)."""
    return isinstance(item.get("output"), dict)


def fetch_agent_output(input, expected, no_orchestrator=False):
    # server = f"http://localhost/v1"
    server = f"http://127.0.0.1:{PORT}/v1"
    try:
        payload = copy.deepcopy(input)
        if no_orchestrator:
            payload["orchestrator_choice"] = expected["orchestrator_choice"]

        data = json.dumps(payload)

        response = requests.post(
            f"{server}/yac/benchmark",
            headers={
                "Content-Type": "application/json",
                "Authorization": "Bearer fake_token",
            },
            data=data,
            # Generous: a slow model past a short client timeout keeps spending
            # tokens on the server while the item is recorded as lost.
            timeout=600,
        )

        if not response.ok:
            raise Exception(
                f"HTTP error! status: {response.status_code}, message: {response.text}"
            )

        data = response.json()
        if isinstance(data, list):
            # Quota/rate-limit refusals come back as HTTP 200 with a bare
            # Rebuff list, which is not a result to score.
            raise Exception(f"refused (rate limit or budget): {data}")
        return data

    except Exception as e:
        print("Error querying LLM:", e)
        return None


def analyze_results(results_data, path=None):
    for item in results_data["results"]:
        input, expected, output = item["input"], item["expected"], item.get("output")
        data_domains = input.get("dataDomains", "[]")
        data_domains = json.loads(data_domains)
        rubric_results = check_rubric(expected, output, data_domains)
        item["rubric"] = rubric_results
        item["score"] = calculate_item_score(rubric_results)

    overall_scores = calculate_overall_scores(results_data["results"])
    summary = summarize_run(
        results_data["results"], overall_scores, results_data["metadata"].get("model")
    )

    analysis = {
        "metadata": results_data["metadata"],
        "scores": overall_scores,
        "summary": summary,
        "results": results_data["results"],
    }

    save_data_to_file(analysis, path or ANALYSIS_FILENAME)
    print(json.dumps(summary, indent=2))
    return analysis


def update_rubric(rubric, key, expected, output, group, points, pass_value=None):
    if pass_value is None:
        pass_value = expected == output
    rubric[key] = {
        "expected": expected,
        "output": output,
        "group": group,
        "points": points,
        "pass": pass_value,
    }
    return pass_value


def check_rubric(expected, output, data_domains):
    rubric = {}

    if not isinstance(output, dict):  # failed (None) or refused (bare list)
        output = {}

    # orchestrator makes correct decision (filter/vis/both)
    output_orchestrator_choice = output.get("orchestrator_choice", None)
    expected_orchestrator_choice = expected.get("orchestrator_choice", None)
    update_rubric(
        rubric,
        "orchestrator_choice",
        expected_orchestrator_choice,
        output_orchestrator_choice,
        "orchestrator",
        100,
    )

    # FILTER RUBRIC
    if (
        expected_orchestrator_choice in ["get-subset-of-data", "both"]
    ) and output_orchestrator_choice in ["get-subset-of-data", "both"]:
        check_filter_rubric(rubric, expected, output, data_domains)

    # VIS RUBRIC
    if (
        expected_orchestrator_choice in ["render-visualization", "both"]
    ) and output_orchestrator_choice in ["render-visualization", "both"]:
        check_vis_rubric(rubric, expected, output, data_domains)

    return rubric


def check_filter_rubric(rubric, expected, output, data_domains):
    expected_tool_calls = expected.get("tool_calls", [])
    output_tool_calls = output.get("tool_calls", [])

    expected_filter_call = _find_call(expected_tool_calls, "FilterData")
    output_filter_call = _find_call(output_tool_calls, "FilterData")
    if expected_filter_call is None:
        # The reference itself chose to filter but produced no filter (possible
        # when the reference is another model's run): nothing to score against.
        return rubric
    expected_filter_call_args = expected_filter_call["arguments"]
    if output_filter_call is None:
        update_rubric(
            rubric, "filter_type", expected_filter_call_args, None, "filter", 40, False
        )
        return rubric
    output_filter_call_args = output_filter_call["arguments"]

    # correct type of filter (point vs range): 40 points
    expected_filter_type = expected_filter_call_args["filter"]["filterType"]
    output_filter_type = output_filter_call_args["filter"]["filterType"]
    update_rubric(
        rubric, "filter_type", expected_filter_type, output_filter_type, "filter", 40
    )

    # correct entity: 20 points
    output_filter_entity = output_filter_call_args["entity"]
    correct_entity = update_rubric(
        rubric,
        "filter_entity_correct",
        expected_filter_call_args["entity"],
        output_filter_entity,
        "filter",
        20,
    )

    # valid entity (it exists in the data schema): 5 points
    if not correct_entity:
        valid_entity_options = {x["entity"] for x in data_domains}
        passed = output_filter_entity in valid_entity_options
        update_rubric(
            rubric,
            "filter_entity_valid",
            json.dumps(list(valid_entity_options)),
            output_filter_entity,
            "filter",
            5,
            passed,
        )

    # correct field: 20 points
    output_filter_field = output_filter_call_args["field"]
    correct_field = update_rubric(
        rubric,
        "filter_field_correct",
        expected_filter_call_args["field"],
        output_filter_field,
        "filter",
        20,
    )

    # valid field (it exists in the data schema): 5 points
    if not correct_field:
        valid_field_options = {x["field"] for x in data_domains}
        passed = output_filter_field in valid_field_options
        update_rubric(
            rubric,
            "filter_field_valid",
            json.dumps(list(valid_field_options)),
            output_filter_field,
            "filter",
            5,
            passed,
        )

    # interval correct (for range filters): 20 points
    if expected_filter_type == "interval":
        expected_interval = expected_filter_call_args["filter"]["intervalRange"]
        output_interval = output_filter_call_args["filter"]["intervalRange"]
        update_rubric(
            rubric,
            "filter_interval_min",
            expected_interval["min"],
            output_interval["min"],
            "filter",
            10,
        )
        update_rubric(
            rubric,
            "filter_interval_max",
            expected_interval["max"],
            output_interval["max"],
            "filter",
            10,
        )

    # point correct (for point filters): 20 points
    point_values_correct = False
    if expected_filter_type == "point":
        expected_points = expected_filter_call_args["filter"]["pointValues"]
        output_points = output_filter_call_args["filter"]["pointValues"]
        point_values_correct = set(expected_points) == set(output_points)
        update_rubric(
            rubric,
            "filter_point_value",
            json.dumps(list(expected_points)),
            json.dumps(list(output_points)),
            "filter",
            20,
            point_values_correct,
        )

    # point valid (for point filters), the point values exist in the field domain: 5 points
    if expected_filter_type == "point" and not point_values_correct:
        valid_points = next(
            (
                x.get("domain", {}).get("values", [])
                for x in data_domains
                if x["entity"] == output_filter_entity
                and x["field"] == output_filter_field
            ),
            [],
        )
        passed = all(point in valid_points for point in output_points)
        update_rubric(
            rubric,
            "filter_point_value_valid",
            json.dumps(list(valid_points)),
            json.dumps(list(output_points)),
            "filter",
            5,
            passed,
        )

    return rubric


def check_vis_rubric(rubric, expected, output, data_domains):
    expected_tool_calls = expected.get("tool_calls", [])
    output_tool_calls = output.get("tool_calls", [])

    expected_vis_call = _find_call(expected_tool_calls, "RenderVisualization")
    if expected_vis_call is None:
        # The reference chose to chart but built nothing (a failed chart arrives
        # as FreeTextExplain): nothing to score against.
        return rubric
    expected_vis_spec = expected_vis_call["arguments"]["spec"]
    expected_vis_spec_json = json.loads(expected_vis_spec)
    output_vis_call = _find_call(output_tool_calls, "RenderVisualization")
    # No chart scores like an unparseable one: zero for the vis group.
    output_vis_spec = output_vis_call["arguments"]["spec"] if output_vis_call else None

    # generates specification that is a valid json
    try:
        output_vis_spec_json = json.loads(output_vis_spec)
        valid_json = True
    except:
        valid_json = False

    if not valid_json:
        # worthless, stop here, update rubric with failed test. (only include passed test if the vis spec isn't 100% correct)
        update_rubric(
            rubric,
            "vis_spec_valid_json",
            expected_vis_spec,
            output_vis_spec,
            "vis",
            10,
            valid_json,
        )
        return rubric

    # exact match of vis spec: 100 points
    spec_match = expected_vis_spec_json == output_vis_spec_json
    update_rubric(
        rubric,
        "vis_spec_exact_match",
        expected_vis_spec,
        output_vis_spec,
        "vis",
        100,
        spec_match,
    )

    if spec_match:
        # perfect, stop here
        return rubric

    # valid json but not exact match: 10 points
    update_rubric(
        rubric,
        "vis_spec_valid_json",
        expected_vis_spec,
        output_vis_spec,
        "vis",
        10,
        valid_json,
    )

    # Generates specification that adheres to to udi grammar: 10 points
    udi_grammar_dict = load_grammar("udi")["schema_dict"]
    try:
        valid_udi_spec = True
        validate(instance=output_vis_spec_json, schema=udi_grammar_dict)
    except ValidationError as e:
        valid_udi_spec = False
    update_rubric(
        rubric,
        "vis_spec_adhere_grammar",
        expected_vis_spec,
        output_vis_spec,
        "vis",
        10,
        valid_udi_spec,
    )

    # the source part of the spec is correct: 25 points
    expected_source = expected_vis_spec_json.get("source", None)
    output_source = output_vis_spec_json.get("source", None)
    update_rubric(
        rubric, "vis_spec_source_correct", expected_source, output_source, "vis", 25
    )

    # the transformation part of the spec is correct: 25 points
    expected_transformation = expected_vis_spec_json.get("transformation", None)
    output_transformation = output_vis_spec_json.get("transformation", None)
    update_rubric(
        rubric,
        "vis_spec_transformation_correct",
        expected_transformation,
        output_transformation,
        "vis",
        25,
    )

    # the representation part of the spec is correct: 25 points
    expected_representation = expected_vis_spec_json.get("representation", None)
    output_representation = output_vis_spec_json.get("representation", None)
    update_rubric(
        rubric,
        "vis_spec_representation_correct",
        expected_representation,
        output_representation,
        "vis",
        25,
    )

    return rubric


def _find_call(tool_calls, name):
    """The first tool call with this name, or None."""
    return next((call for call in tool_calls if call.get("name") == name), None)


def calculate_item_score(rubric):
    """
    For each rubric group calculate the total points.
    The group score is the points divided by 100.
    The overall score is the average of the group scores.

    :param rubric: a dictionary of rubric items. Each item has a group (string), points (int), and pass (bool).
    :return: a dictionary of group results (score and total points) and an overall score.
    """
    scores = {}
    group_scores = {}
    for item in rubric.values():
        group = item["group"]
        points = item["points"]
        passed = item["pass"]

        if group not in group_scores:
            group_scores[group] = {"points": 0}

        if passed:
            group_scores[group]["points"] += points

    overall_score = 0
    for group, data in group_scores.items():
        group_score = data["points"] / 100
        group_scores[group]["score"] = group_score
        overall_score += group_score

    overall_score = overall_score / len(group_scores) if group_scores else 0
    scores["groups"] = group_scores
    scores["overall_score"] = overall_score

    return scores


def calculate_overall_scores(results_data):
    """
    Calculate overall scores of results_data. It will include an average of all overall_score values.
    And the count of items with a score of 1.0 out of the total number of items.

    :param results_data: List of results. Each result will have a "score" field with "overall_score" and "groups" with group scores. Each group will have a "points" and "score"
    """

    score_total = 0
    correct_count = 0
    group_aggregates = {}

    for item in results_data:
        item_score = item.get("score", {})
        overall_score = item_score.get("overall_score", 0)
        score_total += overall_score
        if overall_score == 1.0:
            correct_count += 1

        groups = item_score.get("groups", {})
        for group_name, group_data in groups.items():
            if group_name not in group_aggregates:
                group_aggregates[group_name] = {
                    "score_total": 0,
                    "correct_count": 0,
                    "count": 0,
                }

            group_aggregate = group_aggregates[group_name]

            group_aggregate["score_total"] += group_data.get("score", 0)
            if group_data.get("score", 0) == 1.0:
                group_aggregate["correct_count"] += 1
            group_aggregate["count"] += 1

    overall_score = score_total / len(results_data) if results_data else 0
    percent_correct = correct_count / len(results_data) if results_data else 0

    # Calculate group aggregates
    for group_name, group_data in group_aggregates.items():
        group_data["overall_score"] = (
            group_data["score_total"] / group_data["count"]
            if group_data["count"]
            else 0
        )
        group_data["percent_correct"] = (
            group_data["correct_count"] / group_data["count"]
            if group_data["count"]
            else 0
        )

        del group_data["score_total"]
        group_data["total_count"] = group_data["count"]
        del group_data["count"]

    return {
        "overall_score": overall_score,
        "correct_percent": percent_correct,
        "correct_count": correct_count,
        "total_count": len(results_data),
        "group_aggregates": group_aggregates,
    }


# USD per 1M tokens: (input, cached input, cache write, output). Cache writes
# are billed at 1.25x input from GPT-5.6 on; earlier models charge input rate.
# Reasoning tokens are part of completion tokens and billed as output. Check
# these against https://openai.com/api/pricing before quoting a cost.
PRICES = {
    "gpt-5.4": (2.50, 0.25, 2.50, 15.00),
    "gpt-6.1-sol": (2.00, 0.10, 2.50, 10.00),
    "gpt-6-luna": (0.10, 0.01, 0.125, 0.50),
}

TOKEN_KEYS = (
    "prompt_tokens",
    "cached_prompt_tokens",
    "cache_write_tokens",
    "completion_tokens",
    "reasoning_tokens",
)


def cost_usd(model, usage):
    """Dollar cost of a usage dict, or None for a model without a price.

    Cached and cache-write tokens are both shares of ``prompt_tokens`` (checked
    per call by ``cache_subset_violations`` in the run summary).
    """
    if model not in PRICES:
        return None
    p_input, p_cached, p_write, p_output = PRICES[model]
    cached = usage.get("cached_prompt_tokens", 0)
    write = usage.get("cache_write_tokens", 0)
    uncached = usage.get("prompt_tokens", 0) - cached - write
    return (
        uncached * p_input
        + cached * p_cached
        + write * p_write
        + usage.get("completion_tokens", 0) * p_output
    ) / 1e6


def _percentile(values, q):
    """The q-th percentile (0-100) of a non-empty list."""
    if len(values) == 1:
        return values[0]
    return statistics.quantiles(values, n=100, method="inclusive")[q - 1]


def summarize_run(results, scores, model):
    """One flat dict per run: quality, failures, tokens, cost and latency.

    Token, cost and latency figures cover answered items only; a failed item
    has no usage to report and would drag the means toward zero.
    """
    answered = [item for item in results if _succeeded(item)]
    usages = [item["output"].get("usage") or {} for item in answered]
    operations = [op for usage in usages for op in usage.get("operations", [])]
    totals = {key: sum(u.get(key, 0) for u in usages) for key in TOKEN_KEYS}
    n = len(answered)
    cost = cost_usd(model, totals)
    latencies = [i["latency_s"] for i in answered if i.get("latency_s") is not None]
    op_latencies = defaultdict(list)
    for op in operations:
        if op.get("latency_s") is not None:
            op_latencies[op["op"]].append(op["latency_s"])

    summary = {
        "items": len(results),
        "failed_items": len(results) - n,
        "score_vs_expected": scores["overall_score"],
        **{
            f"{group}_score_vs_expected": agg["overall_score"]
            for group, agg in sorted(scores["group_aggregates"].items())
        },
        **{f"{key}_per_item": totals[key] / n if n else 0 for key in TOKEN_KEYS},
        "cached_percent": (
            100 * totals["cached_prompt_tokens"] / totals["prompt_tokens"]
            if totals["prompt_tokens"]
            else 0
        ),
        "llm_calls_per_item": len(operations) / n if n else 0,
        "cost_usd": cost,
        "cost_per_item_usd": cost / n if cost is not None and n else None,
        "latency_mean_s": statistics.fmean(latencies) if latencies else None,
        "latency_p50_s": _percentile(sorted(latencies), 50) if latencies else None,
        "latency_p95_s": _percentile(sorted(latencies), 95) if latencies else None,
        **{
            f"latency_{op}_mean_s": statistics.fmean(values)
            for op, values in sorted(op_latencies.items())
        },
        "cache_subset_violations": sum(
            op.get("cached_prompt_tokens", 0) + op.get("cache_write_tokens", 0)
            > op.get("prompt_tokens", 0)
            for op in operations
        ),
    }
    return summary


def _template(output):
    """The visualization template a run chose for an item, or None."""
    if not isinstance(output, dict):
        return None
    call = _find_call(output.get("tool_calls", []), "RenderVisualization")
    return ((call or {}).get("meta") or {}).get("tool_used")


def agreement(reference, candidate):
    """Score one run's outputs against another's, item by item.

    The reference run's output stands in for ``expected`` in the usual rubric,
    so "1.0" means the candidate did what the reference did, not that either
    is right. Items the reference failed on are skipped: there is nothing to
    agree with.
    """
    ref_items, cand_items = reference["results"], candidate["results"]
    if len(ref_items) != len(cand_items):
        raise ValueError("runs cover different item counts; compare like with like")
    scored = []
    template_pairs = []
    for ref, cand in zip(ref_items, cand_items):
        if ref["input"]["messages"] != cand["input"]["messages"]:
            raise ValueError("runs cover different items; compare like with like")
        if not _succeeded(ref):
            continue
        domains = json.loads(ref["input"].get("dataDomains", "[]"))
        rubric = check_rubric(ref["output"], cand.get("output"), domains)
        scored.append({"score": calculate_item_score(rubric)})
        if _template(ref["output"]):
            template_pairs.append(_template(ref["output"]) == _template(cand.get("output")))
    scores = calculate_overall_scores(scored)
    return {
        "agreement": scores["overall_score"],
        "identical_percent": 100 * scores["correct_percent"],
        **{
            f"{group}_agreement": agg["overall_score"]
            for group, agg in sorted(scores["group_aggregates"].items())
        },
        "template_agreement_percent": (
            100 * sum(template_pairs) / len(template_pairs) if template_pairs else None
        ),
        "compared_items": len(scored),
    }


def _mean_sd(values):
    values = [v for v in values if v is not None]
    if not values:
        return "—"
    mean = statistics.fmean(values)
    sd = statistics.stdev(values) if len(values) > 1 else 0.0
    fmt = (lambda v: f"{v:,.0f}") if abs(mean) >= 100 else (lambda v: f"{v:.3g}")
    return f"{fmt(mean)} ± {fmt(sd)}"


def _table(columns):
    """A markdown table from ``{header: {metric: [values]}}``, cells as mean ± sd."""
    headers = list(columns)
    rows = list(dict.fromkeys(row for column in columns.values() for row in column))
    lines = [
        "| metric | " + " | ".join(headers) + " |",
        "|---" * (len(headers) + 1) + "|",
    ]
    for row in rows:
        cells = (_mean_sd(columns[header].get(row, [])) for header in headers)
        lines.append(f"| {row} | " + " | ".join(cells) + " |")
    return "\n".join(lines)


def _column(dicts):
    """``[{metric: value}, ...]`` → ``{metric: [value, ...]}``."""
    column = defaultdict(list)
    for d in dicts:
        for key, value in d.items():
            column[key].append(value)
    return column


def compare(paths, baseline=None):
    """Markdown tables comparing analysed runs, grouped by dataset.

    Cells are mean ± sd across repeats of the same label. With ``baseline``, a
    second table scores every other label's outputs against the baseline's
    (every candidate repeat against every baseline repeat), and the baseline
    column shows its repeats scored against each other: the noise floor that
    any other model's agreement should be read against.
    """
    runs = defaultdict(list)
    for path in paths:
        with open(path) as f:
            run = json.load(f)
        meta = run["metadata"]
        label = meta.get("label") or meta.get("model") or "unlabelled"
        runs[(os.path.basename(meta["data_path"]), label)].append(run)

    out = []
    for dataset in sorted({dataset for dataset, _ in runs}):
        labels = sorted(label for d, label in runs if d == dataset)
        if baseline in labels:
            labels.remove(baseline)
            labels.insert(0, baseline)
        header = {label: f"{label} (n={len(runs[(dataset, label)])})" for label in labels}
        out.append(f"## {dataset}\n")
        out.append(
            _table(
                {
                    header[label]: _column(r.get("summary", {}) for r in runs[(dataset, label)])
                    for label in labels
                }
            )
        )
        if baseline in labels:
            base_runs = runs[(dataset, baseline)]
            pairs = {
                label: (
                    combinations(base_runs, 2)
                    if label == baseline
                    else product(base_runs, runs[(dataset, label)])
                )
                for label in labels
            }
            out.append(f"\n### Agreement with {baseline}\n")
            out.append(
                f"Each cell scores a label's outputs against {baseline}'s, item by "
                f"item. The {baseline} column scores its own repeats against each "
                "other: the noise floor (needs 2+ repeats).\n"
            )
            out.append(
                _table(
                    {
                        header[label]: _column(agreement(ref, cand) for ref, cand in pairs[label])
                        for label in labels
                    }
                )
            )
        out.append("")
    return "\n".join(out)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Run UDI Agent benchmark or analysis.")
    parser.add_argument(
        "-p",
        "--path",
        default="./data/benchmark.json",
        help="Benchmark data for full/collect, or a results JSON for analyze "
        "(default: ./data/benchmark.json)",
    )
    parser.add_argument(
        "-a",
        "--action",
        choices=["full", "collect", "analyze", "compare"],
        default="full",
        help="'full' (run benchmark then analyze), 'collect' (run only), "
        "'analyze' (score a results file), or 'compare' (tabulate analysis files).",
    )
    parser.add_argument(
        "files",
        nargs="*",
        help="compare: benchmark_analysis.json files from any number of runs.",
    )

    # add option to bypass orchestrator step.
    parser.add_argument(
        "--no-orchestrator",
        action="store_true",
        help="Intended to bypass the orchestrator step; currently ignored by the server.",
    )

    parser.add_argument(
        "--workers",
        type=int,
        default=5,
        help="Number of concurrent workers for benchmark collection (default: 5).",
    )

    parser.add_argument(
        "--resume",
        type=str,
        default=None,
        help="Path to a partial results JSON file to resume from; failed items are retried.",
    )

    parser.add_argument(
        "--limit",
        type=int,
        default=None,
        help="Cap the number of benchmark items to load.",
    )
    parser.add_argument(
        "--label",
        default=None,
        help="Name this run's configuration in comparisons (default: the model the "
        "server reports). Needed to tell apart configs sharing a model, e.g. "
        "gpt-5.4 on Chat Completions vs Responses.",
    )
    parser.add_argument(
        "--description",
        default=None,
        help="Free-text note stored with the run (prompted for when omitted on a terminal).",
    )
    parser.add_argument(
        "--out",
        default=None,
        help="Directory for benchmark_results.json / benchmark_analysis.json "
        "(default: ./out/<timestamp>; analyze writes next to its input).",
    )
    parser.add_argument(
        "--baseline",
        default=None,
        help="compare: label whose outputs the others are scored against.",
    )

    args = parser.parse_args()
    if args.out:
        RESULT_FILENAME = os.path.join(args.out, "benchmark_results.json")
        ANALYSIS_FILENAME = os.path.join(args.out, "benchmark_analysis.json")

    if args.action == "full":
        # run_benchmark will run collection and analysis internally
        run_benchmark(
            args.path,
            args.no_orchestrator,
            max_workers=args.workers,
            resume_path=args.resume,
            limit=args.limit,
            label=args.label,
            description=args.description,
        )
        sys.exit(0)

    if args.action == "collect":
        try:
            benchmark_data = load_benchmark_data(args.path, limit=args.limit)
        except Exception as e:
            print(f"Failed to read benchmark file {args.path}: {e}")
            sys.exit(1)
        collect_results(
            benchmark_data,
            args.no_orchestrator,
            max_workers=args.workers,
            resume_path=args.resume,
            benchmark_file=args.path,
            label=args.label,
            description=args.description,
        )

        sys.exit(0)

    if args.action == "analyze":
        try:
            with open(args.path, "r") as f:
                data = json.load(f)
        except Exception as e:
            print(f"Failed to read benchmark file {args.path}: {e}")
            sys.exit(1)

        analyze_results(
            data,
            None
            if args.out
            else os.path.join(os.path.dirname(args.path), "benchmark_analysis.json"),
        )
        sys.exit(0)

    if args.action == "compare":
        if not args.files:
            parser.error("compare needs one or more benchmark_analysis.json files")
        print(compare(args.files, baseline=args.baseline))
        sys.exit(0)
