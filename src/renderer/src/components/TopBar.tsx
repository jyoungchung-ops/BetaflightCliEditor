import { useState } from 'react'
import { Eye, FileDown, Home, Pencil, Redo2, RotateCcw, Save, SquarePen, Undo2 } from 'lucide-react'
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
  edit?: EditBar
}

export interface EditBar {
  editing: boolean
  /** get 범위 정보가 있어야 편집할 수 있다 */
  canEdit: boolean
  count: number
  errorCount: number
  canUndo: boolean
  canRedo: boolean
  onToggle(): void
  onUndo(): void
  onRedo(): void
  onRevertAll(): void
}

export const NO_SCHEMA_MESSAGE = '기체를 한 번 연결해 범위 정보를 읽어야 편집할 수 있습니다'

function EditControls({ e }: { e: EditBar }) {
  return (
    <div className={'edit-bar' + (e.editing ? ' on' : '')}>
      <button
        type="button"
        className={'btn' + (e.editing ? ' btn-edit-on' : '')}
        disabled={!e.canEdit && !e.editing}
        aria-pressed={e.editing}
        title={e.canEdit ? (e.editing ? '보기 모드로 (편집은 남아 있음)' : '편집 모드로') : NO_SCHEMA_MESSAGE}
        onClick={e.onToggle}
      >
        {e.editing ? <Eye size={16} aria-hidden /> : <SquarePen size={16} aria-hidden />}
        {e.editing ? '보기로' : '편집'}
      </button>
      {(e.editing || e.count > 0) && (
        <>
          <button type="button" className="btn btn-icon" disabled={!e.canUndo} onClick={e.onUndo} title="되돌리기 (Ctrl+Z)" aria-label="되돌리기">
            <Undo2 size={16} aria-hidden />
          </button>
          <button type="button" className="btn btn-icon" disabled={!e.canRedo} onClick={e.onRedo} title="다시 하기 (Ctrl+Y)" aria-label="다시 하기">
            <Redo2 size={16} aria-hidden />
          </button>
          <span className="edit-count" role="status">
            변경 {e.count}개
            {e.errorCount > 0 && <span className="edit-errors"> · 오류 {e.errorCount}개</span>}
          </span>
          {e.count > 0 && (
            <button type="button" className="btn btn-small" onClick={e.onRevertAll} title="모든 편집을 원래 값으로">
              <RotateCcw size={14} aria-hidden />
              모두 되돌리기
            </button>
          )}
        </>
      )}
    </div>
  )
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

export function TopBar({ craftName, firmware, readAt, offlineFile, canExport, onRename, onSave, onExport, onHome, edit }: Props) {
  const loaded = craftName !== null

  return (
    <header className="topbar">
      <div className="brand">
        <span className="brand-mark" aria-hidden />
        <span className="brand-name">Betaflight CLI Editor</span>
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
        {edit && <EditControls e={edit} />}
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
