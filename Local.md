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

## Test the AI changelog locally

The weekly changelog panel on the homepage is populated from `data/changelog.json`.
You can generate a sample file without a GitHub token using the `--dry-run` flag:

```bash
python scripts/generate_changelog.py --dry-run
```

This writes placeholder content to `data/changelog.json` and lets you verify
the changelog UI in the browser without making any API calls.

To generate a real AI summary, create a `.env` file in the project root:

```
GITHUB_TOKEN=<your-token>
```

The script reads this file automatically, so you can then run:

```bash
python scripts/generate_changelog.py
```

Alternatively, pass the token inline:

```bash
GITHUB_TOKEN=<your-token> python scripts/generate_changelog.py
```

> **Note:** `.env` is in `.gitignore` — your token will not be committed.

To run the automated tests for the changelog generator:

```bash
python scripts/run_python_tests.py
```

## Notes

- The app reads data from the generated JSON files under the data directory.
- If the browser shows stale content, use a hard refresh.
