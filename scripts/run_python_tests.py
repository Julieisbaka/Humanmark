from __future__ import annotations

import time
import traceback
import unittest
from unittest.runner import registerResult


class NodeStyleResult(unittest.TextTestResult):
    def __init__(self, stream, descriptions, verbosity):
        super().__init__(stream, descriptions, verbosity)
        self._started_at: dict[unittest.case.TestCase, float] = {}
        self._run_started = 0.0

    def startTestRun(self) -> None:
        self._run_started = time.perf_counter()
        super().startTestRun()

    def startTest(self, test: unittest.case.TestCase) -> None:
        self._started_at[test] = time.perf_counter()
        super().startTest(test)

    def _duration_ms(self, test: unittest.case.TestCase) -> float:
        started = self._started_at.pop(test, time.perf_counter())
        return (time.perf_counter() - started) * 1000

    def _label(self, test: unittest.case.TestCase) -> str:
        return test.id().split(".")[-1]

    def addSuccess(self, test: unittest.case.TestCase) -> None:
        super().addSuccess(test)
        duration_ms = self._duration_ms(test)
        self.stream.writeln(f"✔ {self._label(test)} ({duration_ms:.4f}ms)")

    def addFailure(self, test: unittest.case.TestCase, err) -> None:
        super().addFailure(test, err)
        duration_ms = self._duration_ms(test)
        self.stream.writeln(f"✖ {self._label(test)} ({duration_ms:.4f}ms)")

    def addError(self, test: unittest.case.TestCase, err) -> None:
        super().addError(test, err)
        duration_ms = self._duration_ms(test)
        self.stream.writeln(f"✖ {self._label(test)} ({duration_ms:.4f}ms)")

    def addSkip(self, test: unittest.case.TestCase, reason: str) -> None:
        super().addSkip(test, reason)
        duration_ms = self._duration_ms(test)
        self.stream.writeln(f"↷ {self._label(test)} ({duration_ms:.4f}ms) # {reason}")

    def addExpectedFailure(self, test: unittest.case.TestCase, err) -> None:
        super().addExpectedFailure(test, err)
        duration_ms = self._duration_ms(test)
        self.stream.writeln(f"✔ {self._label(test)} ({duration_ms:.4f}ms) # expected failure")

    def addUnexpectedSuccess(self, test: unittest.case.TestCase) -> None:
        super().addUnexpectedSuccess(test)
        duration_ms = self._duration_ms(test)
        self.stream.writeln(f"✖ {self._label(test)} ({duration_ms:.4f}ms) # unexpected success")

    def stopTestRun(self) -> None:
        super().stopTestRun()
        duration_ms = (time.perf_counter() - self._run_started) * 1000

        failed = len(self.failures) + len(self.errors)
        skipped = len(self.skipped)
        expected_failures = len(self.expectedFailures)
        unexpected_successes = len(self.unexpectedSuccesses)

        self.stream.writeln(f"ℹ tests {self.testsRun}")
        self.stream.writeln("ℹ suites 0")
        self.stream.writeln(f"ℹ pass {self.testsRun - failed - skipped - expected_failures}")
        self.stream.writeln(f"ℹ fail {failed + unexpected_successes}")
        self.stream.writeln("ℹ cancelled 0")
        self.stream.writeln(f"ℹ skipped {skipped}")
        self.stream.writeln(f"ℹ todo {expected_failures}")
        self.stream.writeln(f"ℹ duration_ms {duration_ms:.4f}")

        if failed:
            self.stream.writeln("\n✖ failing tests:\n")
            for test, err in [*self.failures, *self.errors]:
                self.stream.writeln(f"test at {test.id()}")
                self.stream.writeln(f"✖ {self._label(test)}")
                formatted = "".join(traceback.format_exception(*err)).rstrip()
                for line in formatted.splitlines():
                    self.stream.writeln(f"  {line}")


class NodeStyleRunner(unittest.TextTestRunner):
    resultclass = NodeStyleResult

    def __init__(self):
        super().__init__(verbosity=0)

    def run(self, test):
        result = self._makeResult()
        registerResult(result)
        result.failfast = self.failfast
        result.buffer = self.buffer
        result.tb_locals = self.tb_locals

        start_time = time.perf_counter()
        result.startTestRun()
        try:
            test(result)
        finally:
            result.stopTestRun()
        _ = time.perf_counter() - start_time
        return result


def main() -> int:
    suite = unittest.defaultTestLoader.discover("tests", pattern="test_*.py")
    result = NodeStyleRunner().run(suite)
    return 0 if result.wasSuccessful() else 1


if __name__ == "__main__":
    raise SystemExit(main())
