"""Compatibility facade for benchmark parsing.

This module remains the stable CLI/import entrypoint used by workflows,
local scripts, and tests, while implementation lives in dedicated modules.
"""

try:
    from scripts.benchmark_core import ParseStats, parse, save
    from scripts.benchmark_io import load, main
except ModuleNotFoundError:
    from benchmark_core import ParseStats, parse, save
    from benchmark_io import load, main

__all__ = ["ParseStats", "load", "main", "parse", "save"]


if __name__ == "__main__":
    main()
