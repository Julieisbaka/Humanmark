import json
import pathlib
import tempfile
import unittest
from urllib.error import HTTPError
from unittest.mock import patch

ROOT = pathlib.Path(__file__).resolve().parents[1]
import sys

if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.generate_changelog import (
    COPILOT_API_URL,
    _build_fallback_summary,
    _call_copilot,
    _is_bot_commit,
    generate_changelog,
)


class _FakeHTTPResponse:
    def __init__(self, payload: dict):
        self._payload = payload

    def read(self) -> bytes:
        return json.dumps(self._payload).encode("utf-8")

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        return False


class GenerateChangelogTests(unittest.TestCase):
    def test_generate_changelog_prefers_since_sha_when_present(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            output_path = pathlib.Path(temp_dir) / "changelog.json"
            with patch(
                "scripts.generate_changelog._get_commits_since_sha",
                return_value=["feat: use marker commit"],
            ) as mock_since_sha, patch(
                "scripts.generate_changelog._get_commits_since_days",
                return_value=["feat: fallback days"],
            ) as mock_since_days, patch(
                "scripts.generate_changelog._call_copilot",
                return_value="summary",
            ), patch(
                "scripts.generate_changelog._get_head_sha",
                return_value="abc123",
            ):
                generate_changelog(
                    output_path=output_path,
                    since_sha="deadbeef",
                    token="token",
                    days=7,
                )

            mock_since_sha.assert_called_once_with("deadbeef")
            mock_since_days.assert_not_called()

    def test_call_copilot_returns_fallback_without_commits(self):
        with patch("scripts.generate_changelog.urlopen") as mock_urlopen:
            summary = _call_copilot([], "token")

        self.assertEqual("No significant changes were made this week.", summary)
        mock_urlopen.assert_not_called()

    def test_build_fallback_summary_formats_recent_commits(self):
        summary = _build_fallback_summary(
            ["feat: add changelog", "fix: handle API fallback"]
        )

        self.assertEqual(
            "### Recent updates\n"
            "- feat: add changelog\n"
            "- fix: handle API fallback",
            summary,
        )

    def test_call_copilot_sends_expected_payload_and_parses_response(self):
        captured = {}

        def fake_urlopen(request, timeout):
            captured["url"] = request.full_url
            captured["authorization"] = request.headers.get("Authorization")
            captured["content_type"] = request.headers.get("Content-type")
            captured["payload"] = json.loads(request.data.decode("utf-8"))
            captured["timeout"] = timeout
            return _FakeHTTPResponse(
                {
                    "choices": [
                        {
                            "message": {
                                "content": "### Improvements\n- Added changelog generation."
                            }
                        }
                    ]
                }
            )

        with patch("scripts.generate_changelog.urlopen", side_effect=fake_urlopen):
            summary = _call_copilot(["feat: add changelog"], "token123")

        self.assertEqual(
            "### Improvements\n- Added changelog generation.",
            summary,
        )
        self.assertEqual(COPILOT_API_URL, captured["url"])
        self.assertIn("token123", captured["authorization"] or "")
        self.assertEqual("application/json", captured["content_type"])
        self.assertEqual(60, captured["timeout"])
        self.assertEqual("gpt-4o", captured["payload"]["model"])
        self.assertEqual("system", captured["payload"]["messages"][0]["role"])
        self.assertIn(
            "- feat: add changelog",
            captured["payload"]["messages"][1]["content"],
        )

    def test_call_copilot_raises_for_unexpected_api_response(self):
        with patch(
            "scripts.generate_changelog.urlopen",
            return_value=_FakeHTTPResponse({"id": "response-without-choices"}),
        ):
            with self.assertRaisesRegex(ValueError, "Unexpected Copilot API response"):
                _call_copilot(["fix: handle errors"], "token123")

    def test_generate_changelog_writes_expected_json_payload(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            output_path = pathlib.Path(temp_dir) / "data" / "changelog.json"

            with patch(
                "scripts.generate_changelog._get_commits_since_days",
                return_value=["feat: add changelog", "fix: polish disclaimer"],
            ), patch(
                "scripts.generate_changelog._call_copilot",
                return_value="Grouped summary",
            ) as mock_call_copilot, patch(
                "scripts.generate_changelog._get_head_sha",
                return_value="cafebabe",
            ):
                written_path = generate_changelog(
                    output_path=output_path,
                    since_sha=None,
                    token="token123",
                    days=7,
                )

            self.assertEqual(output_path, written_path)
            self.assertTrue(output_path.exists())
            payload = json.loads(output_path.read_text(encoding="utf-8"))
            self.assertEqual("copilot", payload["generatedBy"])
            self.assertEqual("cafebabe", payload["headSha"])
            self.assertEqual(2, payload["commitCount"])
            self.assertEqual("Grouped summary", payload["summary"])
            self.assertIn("generatedAt", payload)
            mock_call_copilot.assert_called_once_with(
                ["feat: add changelog", "fix: polish disclaimer"],
                "token123",
            )

    def test_generate_changelog_falls_back_when_copilot_request_fails(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            output_path = pathlib.Path(temp_dir) / "data" / "changelog.json"

            with patch(
                "scripts.generate_changelog._get_commits_since_days",
                return_value=["feat: add changelog", "fix: handle API fallback"],
            ), patch(
                "scripts.generate_changelog._call_copilot",
                side_effect=HTTPError(
                    COPILOT_API_URL,
                    400,
                    "Bad Request",
                    hdrs=None,
                    fp=None,
                ),
            ), patch(
                "scripts.generate_changelog._get_head_sha",
                return_value="cafebabe",
            ):
                written_path = generate_changelog(
                    output_path=output_path,
                    since_sha=None,
                    token="token123",
                    days=7,
                )

            self.assertEqual(output_path, written_path)
            payload = json.loads(output_path.read_text(encoding="utf-8"))
            self.assertEqual(
                "### Recent updates\n"
                "- feat: add changelog\n"
                "- fix: handle API fallback",
                payload["summary"],
            )

    def test_bot_commits_are_filtered_from_commit_list(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            output_path = pathlib.Path(temp_dir) / "changelog.json"
            with patch(
                "scripts.generate_changelog._get_commits_since_days",
                return_value=[
                    "feat: real user change",
                    "chore: update AI changelog [skip ci]",
                    "chore: refresh scores [skip ci]",
                ],
            ) as mock_since_days, patch(
                "scripts.generate_changelog._call_copilot",
                return_value="summary",
            ) as mock_call_copilot, patch(
                "scripts.generate_changelog._get_head_sha",
                return_value="abc123",
            ):
                generate_changelog(
                    output_path=output_path,
                    since_sha=None,
                    token="token",
                    days=7,
                )

            mock_since_days.assert_called_once()
            # Only the non-bot commit should be forwarded to _call_copilot
            mock_call_copilot.assert_called_once_with(
                ["feat: real user change"],
                "token",
            )

    def test_is_bot_commit_detects_skip_ci(self):
        self.assertTrue(_is_bot_commit("chore: update AI changelog [skip ci]"))
        self.assertTrue(_is_bot_commit("chore: refresh scores [skip ci]"))
        self.assertFalse(_is_bot_commit("feat: add new feature"))
        self.assertFalse(_is_bot_commit("fix: patch bug"))



if __name__ == '__main__':
    unittest.main()
