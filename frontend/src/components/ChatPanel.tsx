import { useEffect, useRef, useState } from 'react'
import type { ChatMessage } from '../types'

export type ReferenceAttachment = {
  filename: string
  chars: number
}

type Props = {
  messages: ChatMessage[]
  onSend: (text: string) => void
  onRetry?: (retryToken: string) => void
  busy: boolean
  thinking?: boolean
  reference?: ReferenceAttachment | null
  onAttachReference?: (file: File) => Promise<void> | void
  onClearReference?: () => void
  attachBusy?: boolean
  attachError?: string | null
}

export function ChatPanel({
  messages,
  onSend,
  onRetry,
  busy,
  thinking,
  reference,
  onAttachReference,
  onClearReference,
  attachBusy,
  attachError,
}: Props) {
  const logRef = useRef<HTMLDivElement>(null)
  // Auto-scroll on new messages
  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight
    }
  }, [messages.length, thinking])
  const [draft, setDraft] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const submit = () => {
    const t = draft.trim()
    if (!t || busy) return
    onSend(t)
    setDraft('')
  }

  return (
    <div className="chat-panel">
      <div className="chat-log" ref={logRef}>
        {messages.length === 0 && (
          <div className="chat-empty">
            예시:
            <br />· "2025를 2026으로 모두 바꿔줘"
            <br />· "날짜의 요일도 함께 갱신해줘"
            <br />· "공모전 이름을 SenGPT에서 KOR-GPT로 바꿔줘"
            <br />
            <br />
            <small>※ 우상단 ⚙에서 API 키를 먼저 입력하세요.</small>
          </div>
        )}
        {messages.map((m, i) => (
          <div
            key={i}
            className={`chat-msg chat-msg-${m.role}${
              m.kind === 'error' ? ' chat-msg-error' : ''
            }`}
          >
            <div className="chat-role">{m.role === 'user' ? '나' : 'AI'}</div>
            <div className="chat-text">{m.text}</div>
            {m.retryToken && onRetry && (
              <button
                className="chat-retry"
                onClick={() => onRetry(m.retryToken!)}
                disabled={busy}
              >
                ↻ 다시 시도
              </button>
            )}
          </div>
        ))}
        {thinking && (
          <div className="chat-msg chat-msg-assistant">
            <div className="chat-role">AI</div>
            <div className="chat-text chat-thinking">
              <span className="dot" /><span className="dot" /><span className="dot" />
              <span className="thinking-label">생각하는 중…</span>
            </div>
          </div>
        )}
      </div>
      {(reference || attachError) && (
        <div className="chat-reference">
          {reference && (
            <div className="chat-reference-chip">
              <span className="chat-reference-icon" aria-hidden>📎</span>
              <span className="chat-reference-name" title={reference.filename}>
                {reference.filename}
              </span>
              <span className="chat-reference-meta">
                ({reference.chars.toLocaleString()}자)
              </span>
              <button
                className="chat-reference-remove"
                onClick={onClearReference}
                disabled={busy || attachBusy}
                title="첨부 제거"
                aria-label="첨부 제거"
              >
                ×
              </button>
            </div>
          )}
          {attachError && <div className="chat-reference-error">{attachError}</div>}
        </div>
      )}
      <div className="chat-input">
        {onAttachReference && (
          <>
            <input
              ref={fileRef}
              type="file"
              accept=".md,.txt,.pdf,text/markdown,text/plain,application/pdf"
              style={{ display: 'none' }}
              onChange={async (e) => {
                const f = e.target.files?.[0]
                e.target.value = ''
                if (f) await onAttachReference(f)
              }}
            />
            <button
              type="button"
              className="chat-attach-btn"
              onClick={() => fileRef.current?.click()}
              disabled={busy || attachBusy}
              title="참고 파일 첨부 (md/txt/pdf)"
              aria-label="참고 파일 첨부"
            >
              {attachBusy ? <span className="spinner" /> : '📎'}
            </button>
          </>
        )}
        <textarea
          placeholder={reference ? 'AI에게 편집 요청 (참고자료 첨부됨)…' : 'AI에게 편집 요청...'}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            // Ignore the keydown while a Korean (or any) IME composition is
            // still in progress — otherwise the in-progress jamo gets
            // committed AFTER submit, leaking into the next message.
            if (e.nativeEvent.isComposing || e.keyCode === 229) return
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.preventDefault()
              submit()
            }
          }}
          rows={3}
        />
        <button onClick={submit} disabled={busy || !draft.trim()}>
          {busy ? (
            <span className="btn-spin"><span className="spinner" /> 처리 중…</span>
          ) : (
            '보내기 (⌘↩)'
          )}
        </button>
      </div>
    </div>
  )
}
