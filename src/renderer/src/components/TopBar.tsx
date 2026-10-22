import { useEffect, useRef, useState } from 'react'
import { ChevronDown, Cpu, Eye, RefreshCw, FileDown, Home, Pencil, Redo2, RotateCcw, Save, SquarePen, Undo2 } from 'lucide-react'
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
  /** v2 편집 내보내기 */
  exports?: ExportMenu
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
  /** 기체에 쓰기 (쓸 수 없으면 이유) */
  writeBlocked?: string
  onWrite(): void
  /** 화면 내용(원본 + 편집)으로 기체 맞추기 (쓸 수 없으면 이유) */
  syncBlocked?: string
  onSync(): void
}

export interface ExportMenu {
  /** 내보낼 수 없는 이유 (없으면 가능) */
  changesBlocked?: string
  fullDiffBlocked?: string
  onChanges(): void
  onFullDiff(): void
}

/** 내보내기 메뉴: 원문 diff · 변경분 CLI · 편집 반영 diff */
function ExportButton({ canExport, onExport, menu }: { canExport?: boolean; onExport?(): void; menu?: ExportMenu }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener('mousedown', close)
    return () => window.removeEventListener('mousedown', close)
  }, [open])
  if (!menu)
    return (
      <button type="button" className="btn" disabled={!canExport} onClick={onExport} title="diff all 원문을 txt로">
        <FileDown size={16} aria-hidden />
        원문 내보내기
      </button>
    )
  const item = (label: string, hint: string, blocked: string | undefined, run?: () => void) => (
    <button
      type="button"
      role="menuitem"
      className="menu-item"
      disabled={Boolean(blocked) || !run}
      title={blocked}
      onClick={() => {
        setOpen(false)
        run?.()
      }}
    >
      <span>{label}</span>
      <span className="menu-hint">{blocked ?? hint}</span>
    </button>
  )
  return (
    <div className="menu-wrap" ref={ref}>
      <button type="button" className="btn" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <FileDown size={16} aria-hidden />
        내보내기
        <ChevronDown size={14} aria-hidden />
      </button>
      {open && (
        <div className="menu" role="menu">
          {item('변경분 CLI (.txt)', 'Betaflight App CLI 탭에 붙여 넣기', menu.changesBlocked, menu.onChanges)}
          {item('편집 반영 전체 diff (.txt)', '원본 diff all + 편집 — 백업용', menu.fullDiffBlocked, menu.onFullDiff)}
          {item('원문 diff all (.txt)', '읽은 그대로, 편집 미반영', canExport ? undefined : 'diff all 원문이 없습니다', onExport)}
        </div>
      )}
    </div>
  )
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
          {e.editing && (
            <button type="button" className="btn btn-danger" disabled={Boolean(e.writeBlocked)} title={e.writeBlocked ?? '변경한 값만 기체에 씁니다 (백업 → 전송 → 재검증)'} onClick={e.onWrite}>
              <Cpu size={16} aria-hidden />
              기체에 쓰기
            </button>
          )}
          {e.editing && (
            <button
              type="button"
              className="btn"
              disabled={Boolean(e.syncBlocked)}
              title={e.syncBlocked ?? '기체를 읽어 이 화면(저장 파일 + 편집)과 다른 값만 써서 맞춥니다. 펌웨어 빌드가 같아야 합니다'}
              onClick={e.onSync}
            >
              <RefreshCw size={16} aria-hidden />
              이 내용으로 기체 맞추기
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

export function TopBar({ craftName, firmware, readAt, offlineFile, canExport, onRename, onSave, onExport, onHome, edit, exports }: Props) {
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
        <ExportButton canExport={loaded && canExport} onExport={onExport} menu={loaded ? exports : undefined} />
        <button type="button" className="btn btn-primary" disabled={!loaded} onClick={onSave}>
          <Save size={16} aria-hidden />
          저장
        </button>
      </div>
    </header>
  )
}
