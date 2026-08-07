"""Benchmark parsing package.

Canonical module layout:
- scripts.benchmark.core
- scripts.benchmark.io
"""

from __future__ import annotations

from importlib import import_module

__all__ = ["ParseStats", "load", "main", "parse", "parse_args", "save"]


def _load_core_module():
	try:
		return import_module("scripts.benchmark_core")
	except ModuleNotFoundError:
		return import_module("benchmark_core")


def _load_io_module():
	try:
		return import_module("scripts.benchmark_io")
	except ModuleNotFoundError:
		return import_module("benchmark_io")


def __getattr__(name: str):
	if name in {"ParseStats", "parse", "save"}:
		return getattr(_load_core_module(), name)

	if name in {"load", "main", "parse_args"}:
		return getattr(_load_io_module(), name)

	raise AttributeError(name)
