"""Generate a sitemap.xml for pages inside the src directory.

By default this script:
- reads HTML files from ./src
- writes ./sitemap.xml
- uses https://example.com as the base URL

You can override those defaults with CLI flags.
"""

from __future__ import annotations

import argparse
from datetime import datetime, timezone
from pathlib import Path
from xml.etree.ElementTree import Element, ElementTree, SubElement


def _iter_html_pages(src_dir: Path) -> list[Path]:
    """Return sorted HTML files under src_dir, recursively."""
    return sorted(path for path in src_dir.rglob("*.html") if path.is_file())


def _to_url(base_url: str, src_dir: Path, html_file: Path) -> str:
    """Convert a source HTML path into an absolute page URL."""
    relative = html_file.relative_to(src_dir)
    page_path = "/" if relative.name.lower() == "index.html" else f"/{relative.as_posix()}"
    return f"{base_url.rstrip('/')}{page_path}"


def generate_sitemap(src_dir: Path, output_file: Path, base_url: str) -> int:
    """Create sitemap.xml from HTML files in src_dir.

    Returns the number of URLs written.
    """
    html_files = _iter_html_pages(src_dir)

    urlset = Element(
        "urlset",
        {
            "xmlns": "http://www.sitemaps.org/schemas/sitemap/0.9",
        },
    )

    current_date = datetime.now(timezone.utc).date().isoformat()

    for html_file in html_files:
        url = SubElement(urlset, "url")

        loc = SubElement(url, "loc")
        loc.text = _to_url(base_url, src_dir, html_file)

        lastmod = SubElement(url, "lastmod")
        lastmod.text = current_date

    output_file.parent.mkdir(parents=True, exist_ok=True)
    ElementTree(urlset).write(output_file, encoding="utf-8", xml_declaration=True)

    return len(html_files)


def _parse_args() -> argparse.Namespace:
    project_root = Path(__file__).resolve().parents[1]

    parser = argparse.ArgumentParser(description="Generate sitemap.xml from src HTML files.")
    parser.add_argument(
        "--src",
        type=Path,
        default=project_root / "src",
        help="Directory to scan for HTML files (default: ./src)",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=project_root / "sitemap.xml",
        help="Output sitemap file path (default: ./sitemap.xml)",
    )
    parser.add_argument(
        "--base-url",
        default="https://example.com",
        help="Base site URL, e.g. https://humanmark.org",
    )
    return parser.parse_args()


def main() -> None:
    args = _parse_args()

    src_dir = args.src.resolve()
    output_file = args.output.resolve()

    if not src_dir.exists() or not src_dir.is_dir():
        raise SystemExit(f"Source directory not found: {src_dir}")

    count = generate_sitemap(src_dir=src_dir, output_file=output_file, base_url=args.base_url)
    print(f"Generated {output_file} with {count} URL(s).")


if __name__ == "__main__":
    main()