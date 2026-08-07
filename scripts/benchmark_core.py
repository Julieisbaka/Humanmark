from __future__ import annotations

import json
import re
from collections import Counter
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any
from urllib.parse import quote

from datasets import Dataset, DatasetDict

try:
    from scripts.benchmark.constants import (
        ANSWER_KEYS,
        CHOICE_KEYS,
        CHOICE_PROBABILITY_KEYS,
        CODE_REFERENCE_PATTERN,
        EXPLANATION_KEYS,
        ID_KEYS,
        IMAGE_PATH_PATTERN,
        JOINT_PROBABILITY_KEYS,
        MAX_CHOICE_COUNT,
        MAX_PROMPT_CHARS,
        MIN_CHOICE_COUNT,
        QUESTION_KEYS,
        QUESTION_PROBABILITY_KEYS,
        SUPPLEMENTAL_PROMPT_KEYS,
        VISUAL_REFERENCE_PATTERN,
    )
except ModuleNotFoundError:
    from benchmark.constants import (
        ANSWER_KEYS,
        CHOICE_KEYS,
        CHOICE_PROBABILITY_KEYS,
        CODE_REFERENCE_PATTERN,
        EXPLANATION_KEYS,
        ID_KEYS,
        IMAGE_PATH_PATTERN,
        JOINT_PROBABILITY_KEYS,
        MAX_CHOICE_COUNT,
        MAX_PROMPT_CHARS,
        MIN_CHOICE_COUNT,
        QUESTION_KEYS,
        QUESTION_PROBABILITY_KEYS,
        SUPPLEMENTAL_PROMPT_KEYS,
        VISUAL_REFERENCE_PATTERN,
    )


@dataclass
class ParseStats:
    processed: int = 0
    parsed: int = 0
    dropped: Counter[str] = field(default_factory=Counter)

    def drop(self, reason: str) -> None:
        self.dropped[reason] += 1

    @property
    def dropped_total(self) -> int:
        return sum(self.dropped.values())

    def summary_lines(self) -> list[str]:
        lines = [
            f"Processed rows: {self.processed}",
            f"Parsed rows: {self.parsed}",
            f"Dropped rows: {self.dropped_total}",
        ]

        if self.dropped:
            lines.append("Drop reasons:")
            for reason, count in sorted(self.dropped.items(), key=lambda item: (-item[1], item[0])):
                lines.append(f"  - {reason}: {count}")

        return lines


def _normalize_key(key: str) -> str:
    return "".join(character for character in key.casefold() if character.isalnum())


def _get_value(record: dict[str, Any], key: str) -> Any:
    normalized_target = _normalize_key(key)
    for candidate_key, value in record.items():
        if _normalize_key(str(candidate_key)) == normalized_target and value not in (None, ""):
            return value
    return None


def _first_value(record: dict[str, Any], keys: tuple[str, ...]) -> Any:
    for key in keys:
        value = _get_value(record, key)
        if value not in (None, ""):
            return value
    return None


def _normalize_choice_for_compare(value: Any) -> str:
    return re.sub(r"\s+", " ", str(value).strip()).casefold()


def _normalize_aime_answer(value: Any) -> str | None:
    if value is None:
        return None

    if isinstance(value, bool):
        return None

    if isinstance(value, (list, tuple)):
        for candidate in value:
            normalized = _normalize_aime_answer(candidate)
            if normalized is not None:
                return normalized
        return None

    if isinstance(value, dict):
        for key in ("answer", "final_answer", "value", "text", "label", "index"):
            if key in value:
                normalized = _normalize_aime_answer(value[key])
                if normalized is not None:
                    return normalized
        return None

    if isinstance(value, int):
        if 0 <= value <= 999:
            return str(value)
        return None

    if isinstance(value, float):
        if value.is_integer() and 0 <= value <= 999:
            return str(int(value))
        return None

    text = str(value).strip().replace(",", "")
    if not text:
        return None

    if not re.fullmatch(r"[-+]?\d+(?:\.0+)?", text):
        return None

    try:
        numeric = int(float(text))
    except (TypeError, ValueError):
        return None

    if numeric < 0 or numeric > 999:
        return None

    if float(text) != numeric:
        return None

    return str(numeric)


def _validate_question(prompt: str, choices: list[str], answer_index: int) -> str | None:
    if not prompt or not prompt.strip():
        return "invalid_prompt_empty"

    if len(prompt) > MAX_PROMPT_CHARS:
        return "invalid_prompt_too_long"

    if len(choices) < MIN_CHOICE_COUNT:
        return "invalid_choice_count_too_small"

    if len(choices) > MAX_CHOICE_COUNT:
        return "invalid_choice_count_too_large"

    normalized_choices = [_normalize_choice_for_compare(choice) for choice in choices]
    if any(not choice for choice in normalized_choices):
        return "invalid_choice_empty"

    if len(set(normalized_choices)) != len(normalized_choices):
        return "invalid_choice_duplicates"

    if answer_index < 0 or answer_index >= len(choices):
        return "invalid_answer_index_out_of_range"

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


def _build_parsed_record(
    example: dict[str, Any],
    index: int,
    dataset_name: str | None,
    stats: ParseStats,
) -> dict[str, Any] | None:
    base_prompt = _first_value(example, QUESTION_KEYS)
    if base_prompt is None:
        stats.drop("missing_prompt")
        return None

    prompt = _build_prompt(example, base_prompt)
    has_textual_supplement = prompt.strip() != _stringify_prompt_part(base_prompt)
    media_sources = _extract_media_sources(example, dataset_name)

    if _should_skip_incomplete_visual_question(example, prompt, has_textual_supplement, media_sources):
        stats.drop("visual_reference_without_media")
        return None

    raw_answer = _first_value(example, ANSWER_KEYS)
    if raw_answer is None:
        stats.drop("missing_answer")
        return None

    raw_choices = _first_value(example, CHOICE_KEYS)
    choices = _normalize_choices(raw_choices)
    if not choices:
        choices = _option_choices(example)
    if not choices:
        choices = _choices_from_prompt(prompt)
    if not choices:
        choices = _fallback_choices(example, raw_answer)

    if not choices:
        stats.drop("missing_choices")
        return None

    try:
        answer_index = _answer_index(raw_answer, choices)
    except ValueError:
        stats.drop("unresolvable_answer_index")
        return None

    validation_error = _validate_question(str(prompt).strip(), choices, answer_index)
    if validation_error:
        stats.drop(validation_error)
        return None

    explanation = _first_value(example, EXPLANATION_KEYS)
    example_id = _first_value(example, ID_KEYS) or f"question-{index + 1}"
    pmi = _extract_pmi(example, len(choices))

    return {
        "id": str(example_id),
        "prompt": str(prompt).strip(),
        "choices": choices,
        "answerIndex": answer_index,
        **({"explanation": str(explanation).strip()} if explanation is not None else {}),
        **({"media": media_sources} if media_sources else {}),
        **({"pmi": pmi} if pmi is not None else {}),
    }


def _build_standardized_record(
    example: dict[str, Any],
    index: int,
    dataset_name: str | None,
    stats: ParseStats,
) -> dict[str, Any] | None:
    base_prompt = _first_value(example, QUESTION_KEYS)
    if base_prompt is None:
        stats.drop("missing_prompt")
        return None

    prompt = _build_prompt(example, base_prompt)
    raw_answer = _first_value(example, ANSWER_KEYS)
    if raw_answer is None:
        stats.drop("missing_answer")
        return None

    answer_text = _normalize_aime_answer(raw_answer)
    if answer_text is None:
        stats.drop("invalid_standardized_answer")
        return None

    explanation = _first_value(example, EXPLANATION_KEYS)
    example_id = _first_value(example, ID_KEYS) or f"question-{index + 1}"

    return {
        "id": str(example_id),
        "prompt": str(prompt).strip(),
        "answerText": answer_text,
        "answerValue": int(answer_text),
        **({"explanation": str(explanation).strip()} if explanation is not None else {}),
    }


def _parse_hle_example(
    example: dict[str, Any],
    index: int,
    dataset_name: str | None,
    stats: ParseStats,
) -> dict[str, Any] | None:
    answer_type = _get_value(example, "answer_type")
    if isinstance(answer_type, str):
        normalized = answer_type.strip().casefold()
        if normalized and "multiple" not in normalized:
            stats.drop("non_multiple_choice")
            return None

    return _build_parsed_record(example, index, dataset_name, stats)


def _parse_generic_example(
    example: dict[str, Any],
    index: int,
    dataset_name: str | None,
    stats: ParseStats,
) -> dict[str, Any] | None:
    return _build_parsed_record(example, index, dataset_name, stats)


def _resolve_adapter(dataset_name: str | None):
    if not dataset_name:
        return _parse_generic_example

    normalized_name = dataset_name.strip().casefold()
    if normalized_name == "di-zhang-fdu/aime_1983_2024":
        return _build_standardized_record
    if normalized_name == "cais/hle":
        return _parse_hle_example

    return _parse_generic_example


def parse(
    dataset: Any,
    dataset_name: str | None = None,
    return_stats: bool = False,
) -> list[dict[str, Any]] | tuple[list[dict[str, Any]], ParseStats]:
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
    stats = ParseStats()
    adapter = _resolve_adapter(dataset_name)

    for index, example in enumerate(examples):
        stats.processed += 1

        if not isinstance(example, dict):
            stats.drop("invalid_row_type")
            continue

        record = adapter(example, index, dataset_name, stats)
        if record is None:
            continue

        parsed.append(record)
        stats.parsed += 1

    if return_stats:
        return parsed, stats

    return parsed


def save(data: list[dict[str, Any]], output: str | Path) -> Path:
    output_path = Path(output)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(
        json.dumps(data, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    return output_path
