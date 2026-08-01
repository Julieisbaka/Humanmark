Methodology is designed to match Artificial Analysis. This can be found at <https://artificialanalysis.ai/methodology/intelligence-benchmarking>

The build workflows generate a snapshot for the current model scores:

- `data/scores/current.json` for the latest model scores

The client uses that snapshot when comparing the user’s result against the stored model leaderboard.

For the active MCQ benchmarks in this repo, the site mirrors the benchmark method at a high level: per-question pass@1 / accuracy, with the final score computed as the fraction of correctly answered questions.