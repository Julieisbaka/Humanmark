# Running Humanmark Locally

This project is a static web app that can be served locally with Python's built-in HTTP server.

## Prerequisites

- Python 3.10+
- A local terminal

## Start the local server

From the project root, run:

```bash
python -m http.server 8000 --directory .
```

Then open:

- <http://localhost:8000/>

## Refresh benchmark data

If the benchmark and score data files need to be regenerated, run:

```bash
python scripts/sync_scores.py
python scripts/build_benchmark_index.py
```

These commands will refresh:

- `data/scores/current.json`
- `data/benchmarks/index.json`
- `data/benchmarks/*.json`

## Notes

- The app reads committed snapshot JSON files under the `data` directory.
- Temporary parser output stays under `data/benchmarks/generated/` and is not meant to be committed.
- If the browser shows stale content, use a hard refresh.
