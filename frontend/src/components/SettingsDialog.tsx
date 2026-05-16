import { useEffect, useState } from 'react'
import * as api from '../api'
import type { AISettings } from '../aiSettings'

type Props = {
  open: boolean
  initial: AISettings
  onClose: () => void
  onSave: (s: AISettings) => void
}

// Suggested model lists per provider. The user can override via the
// custom field; we don't hard-fail on unknown model names.
const MODEL_HINTS: Record<string, string[]> = {
  gemini: ['gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-1.5-pro', 'gemini-1.5-flash'],
  claude: ['claude-opus-4-7', 'claude-sonnet-4-6', 'claude-haiku-4-5-20251001'],
  openai: ['gpt-4o', 'gpt-4o-mini', 'gpt-4.1', 'gpt-4.1-mini'],
}

export function SettingsDialog({ open, initial, onClose, onSave }: Props) {
  const [provider, setProvider] = useState(initial.provider)
  const [model, setModel] = useState(initial.model)
  const [apiKey, setApiKey] = useState(initial.apiKey)
  const [providers, setProviders] = useState<api.ProviderInfo[]>([])
  const [revealKey, setRevealKey] = useState(false)

  useEffect(() => {
    if (!open) return
    setProvider(initial.provider)
    setModel(initial.model)
    setApiKey(initial.apiKey)
    api.fetchProviders().then(setProviders).catch(() => setProviders([]))
  }, [open, initial])

  if (!open) return null

  const onChangeProvider = (next: string) => {
    setProvider(next)
    // Reset model to that provider's default when switching
    const info = providers.find((p) => p.name === next)
    setModel(info?.default_model ?? MODEL_HINTS[next]?.[0] ?? '')
  }

  const submit = () => {
    onSave({ provider, model: model.trim(), apiKey: apiKey.trim() })
    onClose()
  }

  const hints = MODEL_HINTS[provider] ?? []

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>AI 설정</h3>

        <div className="form-row">
          <label>프로바이더</label>
          <div className="provider-options">
            {(['gemini', 'claude', 'openai'] as const).map((p) => (
              <label key={p} className="radio">
                <input
                  type="radio"
                  name="provider"
                  checked={provider === p}
                  onChange={() => onChangeProvider(p)}
                />
                <span>{labelFor(p)}</span>
              </label>
            ))}
          </div>
        </div>

        <div className="form-row">
          <label>모델</label>
          <input
            type="text"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            placeholder="모델 ID"
            list={`models-${provider}`}
          />
          <datalist id={`models-${provider}`}>
            {hints.map((m) => (
              <option key={m} value={m} />
            ))}
          </datalist>
          <small className="muted">
            추천: {hints.slice(0, 3).join(', ')}
          </small>
        </div>

        <div className="form-row">
          <label>API 키</label>
          <div className="key-row">
            <input
              type={revealKey ? 'text' : 'password'}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={placeholderFor(provider)}
              autoComplete="off"
              spellCheck={false}
            />
            <button type="button" onClick={() => setRevealKey((v) => !v)}>
              {revealKey ? '숨기기' : '보기'}
            </button>
          </div>
          <small className="muted">
            키는 이 브라우저(localStorage)에만 저장되며, 매 요청 시 백엔드를 거쳐
            해당 프로바이더로 전달됩니다. 서버 디스크에는 저장되지 않습니다.
          </small>
        </div>

        <div className="modal-actions">
          <button onClick={onClose}>취소</button>
          <button className="primary" onClick={submit}>
            저장
          </button>
        </div>
      </div>
    </div>
  )
}

function labelFor(p: string): string {
  switch (p) {
    case 'gemini': return 'Google Gemini'
    case 'claude': return 'Anthropic Claude'
    case 'openai': return 'OpenAI'
    default: return p
  }
}

function placeholderFor(p: string): string {
  switch (p) {
    case 'gemini': return 'AIza... (Google AI Studio)'
    case 'claude': return 'sk-ant-...'
    case 'openai': return 'sk-...'
    default: return 'API key'
  }
}
