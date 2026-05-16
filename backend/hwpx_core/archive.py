"""HWPX archive read/write — preserves OPC packaging rules.

The `mimetype` entry must be the first file in the archive and stored
uncompressed (ZIP_STORED). All other entries are deflated.
"""
from __future__ import annotations

from io import BytesIO
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZIP_STORED, ZipFile


def read_entries(source: str | Path | bytes) -> dict[str, bytes]:
    """Read an HWPX archive into a dict of {entry_name: raw_bytes}."""
    if isinstance(source, (bytes, bytearray)):
        zf_ctx = ZipFile(BytesIO(source), "r")
    else:
        zf_ctx = ZipFile(str(source), "r")
    with zf_ctx as zf:
        return {name: zf.read(name) for name in zf.namelist()}


def write_entries(entries: dict[str, bytes], dest: str | Path | None = None) -> bytes:
    """Pack entries into a valid HWPX archive.

    mimetype is written first, uncompressed. If dest is None, returns bytes.
    """
    if "mimetype" not in entries:
        raise ValueError("Missing required 'mimetype' entry")

    buf = BytesIO()
    with ZipFile(buf, "w", ZIP_DEFLATED) as zf:
        zf.writestr(
            zinfo_or_arcname="mimetype",
            data=entries["mimetype"],
            compress_type=ZIP_STORED,
        )
        for name, data in entries.items():
            if name == "mimetype":
                continue
            zf.writestr(name, data, compress_type=ZIP_DEFLATED)

    data = buf.getvalue()
    if dest is not None:
        Path(dest).write_bytes(data)
    return data
