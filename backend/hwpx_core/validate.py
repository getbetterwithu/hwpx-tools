"""Structural integrity checks for an in-memory HwpxDocument.

We intentionally do NOT enforce a full XSD schema. The 2024 KS X 6101 spec
has variants the wild doesn't always honor; a too-strict validator would
flag perfectly fine Hancom-produced documents.

Instead we verify the invariants that a *round-trip text edit* must not
break, which are exactly the failure modes that cause Hancom to refuse to
open the document or to render it as a broken structure:

  1. mimetype must be the first ZIP entry, stored uncompressed
  2. Required parts present: content.hpf, header.xml, at least one section
  3. All XML files well-formed
  4. Every IDREF in the body has a definition somewhere reachable
     - charPrIDRef    → header.xml //hh:charPr/@id
     - paraPrIDRef    → header.xml //hh:paraPr/@id
     - styleIDRef     → header.xml //hh:style/@id
     - borderFillIDRef→ header.xml //hh:borderFill/@id
     - binaryItemIDRef→ content.hpf //opf:item/@id (or BinData/<id>.*)
  5. hp:p/@id values are unique within each section

Severity:
  - error:   the document is at risk of failing to open or losing data
  - warning: structurally suspicious but Hancom usually tolerates it
"""
from __future__ import annotations

import re
from dataclasses import dataclass
from io import BytesIO
from typing import Iterable
from zipfile import ZIP_STORED, ZipFile

from lxml import etree

from .ns import NS

HP = NS["hp"]
HH = NS["hh"]
HC = NS["hc"]
HS = NS["hs"]
OPF = NS["opf"]


@dataclass
class ValidationIssue:
    severity: str  # 'error' | 'warning'
    code: str
    message: str
    where: str = ""


@dataclass
class ValidationReport:
    issues: list[ValidationIssue]

    @property
    def ok(self) -> bool:
        return not any(i.severity == "error" for i in self.issues)

    @property
    def errors(self) -> list[ValidationIssue]:
        return [i for i in self.issues if i.severity == "error"]

    @property
    def warnings(self) -> list[ValidationIssue]:
        return [i for i in self.issues if i.severity == "warning"]


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def validate_archive(data: bytes) -> ValidationReport:
    """Validate a fully-packed HWPX archive (bytes)."""
    issues: list[ValidationIssue] = []
    try:
        zf = ZipFile(BytesIO(data), "r")
    except Exception as e:
        return ValidationReport([
            ValidationIssue("error", "zip.unreadable", f"ZIP을 열 수 없음: {e}")
        ])

    _check_mimetype(zf, issues)
    entries = _read_entries(zf)
    _check_required_parts(entries, issues)
    parsed = _parse_xml_entries(entries, issues)
    _check_id_references(parsed, entries, issues)
    return ValidationReport(issues)


def validate_in_memory(sections: dict[str, etree._Element], all_entries: dict[str, bytes]) -> ValidationReport:
    """Validate a document still held in memory (avoids a full ZIP round-trip).

    Use this on the live HwpxDocument before save: it catches the invariants
    that matter without paying the cost of re-zipping.
    """
    issues: list[ValidationIssue] = []
    _check_required_parts(all_entries, issues)
    parsed: dict[str, etree._Element] = {}
    # Sections come pre-parsed from the doc
    for name, root in sections.items():
        parsed[name] = root
    # Header + manifest need parsing
    for name in ("Contents/header.xml", "Contents/content.hpf"):
        if name in all_entries:
            try:
                parsed[name] = etree.fromstring(all_entries[name])
            except etree.XMLSyntaxError as e:
                issues.append(
                    ValidationIssue("error", "xml.malformed", f"XML 파싱 실패: {e}", where=name)
                )
    _check_id_references(parsed, all_entries, issues)
    _check_paragraph_id_uniqueness(sections, issues)
    return ValidationReport(issues)


# ---------------------------------------------------------------------------
# Checks
# ---------------------------------------------------------------------------

def _check_mimetype(zf: ZipFile, issues: list[ValidationIssue]) -> None:
    names = zf.namelist()
    if not names:
        issues.append(ValidationIssue("error", "zip.empty", "아카이브가 비어 있습니다."))
        return
    if names[0] != "mimetype":
        issues.append(ValidationIssue(
            "error", "zip.mimetype_position",
            f"mimetype은 첫 번째 엔트리여야 합니다. (현재: {names[0]!r})"
        ))
    info = zf.getinfo("mimetype") if "mimetype" in names else None
    if info is None:
        issues.append(ValidationIssue("error", "zip.mimetype_missing", "mimetype 엔트리 없음"))
    elif info.compress_type != ZIP_STORED:
        issues.append(ValidationIssue(
            "error", "zip.mimetype_compressed",
            "mimetype은 무압축(STORE)이어야 합니다."
        ))
    else:
        content = zf.read("mimetype")
        if content.strip() != b"application/hwp+zip":
            issues.append(ValidationIssue(
                "error", "zip.mimetype_content",
                f"mimetype 내용이 'application/hwp+zip' 이 아닙니다: {content!r}"
            ))


def _check_required_parts(entries: dict[str, bytes], issues: list[ValidationIssue]) -> None:
    required = ["Contents/content.hpf", "Contents/header.xml"]
    for r in required:
        if r not in entries:
            issues.append(ValidationIssue("error", "part.missing", f"필수 파트 누락: {r}"))
    sections = [n for n in entries if n.startswith("Contents/section") and n.endswith(".xml")]
    if not sections:
        issues.append(ValidationIssue("error", "part.no_section", "본문 섹션이 하나도 없습니다."))


def _parse_xml_entries(entries: dict[str, bytes], issues: list[ValidationIssue]) -> dict[str, etree._Element]:
    parsed: dict[str, etree._Element] = {}
    for name, data in entries.items():
        if not (name.endswith(".xml") or name.endswith(".hpf")):
            continue
        try:
            parsed[name] = etree.fromstring(data)
        except etree.XMLSyntaxError as e:
            issues.append(
                ValidationIssue("error", "xml.malformed", f"XML 파싱 실패: {e}", where=name)
            )
    return parsed


def _check_id_references(
    parsed: dict[str, etree._Element],
    all_entries: dict[str, bytes],
    issues: list[ValidationIssue],
) -> None:
    """Every IDREF in the body must resolve."""
    header = parsed.get("Contents/header.xml")
    manifest = parsed.get("Contents/content.hpf")

    # Collect known IDs from header.xml
    known: dict[str, set[str]] = {
        "charPr": _collect_attr(header, f"{{{HH}}}charPr", "id"),
        "paraPr": _collect_attr(header, f"{{{HH}}}paraPr", "id"),
        "style": _collect_attr(header, f"{{{HH}}}style", "id"),
        "borderFill": _collect_attr(header, f"{{{HH}}}borderFill", "id"),
        "tabPr": _collect_attr(header, f"{{{HH}}}tabPr", "id"),
        "numbering": _collect_attr(header, f"{{{HH}}}numbering", "id"),
        "bullet": _collect_attr(header, f"{{{HH}}}bullet", "id"),
    }
    # Binary items: from content.hpf manifest
    binary_ids = _collect_attr(manifest, f"{{{OPF}}}item", "id") if manifest is not None else set()

    # Walk each section and verify references
    for name, root in parsed.items():
        if not (name.startswith("Contents/section") and name.endswith(".xml")):
            continue
        for elem in root.iter():
            for attr_name, attr_val in elem.attrib.items():
                # Strip namespace if any
                local = attr_name.split("}")[-1]
                if local == "charPrIDRef":
                    _ref_check(known["charPr"], attr_val, "charPrIDRef", name, elem, issues)
                elif local == "paraPrIDRef":
                    _ref_check(known["paraPr"], attr_val, "paraPrIDRef", name, elem, issues)
                elif local == "styleIDRef":
                    _ref_check(known["style"], attr_val, "styleIDRef", name, elem, issues)
                elif local == "borderFillIDRef":
                    _ref_check(known["borderFill"], attr_val, "borderFillIDRef", name, elem, issues)
                elif local == "tabPrIDRef":
                    _ref_check(known["tabPr"], attr_val, "tabPrIDRef", name, elem, issues)
                elif local == "binaryItemIDRef":
                    if attr_val not in binary_ids:
                        # Some HWPX put the file directly under BinData/<id>.<ext>
                        if not _binary_exists_loosely(all_entries, attr_val):
                            issues.append(ValidationIssue(
                                "error", "ref.binary_missing",
                                f"binaryItemIDRef='{attr_val}'를 manifest에서도 BinData/에서도 찾을 수 없음.",
                                where=name,
                            ))


def _ref_check(
    known: set[str],
    val: str,
    kind: str,
    where: str,
    elem: etree._Element,
    issues: list[ValidationIssue],
) -> None:
    if val not in known:
        issues.append(ValidationIssue(
            "error", f"ref.{kind}.missing",
            f"{kind}='{val}'에 대한 정의가 header.xml에 없습니다.",
            where=where,
        ))


def _collect_attr(root: etree._Element | None, tag: str, attr: str) -> set[str]:
    if root is None:
        return set()
    out: set[str] = set()
    for el in root.iter(tag):
        v = el.get(attr)
        if v is not None:
            out.add(v)
    return out


_BINDATA_NAME = re.compile(r"^BinData/([^/.]+)\.[^/]+$")


def _binary_exists_loosely(entries: dict[str, bytes], binary_id: str) -> bool:
    """Allow the binary to be referenced by its file stem under BinData/."""
    target = binary_id.lower()
    for name in entries:
        m = _BINDATA_NAME.match(name)
        if m and m.group(1).lower() == target:
            return True
    return False


def _check_paragraph_id_uniqueness(
    sections: dict[str, etree._Element], issues: list[ValidationIssue]
) -> None:
    hp_p = f"{{{HP}}}p"
    for name, root in sections.items():
        seen: dict[str, int] = {}
        for p in root.iter(hp_p):
            pid = p.get("id")
            if pid is None:
                continue
            seen[pid] = seen.get(pid, 0) + 1
        dups = [k for k, c in seen.items() if c > 1]
        if dups:
            issues.append(ValidationIssue(
                "warning", "para.id_duplicate",
                f"중복된 hp:p/@id: {', '.join(dups[:5])}{'...' if len(dups)>5 else ''}",
                where=name,
            ))


# ---------------------------------------------------------------------------
# Utilities
# ---------------------------------------------------------------------------

def _read_entries(zf: ZipFile) -> dict[str, bytes]:
    return {n: zf.read(n) for n in zf.namelist()}
