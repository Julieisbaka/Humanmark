"""Compatibility wrapper for benchmark IO and CLI.

The implementation currently lives in scripts.benchmark_io.
This wrapper establishes scripts.benchmark.io as the stable import path.
"""

try:
	from scripts.benchmark_io import load, main, parse_args
except ModuleNotFoundError:
	from benchmark_io import load, main, parse_args

__all__ = ["load", "main", "parse_args"]
