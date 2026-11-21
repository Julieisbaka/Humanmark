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
import math
import os
import sys
from pathlib import Path
from typing import Any, cast
from urllib.error import HTTPError, URLError
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit
from urllib.request import HTTPRedirectHandler, Request, build_opener, urlopen

try:
    from scripts.build_benchmark_index import load_benchmark_definitions
except ModuleNotFoundError:
    from build_benchmark_index import load_benchmark_definitions

DEFAULT_SOURCE_URL = "https://artificialanalysis.ai/api/v2/language/models"
OPENROUTER_URL = "https://openrouter.ai/api/v1/benchmarks?source=openrouter&benchmark_type=gpqa_diamond"


class _NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def _load_openrouter_scores(api_key: str) -> dict[str, Any]:
    request = Request(OPENROUTER_URL, headers={"Accept": "application/json", "Authorization": "Bearer " + api_key})
    with build_opener(_NoRedirect()).open(request, timeout=60) as response:
        return json.loads(response.read().decode("utf-8"))


def _merge_openrouter_scores(cached: dict[str, Any], payload: dict[str, Any]) -> dict[str, Any]:
    benchmarks = cached.get("benchmarks")
    if not isinstance(payload, dict):
        raise ValueError("Invalid OpenRouter benchmark response.")
    data = payload.get("data")
    meta = payload.get("meta")
    if not isinstance(benchmarks, dict) or not isinstance(benchmarks.get("gpqa_diamond"), dict):
        raise ValueError("The cached GPQA leaderboard is missing.")
    if not isinstance(data, list) or not isinstance(meta, dict) or not isinstance(meta.get("as_of"), str) or not meta["as_of"]:
        raise ValueError("Invalid OpenRouter benchmark response.")

    models = []
    seen = set()
    for row in data:
        if not isinstance(row, dict):
            raise ValueError("Invalid OpenRouter benchmark row.")
        if row.get("source") != "openrouter" or row.get("benchmark_type") != "gpqa_diamond":
            continue
        model_id, name, score, size = (row.get("model_permaslug"), row.get("display_name"), row.get("accuracy"), row.get("total_tasks"))
        if (
            not isinstance(model_id, str) or not model_id.strip() or model_id in seen
            or not isinstance(name, str) or not name.strip()
            or isinstance(score, bool) or not isinstance(score, (int, float)) or not math.isfinite(score) or not 0 <= score <= 1
            or isinstance(size, bool) or not isinstance(size, int) or size <= 0
        ):
            raise ValueError("Invalid OpenRouter GPQA benchmark row.")
        seen.add(model_id)
        models.append({"modelId": model_id, "model": name, "score": score, "sampleSize": size})
    if not models:
        raise ValueError("OpenRouter returned no GPQA scores.")
    models.sort(key=lambda model: model["score"], reverse=True)
    for rank, model in enumerate(models, 1):
        model["rank"] = rank
    result = dict(cached)
    result["benchmarks"] = dict(benchmarks)
    result["benchmarks"]["gpqa_diamond"] = {
        **benchmarks["gpqa_diamond"],
        "models": models,
        "scoreSource": "OpenRouter",
        "scoresAsOf": meta["as_of"],
        "scoreSourceUrl": "https://openrouter.ai/benchmarks/gpqa-diamond",
    }
    return result


def _validate_source_url(url: str) -> str:
    parts = urlsplit(url)
    if parts.scheme != "https":
        raise ValueError("Source URL must use HTTPS.")
    if not parts.netloc:
        raise ValueError("Source URL must include a host.")
    return url


def _load_json_from_path(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def _load_json_from_url(url: str, api_key: str | None) -> dict[str, Any]:
    headers = {"Accept": "application/json"}

    if api_key:
        headers["x-api-key"] = api_key

    def fetch(page_url: str) -> dict[str, Any]:
        request = Request(page_url, headers=headers)
        with urlopen(request, timeout=60) as response:
            return json.loads(response.read().decode("utf-8"))

    payload = fetch(url)
    parts = urlsplit(url)
    pagination = payload.get("pagination")
    if (parts.scheme, parts.netloc, parts.path) != ("https", "artificialanalysis.ai", "/api/v2/language/models"):
        return payload

    if not api_key:
        raise ValueError("ARTIFICIAL_ANALYSIS_API_KEY is required for the default model endpoint.")
    if not isinstance(pagination, dict) or not isinstance(payload.get("data"), list):
        raise ValueError("Invalid model list pagination response.")
    page = pagination.get("page")
    total_pages = pagination.get("total_pages")
    if type(page) is not int or type(total_pages) is not int or page != 1 or total_pages < 1:
        raise ValueError("Invalid model list pagination response.")

    query = [(key, value) for key, value in parse_qsl(parts.query, keep_blank_values=True) if key != "page"]
    for next_page in range(2, total_pages + 1):
        page_url = urlunsplit(parts._replace(query=urlencode([*query, ("page", next_page)])))
        next_payload = fetch(page_url)
        next_pagination = next_payload.get("pagination")
        if (
            not isinstance(next_payload.get("data"), list)
            or not isinstance(next_pagination, dict)
            or next_pagination.get("page") != next_page
            or next_pagination.get("total_pages") != total_pages
        ):
            raise ValueError("Invalid model list pagination response.")
        payload["data"].extend(next_payload["data"])

    return payload


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
        default=None,
        help="Optional legacy HTTPS URL or file path for a complete score payload; defaults to OpenRouter with cached fallback.",
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

    if args.source_url is None:
        cached = _load_json_from_path(args.current_file)
        if not isinstance(cached.get("benchmarks"), dict) or not all(
            isinstance(cached["benchmarks"].get(cfg["id"]), dict)
            and isinstance(cached["benchmarks"][cfg["id"]].get("models"), list)
            and bool(cached["benchmarks"][cfg["id"]]["models"])
            for cfg in load_benchmark_definitions()
        ):
            raise ValueError("A complete cached score snapshot is required.")
        api_key = os.getenv("OPENROUTER_API_KEY")
        if not api_key:
            print("OPENROUTER_API_KEY not configured; retaining cached score snapshot.", file=sys.stderr)
            return
        try:
            updated = _merge_openrouter_scores(cached, _load_openrouter_scores(api_key))
        except (HTTPError, URLError, ValueError, TimeoutError, OSError) as exc:
            print(f"OpenRouter score refresh failed ({exc}); retaining cached score snapshot.", file=sys.stderr)
            return
        _write_json(args.current_file, updated)
        print(f"Wrote refreshed GPQA scores to {args.current_file}")
        return

    if args.source_url.startswith(("http://", "https://")):
        source_url = _validate_source_url(args.source_url)
        payload = _load_json_from_url(source_url, args.api_key)
    else:
        payload = _load_json_from_path(Path(args.source_url))

    output = sync_scores(payload, args.current_file.resolve())
    print(f"Wrote refreshed score snapshot to {output}")


if __name__ == "__main__":
    try:
        main()
    except (HTTPError, URLError, ValueError) as exc:
        raise SystemExit(str(exc)) from exc