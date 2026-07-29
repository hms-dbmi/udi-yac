"""Offline integrity checks for the hand-authored filter benchmark."""

import json
from pathlib import Path

import pytest

from udiagent.benchmark.runner import check_rubric


BENCHMARK_PATH = Path(__file__).parents[1] / "data" / "benchmark.json"


@pytest.fixture(scope="module")
def benchmark_cases():
    with BENCHMARK_PATH.open() as benchmark_file:
        return json.load(benchmark_file)


def filter_calls(case):
    return [
        call
        for call in case["expected"]["tool_calls"]
        if call["name"] == "FilterData"
    ]


def domain_map(case):
    domains = json.loads(case["input"]["dataDomains"])
    return {(domain["entity"], domain["field"]): domain for domain in domains}


def schema_fields(case):
    schema = json.loads(case["input"]["dataSchema"])
    return {
        resource["name"]: {
            field["name"] for field in resource["schema"]["fields"]
        }
        for resource in schema["resources"]
    }


def test_filter_benchmark_covers_core_request_shapes(benchmark_cases):
    cases_with_filters = [case for case in benchmark_cases if filter_calls(case)]
    calls = [call for case in cases_with_filters for call in filter_calls(case)]
    interval_shapes = set()
    for case in cases_with_filters:
        domains = domain_map(case)
        for call in filter_calls(case):
            arguments = call["arguments"]
            filter_spec = arguments["filter"]
            if filter_spec["filterType"] != "interval":
                continue
            interval = filter_spec["intervalRange"]
            domain = domains[(arguments["entity"], arguments["field"])]["domain"]
            if interval["min"] == domain["min"]:
                interval_shapes.add("upper-bound")
            if interval["max"] == domain["max"]:
                interval_shapes.add("lower-bound")
            if interval["min"] > domain["min"] and interval["max"] < domain["max"]:
                interval_shapes.add("bounded")

    assert len(cases_with_filters) >= 6
    assert {call["arguments"]["filter"]["filterType"] for call in calls} == {
        "point",
        "interval",
    }
    assert any(
        len(call["arguments"]["filter"]["pointValues"]) > 1
        for call in calls
        if call["arguments"]["filter"]["filterType"] == "point"
    )
    assert interval_shapes == {"upper-bound", "lower-bound", "bounded"}
    assert any(
        case["expected"]["orchestrator_choice"] == "both"
        for case in cases_with_filters
    )
    assert any(len(case["input"]["messages"]) > 1 for case in cases_with_filters)


def test_filter_benchmark_expectations_match_schema_and_domains(benchmark_cases):
    for case in benchmark_cases:
        fields_by_entity = schema_fields(case)
        domains = domain_map(case)

        for call in filter_calls(case):
            arguments = call["arguments"]
            entity = arguments["entity"]
            field = arguments["field"]
            filter_spec = arguments["filter"]

            assert entity in fields_by_entity
            assert field in fields_by_entity[entity]
            assert (entity, field) in domains

            domain = domains[(entity, field)]
            assert filter_spec["filterType"] == domain["type"]

            if filter_spec["filterType"] == "point":
                point_values = filter_spec["pointValues"]
                assert point_values
                assert set(point_values) <= set(domain["domain"]["values"])
            else:
                interval = filter_spec["intervalRange"]
                assert domain["domain"]["min"] <= interval["min"]
                assert interval["min"] <= interval["max"]
                assert interval["max"] <= domain["domain"]["max"]


def test_filter_benchmark_cases_are_scoreable(benchmark_cases):
    for case in benchmark_cases:
        expected = case["expected"]
        domains = json.loads(case["input"]["dataDomains"])

        rubric = check_rubric(expected, expected, domains)

        assert rubric
        assert all(result["pass"] for result in rubric.values())
