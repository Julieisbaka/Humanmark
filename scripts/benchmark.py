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
import re
from urllib.parse import quote
from pathlib import Path
from typing import Any

from datasets import Dataset, DatasetDict, load_dataset


QUESTION_KEYS = ("question", "prompt", "stem", "query", "input", "text")
SUPPLEMENTAL_PROMPT_KEYS = (
    "context",
    "details",
    "description",
    "background",
    "passage",
    "problem",
    "body",
    "statement",
    "setup",
    "question_context",
    "question_details",
    "additional_context",
    "code",
    "pseudocode",
    "snippet",
)
CHOICE_KEYS = (
    "choices",
    "options",
    "candidates",
    "choice_options",
    "answer_choices",
    "multiple_choice_options",
    "mc_options",
)
ANSWER_KEYS = (
    "answer",
    "answers",
    "answer_key",
    "answerkey",
    "answer_letter",
    "answerletter",
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
VISUAL_REFERENCE_PATTERN = re.compile(r"\b(figure|diagram|image|plot|chart|shown|below|above|following)\b", re.IGNORECASE)
CODE_REFERENCE_PATTERN = re.compile(r"\b(pseudocode|code snippet|following code|algorithm)\b", re.IGNORECASE)
IMAGE_PATH_PATTERN = re.compile(r"\.(?:png|jpe?g|gif|webp|bmp|svg|tiff?)$", re.IGNORECASE)


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


def _has_value(value: Any) -> bool:
    if value is None:
        return False
    if isinstance(value, str):
        return bool(value.strip())
    if isinstance(value, (list, tuple, set, dict)):
        return bool(value)
    return True


def _stringify_prompt_part(value: Any) -> str:
    if isinstance(value, str):
        return value.strip()

    if isinstance(value, (list, tuple)):
        parts = [str(part).strip() for part in value if _has_value(part)]
        return "\n".join(part for part in parts if part)

    if isinstance(value, dict):
        for key in ("text", "content", "value", "body", "code", "pseudocode"):
            candidate = value.get(key)
            if _has_value(candidate):
                return _stringify_prompt_part(candidate)
        return ""

    return str(value).strip()


def _build_prompt(example: dict[str, Any], base_prompt: Any) -> str:
    prompt = _stringify_prompt_part(base_prompt)
    sections: list[str] = []

    for key in SUPPLEMENTAL_PROMPT_KEYS:
        raw_value = _get_value(example, key)
        if not _has_value(raw_value):
            continue

        section = _stringify_prompt_part(raw_value)
        if not section:
            continue

        if section == prompt or section in prompt:
            continue

        if key in {"code", "pseudocode", "snippet"}:
            section = f"{key.capitalize()}:\n{section}"

        if any(existing == section for existing in sections):
            continue

        sections.append(section)

    if not sections:
        return prompt

    return f"{prompt}\n\n" + "\n\n".join(sections)


def _has_visual_payload(example: dict[str, Any]) -> bool:
    for key, value in example.items():
        normalized_key = _normalize_key(str(key))
        if any(marker in normalized_key for marker in ("image", "figure", "diagram", "plot", "chart")) and _has_value(value):
            return True
    return False


def _looks_like_image_url(value: str) -> bool:
    text = value.strip()
    return text.startswith("http://") or text.startswith("https://") or text.startswith("data:image/")


def _looks_like_image_path(value: str) -> bool:
    text = value.strip()
    if not text or "\n" in text or "\r" in text or text.startswith("{"):
        return False
    return bool(IMAGE_PATH_PATTERN.search(text))


def _resolve_media_source(value: str, dataset_name: str | None) -> str | None:
    text = value.strip()
    if not text:
        return None

    if _looks_like_image_url(text):
        return text

    if dataset_name and _looks_like_image_path(text):
        normalized_path = text.lstrip("/")
        encoded_path = quote(normalized_path, safe="/._-~")
        return f"https://huggingface.co/datasets/{dataset_name}/resolve/main/{encoded_path}"

    return None


def _extract_media_sources_from_value(value: Any, dataset_name: str | None) -> list[str]:
    if not _has_value(value):
        return []

    if isinstance(value, str):
        resolved = _resolve_media_source(value, dataset_name)
        return [resolved] if resolved else []

    if isinstance(value, dict):
        sources: list[str] = []
        for key in ("url", "uri", "src", "source", "path", "file", "filename", "image", "figure"):
            candidate = value.get(key)
            if not _has_value(candidate):
                continue
            sources.extend(_extract_media_sources_from_value(candidate, dataset_name))
        return sources

    if isinstance(value, (list, tuple, set)):
        sources: list[str] = []
        for item in value:
            sources.extend(_extract_media_sources_from_value(item, dataset_name))
        return sources

    return []


def _extract_media_sources(example: dict[str, Any], dataset_name: str | None) -> list[str]:
    extracted: list[str] = []

    for key, value in example.items():
        normalized_key = _normalize_key(str(key))
        if not any(marker in normalized_key for marker in ("image", "figure", "diagram", "plot", "chart", "media")):
            continue

        extracted.extend(_extract_media_sources_from_value(value, dataset_name))

    deduplicated: list[str] = []
    seen = set()
    for source in extracted:
        if source in seen:
            continue
        seen.add(source)
        deduplicated.append(source)

    return deduplicated


def _should_skip_incomplete_visual_question(
    example: dict[str, Any],
    prompt: str,
    has_textual_supplement: bool,
    media_sources: list[str],
) -> bool:
    if not _has_visual_payload(example):
        return False

    if VISUAL_REFERENCE_PATTERN.search(prompt):
        if media_sources:
            return False
        if CODE_REFERENCE_PATTERN.search(prompt) and has_textual_supplement:
            return False
        return True

    return False


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
        value = None
        for key in (f"option_{letter}", f"choice_{letter}", f"answer_{letter}", letter, letter.upper()):
            candidate = _get_value(record, key)
            if candidate not in (None, ""):
                value = candidate
                break

        if value not in (None, ""):
            choices.append(str(value))

    return choices


def _choices_from_prompt(prompt: Any) -> list[str]:
    text = str(prompt)
    if not text:
        return []

    patterns = [
        re.compile(r"^\s*([A-J])[\)\].:-]\s*(.+?)\s*$", re.IGNORECASE),
        re.compile(r"^\s*\(([A-J])\)\s*(.+?)\s*$", re.IGNORECASE),
    ]

    labeled_choices: dict[str, str] = {}

    for raw_line in text.splitlines():
        line = raw_line.strip()
        if not line:
            continue

        for pattern in patterns:
            matched = pattern.match(line)
            if not matched:
                continue

            letter = matched.group(1).upper()
            choice_text = matched.group(2).strip()
            if choice_text and letter not in labeled_choices:
                labeled_choices[letter] = choice_text
            break

    if len(labeled_choices) < 2:
        return []

    ordered_letters = sorted(labeled_choices.keys())
    return [labeled_choices[letter] for letter in ordered_letters]


def _trim_choice_prefixes(text: str) -> str:
    return re.sub(r"^\s*(?:\(?[A-Z]\)?|\d+)\s*[\)\].:-]\s*", "", text.strip())


def _choice_index_from_letter(letter: str, choices: list[str]) -> int | None:
    if len(letter) != 1 or not ("A" <= letter <= "Z"):
        return None

    index = ord(letter) - ord("A")
    return index if 0 <= index < len(choices) else None


def _choice_index_from_choice_text(raw_answer: Any, choices: list[str]) -> int | None:
    normalized_answer = _trim_choice_prefixes(str(raw_answer)).casefold()
    if not normalized_answer:
        return None

    for index, choice in enumerate(choices):
        normalized_choice = _trim_choice_prefixes(str(choice)).casefold()
        if normalized_answer == normalized_choice:
            return index

    return None


def _choice_index_from_embedded_label(raw_answer: Any, choices: list[str]) -> int | None:
    if not isinstance(raw_answer, str):
        return None

    cleaned = raw_answer.strip()
    if not cleaned:
        return None

    patterns = [
        re.compile(r"^\(?\s*([A-Z])\s*\)?$"),
        re.compile(r"^(?:option|choice|answer)\s*[:\-]?\s*\(?\s*([A-Z])\s*\)?$", re.IGNORECASE),
    ]

    for pattern in patterns:
        matched = pattern.match(cleaned)
        if not matched:
            continue

        letter = matched.group(1).upper()
        return _choice_index_from_letter(letter, choices)

    return None


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
    if isinstance(raw_answer, (list, tuple)):
        for candidate in raw_answer:
            try:
                return _answer_index(candidate, choices)
            except ValueError:
                continue
        raise ValueError(f"Could not infer answer index from {raw_answer!r}")

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

        embedded_label_index = _choice_index_from_embedded_label(cleaned, choices)
        if embedded_label_index is not None:
            return embedded_label_index

        letter = cleaned.upper()
        if len(letter) == 1 and "A" <= letter <= "Z":
            return ord(letter) - ord("A")

        for index, choice in enumerate(choices):
            if cleaned.casefold() == choice.casefold():
                return index

        choice_text_index = _choice_index_from_choice_text(cleaned, choices)
        if choice_text_index is not None:
            return choice_text_index

    if isinstance(raw_answer, dict):
        for key in ("index", "answer_index", "choice", "value", "label", "answer", "text"):
            if key in raw_answer:
                return _answer_index(raw_answer[key], choices)

    raise ValueError(f"Could not infer answer index from {raw_answer!r}")


def parse(dataset: Any, dataset_name: str | None = None) -> list[dict[str, Any]]:
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

        base_prompt = _first_value(example, QUESTION_KEYS)
        if base_prompt is None:
            continue

        prompt = _build_prompt(example, base_prompt)
        has_textual_supplement = prompt.strip() != _stringify_prompt_part(base_prompt)
        media_sources = _extract_media_sources(example, dataset_name)

        if _should_skip_incomplete_visual_question(example, prompt, has_textual_supplement, media_sources):
            continue

        raw_answer = _first_value(example, ANSWER_KEYS)
        if raw_answer is None:
            continue

        raw_choices = _first_value(example, CHOICE_KEYS)
        choices = _normalize_choices(raw_choices)
        if not choices:
            choices = _option_choices(example)
        if not choices:
            choices = _choices_from_prompt(prompt)
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
                **({"media": media_sources} if media_sources else {}),
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
    parsed = parse(dataset, dataset_name=args.dataset)
    output_path = save(parsed, args.output)
    print(f"Saved {len(parsed)} compact questions to {output_path}")


if __name__ == "__main__":
    main()
