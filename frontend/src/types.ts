export type ChatMessage = {
  role: 'user' | 'assistant'
  text: string
  kind?: 'normal' | 'error'
  retryToken?: string  // if set, render a "retry" button bound to this id
}

export type ChangeRecord = {
  id: string
  source: 'manual' | 'ai' | 'replace' | 'undo' | 'redo'
  description: string
  before?: string
  after?: string
  tids?: number[]  // which <hp:t> node ids were affected
  timestamp: number
}
