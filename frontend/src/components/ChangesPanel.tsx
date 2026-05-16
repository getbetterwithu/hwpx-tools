import type { ChangeRecord } from '../types'

type Props = {
  changes: ChangeRecord[]
  selectedId: string | null
  onSelect: (id: string) => void
  onClear: () => void
}

export function ChangesPanel({ changes, selectedId, onSelect, onClear }: Props) {
  return (
    <div className="changes-panel">
      <div className="changes-head">
        <span>변경 사항 ({changes.length})</span>
        <button onClick={onClear} disabled={changes.length === 0}>
          기록 비우기
        </button>
      </div>
      <div className="changes-list">
        {changes.length === 0 && (
          <div className="changes-empty">아직 변경 사항이 없습니다.</div>
        )}
        {changes
          .slice()
          .reverse()
          .map((c) => (
            <div
              key={c.id}
              className={`change-item change-${c.source}${
                c.id === selectedId ? ' change-selected' : ''
              }${c.tids && c.tids.length > 0 ? ' change-clickable' : ''}`}
              onClick={() => {
                if (c.tids && c.tids.length > 0) onSelect(c.id)
              }}
              title={c.tids && c.tids.length > 0 ? '클릭하면 해당 위치로 이동' : undefined}
            >
              <div className="change-source">
                {c.source === 'manual' && '직접 편집'}
                {c.source === 'replace' && '일괄 변경'}
                {c.source === 'ai' && 'AI'}
                {c.source === 'undo' && '되돌리기'}
                {c.source === 'redo' && '다시 실행'}
              </div>
              <div className="change-desc">{c.description}</div>
              {c.before !== undefined && c.after !== undefined && (
                <div className="change-diff">
                  <span className="diff-before">{truncate(c.before)}</span>
                  <span className="diff-arrow">→</span>
                  <span className="diff-after">{truncate(c.after)}</span>
                </div>
              )}
            </div>
          ))}
      </div>
    </div>
  )
}

function truncate(s: string, n = 60): string {
  return s.length > n ? s.slice(0, n) + '…' : s
}
