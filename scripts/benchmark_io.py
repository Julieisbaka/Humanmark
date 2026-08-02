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


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Load a Hugging Face benchmark and save a compact question set."
    )
    parser.add_argument("dataset", help="Hugging Face dataset name, e.g. TIGER-Lab/MMLU-Pro")
    parser.add_argument("--task", default=None, help="Optional dataset subset or config name")
    parser.add_argument("--split", default=None, help="Optional dataset split to load")
    parser.add_argument(
        "--output",
        type=Path,
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
