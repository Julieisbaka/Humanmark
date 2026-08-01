Methodology is designed to match Artificial Analysis. This can be found at <https://artificialanalysis.ai/methodology/intelligence-benchmarking>

The build workflows generate two snapshots for comparison:

- `data/scores/current.json` for the latest weekly model scores
- `data/scores/last_week.json` for the previous weekly snapshot

The client uses both snapshots when showing score movement and uncertainty against the user’s result.

For the active MCQ benchmarks in this repo, the site mirrors the benchmark method at a high level: per-question pass@1 / accuracy, with the final score computed as the fraction of correctly answered questions.

The weekly score refresh workflow rotates the previous `current.json` file into `last_week.json` before writing the newly fetched snapshot to `current.json`.