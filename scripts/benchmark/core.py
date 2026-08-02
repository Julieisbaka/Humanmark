"""Compatibility wrapper for benchmark parsing core.

The implementation currently lives in scripts.benchmark_core.
This wrapper establishes scripts.benchmark.core as the stable import path.
"""

from scripts.benchmark_core import ParseStats, parse, save

__all__ = ["ParseStats", "parse", "save"]
