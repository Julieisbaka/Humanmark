"""Sync current and previous-week model score snapshots.

The script is intentionally generic: it expects the remote source to return a
JSON object that already matches the repository score snapshot shape, or a
wrapper object containing the snapshot under a `current` key.

On each successful run, the existing current snapshot is rotated into the
last-week snapshot before the new current snapshot is written.
"""

from __future__ import annotations

import argparse
import json
import os
import shutil
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


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


def _extract_snapshot(payload: dict[str, Any]) -> dict[str, Any]:
    if {"generatedAt", "methodologyUrl", "benchmarks"}.issubset(payload.keys()):
        return payload

    if isinstance(payload.get("current"), dict):
        return payload["current"]

    if isinstance(payload.get("data"), dict) and isinstance(payload["data"].get("current"), dict):
        return payload["data"]["current"]

    if isinstance(payload.get("data"), list):
        models = payload["data"]

        def build_benchmark(benchmark_id: str, benchmark_name: str, evaluation_key: str) -> dict[str, Any]:
            benchmark_models: list[dict[str, Any]] = []

            for model in models:
                evaluations = model.get("evaluations") or {}
                score = evaluations.get(evaluation_key)

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

        return {
            "generatedAt": payload.get("generatedAt") or payload.get("timestamp") or "unknown",
            "methodologyUrl": "https://artificialanalysis.ai/methodology/intelligence-benchmarking",
            "benchmarks": {
                "gpqa_diamond": build_benchmark("gpqa_diamond", "GPQA Diamond", "gpqa"),
                "mmlu_pro": build_benchmark("mmlu_pro", "MMLU-Pro", "mmlu_pro"),
            },
        }

    raise ValueError(
        "Could not find a score snapshot in the payload. Expected either a "
        "direct snapshot object or a wrapper containing `current`."
    )


def _write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def sync_scores(source: dict[str, Any], current_file: Path, last_week_file: Path) -> Path:
    current_snapshot = _extract_snapshot(source)

    if current_file.exists():
        last_week_file.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(current_file, last_week_file)

    elif not last_week_file.exists():
        last_week_file.parent.mkdir(parents=True, exist_ok=True)
        _write_json(last_week_file, current_snapshot)

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
    parser.add_argument(
        "--last-week-file",
        type=Path,
        default=Path("data/scores/last_week.json"),
        help="Path to the last-week snapshot JSON file.",
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

    output = sync_scores(payload, args.current_file.resolve(), args.last_week_file.resolve())
    print(f"Wrote refreshed score snapshot to {output}")


if __name__ == "__main__":
    try:
        main()
    except (HTTPError, URLError, ValueError) as exc:
        raise SystemExit(str(exc)) from exc