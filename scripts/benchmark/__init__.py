"""Benchmark parsing package.

Canonical module layout:
- scripts.benchmark.core
- scripts.benchmark.io
"""

try:
	from scripts.benchmark_core import ParseStats, parse, save
	from scripts.benchmark_io import load, main, parse_args
except ModuleNotFoundError:
	from benchmark_core import ParseStats, parse, save
	from benchmark_io import load, main, parse_args

__all__ = ["ParseStats", "load", "main", "parse", "parse_args", "save"]
