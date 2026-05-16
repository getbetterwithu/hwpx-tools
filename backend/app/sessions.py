"""In-memory session storage for open documents.

Each upload gets a session_id; subsequent edits and downloads reference it.
Each session keeps an undo/redo history of section snapshots so the
frontend can rewind individual edits.
"""
from __future__ import annotations

import logging
import secrets
import threading

from hwpx_core import HwpxDocument

logger = logging.getLogger("hwpx_tools.session")

MAX_HISTORY = 100  # snapshots; each is a few hundred KB of XML at most


class Session:
    """A live document with undo/redo history.

    The history is a list of section snapshots; `_index` points to the
    currently-active snapshot. A new edit truncates the redo tail.
    """

    def __init__(self, doc: HwpxDocument, filename: str) -> None:
        self.doc = doc
        self.filename = filename
        self._history: list[dict[str, bytes]] = [doc.snapshot_sections()]
        self._index = 0

    # --- mutation hook ----------------------------------------------------

    def record(self, *, auto_revert_on_break: bool = True) -> bool:
        """Push the current document state onto the undo stack.

        Call this AFTER a successful mutation. If validation now reports
        an error and auto_revert_on_break is True, the mutation is rolled
        back to the previous snapshot and False is returned.

        Returns True if the snapshot was recorded, False if it was reverted.
        """
        if auto_revert_on_break:
            report = self.doc.validate()
            if not report.ok:
                # This means our own code (replace_text / apply_edits / AI
                # path) produced a structurally broken result. Users cannot
                # cause this — they only edit text inside <hp:t>. Surface it
                # loudly to our logs so we can fix the bug.
                logger.error(
                    "structural validation failed after mutation in session %s "
                    "(filename=%r) — auto-reverting. errors=%d issues=%s",
                    id(self),
                    self.filename,
                    len(report.errors),
                    [(i.code, i.message, i.where) for i in report.errors[:5]],
                )
                self.doc.restore_sections(self._history[self._index])
                return False

        # Drop the redo tail
        del self._history[self._index + 1 :]
        self._history.append(self.doc.snapshot_sections())
        # Cap size: drop oldest if needed
        if len(self._history) > MAX_HISTORY:
            overflow = len(self._history) - MAX_HISTORY
            self._history = self._history[overflow:]
        self._index = len(self._history) - 1
        return True

    # --- undo / redo ------------------------------------------------------

    def can_undo(self) -> bool:
        return self._index > 0

    def can_redo(self) -> bool:
        return self._index < len(self._history) - 1

    def undo(self) -> bool:
        if not self.can_undo():
            return False
        self._index -= 1
        self.doc.restore_sections(self._history[self._index])
        return True

    def redo(self) -> bool:
        if not self.can_redo():
            return False
        self._index += 1
        self.doc.restore_sections(self._history[self._index])
        return True


class SessionStore:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._items: dict[str, Session] = {}

    def create(self, doc: HwpxDocument, filename: str) -> str:
        sid = secrets.token_urlsafe(12)
        with self._lock:
            self._items[sid] = Session(doc=doc, filename=filename)
        return sid

    def get(self, sid: str) -> Session | None:
        with self._lock:
            return self._items.get(sid)

    def drop(self, sid: str) -> None:
        with self._lock:
            self._items.pop(sid, None)


store = SessionStore()
