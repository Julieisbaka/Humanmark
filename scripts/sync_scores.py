"""Sync the current model score snapshot.

The script is intentionally generic: it expects the remote source to return a
JSON object that already matches the repository score snapshot shape, or a
wrapper object containing the snapshot under a `current` key.

On each successful run, the latest snapshot is written to `current.json`.

Benchmark-to-Artificial-Analysis key mappings are loaded from
``data/benchmarks/config.json`` via the ``artificialAnalysisKeys`` field on
each benchmark definition.  No Python changes are needed when adding benchmarks.
"""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
from typing import Any, cast
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

try:
    from scripts.build_benchmark_index import load_benchmark_definitions
except ModuleNotFoundError:
    from build_benchmark_index import load_benchmark_definitions

DEFAULT_SOURCE_URL = "https://artificialanalysis.ai/api/v2/data/llms/models"


def _load_json_from_path(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def _load_json_from_url(url: str, api_key: str | None) -> dict[str, Any]:
    headers = {"Accept": "application/json"}

    if api_key:
        headers["x-api-key"] = api_key

    request = Request(url, headers=headers)

    with urlopen(request, timeout=60) as response:
        payload = response.read().decode("utf-8")

    return json.loads(payload)


def _extract_snapshot(payload: dict[str, Any], benchmark_configs: list[dict[str, Any]] | None = None) -> dict[str, Any]:
    if {"generatedAt", "methodologyUrl", "benchmarks"}.issubset(payload.keys()):
        return payload

    if isinstance(payload.get("current"), dict):
        return payload["current"]

    if isinstance(payload.get("data"), dict) and isinstance(payload["data"].get("current"), dict):
        return payload["data"]["current"]

    if isinstance(payload.get("data"), list):
        models = payload["data"]
        configs = benchmark_configs if benchmark_configs is not None else load_benchmark_definitions()

        def _extract_score(evaluations: dict[str, Any], keys: list[str]) -> Any:
            for key in keys:
                if key in evaluations and evaluations.get(key) is not None:
                    return evaluations[key]
            return None

        def build_benchmark(benchmark_id: str, benchmark_name: str, evaluation_keys: list[str]) -> dict[str, Any]:
            benchmark_models: list[dict[str, Any]] = []

            for model in models:
                evaluations = cast(dict[str, Any], model.get("evaluations") or {})
                score = _extract_score(evaluations, evaluation_keys)

                if score is None:
                    continue

                benchmark_models.append(
                    {
                        "modelId": model.get("id") or model.get("slug") or model.get("name"),
                        "model": model.get("name") or model.get("slug") or model.get("id"),
                        "score": score,
                        "sampleSize": model.get("sample_size") or model.get("sampleSize") or 0,
                        "rank": model.get("rank") or 0,
                    }
                )

            benchmark_models.sort(key=lambda item: item["score"], reverse=True)

            for index, model in enumerate(benchmark_models, start=1):
                model["rank"] = index

            return {
                "benchmarkId": benchmark_id,
                "benchmarkName": benchmark_name,
                "models": benchmark_models,
            }

        benchmarks: dict[str, Any] = {
            cfg["id"]: build_benchmark(cfg["id"], cfg["name"], cfg.get("artificialAnalysisKeys") or [cfg["id"]])
            for cfg in configs
        }

        return {
            "generatedAt": payload.get("generatedAt") or payload.get("timestamp") or "unknown",
            "methodologyUrl": "https://artificialanalysis.ai/methodology/intelligence-benchmarking",
            "benchmarks": benchmarks,
        }

    raise ValueError(
        "Could not find a score snapshot in the payload. Expected either a "
        "direct snapshot object or a wrapper containing `current`."
    )


def _write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def sync_scores(source: dict[str, Any], current_file: Path) -> Path:
    current_snapshot = _extract_snapshot(source)

    _write_json(current_file, current_snapshot)
    return current_file


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Sync score snapshots from an API or local JSON file.")
    parser.add_argument(
        "--source-url",
        default=DEFAULT_SOURCE_URL,
        help="HTTPS URL or file path for the latest score payload.",
    )
    parser.add_argument(
        "--api-key",
        default=os.getenv("ARTIFICIAL_ANALYSIS_API_KEY"),
        help="Optional bearer token for the score source.",
    )
    parser.add_argument(
        "--current-file",
        type=Path,
        default=Path("data/scores/current.json"),
        help="Path to the current snapshot JSON file.",
    )
    return parser.parse_args()


def main() -> None:
    args = _parse_args()

    if not args.source_url:
        raise SystemExit("No source URL configured.")

    if args.source_url.startswith(("http://", "https://")):
        payload = _load_json_from_url(args.source_url, args.api_key)
    else:
        payload = _load_json_from_path(Path(args.source_url))

    output = sync_scores(payload, args.current_file.resolve())
    print(f"Wrote refreshed score snapshot to {output}")


if __name__ == "__main__":
    try:
        main()
    except (HTTPError, URLError, ValueError) as exc:
        raise SystemExit(str(exc)) from exc