"""Gaussian KDE post-processing for the `kde` transform.

SQL backends have no KDE, so the engine runs the SQL prefix, pulls the rows,
and computes the density here. The toolkit uses fast-kde (Deriche recursive
approximation); this is a plain Gaussian sum, so values are visually
equivalent but not bit-identical — kde is excluded from strict parity.
"""

from __future__ import annotations

import math


def nrd_bandwidth(values: list[float]) -> float:
    """Silverman's normal-reference rule, matching fast-kde's nrd()."""
    n = len(values)
    if n < 2:
        return 1.0
    ordered = sorted(values)
    mean = sum(ordered) / n
    sd = math.sqrt(sum((v - mean) ** 2 for v in ordered) / (n - 1))

    def quantile(q: float) -> float:
        pos = (n - 1) * q
        lo = math.floor(pos)
        hi = math.ceil(pos)
        return ordered[lo] + (ordered[hi] - ordered[lo]) * (pos - lo)

    iqr = (quantile(0.75) - quantile(0.25)) / 1.34
    spread = min(sd, iqr) or sd or 1.0
    return 1.06 * spread * n ** (-0.2)


def gaussian_kde(
    values: list[float],
    bandwidth: float | None = None,
    samples: int = 100,
) -> list[tuple[float, float]]:
    """Density estimate over an evenly spaced grid spanning the data extent
    padded by 3 bandwidths. Returns [(sample, density), ...]."""
    if not values:
        return []
    bw = bandwidth if bandwidth is not None else nrd_bandwidth(values)
    if bw <= 0:
        bw = 1.0
    lo = min(values) - 3 * bw
    hi = max(values) + 3 * bw
    if samples < 2 or lo == hi:
        return [(lo, 1.0)]
    step = (hi - lo) / (samples - 1)
    norm = 1.0 / (len(values) * bw * math.sqrt(2 * math.pi))
    out: list[tuple[float, float]] = []
    for i in range(samples):
        x = lo + i * step
        acc = 0.0
        for v in values:
            z = (x - v) / bw
            if abs(z) < 8:
                acc += math.exp(-0.5 * z * z)
        out.append((x, acc * norm))
    return out
