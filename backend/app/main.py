"""FastAPI app: upload, preview, edit, download HWPX documents.

Run from the backend/ directory:
    .venv/bin/uvicorn app.main:app --reload --port 8000
"""
from __future__ import annotations

import io
from pathlib import Path
from urllib.parse import quote

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from hwpx_core import HwpxDocument, ValidationReport

from .ai import ProviderError, available_providers, get_provider
from .ai.prompt import build_system_prompt
from .sessions import Session, store

app = FastAPI(title="hwpx-tools backend", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# API 라우터 — 로컬 개발(vite proxy: /api → 8000)과 프로덕션(same-origin /api) 모두 동작
from fastapi import APIRouter
router = APIRouter(prefix="/api")

# 프론트엔드 정적 파일 서빙 (Railway 배포 시)
_STATIC_DIR = Path(__file__).resolve().parent.parent.parent / "frontend" / "dist"
if _STATIC_DIR.exists():
    app.mount("/assets", StaticFiles(directory=_STATIC_DIR / "assets"), name="assets")
    app.mount("/samples", StaticFiles(directory=_STATIC_DIR / "samples"), name="samples")


# ---------- response models -----------------------------------------------

class IssueOut(BaseModel):
    severity: str
    code: str
    message: str
    where: str = ""


class ValidationSummary(BaseModel):
    ok: bool
    errors: int
    warnings: int
    issues: list[IssueOut] = []


def _summarize(report: ValidationReport, include_issues: bool = False) -> ValidationSummary:
    return ValidationSummary(
        ok=report.ok,
        errors=len(report.errors),
        warnings=len(report.warnings),
        issues=(
            [IssueOut(**i.__dict__) for i in report.issues]
            if include_issues
            else []
        ),
    )


class HistoryFlags(BaseModel):
    canUndo: bool
    canRedo: bool


class UploadResponse(HistoryFlags):
    session_id: str
    filename: str
    html: str


class PreviewResponse(HistoryFlags):
    html: str


class ReplaceRequest(BaseModel):
    old: str
    new: str
    count: int = -1


class ReplaceResponse(HistoryFlags):
    replaced: int
    html: str


class EditsRequest(BaseModel):
    edits: dict[int, str]


class EditsResponse(HistoryFlags):
    changed: int
    html: str


class UndoRedoResponse(HistoryFlags):
    moved: bool
    html: str


def _flags(s: Session) -> dict:
    return {"canUndo": s.can_undo(), "canRedo": s.can_redo()}


def _require(session_id: str) -> Session:
    s = store.get(session_id)
    if s is None:
        raise HTTPException(status_code=404, detail="session not found")
    return s


# ---------- routes --------------------------------------------------------

@router.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@router.post("/upload", response_model=UploadResponse)
async def upload(file: UploadFile = File(...)) -> UploadResponse:
    if not file.filename or not file.filename.lower().endswith(".hwpx"):
        raise HTTPException(status_code=400, detail="Please upload a .hwpx file")
    data = await file.read()
    try:
        doc = HwpxDocument.open(data)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to parse hwpx: {e}")
    html = doc.to_html()
    sid = store.create(doc, filename=file.filename)
    session = _require(sid)
    return UploadResponse(
        session_id=sid, filename=file.filename, html=html, **_flags(session)
    )


@router.get("/preview/{session_id}", response_model=PreviewResponse)
def preview(session_id: str) -> PreviewResponse:
    s = _require(session_id)
    return PreviewResponse(html=s.doc.to_html(), **_flags(s))


@router.post("/replace/{session_id}", response_model=ReplaceResponse)
def replace_text(session_id: str, body: ReplaceRequest) -> ReplaceResponse:
    s = _require(session_id)
    n = s.doc.replace_text(body.old, body.new, count=body.count)
    if n > 0:
        s.record()
    html = s.doc.to_html()
    return ReplaceResponse(replaced=n, html=html, **_flags(s))


@router.post("/edits/{session_id}", response_model=EditsResponse)
def apply_edits(session_id: str, body: EditsRequest) -> EditsResponse:
    s = _require(session_id)
    changed = s.doc.apply_edits(body.edits)
    if changed > 0:
        s.record()
    html = s.doc.to_html()
    return EditsResponse(changed=changed, html=html, **_flags(s))


@router.post("/undo/{session_id}", response_model=UndoRedoResponse)
def undo(session_id: str) -> UndoRedoResponse:
    s = _require(session_id)
    moved = s.undo()
    return UndoRedoResponse(moved=moved, html=s.doc.to_html(), **_flags(s))


@router.post("/redo/{session_id}", response_model=UndoRedoResponse)
def redo(session_id: str) -> UndoRedoResponse:
    s = _require(session_id)
    moved = s.redo()
    return UndoRedoResponse(moved=moved, html=s.doc.to_html(), **_flags(s))


@router.get("/validate/{session_id}", response_model=ValidationSummary)
def validate_session(session_id: str) -> ValidationSummary:
    """Run a full structural check; returns all issues (errors + warnings)."""
    s = _require(session_id)
    return _summarize(s.doc.validate(), include_issues=True)


@router.get("/download/{session_id}")
def download(session_id: str) -> StreamingResponse:
    s = _require(session_id)
    # If validation now fails, it's almost certainly a bug in OUR code —
    # users can only edit <hp:t> text, which the core never lets break the
    # structure. Log loudly so we can find and fix it; do not surface to
    # the user, since they have no actionable response.
    report = s.doc.validate()
    if not report.ok:
        import logging
        logging.getLogger("hwpx_tools.download").error(
            "download produced a structurally invalid hwpx — session=%s file=%r errors=%s",
            session_id, s.filename,
            [(i.code, i.message, i.where) for i in report.errors[:5]],
        )
    data = s.doc.to_bytes()
    filename_q = quote(s.filename)
    return StreamingResponse(
        io.BytesIO(data),
        media_type="application/hwp+zip",
        headers={
            "Content-Disposition": f"attachment; filename*=UTF-8''{filename_q}",
        },
    )


@router.delete("/session/{session_id}")
def drop(session_id: str) -> dict[str, str]:
    store.drop(session_id)
    return {"status": "dropped"}


# ---------- AI -----------------------------------------------------------

class AIChatRequest(BaseModel):
    message: str
    provider: str
    model: str
    api_key: str
    reference_text: str = ""


class ReferenceExtractResponse(BaseModel):
    filename: str
    text: str
    chars: int


_REFERENCE_MAX_BYTES = 10 * 1024 * 1024  # 10 MB
_REFERENCE_MAX_CHARS = 200_000


def _extract_pdf_text(data: bytes) -> str:
    from pypdf import PdfReader
    reader = PdfReader(io.BytesIO(data))
    parts: list[str] = []
    for page in reader.pages:
        try:
            parts.append(page.extract_text() or "")
        except Exception:
            continue
    return "\n\n".join(p for p in parts if p.strip())


@router.post("/reference/extract", response_model=ReferenceExtractResponse)
async def reference_extract(file: UploadFile = File(...)) -> ReferenceExtractResponse:
    name = (file.filename or "").lower()
    ext = name.rsplit(".", 1)[-1] if "." in name else ""
    if ext not in {"md", "txt", "pdf"}:
        raise HTTPException(status_code=400, detail="md, txt, pdf 파일만 지원합니다.")
    data = await file.read()
    if len(data) > _REFERENCE_MAX_BYTES:
        raise HTTPException(status_code=400, detail="파일이 10MB를 초과합니다.")
    try:
        if ext == "pdf":
            text = _extract_pdf_text(data)
        else:
            text = data.decode("utf-8", errors="replace")
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"파일 처리 실패: {e}")
    text = text.strip()
    if not text:
        raise HTTPException(status_code=400, detail="파일에서 텍스트를 추출하지 못했습니다.")
    if len(text) > _REFERENCE_MAX_CHARS:
        text = text[:_REFERENCE_MAX_CHARS] + "\n\n…(이하 생략)"
    return ReferenceExtractResponse(filename=file.filename or "", text=text, chars=len(text))


class AppliedReplacement(BaseModel):
    old: str
    new: str
    count: int


class AIChatResponse(HistoryFlags):
    summary: str
    applied: list[AppliedReplacement]
    skipped: list[AppliedReplacement]  # zero-match entries the AI suggested
    html: str


@router.get("/ai/providers")
def ai_providers() -> dict:
    return {"providers": available_providers()}


@router.post("/ai/chat/{session_id}", response_model=AIChatResponse)
async def ai_chat(session_id: str, body: AIChatRequest) -> AIChatResponse:
    s = _require(session_id)
    if not body.api_key:
        raise HTTPException(status_code=400, detail="API 키가 비어 있습니다.")
    try:
        provider = get_provider(body.provider)
    except KeyError:
        raise HTTPException(status_code=400, detail=f"Unknown provider: {body.provider}")
    document_text = s.doc.extract_text()
    system_prompt = build_system_prompt(body.message, reference_text=body.reference_text)
    try:
        result = await provider.chat(
            api_key=body.api_key,
            model=body.model or provider.default_model,
            system=system_prompt,
            user_text=body.message,
            document_text=document_text,
        )
    except ProviderError as e:
        raise HTTPException(status_code=502, detail=str(e))

    applied: list[AppliedReplacement] = []
    skipped: list[AppliedReplacement] = []
    any_change = False
    for rep in result.replacements:
        n = s.doc.replace_text(rep.old, rep.new, count=-1)
        if n > 0:
            applied.append(AppliedReplacement(old=rep.old, new=rep.new, count=n))
            any_change = True
        else:
            skipped.append(AppliedReplacement(old=rep.old, new=rep.new, count=0))
    if any_change:
        s.record()  # one history step per chat turn
    return AIChatResponse(
        summary=result.summary,
        applied=applied,
        skipped=skipped,
        html=s.doc.to_html(),
        **_flags(s),
    )


app.include_router(router)


# SPA fallback — API 라우트가 아닌 모든 경로를 index.html로
@app.get("/{full_path:path}", include_in_schema=False)
async def spa_fallback(full_path: str):
    index = _STATIC_DIR / "index.html"
    if index.exists():
        return FileResponse(index)
    return {"detail": "frontend not built"}
