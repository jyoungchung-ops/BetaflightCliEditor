import { useState } from 'react'
import { FileDown, Home, Pencil, Save } from 'lucide-react'
import { saveFileName } from '@shared/files'

interface Props {
  craftName: string | null
  firmware: string | null
  readAt: string | null
  /** 파일에서 연 경우 파일 이름 */
  offlineFile?: string
  canExport?: boolean
  onRename?(name: string): void
  onSave?(): void
  onExport?(): void
  onHome?(): void
}

function formatReadAt(iso: string) {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString('ko-KR', { dateStyle: 'medium', timeStyle: 'short' })
}

/** 클릭해서 고치는 기체 이름 */
function CraftName({ name, onRename }: { name: string; onRename?(n: string): void }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(name)

  if (!onRename) return <span className="info-value craft-name">{name}</span>
  if (!editing) {
    return (
      <button
        type="button"
        className="craft-name-btn"
        title={`이름 바꾸기 — 기본 저장 파일: ${saveFileName(name)}`}
        onClick={() => {
          setDraft(name)
          setEditing(true)
        }}
      >
        <span className="info-value craft-name">{name}</span>
        <Pencil size={13} aria-hidden />
      </button>
    )
  }
  const commit = () => {
    const t = draft.trim()
    if (t && t !== name) onRename(t)
    setEditing(false)
  }
  return (
    <input
      className="text-input craft-name-input"
      autoFocus
      value={draft}
      maxLength={100}
      aria-label="기체 이름"
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') commit()
        if (e.key === 'Escape') setEditing(false)
      }}
    />
  )
}

export function TopBar({ craftName, firmware, readAt, offlineFile, canExport, onRename, onSave, onExport, onHome }: Props) {
  const loaded = craftName !== null

  return (
    <header className="topbar">
      <div className="brand">
        <span className="brand-mark" aria-hidden />
        <span className="brand-name">FC CLI Viewer</span>
      </div>

      <div className="topbar-info">
        <div className="info-item">
          <span className="info-label">기체</span>
          {loaded ? <CraftName name={craftName} onRename={onRename} /> : <span className="info-value">—</span>}
        </div>
        <div className="info-item">
          <span className="info-label">펌웨어</span>
          <span className="info-value">{firmware || '—'}</span>
        </div>
        <div className="info-item">
          <span className="info-label">{offlineFile ? '오프라인 파일 · 읽은 시각' : '읽은 시각'}</span>
          <span className="info-value" title={offlineFile}>
            {readAt ? formatReadAt(readAt) : '—'}
          </span>
        </div>
      </div>

      <div className="topbar-actions">
        {loaded && (
          <button type="button" className="btn" onClick={onHome} title="처음 화면 (다른 기체 연결·파일 열기)">
            <Home size={16} aria-hidden />
            처음으로
          </button>
        )}
        <button type="button" className="btn" disabled={!loaded || !canExport} onClick={onExport} title="diff all 원문을 txt로">
          <FileDown size={16} aria-hidden />
          원문 내보내기
        </button>
        <button type="button" className="btn btn-primary" disabled={!loaded} onClick={onSave}>
          <Save size={16} aria-hidden />
          저장
        </button>
      </div>
    </header>
  )
}
