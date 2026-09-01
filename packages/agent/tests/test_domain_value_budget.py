"""How much of a categorical domain reaches the prompt.

A value the model cannot see is a value it cannot filter on: it invents one
instead, and the resulting filter matches nothing. These pin the budget that
decides when a domain is spelled out in full.
"""

from udiagent.schema import (
    MAX_ENUMERATED_CHARS,
    MAX_ENUMERATED_VALUES,
    simplify_data_domains,
)


def _point_field(values, field="dataset_type", entity="datasets"):
    return [
        {
            "entity": entity,
            "field": field,
            "type": "point",
            "fieldDescription": "",
            "domain": {"values": values},
        }
    ]


def test_domain_within_budget_is_listed_in_full():
    # 26 real values, ~322 chars -- the HuBMAP raw_dataset_type case. The
    # value that matters sorts last, so a head-of-list sample would drop it.
    values = [
        "10X Multiome", "2D Imaging Mass Cytometry", "3D Imaging Mass Cytometry",
        "ATACseq", "Auto-fluorescence", "CODEX", "Cell DIVE",
        "CosMx Transcriptomics", "CyTOF", "DESI", "GeoMx (NGS)", "Histology",
        "LC-MS", "Light Sheet", "MALDI", "MIBI", "MUSIC", "PhenoCycler",
        "RNAseq", "RNAseq (with probes)", "SNARE-seq2", "Slide-seq",
        "Visium (no probes)", "WGS", "Xenium", "seqFISH",
    ]
    out = simplify_data_domains(_point_field(values))
    assert "Xenium" in out
    assert "unique)" not in out


def test_domain_over_value_cap_is_sampled():
    values = [f"value{i}" for i in range(MAX_ENUMERATED_VALUES + 1)]
    out = simplify_data_domains(_point_field(values))
    assert f"({len(values)} unique)" in out
    assert "value0" in out
    assert "value40" not in out


def test_domain_under_value_cap_but_over_char_cap_is_sampled():
    # Few values, each enormous: free-text reports, DOIs, adapter sequences.
    values = ["x" * 300, "y" * 300, "z" * 300]
    assert len(values) <= MAX_ENUMERATED_VALUES
    assert sum(len(v) + 2 for v in values) > MAX_ENUMERATED_CHARS
    out = simplify_data_domains(_point_field(values))
    assert "(3 unique)" in out


def test_exactly_at_both_caps_is_listed_in_full():
    values = [f"v{i:02d}" for i in range(MAX_ENUMERATED_VALUES)]
    assert sum(len(v) + 2 for v in values) <= MAX_ENUMERATED_CHARS
    out = simplify_data_domains(_point_field(values))
    assert "unique)" not in out
    assert values[-1] in out


def test_interval_fields_are_unaffected():
    domains = [
        {
            "entity": "donors",
            "field": "age_value",
            "type": "interval",
            "fieldDescription": "",
            "domain": {"min": 1, "max": 90},
        }
    ]
    assert "range: [1, 90]" in simplify_data_domains(domains)


def test_descriptions_are_never_truncated():
    # Descriptions are the one channel that survives intact, so portal-side
    # vocabulary hints depend on this.
    long_desc = "word " * 200
    domains = _point_field(["a", "b"])
    domains[0]["fieldDescription"] = long_desc
    assert long_desc.strip() in simplify_data_domains(domains)
