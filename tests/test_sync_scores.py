import io
import json
import pathlib
import tempfile
import unittest
from unittest.mock import patch
from urllib.error import HTTPError

ROOT = pathlib.Path(__file__).resolve().parents[1]
import sys

if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.sync_scores import DEFAULT_SOURCE_URL, _extract_snapshot, _load_json_from_url, sync_scores


class SyncScoresTests(unittest.TestCase):
    def test_load_model_pages_with_api_key_and_existing_query(self):
        pages = [
            {"pagination": {"page": 1, "total_pages": 2}, "data": [
                {"id": "a", "name": "A", "evaluations": {"gpqa": 0.4}}
            ]},
            {"pagination": {"page": 2, "total_pages": 2}, "data": [
                {"id": "b", "name": "B", "evaluations": {"gpqa": 0.8}}
            ]},
        ]
        responses = [io.BytesIO(json.dumps(page).encode()) for page in pages]
        with patch("scripts.sync_scores.urlopen", side_effect=responses) as urlopen:
            payload = _load_json_from_url(DEFAULT_SOURCE_URL + "?filter=test", "test-key")

        self.assertEqual(DEFAULT_SOURCE_URL + "?filter=test&page=2", urlopen.call_args_list[1].args[0].full_url)
        for call in urlopen.call_args_list:
            self.assertEqual("test-key", call.args[0].get_header("X-api-key"))
            self.assertEqual(60, call.kwargs["timeout"])
        snapshot = _extract_snapshot(payload)
        self.assertEqual(["B", "A"], [model["model"] for model in snapshot["benchmarks"]["gpqa_diamond"]["models"]])

    def test_load_model_pages_rejects_invalid_pagination(self):
        page = {"pagination": {"page": 2, "total_pages": 2}, "data": []}
        with patch("scripts.sync_scores.urlopen", return_value=io.BytesIO(json.dumps(page).encode())):
            with self.assertRaises(ValueError):
                _load_json_from_url(DEFAULT_SOURCE_URL, None)

    def test_load_model_pages_propagates_later_page_failure(self):
        first = {"pagination": {"page": 1, "total_pages": 2}, "data": []}
        error = HTTPError(DEFAULT_SOURCE_URL, 403, "Forbidden", {}, None)
        with patch("scripts.sync_scores.urlopen", side_effect=[io.BytesIO(json.dumps(first).encode()), error]):
            with self.assertRaises(HTTPError):
                _load_json_from_url(DEFAULT_SOURCE_URL, "test-key")

    def test_load_custom_url_does_not_follow_pagination(self):
        payload = {"pagination": {"page": 1, "total_pages": 2}, "data": []}
        with patch("scripts.sync_scores.urlopen", return_value=io.BytesIO(json.dumps(payload).encode())) as urlopen:
            self.assertEqual(payload, _load_json_from_url("https://example.com/scores", None))
        urlopen.assert_called_once()

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
