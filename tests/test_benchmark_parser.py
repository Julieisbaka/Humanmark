import os
import pathlib
import tempfile
import unittest
from unittest import mock


ROOT = pathlib.Path(__file__).resolve().parents[1]
import sys

if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.benchmark import parse
from scripts.benchmark_core import save
from scripts.benchmark_io import parse_args


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

    def test_aime_integer_answers_are_parsed_and_invalid_answers_are_dropped(self):
        sample = [
            {
                "ID": "1983-1",
                "Question": "Find the answer.",
                "Answer": "007",
            },
            {
                "ID": "1983-2",
                "Question": "Find the answer.",
                "Answer": "3/4",
            },
        ]

        parsed, stats = parse(sample, dataset_name="di-zhang-fdu/AIME_1983_2024", return_stats=True)

        self.assertEqual(1, len(parsed))
        self.assertEqual("1983-1", parsed[0]["id"])
        self.assertEqual("7", parsed[0]["answerText"])
        self.assertEqual(1, stats.dropped["invalid_standardized_answer"])

    def test_save_and_cli_accept_in_tree_relative_and_absolute_output_paths(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            tmpdir_path = pathlib.Path(tmpdir)
            relative_output = pathlib.Path("nested") / "benchmark.json"
            absolute_output = tmpdir_path / "absolute" / "benchmark.json"
            original_cwd = os.getcwd()
            try:
                os.chdir(tmpdir_path)

                saved_relative = save([{"id": "rel"}], relative_output)
                self.assertEqual(tmpdir_path / relative_output, saved_relative)
                self.assertTrue(saved_relative.is_file())

                with mock.patch.object(
                    sys,
                    "argv",
                    ["benchmark.py", "demo/dataset", "--output", str(relative_output)],
                ):
                    self.assertEqual(tmpdir_path / relative_output, parse_args().output)

                saved_absolute = save([{"id": "abs"}], absolute_output)
                self.assertEqual(absolute_output, saved_absolute)
                self.assertTrue(saved_absolute.is_file())

                with mock.patch.object(
                    sys,
                    "argv",
                    ["benchmark.py", "demo/dataset", "--output", str(absolute_output)],
                ):
                    self.assertEqual(absolute_output, parse_args().output)
            finally:
                os.chdir(original_cwd)

    def test_save_and_cli_reject_output_paths_outside_cwd(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            tmpdir_path = pathlib.Path(tmpdir)
            outside_dir = tmpdir_path.parent / f"{tmpdir_path.name}-outside"
            outside_dir.mkdir(exist_ok=True)
            relative_escape = pathlib.Path("..") / outside_dir.name / "escape.json"
            absolute_escape = outside_dir / "escape.json"
            original_cwd = os.getcwd()
            try:
                os.chdir(tmpdir_path)

                for output in (pathlib.Path("."), relative_escape, absolute_escape):
                    with self.subTest(output=str(output)):
                        with self.assertRaisesRegex(
                            ValueError,
                            "Output path must be within the current working directory.",
                        ):
                            save([], output)

                        with mock.patch.object(
                            sys,
                            "argv",
                            ["benchmark.py", "demo/dataset", "--output", str(output)],
                        ):
                            with self.assertRaises(SystemExit):
                                parse_args()
            finally:
                os.chdir(original_cwd)

    def test_save_and_cli_reject_blank_output_paths(self):
        with self.assertRaisesRegex(
            ValueError,
            "Output path must be a non-empty path within the current working directory.",
        ):
            save([], "   ")

        with mock.patch.object(sys, "argv", ["benchmark.py", "demo/dataset", "--output", "   "]):
            with self.assertRaises(SystemExit):
                parse_args()

    def test_save_and_cli_reject_symlink_escape_output_paths(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            tmpdir_path = pathlib.Path(tmpdir)
            outside_dir = tmpdir_path.parent / f"{tmpdir_path.name}-symlink-outside"
            outside_dir.mkdir(exist_ok=True)
            link_path = tmpdir_path / "outside-link"
            try:
                link_path.symlink_to(outside_dir, target_is_directory=True)
            except (NotImplementedError, OSError) as exc:
                self.skipTest(f"symlink setup unavailable: {exc}")

            original_cwd = os.getcwd()
            try:
                os.chdir(tmpdir_path)
                output = link_path / "escape.json"

                with self.assertRaisesRegex(
                    ValueError,
                    "Output path must be within the current working directory.",
                ):
                    save([], output)

                with mock.patch.object(
                    sys,
                    "argv",
                    ["benchmark.py", "demo/dataset", "--output", str(output)],
                ):
                    with self.assertRaises(SystemExit):
                        parse_args()
            finally:
                os.chdir(original_cwd)


if __name__ == "__main__":
    unittest.main()
