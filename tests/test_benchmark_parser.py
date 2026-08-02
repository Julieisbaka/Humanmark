import pathlib
import unittest


ROOT = pathlib.Path(__file__).resolve().parents[1]
import sys

if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.benchmark import parse


class BenchmarkParserTests(unittest.TestCase):
    def test_hle_visual_reference_without_media_is_dropped(self):
        sample = [
            {
                "id": "v1",
                "question": "What does the main character in this image hold?",
                "options": ["A", "B"],
                "answer": "A",
                "answer_type": "multiple_choice",
            },
            {
                "id": "v2",
                "question": "What does the main character in this image hold?",
                "image": "figures/hero.png",
                "options": ["A", "B"],
                "answer": "A",
                "answer_type": "multiple_choice",
            },
        ]

        parsed, stats = parse(sample, dataset_name="cais/hle", return_stats=True)

        self.assertEqual(1, len(parsed))
        self.assertEqual("v2", parsed[0]["id"])
        self.assertIn("media", parsed[0])
        self.assertEqual(1, stats.dropped["visual_reference_without_media"])

    def test_hle_non_multiple_choice_is_dropped(self):
        sample = [
            {
                "id": "open-1",
                "question": "Prove the theorem.",
                "answer": "By induction",
                "answer_type": "short_answer",
            }
        ]

        parsed, stats = parse(sample, dataset_name="cais/hle", return_stats=True)

        self.assertEqual([], parsed)
        self.assertEqual(1, stats.dropped["non_multiple_choice"])

    def test_duplicate_choices_are_rejected(self):
        sample = [
            {
                "id": "dup-1",
                "question": "Pick one",
                "options": ["A", "A", "B"],
                "answer": "A",
            }
        ]

        parsed, stats = parse(sample, dataset_name="custom/set", return_stats=True)

        self.assertEqual([], parsed)
        self.assertEqual(1, stats.dropped["invalid_choice_duplicates"])

    def test_parse_without_stats_keeps_backward_compatibility(self):
        sample = [
            {
                "id": "ok-1",
                "question": "2+2?",
                "options": ["3", "4"],
                "answer": "B",
            }
        ]

        parsed = parse(sample, dataset_name="custom/set")

        self.assertIsInstance(parsed, list)
        self.assertEqual(1, len(parsed))
        self.assertEqual("ok-1", parsed[0]["id"])


if __name__ == "__main__":
    unittest.main()
