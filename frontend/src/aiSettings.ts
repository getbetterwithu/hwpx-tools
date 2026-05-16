// AI provider settings stored in localStorage.
// We keep this simple — the API key lives only in the browser; it is never
// persisted server-side. Each chat request carries the key in the body.

import { useEffect, useState } from 'react'

export type AISettings = {
  provider: string  // 'gemini' | 'claude' | 'openai'
  model: string
  apiKey: string
}

const STORAGE_KEY = 'hwpx-tools.ai-settings.v1'

export const DEFAULT_SETTINGS: AISettings = {
  provider: 'gemini',
  model: 'gemini-2.5-pro',
  apiKey: '',
}

export function loadSettings(): AISettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_SETTINGS
    const parsed = JSON.parse(raw) as Partial<AISettings>
    return { ...DEFAULT_SETTINGS, ...parsed }
  } catch {
    return DEFAULT_SETTINGS
  }
}

export function saveSettings(s: AISettings): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(s))
}

export function useAISettings() {
  const [settings, setSettings] = useState<AISettings>(() => loadSettings())
  useEffect(() => {
    saveSettings(settings)
  }, [settings])
  return [settings, setSettings] as const
}
