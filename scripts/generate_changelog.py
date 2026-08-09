"""Generate an AI-powered changelog from recent git commits.

Fetches commits since the last weekly update (up to 7 days back), sends them
to the GitHub Copilot chat completions API for summarization, and writes the
result to ``data/changelog.json``.

Required environment variables:
  GITHUB_TOKEN  — a GitHub token used to call the GitHub Copilot chat
                  completions API.

Optional environment variables:
  SINCE_SHA     — if set, commits are collected starting from this SHA
                  (exclusive) up to HEAD.  Falls back to --days when absent.
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
from datetime import datetime, timezone
from pathlib import Path
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError


COPILOT_API_URL = "https://api.githubcopilot.com/chat/completions"
MODEL_NAME = "gpt-4o"

SYSTEM_PROMPT = (
    "You are a helpful assistant that writes concise, human-readable release "
    "notes for an open-source project. You will receive a list of recent git "
    "commit messages and you must produce a short changelog suitable for "
    "displaying on the project homepage. Group related changes under clear "
    "headings (e.g. 'New features', 'Improvements', 'Bug fixes', 'Data "
    "updates'). Use bullet points. Keep each bullet to one or two sentences. "
    "If there is nothing meaningful to report (e.g. only automated commits), "
    "return a single paragraph stating that no significant changes were made "
    "this week. Do NOT include headers like 'Changelog' — just the grouped "
    "bullet points."
)


def _is_bot_commit(subject: str) -> bool:
    return "[skip ci]" in subject


def _get_commits_since_sha(since_sha: str) -> list[str]:
    result = subprocess.run(
        ["git", "log", f"{since_sha}..HEAD", "--pretty=format:%s", "--no-merges"],
        capture_output=True,
        text=True,
        check=True,
    )
    return [line.strip() for line in result.stdout.splitlines() if line.strip()]


def _get_commits_since_days(days: int) -> list[str]:
    result = subprocess.run(
        [
            "git",
            "log",
            f"--since={days} days ago",
            "--pretty=format:%s",
            "--no-merges",
        ],
        capture_output=True,
        text=True,
        check=True,
    )
    return [line.strip() for line in result.stdout.splitlines() if line.strip()]


def _get_head_sha() -> str:
    result = subprocess.run(
        ["git", "rev-parse", "HEAD"],
        capture_output=True,
        text=True,
        check=True,
    )
    return result.stdout.strip()


def _call_copilot(commit_messages: list[str], token: str) -> str:
    if not commit_messages:
        return "No significant changes were made this week."

    user_content = "Recent commits:\n" + "\n".join(f"- {msg}" for msg in commit_messages)

    payload = json.dumps(
        {
            "model": MODEL_NAME,
            "messages": [
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": user_content},
            ],
            "max_tokens": 1024,
            "temperature": 0.3,
        }
    ).encode("utf-8")

    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
        "Accept": "application/json",
    }

    request = Request(COPILOT_API_URL, data=payload, headers=headers, method="POST")

    with urlopen(request, timeout=60) as response:
        body = json.loads(response.read().decode("utf-8"))

    choices = body.get("choices")
    if not choices:
        raise ValueError(f"Unexpected Copilot API response: {body}")
    return choices[0]["message"]["content"].strip()


def generate_changelog(
    output_path: Path,
    since_sha: str | None,
    token: str,
    days: int = 7,
) -> Path:
    if since_sha:
        commits = _get_commits_since_sha(since_sha)
    else:
        commits = _get_commits_since_days(days)

    commits = [c for c in commits if not _is_bot_commit(c)]

    summary = _call_copilot(commits, token)
    head_sha = _get_head_sha()

    changelog = {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "generatedBy": "copilot",
        "headSha": head_sha,
        "commitCount": len(commits),
        "summary": summary,
    }

    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(
        json.dumps(changelog, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )

    return output_path


_DRY_RUN_SUMMARY = """\
### New features
- Added weekly AI-generated changelog surfaced on the homepage.

### Improvements
- Scores and benchmark data are now refreshed on a regular schedule.

### Data updates
- Latest model scores have been synced from upstream providers.
"""


def _dry_run(output_path: Path, days: int) -> Path:
    """Write a sample changelog without calling the Copilot API.

    Useful for local development and smoke-testing the homepage UI.
    """
    commits = _get_commits_since_days(days)
    commits = [c for c in commits if not _is_bot_commit(c)]
    head_sha = _get_head_sha()

    changelog = {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "generatedBy": "dry-run",
        "headSha": head_sha,
        "commitCount": len(commits),
        "summary": _DRY_RUN_SUMMARY.strip(),
    }

    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(
        json.dumps(changelog, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    return output_path


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Generate an AI-powered changelog from recent commits."
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=Path("data/changelog.json"),
        help="Destination path for the generated changelog JSON.",
    )
    parser.add_argument(
        "--since-sha",
        default=os.getenv("SINCE_SHA"),
        help="Collect commits after this SHA.  Falls back to --days.",
    )
    parser.add_argument(
        "--days",
        type=int,
        default=7,
        help="Number of days to look back when --since-sha is not set.",
    )
    parser.add_argument(
        "--token",
        default=os.getenv("GITHUB_TOKEN"),
        help="GitHub token used to call the Copilot API.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help=(
            "Write a sample changelog using placeholder text without calling "
            "the Copilot API.  Useful for local UI smoke-testing."
        ),
    )
    return parser.parse_args()


def main() -> None:
    args = _parse_args()

    if args.dry_run:
        output = _dry_run(
            output_path=args.output.resolve(),
            days=args.days,
        )
        print(f"Dry-run: wrote sample changelog to {output}")
        return

    if not args.token:
        raise SystemExit(
            "No GitHub token found.  Set GITHUB_TOKEN or pass --token."
        )

    output = generate_changelog(
        output_path=args.output.resolve(),
        since_sha=args.since_sha,
        token=args.token,
        days=args.days,
    )
    print(f"Wrote changelog to {output}")


if __name__ == "__main__":
    try:
        main()
    except (HTTPError, URLError, subprocess.CalledProcessError, ValueError) as exc:
        raise SystemExit(str(exc)) from exc
