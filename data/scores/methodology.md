GPQA Diamond scores are refreshed from [OpenRouter's benchmark API](https://openrouter.ai/benchmarks/gpqa-diamond) when available. They aggregate repeated model runs and may differ in evaluation conditions from Humanmark's user tests. AIME, Humanity's Last Exam, and MMLU-Pro use the existing cached Artificial Analysis scores; their refresh date may be unknown. See the [Artificial Analysis methodology](https://artificialanalysis.ai/methodology/intelligence-benchmarking).

The build workflows maintain a snapshot of model scores:

- `data/scores/current.json` for the latest model scores

The client uses that snapshot when comparing the user’s result against the stored model leaderboard.

For the active MCQ benchmarks in this repo, the site mirrors the benchmark method at a high level: per-question pass@1 / accuracy, with the final score computed as the fraction of correctly answered questions.