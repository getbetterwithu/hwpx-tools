"""hwpx → HTML preview renderer.

Goal: produce semantically faithful HTML for in-browser preview and direct
editing. We do NOT try to match the document's exact pixel layout. Instead:
  - Paragraphs become <p>
  - Tables become <table>/<tr>/<td>, preserving rowSpan / colSpan
  - Embedded images become <img src="data:..."> (inlined base64)

Each text-bearing element carries data-tid="<paragraph_index>:<t_index>"
so the frontend can map edits back to specific <hp:t> nodes in the doc.
"""
from __future__ import annotations

import base64
from html import escape
from typing import Iterable

from lxml import etree

from .ns import NS

HP = NS["hp"]
HC = NS["hc"]


def _qname(prefix: str, local: str) -> str:
    return f"{{{NS[prefix]}}}{local}"


HP_P = _qname("hp", "p")
HP_RUN = _qname("hp", "run")
HP_T = _qname("hp", "t")
HP_TBL = _qname("hp", "tbl")
HP_TR = _qname("hp", "tr")
HP_TC = _qname("hp", "tc")
HP_SUBLIST = _qname("hp", "subList")
HP_CELLADDR = _qname("hp", "cellAddr")
HP_PIC = _qname("hp", "pic")
HP_LINEBREAK = _qname("hp", "lineBreak")
HP_TAB = _qname("hp", "tab")
HC_IMG = _qname("hc", "img")


class HtmlRenderer:
    """Render an HwpxDocument to HTML for preview.

    Pass `image_lookup(binary_data_id) -> (mime, bytes) | None` so images
    can be inlined. If None, images are rendered as a placeholder.
    """

    def __init__(self, image_lookup=None):
        self.image_lookup = image_lookup
        self._para_index = 0
        self._t_locator: dict[int, etree._Element] = {}

    def render(self, sections: dict[str, etree._Element]) -> tuple[str, dict[int, etree._Element]]:
        """Return (html_string, locator_map).

        locator_map: global text-node index -> the <hp:t> element it came from.
        The frontend never sees this map; it lives server-side so edits can be
        applied to the right node.
        """
        self._para_index = 0
        self._t_locator = {}

        parts: list[str] = ['<div class="hwpx-doc">']
        for _, root in sorted(sections.items()):
            # Iterate only top-level paragraphs of this section; nested
            # paragraphs inside tables are handled by _render_table.
            for child in self._iter_top_paragraphs(root):
                parts.append(self._render_paragraph(child))
        parts.append("</div>")
        return "".join(parts), self._t_locator

    def _iter_top_paragraphs(self, section_root: etree._Element) -> Iterable[etree._Element]:
        for p in section_root.iter(HP_P):
            # Skip paragraphs that are inside table cells; those are emitted
            # when we render the enclosing table.
            ancestor = p.getparent()
            while ancestor is not None:
                if ancestor.tag == HP_TC:
                    break
                ancestor = ancestor.getparent()
            if ancestor is None:
                yield p

    # -- paragraph / runs --------------------------------------------------

    def _render_paragraph(self, p: etree._Element) -> str:
        # If this paragraph contains a top-level table, render the table
        # separately and emit the rest as inline content.
        table_children = [
            run for run in p.findall(HP_RUN)
            if run.find(HP_TBL) is not None
        ]
        if table_children:
            return self._render_paragraph_with_table(p)

        return f'<p class="hwpx-p">{self._render_runs(p)}</p>'

    def _render_paragraph_with_table(self, p: etree._Element) -> str:
        out: list[str] = []
        for run in p.findall(HP_RUN):
            tbl = run.find(HP_TBL)
            if tbl is not None:
                out.append(self._render_table(tbl))
            else:
                inline = self._render_run_inline(run)
                if inline.strip():
                    out.append(f'<p class="hwpx-p">{inline}</p>')
        return "".join(out)

    def _render_runs(self, p: etree._Element) -> str:
        out: list[str] = []
        for run in p.findall(HP_RUN):
            out.append(self._render_run_inline(run))
        return out and "".join(out) or "&nbsp;"

    def _render_run_inline(self, run: etree._Element) -> str:
        out: list[str] = []
        for child in run:
            if child.tag == HP_T:
                tid = len(self._t_locator)
                self._t_locator[tid] = child
                text = escape(child.text or "")
                # Use non-breaking spans so empty cells still take space
                out.append(
                    f'<span class="hwpx-t" data-tid="{tid}" '
                    f'contenteditable="true">{text or "&#8203;"}</span>'
                )
            elif child.tag == HP_LINEBREAK:
                out.append("<br/>")
            elif child.tag == HP_TAB:
                out.append('<span class="hwpx-tab">    </span>')
            elif child.tag == HP_PIC:
                out.append(self._render_picture(child))
            # other ctrls (page numbers, fields, etc.) are ignored for preview
        return "".join(out)

    # -- table -------------------------------------------------------------

    def _render_table(self, tbl: etree._Element) -> str:
        row_cnt = tbl.get("rowCnt") or ""
        col_cnt = tbl.get("colCnt") or ""
        rows_html: list[str] = []
        skip: set[tuple[int, int]] = set()

        for tr in tbl.findall(HP_TR):
            cells_html: list[str] = []
            for tc in tr.findall(HP_TC):
                addr = tc.find(HP_CELLADDR)
                col = int(addr.get("colAddr", "0")) if addr is not None else 0
                row = int(addr.get("rowAddr", "0")) if addr is not None else 0
                if (row, col) in skip:
                    continue
                col_span = int(addr.get("colSpan", "1")) if addr is not None else 1
                row_span = int(addr.get("rowSpan", "1")) if addr is not None else 1
                for dr in range(row_span):
                    for dc in range(col_span):
                        if dr or dc:
                            skip.add((row + dr, col + dc))

                inner_paragraphs: list[str] = []
                sublist = tc.find(HP_SUBLIST)
                if sublist is not None:
                    for cell_p in sublist.findall(HP_P):
                        inner_paragraphs.append(self._render_paragraph(cell_p))
                cell_html = "".join(inner_paragraphs) or "&nbsp;"
                span_attrs = ""
                if col_span > 1:
                    span_attrs += f' colspan="{col_span}"'
                if row_span > 1:
                    span_attrs += f' rowspan="{row_span}"'
                cells_html.append(f"<td{span_attrs}>{cell_html}</td>")
            rows_html.append(f"<tr>{''.join(cells_html)}</tr>")

        attrs = ""
        if row_cnt:
            attrs += f' data-rows="{row_cnt}"'
        if col_cnt:
            attrs += f' data-cols="{col_cnt}"'
        return f'<table class="hwpx-tbl"{attrs}>{"".join(rows_html)}</table>'

    # -- images ------------------------------------------------------------

    def _render_picture(self, pic: etree._Element) -> str:
        img = pic.find(HC_IMG)
        if img is None:
            return ""
        bin_data_id = img.get("binaryItemIDRef") or img.get("BinDataID") or ""
        if self.image_lookup is None or not bin_data_id:
            return '<span class="hwpx-img-placeholder">[image]</span>'
        result = self.image_lookup(bin_data_id)
        if result is None:
            return '<span class="hwpx-img-placeholder">[image]</span>'
        mime, data = result
        b64 = base64.b64encode(data).decode("ascii")
        return f'<img class="hwpx-img" src="data:{mime};base64,{b64}"/>'
