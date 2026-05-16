"""HwpxDocument — open, edit, save .hwpx files preserving formatting.

Phase 1 scope:
  - extract_text(): plain text for previews / AI input
  - replace_text(old, new): safe text substitution across all sections,
    including table cells, headers, and footers
  - save(path): repack the archive

Safety guarantee: only text inside <hp:t> elements is modified. All other
XML structure (styles, run boundaries, table layout, images, scripts) is
preserved byte-for-byte.
"""
from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from lxml import etree

from typing import TYPE_CHECKING

from .archive import read_entries, write_entries
from .html_view import HtmlRenderer
from .ns import HP_P, HP_T

if TYPE_CHECKING:
    from .validate import ValidationReport

_MIME_BY_EXT = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".bmp": "image/bmp",
    ".svg": "image/svg+xml",
    ".webp": "image/webp",
}


@dataclass
class _TextSpan:
    """A character range inside a single <hp:t> element."""
    t_element: etree._Element
    start: int  # offset within t_element.text where this span begins
    end: int    # exclusive


def _iter_paragraph_tspans(paragraph: etree._Element) -> list[_TextSpan]:
    """Return the ordered text spans of a paragraph.

    Each <hp:t> contributes one span covering its full text. We deliberately
    do not descend into nested tables here — table cells contain their own
    <hp:p> elements which are walked separately by the section iterator.
    """
    spans: list[_TextSpan] = []
    for t in paragraph.iter(HP_T):
        # only direct paragraph text — skip <hp:t> inside nested <hp:p>
        # (those will be visited when we iterate that inner paragraph)
        if _nearest_paragraph(t) is not paragraph:
            continue
        text = t.text or ""
        spans.append(_TextSpan(t_element=t, start=0, end=len(text)))
    return spans


def _nearest_paragraph(elem: etree._Element) -> etree._Element | None:
    p = elem.getparent()
    while p is not None and p.tag != HP_P:
        p = p.getparent()
    return p


class HwpxDocument:
    """An open HWPX document.

    Use HwpxDocument.open(path) to load, then call replace_text / extract_text,
    and save(path) to write back. The document keeps every original archive
    entry — only the body-bearing XML parts are mutated in memory.

    Body-bearing parts are any `Contents/*.xml` that can hold paragraphs:
    `section*.xml` (main body), `masterPage*.xml` (header/footer pages),
    `footNote*.xml`, `endNote*.xml`. Crucially we DO NOT include
    `header.xml` — that is the style/format reference library, not body
    text, and must never be touched.
    """

    @staticmethod
    def _is_body_part(name: str) -> bool:
        if not name.startswith("Contents/") or not name.endswith(".xml"):
            return False
        base = name[len("Contents/"):]
        if base == "header.xml":
            return False
        # Anything else under Contents/ that has body content: section,
        # masterPage, footNote, endNote, plus any future variant Hancom may
        # add. The XML parse step below will skip non-OWPML files safely.
        return True

    def __init__(self, entries: dict[str, bytes]):
        self._entries = entries
        self._sections: dict[str, etree._Element] = {}
        for name in entries:
            if not self._is_body_part(name):
                continue
            try:
                root = etree.fromstring(entries[name])
            except etree.XMLSyntaxError:
                # Some Contents/*.xml are non-body (rare). Skip rather than fail.
                continue
            # Only keep parts whose root or descendants carry any text-bearing
            # OWPML element. This makes the heuristic safe even for unrelated
            # XML that happens to land under Contents/.
            if root.find(f".//{HP_T}") is not None or root.find(f".//{HP_P}") is not None:
                self._sections[name] = root
        # last preview's tid -> <hp:t> map, populated by to_html()
        self._t_locator: dict[int, etree._Element] = {}

    # --- construction -----------------------------------------------------

    @classmethod
    def open(cls, source: str | Path | bytes) -> "HwpxDocument":
        return cls(read_entries(source))

    # --- snapshot / restore ----------------------------------------------

    def snapshot_sections(self) -> dict[str, bytes]:
        """Return the current section XMLs as bytes, for undo history."""
        return {
            name: etree.tostring(root)
            for name, root in self._sections.items()
        }

    def restore_sections(self, snapshot: dict[str, bytes]) -> None:
        """Replace the in-memory sections from a previous snapshot."""
        self._sections = {
            name: etree.fromstring(data) for name, data in snapshot.items()
        }
        self._t_locator = {}

    def validate(self) -> "ValidationReport":
        """Run structural checks against the current in-memory state."""
        from .validate import validate_in_memory
        return validate_in_memory(self._sections, self._entries)

    # --- reading ----------------------------------------------------------

    def _iter_paragraphs(self):
        """Yield every <hp:p> in document order across all sections.

        Includes paragraphs nested inside table cells (<hp:subList>).
        """
        for _, root in sorted(self._sections.items()):
            for p in root.iter(HP_P):
                yield p

    def extract_text(self, paragraph_sep: str = "\n") -> str:
        """Return plain text of the document.

        Concatenates <hp:t> content paragraph by paragraph. Suitable for
        previews and as input to an LLM. Tables appear as their cell texts
        in document order.
        """
        lines: list[str] = []
        for p in self._iter_paragraphs():
            spans = _iter_paragraph_tspans(p)
            line = "".join((s.t_element.text or "")[s.start:s.end] for s in spans)
            lines.append(line)
        return paragraph_sep.join(lines)

    # --- preview ----------------------------------------------------------

    def _image_lookup(self, bin_id: str) -> tuple[str, bytes] | None:
        """Resolve a BinData/* image entry by its id (case-insensitive stem)."""
        if not bin_id:
            return None
        target = bin_id.lower()
        for name, data in self._entries.items():
            if not name.startswith("BinData/"):
                continue
            stem = Path(name).stem.lower()
            if stem == target:
                ext = Path(name).suffix.lower()
                return _MIME_BY_EXT.get(ext, "application/octet-stream"), data
        return None

    def to_html(self) -> str:
        """Render the document to preview HTML.

        Also caches a server-side tid -> <hp:t> map so a later
        apply_edits(...) call can target individual text nodes.
        """
        renderer = HtmlRenderer(image_lookup=self._image_lookup)
        html, locator = renderer.render(self._sections)
        self._t_locator = locator
        return html

    def apply_edits(self, edits: dict[int, str]) -> int:
        """Apply per-text-node edits from a previous to_html() preview.

        edits maps tid (int) -> new full text for that <hp:t>. tids that
        aren't in the current locator are ignored.

        Returns the number of <hp:t> elements actually changed.
        """
        if not self._t_locator:
            # No preview rendered yet — render once to populate the map
            self.to_html()
        changed = 0
        for tid, new_text in edits.items():
            try:
                tid_int = int(tid)
            except (TypeError, ValueError):
                continue
            t_elem = self._t_locator.get(tid_int)
            if t_elem is None:
                continue
            if (t_elem.text or "") != new_text:
                t_elem.text = new_text
                changed += 1
        return changed

    # --- mutation ---------------------------------------------------------

    def replace_text(self, old: str, new: str, count: int = -1) -> int:
        """Replace occurrences of `old` with `new` across the document.

        Matching is performed at the paragraph level: the concatenated text
        of all <hp:t> within a paragraph forms a logical string, and matches
        within that string are applied back to the underlying <hp:t> nodes.

        Returns the number of replacements made. count=-1 means replace all.
        """
        if not old:
            raise ValueError("'old' must be a non-empty string")

        replaced = 0
        for p in self._iter_paragraphs():
            if count >= 0 and replaced >= count:
                break
            spans = _iter_paragraph_tspans(p)
            if not spans:
                continue
            remaining = (count - replaced) if count >= 0 else -1
            n = _replace_in_spans(spans, old, new, remaining)
            replaced += n
        return replaced

    # --- saving -----------------------------------------------------------

    def save(self, dest: str | Path) -> None:
        out_entries = dict(self._entries)
        for name, root in self._sections.items():
            out_entries[name] = etree.tostring(
                root, xml_declaration=True, encoding="UTF-8", standalone=True
            )
        write_entries(out_entries, dest)

    def to_bytes(self) -> bytes:
        out_entries = dict(self._entries)
        for name, root in self._sections.items():
            out_entries[name] = etree.tostring(
                root, xml_declaration=True, encoding="UTF-8", standalone=True
            )
        return write_entries(out_entries)


# ---------------------------------------------------------------------------
# replacement engine
# ---------------------------------------------------------------------------

def _replace_in_spans(
    spans: list[_TextSpan], old: str, new: str, max_replacements: int
) -> int:
    """Apply replacements within a paragraph's text spans.

    The spans are the original <hp:t> contents. We build a logical string
    `concat`, find matches, then write back. For matches contained in a
    single span, we splice into that <hp:t>.text only. For matches that
    straddle multiple spans, the replacement text goes into the first
    touched span and the rest are emptied of the matched range.
    """
    if max_replacements == 0:
        return 0

    # Build positional map: index of concat -> (span_idx, offset_within_span)
    pieces: list[str] = []
    span_index_for_char: list[int] = []
    offset_in_span_for_char: list[int] = []
    for i, sp in enumerate(spans):
        text = (sp.t_element.text or "")[sp.start:sp.end]
        pieces.append(text)
        for j in range(len(text)):
            span_index_for_char.append(i)
            offset_in_span_for_char.append(j)
    concat = "".join(pieces)
    if not concat:
        return 0

    # Find all non-overlapping matches left-to-right.
    matches: list[tuple[int, int]] = []  # (start, end)
    search_from = 0
    while True:
        if max_replacements >= 0 and len(matches) >= max_replacements:
            break
        idx = concat.find(old, search_from)
        if idx < 0:
            break
        matches.append((idx, idx + len(old)))
        search_from = idx + len(old)

    if not matches:
        return 0

    # Apply matches from right to left so earlier indices remain valid.
    # Each <hp:t> gets edited in place.
    # We collect, per-span, a list of (local_start, local_end, replacement_or_None)
    # then apply per span.
    edits_per_span: dict[int, list[tuple[int, int, str]]] = {}
    for (g_start, g_end) in matches:
        first_span = span_index_for_char[g_start]
        last_span = span_index_for_char[g_end - 1]
        if first_span == last_span:
            local_start = offset_in_span_for_char[g_start]
            local_end = offset_in_span_for_char[g_end - 1] + 1
            edits_per_span.setdefault(first_span, []).append(
                (local_start, local_end, new)
            )
        else:
            # Replacement goes into first span; subsequent spans lose their
            # share of the matched range entirely.
            first_local_start = offset_in_span_for_char[g_start]
            first_text_len = len(pieces[first_span])
            edits_per_span.setdefault(first_span, []).append(
                (first_local_start, first_text_len, new)
            )
            for mid in range(first_span + 1, last_span):
                mid_text_len = len(pieces[mid])
                edits_per_span.setdefault(mid, []).append(
                    (0, mid_text_len, "")
                )
            last_local_end = offset_in_span_for_char[g_end - 1] + 1
            edits_per_span.setdefault(last_span, []).append(
                (0, last_local_end, "")
            )

    # Apply edits to each <hp:t>.text right-to-left
    for span_idx, edits in edits_per_span.items():
        sp = spans[span_idx]
        text = sp.t_element.text or ""
        # local edits operate on the substring [sp.start:sp.end] of text;
        # for now sp.start == 0 and sp.end == len(text) always, but we
        # keep the math explicit for future re-entrancy.
        sub = text[sp.start:sp.end]
        for local_start, local_end, replacement in sorted(edits, key=lambda e: -e[0]):
            sub = sub[:local_start] + replacement + sub[local_end:]
        new_text = text[:sp.start] + sub + text[sp.end:]
        sp.t_element.text = new_text

    return len(matches)
