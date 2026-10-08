"""Tests for benchmark scoring robustness, run summaries, costs and model comparison."""

import json

import pytest

from udiagent.benchmark.runner import (
    agreement,
    analyze_results,
    calculate_overall_scores,
    check_rubric,
    compare,
    cost_usd,
    summarize_run,
)

SPEC_A = json.dumps({"source": {"name": "donors"}, "representation": {"mark": "bar"}})
SPEC_B = json.dumps({"source": {"name": "donors"}, "representation": {"mark": "point"}})
MESSAGES = [{"role": "user", "content": "donors by sex"}]


def _chart(spec, template):
    return {
        "name": "RenderVisualization",
        "arguments": {"spec": spec},
        "meta": {"tool_used": template},
    }


def _output(*calls, choice="render-visualization", latency=1.0, **usage):
    return {
        "tool_calls": list(calls),
        "orchestrator_choice": choice,
        "model": "gpt-6.1-sol",
        "usage": {
            "prompt_tokens": usage.get("prompt", 2000),
            "cached_prompt_tokens": usage.get("cached", 1024),
            "cache_write_tokens": usage.get("write", 512),
            "completion_tokens": usage.get("completion", 300),
            "reasoning_tokens": usage.get("reasoning", 0),
            "operations": [
                {
                    "op": "orchestrate",
                    "prompt_tokens": 1000,
                    "cached_prompt_tokens": 512,
                    "cache_write_tokens": 256,
                    "latency_s": latency,
                }
            ],
        },
    }


def _run(label, outputs, path="data/small.jsonl"):
    """An analysed run in the shape analyze_results writes."""
    results = [
        {
            "input": {"messages": MESSAGES, "dataDomains": "[]"},
            "expected": {
                "tool_calls": [_chart(SPEC_A, "bar")],
                "orchestrator_choice": "render-visualization",
            },
            "output": output,
            "latency_s": 2.0,
        }
        for output in outputs
    ]
    data = {"metadata": {"label": label, "model": label, "data_path": path}, "results": results}
    return analyze_results(data, path="/dev/null")


class TestCost:
    def test_prices_each_token_class(self):
        usage = {
            "prompt_tokens": 2000,
            "cached_prompt_tokens": 1024,
            "cache_write_tokens": 512,
            "completion_tokens": 300,
        }
        # (2000-1024-512)*2.00 + 1024*0.10 + 512*2.50 + 300*10.00, per 1M
        assert cost_usd("gpt-6.1-sol", usage) == pytest.approx(5310.4 / 1e6)

    def test_unknown_model_has_no_price(self):
        assert cost_usd("gpt-5.4-mini", {"prompt_tokens": 1}) is None


class TestRubricRobustness:
    def test_refusal_list_scores_zero_without_crashing(self):
        expected = {"tool_calls": [_chart(SPEC_A, "bar")], "orchestrator_choice": "render-visualization"}
        rubric = check_rubric(expected, [{"name": "Rebuff"}], [])
        assert rubric["orchestrator_choice"]["pass"] is False

    def test_failed_chart_scores_zero_for_vis(self):
        expected = {"tool_calls": [_chart(SPEC_A, "bar")], "orchestrator_choice": "render-visualization"}
        output = {
            "tool_calls": [{"name": "FreeTextExplain", "arguments": {}}],
            "orchestrator_choice": "render-visualization",
        }
        rubric = check_rubric(expected, output, [])
        assert rubric["vis_spec_valid_json"]["pass"] is False

    def test_reference_without_a_chart_skips_vis(self):
        reference = {
            "tool_calls": [{"name": "FreeTextExplain", "arguments": {}}],
            "orchestrator_choice": "render-visualization",
        }
        rubric = check_rubric(reference, _output(_chart(SPEC_A, "bar")), [])
        assert {entry["group"] for entry in rubric.values()} == {"orchestrator"}

    def test_partial_match_validates_against_the_grammar(self):
        expected = {"tool_calls": [_chart(SPEC_A, "bar")], "orchestrator_choice": "render-visualization"}
        rubric = check_rubric(expected, _output(_chart(SPEC_B, "point")), [])
        assert "vis_spec_adhere_grammar" in rubric
        assert rubric["vis_spec_source_correct"]["pass"] is True


class TestSummary:
    def test_failures_are_counted_and_excluded_from_means(self):
        results = [
            {"output": _output(_chart(SPEC_A, "bar")), "latency_s": 2.0},
            {"output": [{"name": "Rebuff"}], "latency_s": 0.1},
        ]
        scores = calculate_overall_scores([{"score": {"overall_score": 1.0}}, {}])
        summary = summarize_run(results, scores, "gpt-6.1-sol")
        assert summary["failed_items"] == 1
        assert summary["prompt_tokens_per_item"] == 2000
        assert summary["cache_write_tokens_per_item"] == 512
        assert summary["cost_usd"] == pytest.approx(5310.4 / 1e6)
        assert summary["latency_p50_s"] == 2.0
        assert summary["latency_orchestrate_mean_s"] == 1.0
        assert summary["cache_subset_violations"] == 0


class TestAgreement:
    def test_identical_outputs_agree_fully(self):
        base = _run("gpt-5.4", [_output(_chart(SPEC_A, "bar"))])
        result = agreement(base, base)
        assert result["agreement"] == 1.0
        assert result["template_agreement_percent"] == 100

    def test_different_template_lowers_agreement(self):
        base = _run("gpt-5.4", [_output(_chart(SPEC_A, "bar"))])
        cand = _run("gpt-6-luna", [_output(_chart(SPEC_B, "point"))])
        result = agreement(base, cand)
        assert result["agreement"] < 1.0
        assert result["template_agreement_percent"] == 0

    def test_items_the_reference_failed_are_skipped(self):
        base = _run("gpt-5.4", [None])
        cand = _run("gpt-6-luna", [_output(_chart(SPEC_A, "bar"))])
        assert agreement(base, cand)["compared_items"] == 0

    def test_runs_over_different_items_are_refused(self):
        base = _run("gpt-5.4", [_output(_chart(SPEC_A, "bar"))])
        cand = _run("gpt-6-luna", [_output(_chart(SPEC_A, "bar"))] * 2)
        with pytest.raises(ValueError, match="different item counts"):
            agreement(base, cand)


def test_compare_puts_the_baseline_first_with_its_noise_floor(tmp_path):
    runs = {
        "base-r0": _run("gpt-5.4", [_output(_chart(SPEC_A, "bar"))]),
        "base-r1": _run("gpt-5.4", [_output(_chart(SPEC_A, "bar"))]),
        "luna-r0": _run("gpt-6-luna", [_output(_chart(SPEC_B, "point"))]),
    }
    paths = []
    for name, run in runs.items():
        path = tmp_path / f"{name}.json"
        path.write_text(json.dumps(run))
        paths.append(str(path))

    table = compare(paths, baseline="gpt-5.4")

    assert "## small.jsonl" in table
    assert "| metric | gpt-5.4 (n=2) | gpt-6-luna (n=1) |" in table
    assert "### Agreement with gpt-5.4" in table
    agreement_row = next(
        line for line in table.splitlines() if line.startswith("| template_agreement_percent")
    )
    # Baseline repeats agree with each other; Luna picked another template.
    assert agreement_row == "| template_agreement_percent | 100 ± 0 | 0 ± 0 |"
