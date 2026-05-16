import { useEffect, useRef, useState } from 'react'
import { CHECKBOX_PAIRS, SYMBOL_CATEGORIES } from '../symbols'

type Props = {
  open: boolean
  onClose: () => void
  onInsert: (ch: string) => void
  onBulkReplace: (from: string, to: string) => void
}

export function SymbolPalette({ open, onClose, onInsert, onBulkReplace }: Props) {
  const [active, setActive] = useState(SYMBOL_CATEGORIES[0].id)
  const ref = useRef<HTMLDivElement>(null)

  // Close on outside click / Escape
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [open, onClose])

  if (!open) return null

  const current = SYMBOL_CATEGORIES.find((c) => c.id === active)!

  return (
    <div className="symbol-popover" ref={ref}>
      <div className="symbol-cats">
        {SYMBOL_CATEGORIES.map((c) => (
          <button
            key={c.id}
            className={c.id === active ? 'active' : ''}
            onClick={() => setActive(c.id)}
          >
            {c.label}
          </button>
        ))}
      </div>
      <div className="symbol-body">
        <div className="symbol-hint">
          기호를 클릭하면 미리보기에서 마지막으로 편집한 위치에 삽입됩니다.
          삽입할 위치가 없으면 클립보드에 복사됩니다.
        </div>
        <div className="symbol-grid">
          {current.items.map((ch) => (
            <button
              key={ch}
              className="symbol-cell"
              onClick={() => onInsert(ch)}
              title={ch}
            >
              {ch}
            </button>
          ))}
        </div>

        {current.id === 'checkbox' && (
          <div className="symbol-toggle-section">
            <div className="symbol-toggle-title">
              문서 전체 일괄 토글
            </div>
            <div className="symbol-toggle-grid">
              {CHECKBOX_PAIRS.map((p) => (
                <button
                  key={p.label}
                  onClick={() => onBulkReplace(p.from, p.to)}
                  className="symbol-toggle-btn"
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
