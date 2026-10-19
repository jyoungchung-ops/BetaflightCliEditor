import { useCallback, useEffect, useMemo, useState } from 'react'
import { TABS, type TabId } from '@shared/tabs'
import { buildSnapshot } from '@shared/cli/parser'
import type { CraftSnapshot, RawCli } from '@shared/cli/types'
import type { FileResult, OpenedFile } from '@shared/ipc'
import { FileFormatError, fromSavedFile, looksLikeSavedFile, rawFromCliText, toSavedFile } from '@shared/files'
import { Sidebar } from './components/Sidebar'
import { TopBar } from './components/TopBar'
import { ConnectScreen } from './components/ConnectScreen'
import { NameModal } from './components/NameModal'
import { TabPlaceholder } from './tabs/TabPlaceholder'
import { TAB_VIEWS } from './tabs'
import { SnapshotProvider } from './ui/snapshot'

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
  const snapshot = loaded?.snap ?? null

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

  const confirmLeave = useCallback(
    () => !loaded?.dirty || window.confirm('저장하지 않은 읽기 결과가 있습니다. 버리고 계속할까요?'),
    [loaded]
  )

  const show = useCallback((snap: CraftSnapshot, opts: { file?: string; dirty: boolean }) => {
    setLoaded({ snap, ...opts })
    setActiveTab('setup')
  }, [])

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
          show(fromSavedFile(json), { file: f.name, dirty: false })
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
    const json = JSON.stringify(toSavedFile(loaded.snap, appVersion), null, 2)
    const r = await window.bfview.saveSnapshot(loaded.snap.craftName, json)
    if (r.ok) {
      setLoaded({ ...loaded, dirty: false })
      setToast({ kind: 'ok', text: `저장했습니다: ${r.value}` })
    } else if (!r.canceled) setToast({ kind: 'error', text: `저장 실패: ${r.message}` })
  }

  async function exportDiff() {
    if (!loaded) return
    const r = await window.bfview.exportDiff(loaded.snap.craftName, loaded.snap.raw.diffAll)
    if (r.ok) setToast({ kind: 'ok', text: `내보냈습니다: ${r.value}` })
    else if (!r.canceled) setToast({ kind: 'error', text: `내보내기 실패: ${r.message}` })
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
      />
      {snapshot ? (
        <SnapshotProvider snap={snapshot}>
          <div className="app-body">
            <Sidebar tabs={tabs} active={tab.id} onSelect={setActiveTab} />
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
      ) : (
        <ConnectScreen
          onOpenFile={() => void window.bfview.openFile().then(handleOpened)}
          onRead={({ craftName, raw }) => {
            show(buildSnapshot({ craftName, readAt: new Date().toISOString(), raw }), { dirty: true })
            setReplugNotice(true)
          }}
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
