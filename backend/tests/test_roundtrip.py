"""End-to-end checks against real samples.

Run with:
  cd backend && .venv/bin/python -m tests.test_roundtrip
"""
from __future__ import annotations

import sys
from pathlib import Path

# Allow running as a script: add backend/ to sys.path
ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from hwpx_core import HwpxDocument  # noqa: E402

PROJECT = ROOT.parent
SAMPLES = PROJECT / "samples"
OUT = Path.home() / "Workspace/99_outputs/hwpx-tools/2026-05-16_phase1-코어"


def find_samples() -> list[Path]:
    return sorted(SAMPLES.glob("*.hwpx"))


def test_open_and_extract(path: Path) -> str:
    doc = HwpxDocument.open(path)
    text = doc.extract_text()
    print(f"  paragraphs (non-empty lines): {sum(1 for l in text.splitlines() if l.strip())}")
    print(f"  total chars: {len(text)}")
    return text


def test_noop_roundtrip(path: Path, out_dir: Path) -> Path:
    """Open and save without changes — should still open in Hangul."""
    doc = HwpxDocument.open(path)
    dest = out_dir / f"{path.stem}__noop.hwpx"
    doc.save(dest)
    print(f"  saved no-op: {dest.name} ({dest.stat().st_size:,} bytes)")
    # Verify it reopens cleanly
    doc2 = HwpxDocument.open(dest)
    assert doc2.extract_text() == doc.extract_text(), "round-trip changed text"
    return dest


def test_year_replace(path: Path, out_dir: Path) -> tuple[Path, int]:
    doc = HwpxDocument.open(path)
    before = doc.extract_text()
    n = doc.replace_text("2026", "2027")
    after = doc.extract_text()
    dest = out_dir / f"{path.stem}__2026to2027.hwpx"
    doc.save(dest)
    # sanity: 2026 count should drop by n; 2027 should increase by n
    assert before.count("2026") - after.count("2026") == n, "count delta mismatch on 2026"
    assert after.count("2027") - before.count("2027") == n, "count delta mismatch on 2027"
    # reopen
    doc2 = HwpxDocument.open(dest)
    assert doc2.extract_text() == after, "saved file diverged from in-memory state"
    print(f"  replaced 2026→2027: {n} occurrence(s)  →  {dest.name}")
    return dest, n


def main() -> int:
    OUT.mkdir(parents=True, exist_ok=True)
    samples = find_samples()
    if not samples:
        print(f"No samples in {SAMPLES}")
        return 1
    print(f"Samples folder: {SAMPLES}")
    print(f"Output folder:  {OUT}\n")

    for path in samples:
        print(f"=== {path.name} ===")
        test_open_and_extract(path)
        test_noop_roundtrip(path, OUT)
        test_year_replace(path, OUT)
        print()
    print("All checks passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
