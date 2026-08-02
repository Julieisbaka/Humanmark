from __future__ import annotations

import re

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

VISUAL_REFERENCE_PATTERN = re.compile(
    r"\b(?:"
    r"the\s+figure\s+shows|figure\s+shows|"
    r"this\s+image|in\s+the\s+image|shown\s+in\s+the\s+image|"
    r"this\s+diagram|in\s+the\s+diagram|shown\s+below|shown\s+above|"
    r"following\s+image|following\s+diagram|the\s+image\s+below|the\s+diagram\s+below|"
    r"figure\s+below|figure\s+above|see\s+the\s+image|see\s+the\s+diagram"
    r")\b",
    re.IGNORECASE,
)
CODE_REFERENCE_PATTERN = re.compile(r"\b(pseudocode|code snippet|following code|algorithm)\b", re.IGNORECASE)
IMAGE_PATH_PATTERN = re.compile(r"\.(?:png|jpe?g|gif|webp|bmp|svg|tiff?)$", re.IGNORECASE)

MIN_CHOICE_COUNT = 2
MAX_CHOICE_COUNT = 26
MAX_PROMPT_CHARS = 20_000
