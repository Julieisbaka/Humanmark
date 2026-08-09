from __future__ import annotations

import argparse
import os
import sys
import traceback
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

try:
    from scripts.benchmark import parse, save
    from scripts.benchmark_io import load as load_dataset
    from scripts.build_benchmark_index import BENCHMARK_DEFINITIONS, build_index
    from scripts.sync_scores import (
        DEFAULT_SOURCE_URL,
        _load_json_from_path,
        _load_json_from_url,
        sync_scores,
    )
except ModuleNotFoundError:
    from benchmark import parse, save
    from benchmark_io import load as load_dataset
    from build_benchmark_index import BENCHMARK_DEFINITIONS, build_index
    from sync_scores import DEFAULT_SOURCE_URL, _load_json_from_path, _load_json_from_url, sync_scores


ROOT = Path(__file__).resolve().parents[1]


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Download benchmark data, refresh scores, and start a local Python server."
    )
    parser.add_argument("--host", default="localhost", help="Host interface for the local server.")
    parser.add_argument("--port", type=int, default=8000, help="Port for the local server.")
    parser.add_argument(
        "--directory",
        type=Path,
        default=ROOT,
        help="Project directory to serve.",
    )
    parser.add_argument(
        "--source-url",
        default=DEFAULT_SOURCE_URL,
        help="HTTPS URL or file path for the latest score payload.",
    )
    parser.add_argument(
        "--api-key",
        default=os.getenv("ARTIFICIAL_ANALYSIS_API_KEY"),
        help="Optional API key for the score source.",
    )
    return parser.parse_args(argv)


def _generated_paths(project_root: Path, definition: dict[str, object]) -> Path:
    return project_root / "data" / "benchmarks" / "generated" / str(definition["generatedQuestionsFile"])


def refresh_benchmarks(project_root: Path) -> None:
    for definition in BENCHMARK_DEFINITIONS:
        dataset_name = str(definition["source"]["dataset"])
        subset = definition["source"].get("subset")
        split = definition["source"].get("split")
        output_path = _generated_paths(project_root, definition)

        print(f"Downloading {dataset_name}...", flush=True)
        dataset = load_dataset(
            dataset_name,
            task=None if subset is None else str(subset),
            split=None if split is None else str(split),
        )
        parsed, stats = parse(dataset, dataset_name=dataset_name, return_stats=True)
        written = save(parsed, output_path)
        print(f"Saved {len(parsed)} questions to {written}", flush=True)
        for line in stats.summary_lines():
            print(line, flush=True)

    build_index(
        project_root / "data" / "benchmarks" / "generated",
        project_root / "data" / "benchmarks",
        project_root / "data" / "benchmarks" / "index.json",
    )
    print("Refreshed benchmark index.", flush=True)


def load_score_source(source_url: str, api_key: str | None) -> dict[str, object]:
    if source_url.startswith(("http://", "https://")):
        return _load_json_from_url(source_url, api_key)
    return _load_json_from_path(Path(source_url))


def refresh_scores(project_root: Path, source_url: str, api_key: str | None) -> Path:
    payload = load_score_source(source_url, api_key)
    output = sync_scores(payload, project_root / "data" / "scores" / "current.json")
    print(f"Refreshed scores at {output}", flush=True)
    return output


def build_local_url(host: str, port: int) -> str:
    display_host = "127.0.0.1" if host in {"0.0.0.0", ""} else host
    return f"http://{display_host}:{port}/"


def create_server(host: str, port: int, directory: Path) -> ThreadingHTTPServer:
    handler = partial(SimpleHTTPRequestHandler, directory=str(directory))
    return ThreadingHTTPServer((host, port), handler)


def run_setup(
    *,
    project_root: Path,
    directory: Path,
    host: str,
    port: int,
    source_url: str,
    api_key: str | None,
) -> str:
    refresh_benchmarks(project_root)
    refresh_scores(project_root, source_url, api_key)

    server = create_server(host, port, directory)
    try:
        actual_port = int(server.server_address[1])
        url = build_local_url(host, actual_port)
        print(f"Local server running at {url}", flush=True)
        print("Press Ctrl+C to stop the server.", flush=True)
        server.serve_forever()
        return url
    finally:
        server.server_close()


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)

    try:
        run_setup(
            project_root=ROOT,
            directory=args.directory.resolve(),
            host=args.host,
            port=args.port,
            source_url=args.source_url,
            api_key=args.api_key,
        )
    except KeyboardInterrupt:
        print("\nLocal server stopped.", flush=True)
        return 0
    except Exception as exc:
        print(f"Setup failed: {exc}", file=sys.stderr, flush=True)
        traceback.print_exc(file=sys.stderr)
        return 1

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
