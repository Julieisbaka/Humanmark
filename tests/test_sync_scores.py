import pathlib
import tempfile
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[1]
import sys

if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.sync_scores import _extract_snapshot, sync_scores


class SyncScoresTests(unittest.TestCase):
    def test_extract_snapshot_accepts_direct_shape(self):
        payload = {
            "generatedAt": "2026-01-01T00:00:00Z",
            "methodologyUrl": "https://example.com",
            "benchmarks": {},
        }

        extracted = _extract_snapshot(payload)
        self.assertEqual(payload, extracted)

    def test_extract_snapshot_accepts_nested_current(self):
        payload = {
            "data": {
                "current": {
                    "generatedAt": "x",
                    "methodologyUrl": "y",
                    "benchmarks": {"mmlu_pro": {"models": []}},
                }
            }
        }

        extracted = _extract_snapshot(payload)
        self.assertEqual("x", extracted["generatedAt"])
        self.assertIn("mmlu_pro", extracted["benchmarks"])

    def test_extract_snapshot_builds_from_model_list(self):
        payload = {
            "timestamp": "2026-01-02T00:00:00Z",
            "data": [
                {
                    "id": "model-a",
                    "name": "Model A",
                    "evaluations": {
                        "gpqa": 0.3,
                        "humanitys_last_exam": 0.2,
                        "mmlu_pro": 0.8,
                    },
                },
                {
                    "id": "model-b",
                    "name": "Model B",
                    "evaluations": {
                        "gpqa_diamond": 0.9,
                        "hle": 0.4,
                        "mmlu_pro": 0.7,
                    },
                },
            ],
        }

        extracted = _extract_snapshot(payload)
        self.assertEqual("2026-01-02T00:00:00Z", extracted["generatedAt"])
        self.assertIn("gpqa_diamond", extracted["benchmarks"])

        gpqa_models = extracted["benchmarks"]["gpqa_diamond"]["models"]
        self.assertEqual("Model B", gpqa_models[0]["model"])
        self.assertEqual(1, gpqa_models[0]["rank"])

    def test_extract_snapshot_raises_for_unknown_shape(self):
        with self.assertRaises(ValueError):
            _extract_snapshot({"unexpected": True})

    def test_sync_scores_writes_snapshot_file(self):
        source = {
            "generatedAt": "2026-01-01T00:00:00Z",
            "methodologyUrl": "https://example.com",
            "benchmarks": {"mmlu_pro": {"models": []}},
        }

        with tempfile.TemporaryDirectory() as temp_dir:
            output_path = pathlib.Path(temp_dir) / "scores" / "current.json"
            written = sync_scores(source, output_path)

            self.assertEqual(output_path, written)
            self.assertTrue(output_path.exists())

            content = output_path.read_text(encoding="utf-8")
            self.assertIn("generatedAt", content)
            self.assertIn("mmlu_pro", content)


if __name__ == "__main__":
    unittest.main()
