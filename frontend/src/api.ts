// Thin wrapper over the backend REST API.

export type HistoryFlags = {
  canUndo: boolean
  canRedo: boolean
}

export type UploadResponse = HistoryFlags & {
  session_id: string
  filename: string
  html: string
}

export type ReplaceResponse = HistoryFlags & {
  replaced: number
  html: string
}

export type EditsResponse = HistoryFlags & {
  changed: number
  html: string
}

export type UndoRedoResponse = HistoryFlags & {
  moved: boolean
  html: string
}

export type AppliedReplacement = { old: string; new: string; count: number }
export type AppliedCellFill = { tid: number; text: string }

export type AIChatResponse = HistoryFlags & {
  summary: string
  applied: AppliedReplacement[]
  skipped: AppliedReplacement[]
  applied_cells?: AppliedCellFill[]
  skipped_cells?: AppliedCellFill[]
  html: string
}

export type ProviderInfo = { name: string; default_model: string }

const BASE = '/api'

export async function upload(file: File): Promise<UploadResponse> {
  const fd = new FormData()
  fd.append('file', file)
  const r = await fetch(`${BASE}/upload`, { method: 'POST', body: fd })
  if (!r.ok) throw new Error(await safeError(r))
  return r.json()
}

export async function replaceText(
  sessionId: string,
  oldText: string,
  newText: string,
): Promise<ReplaceResponse> {
  const r = await fetch(`${BASE}/replace/${sessionId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ old: oldText, new: newText, count: -1 }),
  })
  if (!r.ok) throw new Error(await safeError(r))
  return r.json()
}

export async function applyEdits(
  sessionId: string,
  edits: Record<number, string>,
): Promise<EditsResponse> {
  const r = await fetch(`${BASE}/edits/${sessionId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ edits }),
  })
  if (!r.ok) throw new Error(await safeError(r))
  return r.json()
}

export async function undo(sessionId: string): Promise<UndoRedoResponse> {
  const r = await fetch(`${BASE}/undo/${sessionId}`, { method: 'POST' })
  if (!r.ok) throw new Error(await safeError(r))
  return r.json()
}

export async function redo(sessionId: string): Promise<UndoRedoResponse> {
  const r = await fetch(`${BASE}/redo/${sessionId}`, { method: 'POST' })
  if (!r.ok) throw new Error(await safeError(r))
  return r.json()
}

export async function fetchProviders(): Promise<ProviderInfo[]> {
  const r = await fetch(`${BASE}/ai/providers`)
  if (!r.ok) throw new Error(await safeError(r))
  const j = await r.json()
  return j.providers
}

export async function aiChat(
  sessionId: string,
  args: {
    message: string
    provider: string
    model: string
    api_key: string
    reference_text?: string
  },
): Promise<AIChatResponse> {
  const r = await fetch(`${BASE}/ai/chat/${sessionId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
  })
  if (!r.ok) throw new Error(await safeError(r))
  return r.json()
}

export type ReferenceExtractResponse = {
  filename: string
  text: string
  chars: number
}

export async function extractReference(file: File): Promise<ReferenceExtractResponse> {
  const fd = new FormData()
  fd.append('file', file)
  const r = await fetch(`${BASE}/reference/extract`, { method: 'POST', body: fd })
  if (!r.ok) throw new Error(await safeError(r))
  return r.json()
}

export function downloadUrl(sessionId: string): string {
  return `${BASE}/download/${sessionId}`
}

async function safeError(r: Response): Promise<string> {
  try {
    const j = await r.json()
    return j.detail || JSON.stringify(j)
  } catch {
    return `HTTP ${r.status}`
  }
}
