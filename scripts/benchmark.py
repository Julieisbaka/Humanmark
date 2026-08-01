"""Load and compact benchmark datasets from Hugging Face.

The raw datasets often contain large amounts of metadata, annotations, and
auxiliary columns that are not needed by the client. This script keeps only the
fields the site uses: prompt text, answer choices, the correct answer index,
and any short explanation that helps with review.
"""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
from typing import Any

from datasets import Dataset, DatasetDict, load_dataset


QUESTION_KEYS = ("question", "prompt", "stem", "query", "input", "text")
CHOICE_KEYS = ("choices", "options", "candidates", "answers")
ANSWER_KEYS = (
    "answer",
    "label",
    "correct",
    "correct_answer",
    "correctanswer",
    "final_answer",
    "gold",
    "target",
)
EXPLANATION_KEYS = ("explanation", "rationale", "solution", "analysis")
ID_KEYS = ("id", "uid", "sample_id", "example_id")
QUESTION_PROBABILITY_KEYS = ("question_probability", "question_prob", "px", "p_x")
JOINT_PROBABILITY_KEYS = ("joint_probabilities", "joint_probability", "pxy", "p_xy", "cooccurrence_probabilities")
CHOICE_PROBABILITY_KEYS = ("choice_probabilities", "choice_probability", "py", "p_y")


def _normalize_key(key: str) -> str:
    return "".join(character for character in key.casefold() if character.isalnum())


def _get_value(record: dict[str, Any], key: str) -> Any:
    normalized_target = _normalize_key(key)
    for candidate_key, value in record.items():
        if _normalize_key(str(candidate_key)) == normalized_target and value not in (None, ""):
            return value
    return None


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


def _first_value(record: dict[str, Any], keys: tuple[str, ...]) -> Any:
    for key in keys:
        value = _get_value(record, key)
        if value not in (None, ""):
            return value
    return None


def _fallback_choices(record: dict[str, Any], raw_answer: Any) -> list[str]:
    incorrect_candidates = [
        "incorrect_answer_1",
        "incorrect_answer_2",
        "incorrect_answer_3",
        "incorrect_answer_4",
        "distractor_1",
        "distractor_2",
        "distractor_3",
        "distractor_4",
    ]

    incorrect = [
        str(value)
        for key in incorrect_candidates
        for value in [_get_value(record, key)]
        if value not in (None, "")
    ]

    if raw_answer not in (None, "") and incorrect:
        return [str(raw_answer), *incorrect]

    return []


def _normalize_choices(raw_choices: Any) -> list[str]:
    if raw_choices is None:
        return []

    if isinstance(raw_choices, dict):
        for candidate_key in ("text", "choices", "options", "labels", "answer"):
            candidate = raw_choices.get(candidate_key)
            if isinstance(candidate, list):
                return [str(choice) for choice in candidate]

        values = list(raw_choices.values())
        if values and all(isinstance(value, str) for value in values):
            return [str(value) for value in values]

        return [str(value) for value in values]

    if isinstance(raw_choices, (list, tuple)):
        flattened: list[str] = []
        for choice in raw_choices:
            if isinstance(choice, dict):
                text = choice.get("text") or choice.get("label") or choice.get("value")
                flattened.append(str(text if text is not None else choice))
            else:
                flattened.append(str(choice))
        return flattened

    return [str(raw_choices)]


def _option_choices(record: dict[str, Any]) -> list[str]:
    choices: list[str] = []
    for letter in "abcdefghijklmnopqrstuvwxyz":
        value = _get_value(record, f"option_{letter}")
        if value in (None, ""):
            break
        choices.append(str(value))

    return choices


def _normalize_number_list(value: Any) -> list[float] | None:
    if not isinstance(value, (list, tuple)):
        return None

    numbers: list[float] = []
    for item in value:
        try:
            number = float(item)
        except (TypeError, ValueError):
            return None
        if number <= 0:
            return None
        numbers.append(number)

    return numbers if numbers else None


def _extract_pmi(record: dict[str, Any], choice_count: int) -> dict[str, Any] | None:
    raw_question_probability = _first_value(record, QUESTION_PROBABILITY_KEYS)
    raw_joint_probabilities = _first_value(record, JOINT_PROBABILITY_KEYS)
    raw_choice_probabilities = _first_value(record, CHOICE_PROBABILITY_KEYS)

    try:
        question_probability = float(raw_question_probability)
    except (TypeError, ValueError):
        return None

    if question_probability <= 0:
        return None

    joint_probabilities = _normalize_number_list(raw_joint_probabilities)
    choice_probabilities = _normalize_number_list(raw_choice_probabilities)

    if not joint_probabilities or not choice_probabilities:
        return None

    if len(joint_probabilities) != choice_count or len(choice_probabilities) != choice_count:
        return None

    return {
        "questionProbability": question_probability,
        "jointProbabilities": joint_probabilities,
        "choiceProbabilities": choice_probabilities,
    }


def _answer_index(raw_answer: Any, choices: list[str]) -> int:
    if isinstance(raw_answer, bool):
        return int(raw_answer)

    if isinstance(raw_answer, int):
        return raw_answer

    if isinstance(raw_answer, float) and raw_answer.is_integer():
        return int(raw_answer)

    if isinstance(raw_answer, str):
        cleaned = raw_answer.strip()

        if cleaned.isdigit():
            return int(cleaned)

        letter = cleaned.upper()
        if len(letter) == 1 and "A" <= letter <= "Z":
            return ord(letter) - ord("A")

        for index, choice in enumerate(choices):
            if cleaned.casefold() == choice.casefold():
                return index

    if isinstance(raw_answer, dict):
        for key in ("index", "answer_index", "choice", "value", "label"):
            if key in raw_answer:
                return _answer_index(raw_answer[key], choices)

    raise ValueError(f"Could not infer answer index from {raw_answer!r}")


def parse(dataset: Any) -> list[dict[str, Any]]:
    if isinstance(dataset, DatasetDict):
        split_name = next(iter(dataset.keys()))
        dataset = dataset[split_name]

    if isinstance(dataset, Dataset):
        rows = dataset.to_dict()
        row_count = len(next(iter(rows.values()))) if rows else 0
        examples = [
            {column: rows[column][index] for column in rows}
            for index in range(row_count)
        ]
    else:
        examples = list(dataset)

    parsed: list[dict[str, Any]] = []

    for index, example in enumerate(examples):
        if not isinstance(example, dict):
            continue

        prompt = _first_value(example, QUESTION_KEYS)
        if prompt is None:
            continue

        raw_answer = _first_value(example, ANSWER_KEYS)
        if raw_answer is None:
            continue

        raw_choices = _first_value(example, CHOICE_KEYS)
        choices = _normalize_choices(raw_choices)
        if not choices:
            choices = _option_choices(example)
        if not choices:
            choices = _fallback_choices(example, raw_answer)

        if not choices:
            continue

        try:
            answer_index = _answer_index(raw_answer, choices)
        except ValueError:
            continue

        if answer_index < 0 or answer_index >= len(choices):
            continue

        explanation = _first_value(example, EXPLANATION_KEYS)
        example_id = _first_value(example, ID_KEYS) or f"question-{index + 1}"
        pmi = _extract_pmi(example, len(choices))

        parsed.append(
            {
                "id": str(example_id),
                "prompt": str(prompt).strip(),
                "choices": choices,
                "answerIndex": answer_index,
                **({"explanation": str(explanation).strip()} if explanation is not None else {}),
                **({"pmi": pmi} if pmi is not None else {}),
            }
        )

    return parsed


def save(data: list[dict[str, Any]], output: str | Path) -> Path:
    output_path = Path(output)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(
        json.dumps(data, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    return output_path


def _parse_args() -> argparse.Namespace:
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
    args = _parse_args()
    dataset = load(args.dataset, task=args.task, split=args.split)
    parsed = parse(dataset)
    output_path = save(parsed, args.output)
    print(f"Saved {len(parsed)} compact questions to {output_path}")


if __name__ == "__main__":
    main()
