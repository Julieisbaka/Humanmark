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

Regenerating benchmark data requires two stages. First, run the benchmark
parsers to download and convert each dataset into the temporary
`data/benchmarks/generated/` directory:

```bash
python scripts/benchmark.py di-zhang-fdu/AIME_1983_2024 \
    --split train \
    --output data/benchmarks/generated/aime.json

python scripts/benchmark.py Idavidrein/gpqa \
    --task gpqa_diamond \
    --split train \
    --output data/benchmarks/generated/gpqa_diamond.json

python scripts/benchmark.py cais/hle \
    --split test \
    --output data/benchmarks/generated/humanitys_last_exam.json

python scripts/benchmark.py TIGER-Lab/MMLU-Pro \
    --split test \
    --output data/benchmarks/generated/mmlu_pro.json
```

Then build the index and refresh the score snapshot:

```bash
python scripts/build_benchmark_index.py
python scripts/sync_scores.py
```

These commands will refresh:

- `data/scores/current.json`
- `data/benchmarks/index.json`
- benchmark snapshot files under `data/benchmarks/` such as `data/benchmarks/aime.json`

## Notes

- The app reads committed snapshot JSON files under the `data` directory.
- `data/benchmarks/config.json` is committed source configuration, not generated snapshot output.
- Temporary parser output stays under `data/benchmarks/generated/` and is not meant to be committed.
- If the browser shows stale content, use a hard refresh.
