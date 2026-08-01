"""Build the compact benchmark index JSON from parsed benchmark files.

The parser workflow writes compact question files to a temporary generated
directory. This script copies each benchmark into its final home under
`data/benchmarks/` and writes the manifest-only `data/benchmarks/index.json`
file that the client reads first.
"""

from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


BENCHMARK_DEFINITIONS: list[dict[str, Any]] = [
    {
        "id": "gpqa_diamond",
        "name": "GPQA Diamond",
        "description": "A hard 4-option science benchmark that rewards careful reasoning over guesswork.",
        "options": 4,
        "scoring": {"method": "pass@1", "mode": "multiple-choice", "options": 4},
        "source": {"dataset": "Idavidrein/gpqa", "subset": "gpqa_diamond", "split": "train"},
        "tags": ["science", "reasoning", "4 options"],
        "toolPolicy": {
            "modelToolsAllowed": False,
            "humanToolsAllowed": False,
            "allowedTools": [],
            "notes": "Tool rules should stay aligned between model and human attempts.",
        },
        "generatedQuestionsFile": "gpqa_diamond.json",
        "file": "gpqa_diamond.json",
    },
    {
        "id": "mmlu_pro",
        "name": "MMLU-Pro",
        "description": "A 10-option knowledge benchmark that makes broad coverage and precision both matter.",
        "options": 10,
        "scoring": {"method": "pass@1", "mode": "multiple-choice", "options": 10},
        "source": {"dataset": "TIGER-Lab/MMLU-Pro", "subset": None, "split": "test"},
        "tags": ["knowledge", "broad coverage", "10 options"],
        "toolPolicy": {
            "modelToolsAllowed": False,
            "humanToolsAllowed": False,
            "allowedTools": [],
            "notes": "Tool rules should stay aligned between model and human attempts.",
        },
        "generatedQuestionsFile": "mmlu_pro.json",
        "file": "mmlu_pro.json",
    },
]


def _load_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def build_index(generated_dir: Path, benchmarks_dir: Path, output_file: Path) -> dict[str, Any]:
    benchmarks: list[dict[str, Any]] = []
    benchmarks_dir.mkdir(parents=True, exist_ok=True)

    for definition in BENCHMARK_DEFINITIONS:
        questions_path = generated_dir / definition["generatedQuestionsFile"]
        if not questions_path.exists():
            raise FileNotFoundError(f"Missing parsed benchmark file: {questions_path}")

        questions: list[dict[str, Any]] = _load_json(questions_path)
        benchmark_output = benchmarks_dir / definition["file"]
        benchmark_payload: dict[str, Any] = {
            "id": definition["id"],
            "name": definition["name"],
            "description": definition["description"],
            "options": definition["options"],
            "questionCount": len(questions),
            "scoring": definition["scoring"],
            "source": definition["source"],
            "tags": definition["tags"],
            "toolPolicy": definition["toolPolicy"],
            "questions": questions,
        }
        benchmark_output.write_text(json.dumps(benchmark_payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        benchmarks.append(
            {
                "id": definition["id"],
                "name": definition["name"],
                "description": definition["description"],
                "options": definition["options"],
                "questionCount": len(questions),
                "scoring": definition["scoring"],
                "source": definition["source"],
                "tags": definition["tags"],
                "toolPolicy": definition["toolPolicy"],
                "file": definition["file"],
            }
        )

    payload: dict[str, Any] = {
        "generatedAt": datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z"),
        "benchmarks": benchmarks,
    }

    output_file.parent.mkdir(parents=True, exist_ok=True)
    output_file.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return payload


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Build data/benchmarks/index.json from parsed benchmark JSON files.")
    parser.add_argument(
        "--generated-dir",
        type=Path,
        default=Path("data/benchmarks/generated"),
        help="Directory containing parsed benchmark question JSON files.",
    )
    parser.add_argument(
        "--benchmarks-dir",
        type=Path,
        default=Path("data/benchmarks"),
        help="Directory where per-benchmark JSON files should be written.",
    )
    parser.add_argument(
        "--output-file",
        type=Path,
        default=Path("data/benchmarks/index.json"),
        help="Output benchmark index JSON file.",
    )
    return parser.parse_args()


def main() -> None:
    args = _parse_args()
    payload = build_index(args.generated_dir.resolve(), args.benchmarks_dir.resolve(), args.output_file.resolve())
    print(f"Wrote benchmark index with {len(payload['benchmarks'])} benchmark(s) to {args.output_file.resolve()}")


if __name__ == "__main__":
    main()