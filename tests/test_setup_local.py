import io
import pathlib
import tempfile
import unittest
from contextlib import redirect_stderr, redirect_stdout
from unittest.mock import patch

ROOT = pathlib.Path(__file__).resolve().parents[1]
import sys

if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts import setup_local


class _FakeStats:
    def summary_lines(self):
        return ["kept 1"]


class _FakeServer:
    def __init__(self, port: int):
        self.server_address = ("localhost", port)
        self.served = False
        self.closed = False

    def serve_forever(self):
        self.served = True

    def server_close(self):
        self.closed = True


class SetupLocalTests(unittest.TestCase):
    def test_run_setup_refreshes_data_then_starts_server(self):
        definitions = [
            {
                "source": {"dataset": "demo/set", "subset": "subset-a", "split": "train"},
                "generatedQuestionsFile": "demo.json",
            }
        ]

        with tempfile.TemporaryDirectory() as temp_dir:
            root = pathlib.Path(temp_dir)
            server = _FakeServer(8123)

            with (
                patch.object(setup_local, "BENCHMARK_DEFINITIONS", definitions),
                patch.object(setup_local, "load_dataset", return_value=["raw"]) as load_dataset,
                patch.object(setup_local, "parse", return_value=([{"id": "q1"}], _FakeStats())) as parse,
                patch.object(setup_local, "save", return_value=root / "data" / "benchmarks" / "generated" / "demo.json") as save,
                patch.object(setup_local, "build_index") as build_index,
                patch.object(setup_local, "load_score_source", return_value={"current": {}}) as load_score_source,
                patch.object(setup_local, "sync_scores", return_value=root / "data" / "scores" / "current.json") as sync_scores,
                patch.object(setup_local, "create_server", return_value=server) as create_server,
                redirect_stdout(io.StringIO()) as stdout,
            ):
                url = setup_local.run_setup(
                    project_root=root,
                    directory=root,
                    host="localhost",
                    port=8123,
                    source_url="scores.json",
                    api_key="token",
                )

        self.assertEqual("http://localhost:8123/", url)
        load_dataset.assert_called_once_with("demo/set", task="subset-a", split="train")
        parse.assert_called_once_with(["raw"], dataset_name="demo/set", return_stats=True)
        save.assert_called_once_with([{"id": "q1"}], root / "data" / "benchmarks" / "generated" / "demo.json")
        build_index.assert_called_once_with(
            root / "data" / "benchmarks" / "generated",
            root / "data" / "benchmarks",
            root / "data" / "benchmarks" / "index.json",
        )
        load_score_source.assert_called_once_with("scores.json", "token")
        sync_scores.assert_called_once_with({"current": {}}, root / "data" / "scores" / "current.json")
        create_server.assert_called_once_with("localhost", 8123, root)
        self.assertTrue(server.served)
        self.assertTrue(server.closed)
        self.assertIn("Local server running at http://localhost:8123/", stdout.getvalue())

    def test_main_reports_errors_to_stderr(self):
        stderr = io.StringIO()

        with (
            patch.object(setup_local, "run_setup", side_effect=RuntimeError("boom")),
            redirect_stderr(stderr),
        ):
            exit_code = setup_local.main([])

        self.assertEqual(1, exit_code)
        self.assertIn("Setup failed: boom", stderr.getvalue())

    def test_build_local_url_rewrites_wildcard_host(self):
        self.assertEqual("http://127.0.0.1:8000/", setup_local.build_local_url("0.0.0.0", 8000))


if __name__ == "__main__":
    unittest.main()
