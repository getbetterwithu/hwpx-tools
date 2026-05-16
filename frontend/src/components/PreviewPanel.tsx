import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'

type Props = {
  html: string
  yellowTids: Set<number>
  redTids: Set<number>
  onEdit: (tid: number, newText: string) => void
}

export type PreviewHandle = {
  insertAtCaret: (text: string) => boolean
  scrollToTid: (tid: number) => void
}

export const PreviewPanel = forwardRef<PreviewHandle, Props>(function PreviewPanel(
  { html, yellowTids, redTids, onEdit }: Props,
  ref,
) {
  const rootRef = useRef<HTMLDivElement>(null)
  const lastFocused = useRef<HTMLElement | null>(null)
  const lastCaretOffset = useRef<number>(0)

  // Re-inject HTML whenever it changes from server
  useEffect(() => {
    if (!rootRef.current) return
    rootRef.current.innerHTML = html
    lastFocused.current = null
    lastCaretOffset.current = 0
  }, [html])

  // Apply yellow highlight to all changed tids
  useEffect(() => {
    if (!rootRef.current) return
    const spans = rootRef.current.querySelectorAll<HTMLElement>('span.hwpx-t[data-tid]')
    spans.forEach((s) => {
      const tid = Number(s.dataset.tid)
      if (yellowTids.has(tid)) s.classList.add('hwpx-highlight-yellow')
      else s.classList.remove('hwpx-highlight-yellow')
    })
  }, [yellowTids, html])

  // Apply red highlight to selected change's tids
  useEffect(() => {
    if (!rootRef.current) return
    const spans = rootRef.current.querySelectorAll<HTMLElement>('span.hwpx-t[data-tid]')
    spans.forEach((s) => {
      const tid = Number(s.dataset.tid)
      if (redTids.has(tid)) s.classList.add('hwpx-highlight-red')
      else s.classList.remove('hwpx-highlight-red')
    })
  }, [redTids, html])

  // focus/blur/caret tracking
  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    const onFocus = (ev: FocusEvent) => {
      const tgt = ev.target as HTMLElement
      if (!tgt?.classList?.contains('hwpx-t')) return
      lastFocused.current = tgt
    }
    const onKeyOrClick = () => {
      const sel = window.getSelection()
      if (!sel || sel.rangeCount === 0) return
      const range = sel.getRangeAt(0)
      const anchor = range.startContainer
      const host =
        anchor.nodeType === Node.TEXT_NODE
          ? (anchor.parentElement as HTMLElement | null)
          : (anchor as HTMLElement)
      if (host && host.classList?.contains('hwpx-t')) {
        lastFocused.current = host
        lastCaretOffset.current = range.startOffset
      }
    }
    const onBlur = (ev: FocusEvent) => {
      const tgt = ev.target as HTMLElement
      if (!tgt?.classList?.contains('hwpx-t')) return
      const tidStr = tgt.dataset.tid
      if (tidStr === undefined) return
      onEdit(Number(tidStr), tgt.innerText)
    }
    root.addEventListener('focus', onFocus, true)
    root.addEventListener('blur', onBlur, true)
    root.addEventListener('keyup', onKeyOrClick, true)
    root.addEventListener('click', onKeyOrClick, true)
    return () => {
      root.removeEventListener('focus', onFocus, true)
      root.removeEventListener('blur', onBlur, true)
      root.removeEventListener('keyup', onKeyOrClick, true)
      root.removeEventListener('click', onKeyOrClick, true)
    }
  }, [onEdit])

  useImperativeHandle(ref, () => ({
    insertAtCaret: (text: string): boolean => {
      const target = lastFocused.current
      if (!target || !rootRef.current?.contains(target)) return false
      const current = target.innerText
      const cleaned = current.replace(/​/g, '')
      const offset = Math.min(lastCaretOffset.current, cleaned.length)
      const next = cleaned.slice(0, offset) + text + cleaned.slice(offset)
      target.innerText = next
      lastCaretOffset.current = offset + text.length
      const tidStr = target.dataset.tid
      if (tidStr !== undefined) onEdit(Number(tidStr), next)
      return true
    },
    scrollToTid: (tid: number): void => {
      const root = rootRef.current
      if (!root) return
      const el = root.querySelector<HTMLElement>(`span.hwpx-t[data-tid="${tid}"]`)
      if (!el) return
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    },
  }))

  return <div ref={rootRef} className="preview-doc" />
})
