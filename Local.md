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

### Prerequisites

Install the required Python tooling:

```bash
pip install datasets
```

Set your Hugging Face token (required to download datasets):

```bash
export HF_TOKEN=your-huggingface-token
```

You can create a token at <https://huggingface.co/settings/tokens>. A read-only
token is sufficient.

### Generate benchmark files

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

## Test the AI changelog locally

The weekly changelog panel on the homepage is populated from `data/changelog.json`.
You can generate a sample file without a GitHub token using the `--dry-run` flag:

```bash
python scripts/generate_changelog.py --dry-run
```

This writes placeholder content to `data/changelog.json` and lets you verify
the changelog UI in the browser without making any API calls.

To generate a real AI summary (requires a GitHub token with access to the
GitHub Copilot chat completions API):

```bash
GITHUB_TOKEN=<your-token> python scripts/generate_changelog.py
```

To run the automated tests for the changelog generator:

```bash
python scripts/run_python_tests.py
```

## Notes

- The app reads committed snapshot JSON files under the `data` directory.
- `data/benchmarks/config.json` is committed source configuration, not generated snapshot output.
- Temporary parser output stays under `data/benchmarks/generated/` and is not meant to be committed.
- If the browser shows stale content, use a hard refresh.
