"""Compatibility facade for benchmark parsing.

This module intentionally remains as the stable entrypoint used by workflows,
local scripts, and tests. Implementation details now live under
the package namespace:
- scripts.benchmark.core
- scripts.benchmark.io
"""

from scripts.benchmark.core import ParseStats, parse, save
from scripts.benchmark.io import load, main

__all__ = ["ParseStats", "load", "main", "parse", "save"]


if __name__ == "__main__":
    main()
