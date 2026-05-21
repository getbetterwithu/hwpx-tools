import { useCallback, useEffect, useRef, useState } from 'react'
import './App.css'
import { ChangesPanel } from './components/ChangesPanel'
import { ChatPanel } from './components/ChatPanel'
import { PreviewPanel, type PreviewHandle } from './components/PreviewPanel'
import { SettingsDialog } from './components/SettingsDialog'
import { HelpDialog } from './components/HelpDialog'
import { SymbolPalette } from './components/SymbolPalette'
import * as api from './api'
import { useAISettings } from './aiSettings'
import type { ChangeRecord, ChatMessage } from './types'

function App() {
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [filename, setFilename] = useState<string>('')
  const [html, setHtml] = useState<string>('')
  const [yellowTids, setYellowTids] = useState<Set<number>>(new Set())
  const [redTids, setRedTids] = useState<Set<number>>(new Set())
  const [selectedChangeId, setSelectedChangeId] = useState<string | null>(null)
  const [changes, setChanges] = useState<ChangeRecord[]>([])
  const [_redoStack, setRedoStack] = useState<ChangeRecord[]>([])  // popped by undo, restored by redo
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [canUndo, setCanUndo] = useState(false)
  const [canRedo, setCanRedo] = useState(false)
  // "dirty" = has unsaved edits since the last download
  const [dirty, setDirty] = useState(false)

  const [oldText, setOldText] = useState('')
  const [newText, setNewText] = useState('')

  const [aiSettings, setAiSettings] = useAISettings()
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const [thinking, setThinking] = useState(false)
  // Map of retryToken -> the original user message text, so the retry
  // button can resubmit the exact same request with extra hints.
  const [retryMap, setRetryMap] = useState<Record<string, string>>({})

  const [paletteOpen, setPaletteOpen] = useState(false)
  const previewRef = useRef<PreviewHandle>(null)

  // Reference attachment for AI chat (md/txt/pdf)
  const [referenceText, setReferenceText] = useState<string>('')
  const [referenceFilename, setReferenceFilename] = useState<string>('')
  const [referenceChars, setReferenceChars] = useState<number>(0)
  const [referenceBusy, setReferenceBusy] = useState(false)
  const [referenceError, setReferenceError] = useState<string | null>(null)

  const onAttachReference = useCallback(async (file: File) => {
    setReferenceBusy(true)
    setReferenceError(null)
    try {
      const r = await api.extractReference(file)
      setReferenceText(r.text)
      setReferenceFilename(r.filename)
      setReferenceChars(r.chars)
    } catch (e) {
      setReferenceError(e instanceof Error ? e.message : String(e))
    } finally {
      setReferenceBusy(false)
    }
  }, [])

  const onClearReference = useCallback(() => {
    setReferenceText('')
    setReferenceFilename('')
    setReferenceChars(0)
    setReferenceError(null)
  }, [])

  const onSelectChange = useCallback((id: string) => {
    const c = changes.find((ch) => ch.id === id)
    if (!c || !c.tids || c.tids.length === 0) return
    setSelectedChangeId(id)
    setRedTids(new Set(c.tids))
    // Scroll to first tid
    previewRef.current?.scrollToTid(c.tids[0])
  }, [changes])

  const applyFlags = useCallback((r: api.HistoryFlags) => {
    setCanUndo(r.canUndo)
    setCanRedo(r.canRedo)
  }, [])

  // Any new mutation wipes the redo stack (standard undo/redo behavior)
  const clearRedoStack = useCallback(() => setRedoStack([]), [])

  const onSymbolInsert = useCallback((ch: string) => {
    const ok = previewRef.current?.insertAtCaret(ch) ?? false
    if (!ok) {
      // No active caret — fall back to clipboard so user can paste manually
      navigator.clipboard?.writeText(ch).catch(() => {})
      setError(
        `삽입할 위치가 없어 "${ch}"를 클립보드에 복사했습니다. 본문에서 삽입할 자리를 한 번 클릭한 뒤 다시 시도하세요.`,
      )
      setTimeout(() => setError(null), 3500)
    }
  }, [])

  const onSymbolBulkReplace = useCallback(
    async (from: string, to: string) => {
      if (!sessionId) return
      setBusy(true)
      setError(null)
      try {
        const r = await api.replaceText(sessionId, from, to)
        setHtml(r.html)
        const tids = extractTidsContaining(r.html, to)
        setYellowTids((prev) => new Set([...prev, ...tids]))
        setRedTids(new Set())
        setSelectedChangeId(null)
        applyFlags(r)
        if (r.replaced > 0) {
          setChanges((prev) => [
            ...prev,
            {
              id: crypto.randomUUID(),
              source: 'replace',
              description: `"${from}" → "${to}" (${r.replaced}곳)`,
              before: from,
              after: to,
              tids: [...tids],
              timestamp: Date.now(),
            },
          ])
          setDirty(true)
          clearRedoStack()
        }
      } catch (e: unknown) {
        setError((e as Error).message)
      } finally {
        setBusy(false)
      }
    },
    [sessionId],
  )

  // --- upload ----------------------------------------------------------
  const onPickFile = useCallback(async (file: File) => {
    setBusy(true)
    setError(null)
    try {
      const r = await api.upload(file)
      setSessionId(r.session_id)
      setFilename(r.filename)
      setHtml(r.html)
      setYellowTids(new Set()); setRedTids(new Set()); setSelectedChangeId(null)
      setChanges([])
      setRedoStack([])
      setMessages([])
      applyFlags(r)
      setDirty(false)
    } catch (e: unknown) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }, [])

  // --- direct edit (contentEditable blur) -------------------------------
  const onDirectEdit = useCallback(
    async (tid: number, newText: string) => {
      if (!sessionId) return
      setBusy(true)
      try {
        const r = await api.applyEdits(sessionId, { [tid]: newText })
        if (r.changed > 0) {
          setHtml(r.html)
          setYellowTids((prev) => new Set([...prev, tid]))
          setRedTids(new Set())
          setSelectedChangeId(null)
          const cid = crypto.randomUUID()
          setChanges((prev) => [
            ...prev,
            {
              id: cid,
              source: 'manual',
              description: `직접 편집`,
              after: newText,
              tids: [tid],
              timestamp: Date.now(),
            },
          ])
          setDirty(true)
          clearRedoStack()
        }
        applyFlags(r)
      } catch (e: unknown) {
        setError((e as Error).message)
      } finally {
        setBusy(false)
      }
    },
    [sessionId],
  )

  // --- quick replace (toolbar) -----------------------------------------
  const doReplace = async () => {
    if (!sessionId || !oldText) return
    setBusy(true)
    setError(null)
    try {
      const r = await api.replaceText(sessionId, oldText, newText)
      setHtml(r.html)
      const tids = extractTidsContaining(r.html, newText)
      setYellowTids((prev) => new Set([...prev, ...tids]))
      setRedTids(new Set())
      setSelectedChangeId(null)
      if (r.replaced > 0) {
        setChanges((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            source: 'replace',
            description: `"${oldText}" → "${newText}" (${r.replaced}곳)`,
            before: oldText,
            after: newText,
            tids: [...tids],
            timestamp: Date.now(),
          },
        ])
        setDirty(true)
        clearRedoStack()
      }
      applyFlags(r)
    } catch (e: unknown) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  // --- undo / redo -----------------------------------------------------
  const doUndo = useCallback(async () => {
    if (!sessionId || !canUndo || busy) return
    setBusy(true)
    setError(null)
    try {
      const r = await api.undo(sessionId)
      setHtml(r.html)
      setYellowTids(new Set()); setRedTids(new Set()); setSelectedChangeId(null)
      applyFlags(r)
      if (r.moved) {
        // Pop the last change record and push to redo stack
        setChanges((prev) => {
          if (prev.length === 0) return prev
          const last = prev[prev.length - 1]
          setRedoStack((rs) => [...rs, last])
          return prev.slice(0, -1)
        })
      }
    } catch (e: unknown) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }, [sessionId, canUndo, busy])

  const doRedo = useCallback(async () => {
    if (!sessionId || !canRedo || busy) return
    setBusy(true)
    setError(null)
    try {
      const r = await api.redo(sessionId)
      setHtml(r.html)
      setYellowTids(new Set()); setRedTids(new Set()); setSelectedChangeId(null)
      applyFlags(r)
      if (r.moved) {
        // Restore the last popped record from redo stack
        setRedoStack((rs) => {
          if (rs.length === 0) return rs
          const last = rs[rs.length - 1]
          setChanges((prev) => [...prev, last])
          return rs.slice(0, -1)
        })
      }
    } catch (e: unknown) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }, [sessionId, canRedo, busy])

  // Keyboard shortcuts: ⌘Z / ⇧⌘Z (also Ctrl on non-mac)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey
      if (!mod) return
      if (e.key === 'z' || e.key === 'Z') {
        // Skip when focus is in an <input>/<textarea> (those have native undo)
        const t = e.target as HTMLElement | null
        const tag = t?.tagName
        const isContentEditable = t?.isContentEditable
        if (tag === 'INPUT' || tag === 'TEXTAREA' || isContentEditable) return
        e.preventDefault()
        if (e.shiftKey) doRedo()
        else doUndo()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [doUndo, doRedo])

  // --- chat (AI) --------------------------------------------------------
  // Run a single AI turn. `userText` is the original user request; if this
  // is a retry, `hint` carries the prior failure context to prepend.
  const runChat = useCallback(
    async (userText: string, hint?: string) => {
      if (!sessionId) return
      if (!aiSettings.apiKey) {
        setMessages((prev) => [
          ...prev,
          { role: 'user', text: userText },
          {
            role: 'assistant',
            kind: 'error',
            text: 'AI 설정에서 API 키를 먼저 입력해주세요. (우상단 ⚙ AI 설정)',
          },
        ])
        return
      }
      const messageBody = hint ? `${hint}\n\n${userText}` : userText
      setBusy(true)
      setThinking(true)
      setError(null)
      try {
        const r = await api.aiChat(sessionId, {
          message: messageBody,
          provider: aiSettings.provider,
          model: aiSettings.model,
          api_key: aiSettings.apiKey,
          reference_text: referenceText,
        })
        setHtml(r.html)
        applyFlags(r)
        if (r.applied.length > 0) {
          const allTids = new Set<number>()
          const tidsByApplied: number[][] = []
          for (const a of r.applied) {
            const t = [...extractTidsContaining(r.html, a.new)]
            t.forEach((tid) => allTids.add(tid))
            tidsByApplied.push(t)
          }
          setYellowTids((prev) => new Set([...prev, ...allTids]))
          setRedTids(new Set())
          setSelectedChangeId(null)
          setDirty(true)
          clearRedoStack()
          for (let i = 0; i < r.applied.length; i++) {
            const a = r.applied[i]
            setChanges((prev) => [
              ...prev,
              {
                id: crypto.randomUUID(),
                source: 'ai',
                description: `"${a.old}" → "${a.new}" (${a.count}곳)`,
                before: a.old,
                after: a.new,
                tids: tidsByApplied[i],
                timestamp: Date.now(),
              },
            ])
          }
        }
        const lines: string[] = []
        if (r.summary) lines.push(r.summary)
        if (r.applied.length > 0) {
          lines.push(
            `적용: ${r.applied.length}건 (총 ${r.applied.reduce(
              (s, a) => s + a.count,
              0,
            )}곳)`,
          )
        }
        if (r.skipped.length > 0) {
          lines.push(`건너뜀(원문 미발견): ${r.skipped.length}건`)
          for (const sk of r.skipped) {
            lines.push(
              `  · "${truncate(sk.old, 60)}" → "${truncate(sk.new, 60)}"`,
            )
          }
        }
        if (r.applied.length === 0 && r.skipped.length === 0) {
          lines.push('변경 사항 없음.')
        }
        // If nothing applied but AI suggested things, attach a retry button
        const allSkipped =
          r.applied.length === 0 && r.skipped.length > 0
        const retryToken = allSkipped ? crypto.randomUUID() : undefined
        if (retryToken) {
          setRetryMap((prev) => ({
            ...prev,
            [retryToken]: userText,
          }))
        }
        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            text: lines.join('\n'),
            kind: allSkipped ? 'error' : 'normal',
            retryToken,
          },
        ])
      } catch (e: unknown) {
        const msg = (e as Error).message
        const retryToken = crypto.randomUUID()
        setRetryMap((prev) => ({ ...prev, [retryToken]: userText }))
        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            kind: 'error',
            text: `오류: ${msg}`,
            retryToken,
          },
        ])
        setError(msg)
      } finally {
        setBusy(false)
        setThinking(false)
      }
    },
    [sessionId, aiSettings, referenceText],
  )

  const onChatSend = useCallback(
    (text: string) => {
      setMessages((prev) => [...prev, { role: 'user', text }])
      runChat(text)
    },
    [runChat],
  )

  const onChatRetry = useCallback(
    (retryToken: string) => {
      const original = retryMap[retryToken]
      if (!original) return
      // Append a system-style hint to nudge the model toward exact strings
      const hint =
        '(재시도) 이전 응답의 `old` 값들이 본문에 정확히 일치하지 않아 적용되지 않았습니다. ' +
        '본문에 실제로 존재하는 정확한 부분 문자열만 `old`로 제시해주세요. ' +
        '공백·구두점·연도·요일 표기까지 본문과 글자 단위로 동일해야 합니다.\n' +
        '아래는 사용자의 원래 요청입니다:'
      setMessages((prev) => [
        ...prev,
        { role: 'user', text: `(재시도) ${original}` },
      ])
      runChat(original, hint)
    },
    [retryMap, runChat],
  )

  // --- download / new file ---------------------------------------------
  const onDownload = () => {
    if (!sessionId) return
    window.location.href = api.downloadUrl(sessionId)
    setDirty(false)
  }

  const onNewFile = () => {
    if (dirty) {
      const ok = window.confirm(
        '저장되지 않은 변경 사항이 있습니다.\n\n' +
          '새 파일을 열면 저장하지 않은 데이터는 삭제됩니다.\n' +
          '먼저 "다운로드" 버튼으로 파일을 저장하세요.\n\n' +
          '그래도 새 파일을 여시겠습니까?',
      )
      if (!ok) return
    } else if (sessionId) {
      const ok = window.confirm(
        '현재 열려 있는 문서를 닫고 새 파일을 여시겠습니까?',
      )
      if (!ok) return
    }
    if (sessionId) {
      // Best-effort cleanup of server-side session
      fetch(`/api/session/${sessionId}`, { method: 'DELETE' }).catch(() => {})
    }
    setSessionId(null)
    setHtml('')
    setFilename('')
    setChanges([])
    setYellowTids(new Set()); setRedTids(new Set()); setSelectedChangeId(null)
    setMessages([])
    setCanUndo(false)
    setCanRedo(false)
    setDirty(false)
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">hwpx 편집기</div>
        {!sessionId ? (
          <div className="topbar-right">
            <button onClick={() => setHelpOpen(true)}>📄 사용설명서</button>
            <button onClick={() => setSettingsOpen(true)}>⚙ AI 설정</button>
          </div>
        ) : (
          <>
            <div className="topbar-mid">
              <span className="filename" title={filename}>
                {dirty && <span className="dirty-dot" title="저장되지 않은 변경 사항">●</span>}
                {filename}
              </span>
              <div className="undo-group" role="group">
                <button
                  onClick={doUndo}
                  disabled={!canUndo || busy}
                  title="되돌리기 (⌘Z)"
                >
                  ↶ 되돌리기
                </button>
                <button
                  onClick={doRedo}
                  disabled={!canRedo || busy}
                  title="되돌리기 취소 (⇧⌘Z)"
                >
                  ↷ 다시 실행
                </button>
              </div>
              <div className="replace-group">
                <input
                  placeholder="찾을 텍스트"
                  value={oldText}
                  onChange={(e) => setOldText(e.target.value)}
                />
                <span className="arrow">→</span>
                <input
                  placeholder="바꿀 텍스트"
                  value={newText}
                  onChange={(e) => setNewText(e.target.value)}
                />
                <button onClick={doReplace} disabled={busy || !oldText}>
                  일괄 변경
                </button>
              </div>
              <div className="symbol-anchor">
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    setPaletteOpen((v) => !v)
                  }}
                  title="자주 쓰는 기호"
                  className={paletteOpen ? 'active' : ''}
                >
                  Ω 기호
                </button>
                <SymbolPalette
                  open={paletteOpen}
                  onClose={() => setPaletteOpen(false)}
                  onInsert={onSymbolInsert}
                  onBulkReplace={onSymbolBulkReplace}
                />
              </div>
            </div>
            <div className="topbar-right">
              <button onClick={() => setHelpOpen(true)}>📄 사용설명서</button>
              <button onClick={() => setSettingsOpen(true)} title="AI 설정">
                ⚙ AI 설정
              </button>
              <button onClick={onDownload} className="primary">
                ⬇ 다운로드
              </button>
              <button onClick={onNewFile} className="danger" title="현재 문서를 닫고 다른 파일을 엽니다">
                새 파일 열기…
              </button>
            </div>
          </>
        )}
      </header>

      <HelpDialog open={helpOpen} onClose={() => setHelpOpen(false)} />
      <SettingsDialog
        open={settingsOpen}
        initial={aiSettings}
        onClose={() => setSettingsOpen(false)}
        onSave={setAiSettings}
      />

      {error && <div className="error-bar">⚠ {error}</div>}

      {!sessionId ? (
        <Dropzone onPick={onPickFile} busy={busy} />
      ) : (
        <main className="layout">
          <section className="col-chat">
            <ChatPanel
              messages={messages}
              onSend={onChatSend}
              onRetry={onChatRetry}
              busy={busy}
              thinking={thinking}
              reference={
                referenceFilename
                  ? { filename: referenceFilename, chars: referenceChars }
                  : null
              }
              onAttachReference={onAttachReference}
              onClearReference={onClearReference}
              attachBusy={referenceBusy}
              attachError={referenceError}
            />
          </section>
          <section className="col-preview">
            <PreviewPanel
              ref={previewRef}
              html={html}
              yellowTids={yellowTids} redTids={redTids}
              onEdit={onDirectEdit}
            />
          </section>
          <section className="col-changes">
            <ChangesPanel
              changes={changes}
              selectedId={selectedChangeId}
              onSelect={onSelectChange}
              onClear={() => {
                setChanges([])
                setYellowTids(new Set())
                setRedTids(new Set())
                setSelectedChangeId(null)
              }}
            />
          </section>
        </main>
      )}
      <footer className="appfooter">
        © 2026 edge · <a href="mailto:jclover2@snu.ac.kr">jclover2@snu.ac.kr</a>
      </footer>
    </div>
  )
}

function Dropzone({
  onPick,
  busy,
}: {
  onPick: (f: File) => void
  busy: boolean
}) {
  const [dragOver, setDragOver] = useState(false)

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    if (busy) return
    const file = e.dataTransfer.files?.[0]
    if (!file) return
    if (!file.name.toLowerCase().endsWith('.hwpx')) {
      alert('hwpx 파일만 업로드할 수 있습니다.')
      return
    }
    onPick(file)
  }

  return (
    <div
      className={`dropzone ${dragOver ? 'dropzone--over' : ''}`}
      onDragOver={(e) => {
        e.preventDefault()
        if (!busy) setDragOver(true)
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={onDrop}
    >
      <div className="dropzone-inner">
        <h2>hwpx 파일을 업로드하세요</h2>
        <p className="muted">
          파일을 끌어다 놓거나, 아래 버튼으로 선택할 수 있습니다.
          <br />
          업로드 후 미리보기에서 직접 편집하거나 AI에게 일괄 수정을 요청할 수
          있습니다.
        </p>
        <label className="file-btn">
          {busy ? '불러오는 중…' : '파일 선택'}
          <input
            type="file"
            accept=".hwpx"
            disabled={busy}
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) onPick(f)
            }}
          />
        </label>
      </div>
    </div>
  )
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n) + '…' : s
}

function extractTidsContaining(html: string, needle: string): Set<number> {
  if (!needle) return new Set()
  const out = new Set<number>()
  const doc = new DOMParser().parseFromString(html, 'text/html')
  doc.querySelectorAll('span.hwpx-t[data-tid]').forEach((el) => {
    const text = el.textContent ?? ''
    if (text.includes(needle)) {
      const tid = Number((el as HTMLElement).dataset.tid)
      if (!Number.isNaN(tid)) out.add(tid)
    }
  })
  return out
}

export default App
