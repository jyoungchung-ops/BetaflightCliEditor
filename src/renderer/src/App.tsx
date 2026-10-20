import { useCallback, useEffect, useMemo, useState } from 'react'
import { TABS, type TabId } from '@shared/tabs'
import { buildSnapshot } from '@shared/cli/parser'
import type { CraftSnapshot, RawCli } from '@shared/cli/types'
import type { FileResult, OpenedFile } from '@shared/ipc'
import { revertEdits } from '@shared/edit/writePlan'
import { changesFileName, changesFileText, fullDiffFileName, fullDiffText } from '@shared/edit/commands'
import { editsOfSavedFile, FileFormatError, fromSavedFile, looksLikeSavedFile, rawFromCliText, toSavedFile } from '@shared/files'
import {
  countByTab,
  effective,
  emptyEditState,
  redo,
  revertAll,
  revertKey,
  setValue as setEditValue,
  undo,
  validateEdits,
  valueOf as editsBaseValue,
  type EditState,
  type Edits
} from '@shared/edit/session'
import { Sidebar } from './components/Sidebar'
import { TopBar } from './components/TopBar'
import { ConnectScreen } from './components/ConnectScreen'
import { NameModal } from './components/NameModal'
import { WriteDialog } from './components/WriteDialog'
import { TabPlaceholder } from './tabs/TabPlaceholder'
import { TAB_VIEWS } from './tabs'
import { SnapshotProvider } from './ui/snapshot'
import { EditProvider, type EditCtx } from './ui/editContext'

/** 서보를 쓰는 믹서 (고정익·트라이 등). 그 밖에는 서보 탭을 숨긴다 */
const SERVO_MIXERS = new Set([
  'TRI', 'CUSTOMTRI', 'AIRPLANE', 'CUSTOMAIRPLANE', 'FLYING_WING', 'BICOPTER', 'DUALCOPTER', 'SINGLECOPTER', 'GIMBAL'
])

interface Loaded {
  snap: CraftSnapshot
  /** 파일에서 열었으면 파일 이름 */
  file?: string
  /** 마지막 저장 이후 바뀜 (새로 읽음·이름 변경) */
  dirty: boolean
}

/** 이름을 받아야 하는 CLI 텍스트 파일 */
interface PendingText {
  raw: RawCli
  fcCraftName: string
  kind: 'dump' | 'diff'
  file: string
  readAt: string
}

type Toast = { kind: 'ok' | 'error'; text: string }

export default function App() {
  const [activeTab, setActiveTab] = useState<TabId>('setup')
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [pending, setPending] = useState<PendingText | null>(null)
  const [replugNotice, setReplugNotice] = useState(false)
  const [toast, setToast] = useState<Toast | null>(null)
  const [dragging, setDragging] = useState(false)
  const [appVersion, setAppVersion] = useState('')
  const [editState, setEditState] = useState<EditState>(emptyEditState)
  /** 마지막으로 저장(또는 연)한 시점의 편집 — 다르면 저장 안 된 변경이 있음 */
  const [savedEdits, setSavedEdits] = useState<Edits>(editState.edits)
  const [editing, setEditing] = useState(false)
  const [writing, setWriting] = useState(false)
  const [revertMode, setRevertMode] = useState(false)
  const [writeKey, setWriteKey] = useState(0)
  const base = loaded?.snap ?? null
  const edits = editState.edits
  const editCount = Object.keys(edits).length
  // 화면은 언제나 원본 + 편집을 그린다 (보기 모드로 돌아가도 편집은 남아 있음)
  const snapshot = useMemo(() => (base ? effective(base, edits) : null), [base, edits])
  const errors = useMemo(() => (base ? validateEdits(base, edits) : {}), [base, edits])
  const canEdit = Boolean(base?.schema && Object.keys(base.schema).length > 0)
  const unsaved = Boolean(loaded?.dirty) || edits !== savedEdits

  const tabs = useMemo(
    () => TABS.filter((t) => t.id !== 'servos' || SERVO_MIXERS.has(snapshot?.mixer?.type ?? '')),
    [snapshot]
  )
  const tab = tabs.find((t) => t.id === activeTab) ?? tabs[0]
  const View = TAB_VIEWS[tab.id]

  useEffect(() => {
    if (!toast) return
    const id = setTimeout(() => setToast(null), toast.kind === 'error' ? 7000 : 4000)
    return () => clearTimeout(id)
  }, [toast])

  const confirmLeave = useCallback(() => {
    if (!unsaved) return true
    const n = Object.keys(edits).length
    return window.confirm(
      n > 0
        ? `저장하지 않은 편집 ${n}개가 있습니다. 버리고 계속할까요?`
        : '저장하지 않은 읽기 결과가 있습니다. 버리고 계속할까요?'
    )
  }, [unsaved, edits])

  /** 새 기체·파일을 보여 준다. 앱은 언제나 보기 모드로 시작 (SPEC 9절) */
  const show = useCallback((snap: CraftSnapshot, opts: { file?: string; dirty: boolean; edits?: Edits }) => {
    setLoaded({ snap, file: opts.file, dirty: opts.dirty })
    const st: EditState = { ...emptyEditState(), edits: opts.edits ?? {} }
    setEditState(st)
    setSavedEdits(st.edits)
    setEditing(false)
    setActiveTab('setup')
  }, [])

  const editCtx = useMemo<EditCtx>(
    () => ({
      editing,
      base,
      edits,
      errors,
      schema: base?.schema,
      setValue: (key, value, opts) => base && setEditState((s) => setEditValue(s, base, key, value, opts)),
      revert: (key) => setEditState((s) => revertKey(s, key))
    }),
    [editing, base, edits, errors]
  )

  // Ctrl+Z / Ctrl+Y (Ctrl+Shift+Z) — 편집 되돌리기·다시 하기
  useEffect(() => {
    if (!base) return
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return
      if ((e.target as HTMLElement | null)?.closest?.('.craft-name-input')) return
      const k = e.key.toLowerCase()
      if (k === 'z' && !e.shiftKey) {
        e.preventDefault()
        setEditState(undo)
      } else if (k === 'y' || (k === 'z' && e.shiftKey)) {
        e.preventDefault()
        setEditState(redo)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [base])

  /** 열기 창·드래그·파일 연결 공용 */
  const handleOpened = useCallback(
    (r: FileResult<OpenedFile> | null) => {
      if (!r) return
      if (!r.ok) {
        if (!r.canceled) setToast({ kind: 'error', text: r.message })
        return
      }
      if (!confirmLeave()) return
      const f = r.value
      try {
        if (looksLikeSavedFile(f.name, f.content)) {
          let json: unknown
          try {
            json = JSON.parse(f.content)
          } catch {
            throw new FileFormatError('JSON 형식이 올바르지 않습니다.')
          }
          const snap = fromSavedFile(json)
          // 원본 값이 지금 원본과 같은 편집만 이어받는다 (파일을 손으로 고친 경우 대비)
          const kept: Edits = {}
          for (const e of Object.values(editsOfSavedFile(json))) {
            const now = editsBaseValue(snap, e.key)
            if (now !== undefined && now === e.before && e.after !== e.before) kept[e.key] = e
          }
          show(snap, { file: f.name, dirty: false, edits: kept })
          setReplugNotice(false)
        } else {
          const { raw, kind, fcCraftName } = rawFromCliText(f.content)
          setPending({ raw, kind, fcCraftName, file: f.name, readAt: f.modifiedAt })
        }
      } catch (e) {
        setToast({ kind: 'error', text: `${f.name}: ${(e as Error).message}` })
      }
    },
    [confirmLeave, show]
  )

  // 앱 버전, 파일로 실행된 경우 그 파일, 실행 중 파일 열기 요청
  useEffect(() => {
    if (!window.bfview) return
    void window.bfview.getAppInfo().then((i) => setAppVersion(i.appVersion))
    void window.bfview.takeLaunchFile().then(handleOpened)
    return window.bfview.onOpenRequest(handleOpened)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 창에 파일 끌어다 놓기
  useEffect(() => {
    const over = (e: DragEvent) => {
      if (!e.dataTransfer?.types.includes('Files')) return
      e.preventDefault()
      setDragging(true)
    }
    const leave = (e: DragEvent) => {
      if (e.relatedTarget === null) setDragging(false)
    }
    const drop = (e: DragEvent) => {
      e.preventDefault()
      setDragging(false)
      const file = e.dataTransfer?.files[0]
      if (file && window.bfview) void window.bfview.readDroppedFile(file).then(handleOpened)
    }
    window.addEventListener('dragover', over)
    window.addEventListener('dragleave', leave)
    window.addEventListener('drop', drop)
    return () => {
      window.removeEventListener('dragover', over)
      window.removeEventListener('dragleave', leave)
      window.removeEventListener('drop', drop)
    }
  }, [handleOpened])

  async function save() {
    if (!loaded) return
    const json = JSON.stringify(toSavedFile(loaded.snap, appVersion, edits), null, 2)
    const r = await window.bfview.saveSnapshot(loaded.snap.craftName, json)
    if (r.ok) {
      setLoaded({ ...loaded, dirty: false })
      setSavedEdits(edits)
      setToast({ kind: 'ok', text: editCount ? `저장했습니다 (편집 ${editCount}개 포함): ${r.value}` : `저장했습니다: ${r.value}` })
    } else if (!r.canceled) setToast({ kind: 'error', text: `저장 실패: ${r.message}` })
  }

  async function exportDiff() {
    if (!loaded) return
    const r = await window.bfview.exportDiff(loaded.snap.craftName, loaded.snap.raw.diffAll)
    if (r.ok) setToast({ kind: 'ok', text: `내보냈습니다: ${r.value}` })
    else if (!r.canceled) setToast({ kind: 'error', text: `내보내기 실패: ${r.message}` })
  }

  const errorCount = Object.keys(errors).length
  const exportBlocked = editCount === 0 ? '편집한 값이 없습니다' : errorCount > 0 ? `오류 ${errorCount}개를 먼저 고치세요` : undefined

  async function exportEdited(kind: 'changes' | 'full') {
    if (!loaded || exportBlocked) return
    try {
      const now = new Date()
      const text = kind === 'changes' ? changesFileText(loaded.snap, edits, appVersion) : fullDiffText(loaded.snap, edits, appVersion)
      if (text === null) return
      const name = kind === 'changes' ? changesFileName(loaded.snap.craftName, now) : fullDiffFileName(loaded.snap.craftName, now)
      const r = await window.bfview.exportText(name, text, kind === 'changes' ? '변경분 CLI 내보내기' : '편집 반영 diff 내보내기')
      if (r.ok) setToast({ kind: 'ok', text: `내보냈습니다: ${r.value}` })
      else if (!r.canceled) setToast({ kind: 'error', text: `내보내기 실패: ${r.message}` })
    } catch (e) {
      setToast({ kind: 'error', text: (e as Error).message })
    }
  }

  /** 쓰기 뒤: 기체에서 다시 읽은 설정이 새 편집 원본. 반영되지 않은 편집만 남긴다 (원래 값 = 지금 기체 값) */
  function written(afterRaw: RawCli) {
    if (!loaded) return
    const snap = buildSnapshot({ craftName: loaded.snap.craftName, readAt: new Date().toISOString(), raw: afterRaw })
    const left: Edits = {}
    for (const e of Object.values(edits)) {
      const now = editsBaseValue(snap, e.key)
      if (now !== undefined && now !== e.after) left[e.key] = { ...e, before: now }
    }
    setLoaded({ snap, file: undefined, dirty: true })
    setEditState({ ...emptyEditState(), edits: left })
    setSavedEdits({})
  }

  /** 백업으로 되돌리기: 지금 기체를 원본으로, 쓰기 직전 값과 다른 것만 편집으로 만들어 같은 절차(1~9)를 다시 연다 */
  function startRevert(nowRaw: RawCli, beforeRaw: RawCli) {
    if (!loaded) return
    const name = loaded.snap.craftName
    const now = buildSnapshot({ craftName: name, readAt: new Date().toISOString(), raw: nowRaw })
    const before = buildSnapshot({ craftName: name, readAt: '', raw: beforeRaw })
    const { edits: back, skipped } = revertEdits(now, before)
    setLoaded({ snap: now, file: undefined, dirty: true })
    setEditState({ ...emptyEditState(), edits: back })
    setSavedEdits({})
    setEditing(true)
    if (Object.keys(back).length === 0) {
      setWriting(false)
      setToast({ kind: 'ok', text: '쓰기 직전 설정과 같습니다. 되돌릴 값이 없습니다.' })
      return
    }
    if (skipped.length) setToast({ kind: 'error', text: `되돌릴 수 없는 항목 ${skipped.length}개: ${skipped.slice(0, 5).join(', ')}` })
    setRevertMode(true)
    setWriteKey((k) => k + 1) // 창을 처음 단계부터 다시
  }

  function rename(craftName: string) {
    if (loaded) setLoaded({ ...loaded, snap: { ...loaded.snap, craftName }, dirty: true })
  }

  function goHome() {
    if (!confirmLeave()) return
    setLoaded(null)
    setReplugNotice(false)
  }

  return (
    <div className="app">
      <TopBar
        craftName={snapshot?.craftName ?? null}
        firmware={snapshot?.meta.firmware ?? null}
        readAt={snapshot?.readAt ?? null}
        offlineFile={loaded?.file}
        canExport={Boolean(snapshot?.raw.diffAll.trim())}
        onRename={rename}
        onSave={() => void save()}
        onExport={() => void exportDiff()}
        onHome={goHome}
        exports={{
          changesBlocked: exportBlocked,
          fullDiffBlocked: exportBlocked ?? (base?.raw.diffAll.trim() ? undefined : 'diff all 원문이 없는 파일입니다'),
          onChanges: () => void exportEdited('changes'),
          onFullDiff: () => void exportEdited('full')
        }}
        edit={
          base
            ? {
                editing,
                canEdit,
                count: editCount,
                errorCount,
                canUndo: editState.past.length > 0,
                canRedo: editState.future.length > 0,
                onToggle: () => setEditing((v) => !v),
                onUndo: () => setEditState(undo),
                onRedo: () => setEditState(redo),
                writeBlocked: !canEdit
                  ? '범위 정보가 없어 쓸 수 없습니다'
                  : editCount === 0
                    ? '편집한 값이 없습니다'
                    : errorCount > 0
                      ? `오류 ${errorCount}개를 먼저 고치세요`
                      : !window.bfview
                        ? '앱에서만 쓸 수 있습니다'
                        : undefined,
                onWrite: () => setWriting(true),
                onRevertAll: () => {
                  if (window.confirm(`편집 ${editCount}개를 모두 원래 값으로 되돌릴까요?`)) setEditState(revertAll)
                }
              }
            : undefined
        }
      />
      {snapshot ? (
        <EditProvider value={editCtx}>
        <SnapshotProvider snap={snapshot}>
          <div className={'app-body' + (editing ? ' editing' : '')}>
            <Sidebar tabs={tabs} active={tab.id} onSelect={setActiveTab} badges={countByTab(edits)} />
            <main className="content">
              {replugNotice && (
                <div className="notice info banner">
                  읽기가 끝났습니다. 기체는 CLI 모드에 남아 있으니 USB를 뽑았다 다시 꽂으세요.
                  <button type="button" className="link" onClick={() => setReplugNotice(false)}>
                    닫기
                  </button>
                </div>
              )}
              {snapshot.raw.dumpAll.trim() === '' && (
                <div className="notice info banner">diff all만 있는 파일입니다. 기본값인 항목은 표시되지 않습니다.</div>
              )}
              {snapshot.raw.diffAll.trim() === '' && (
                <div className="notice info banner">dump만 있는 파일이라 변경 표시(노란 점)가 없습니다.</div>
              )}
              {View ? <View key={`${tab.id}-${snapshot.readAt}`} /> : <TabPlaceholder tab={tab} snapshot={snapshot} />}
            </main>
          </div>
        </SnapshotProvider>
        </EditProvider>
      ) : (
        <ConnectScreen
          onOpenFile={() => void window.bfview.openFile().then(handleOpened)}
          onRead={({ craftName, raw }) => {
            show(buildSnapshot({ craftName, readAt: new Date().toISOString(), raw }), { dirty: true })
            setReplugNotice(true)
          }}
        />
      )}

      {writing && base && (
        <WriteDialog
          key={writeKey}
          base={base}
          edits={edits}
          revert={revertMode}
          onClose={() => {
            setWriting(false)
            setRevertMode(false)
          }}
          onWritten={(raw) => written(raw)}
          onRevert={startRevert}
        />
      )}

      {pending && (
        <NameModal
          title={`CLI ${pending.kind === 'dump' ? 'dump' : 'diff'} 파일 열기 — ${pending.file}`}
          initial={pending.fcCraftName}
          confirmLabel="열기"
          onCancel={() => setPending(null)}
          onConfirm={(craftName) => {
            show(buildSnapshot({ craftName, readAt: pending.readAt, raw: pending.raw }), { file: pending.file, dirty: true })
            setReplugNotice(false)
            setPending(null)
          }}
        />
      )}

      {dragging && (
        <div className="drop-overlay" aria-hidden>
          <div>.bfview.json 또는 CLI .txt 파일을 놓으면 엽니다</div>
        </div>
      )}

      {toast && (
        <div className={`toast ${toast.kind}`} role="status">
          {toast.text}
        </div>
      )}
    </div>
  )
}
