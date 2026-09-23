from __future__ import annotations

import argparse
import os
from pathlib import Path

from datasets import load_dataset

try:
    from scripts.benchmark_core import parse, save
except ModuleNotFoundError:
    from benchmark_core import parse, save


def load(dataset: str, task: str | None = None, split: str | None = None):
    token = os.getenv("HF_TOKEN")
    if not token:
        raise RuntimeError("HF_TOKEN is required to load benchmark datasets from Hugging Face.")

    if task and split:
        return load_dataset(dataset, task, split=split, token=token)

    if task:
        return load_dataset(dataset, task, token=token)

    if split:
        return load_dataset(dataset, split=split, token=token)

    return load_dataset(dataset, token=token)


def _output_path_arg(value: str) -> Path:
    base_path = Path.cwd().resolve(strict=False)
    output_path = Path(value).expanduser()
    if not output_path.is_absolute():
        output_path = base_path / output_path

    output_path = output_path.resolve(strict=False)
    normalized_base = os.path.normcase(str(base_path))
    normalized_output = os.path.normcase(str(output_path))
    try:
        within_base = (
            os.path.commonpath((normalized_base, normalized_output)) == normalized_base
        )
    except ValueError:
        within_base = False

    if not within_base:
        raise argparse.ArgumentTypeError(
            "Output path must be within the current working directory."
        )

    return output_path


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Load a Hugging Face benchmark and save a compact question set."
    )
    parser.add_argument("dataset", help="Hugging Face dataset name, e.g. TIGER-Lab/MMLU-Pro")
    parser.add_argument("--task", default=None, help="Optional dataset subset or config name")
    parser.add_argument("--split", default=None, help="Optional dataset split to load")
    parser.add_argument(
        "--output",
        type=_output_path_arg,
        required=True,
        help="Output JSON file path for the compact parsed benchmark",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    dataset = load(args.dataset, task=args.task, split=args.split)
    parsed, stats = parse(dataset, dataset_name=args.dataset, return_stats=True)
    output_path = save(parsed, args.output)
    print(f"Saved {len(parsed)} compact questions to {output_path}")
    for line in stats.summary_lines():
        print(line)
