import json
import pathlib
import tempfile
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[1]
import sys

if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.build_benchmark_index import BENCHMARK_DEFINITIONS, build_index


class BuildBenchmarkIndexTests(unittest.TestCase):
    def _write_generated_inputs(self, generated_dir: pathlib.Path) -> None:
        generated_dir.mkdir(parents=True, exist_ok=True)
        for definition in BENCHMARK_DEFINITIONS:
            path = generated_dir / definition["generatedQuestionsFile"]
            path.write_text(
                json.dumps([
                    {
                        "id": f"{definition['id']}-q1",
                        "prompt": "Question?",
                        "choices": ["A", "B"],
                        "answerIndex": 0,
                    },
                    {
                        "id": f"{definition['id']}-q2",
                        "prompt": "Question 2?",
                        "choices": ["A", "B"],
                        "answerIndex": 1,
                    },
                ], ensure_ascii=False, indent=2)
                + "\n",
                encoding="utf-8",
            )

    def test_build_index_writes_manifest_and_benchmark_payloads(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            root = pathlib.Path(temp_dir)
            generated_dir = root / "generated"
            benchmarks_dir = root / "benchmarks"
            output_file = root / "index.json"

            self._write_generated_inputs(generated_dir)
            payload = build_index(generated_dir, benchmarks_dir, output_file)

            self.assertEqual(len(BENCHMARK_DEFINITIONS), len(payload["benchmarks"]))
            self.assertTrue(output_file.exists())
            self.assertIn("generatedAt", payload)

            for definition in BENCHMARK_DEFINITIONS:
                benchmark_file = benchmarks_dir / definition["file"]
                self.assertTrue(benchmark_file.exists())

                content = json.loads(benchmark_file.read_text(encoding="utf-8"))
                self.assertEqual(definition["id"], content["id"])
                self.assertEqual(2, content["questionCount"])
                self.assertEqual(2, len(content["questions"]))

    def test_build_index_raises_when_generated_file_missing(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            root = pathlib.Path(temp_dir)
            generated_dir = root / "generated"
            benchmarks_dir = root / "benchmarks"
            output_file = root / "index.json"

            generated_dir.mkdir(parents=True, exist_ok=True)
            with self.assertRaises(FileNotFoundError):
                build_index(generated_dir, benchmarks_dir, output_file)


if __name__ == "__main__":
    unittest.main()
