import { useEffect, useState } from 'react'
import { FolderOpen, Plug, RefreshCw } from 'lucide-react'
import type { RawCli } from '@shared/cli/types'
import { READ_COMMANDS, type ReadProgress } from '@shared/serial'
import { usePorts } from '../hooks/usePorts'
import { NameModal } from './NameModal'

interface Props {
  /** 읽기 완료: 사용자가 입력한 기체 이름과 원문 */
  onRead(result: { craftName: string; raw: RawCli }): void
  onOpenFile(): void
}

type Phase = 'idle' | 'connecting' | 'naming' | 'reading'

const STAGE_LABEL: Record<string, string> = {
  opening: '포트 여는 중',
  entering: 'CLI 모드 진입 중',
  done: '완료'
}

export function ConnectScreen({ onRead, onOpenFile }: Props) {
  const [phase, setPhase] = useState<Phase>('idle')
  const [fcName, setFcName] = useState('')
  const [selected, setSelected] = useState('')
  const [progress, setProgress] = useState<ReadProgress | null>(null)
  const [error, setError] = useState<string | null>(null)
  const { ports, error: listError, refresh } = usePorts(phase === 'idle')
  const hasBridge = Boolean(window.bfview)

  // 선택한 포트가 사라지면 첫 번째(FC 추정 우선)로
  useEffect(() => {
    if (!ports.some((p) => p.path === selected)) setSelected(ports[0]?.path ?? '')
  }, [ports, selected])

  useEffect(() => window.bfview?.onReadProgress(setProgress), [])

  async function connect() {
    setError(null)
    setProgress(null)
    setPhase('connecting')
    const c = await window.bfview.connect(selected)
    if (!c.ok) {
      setError(c.message)
      setPhase('idle')
      return
    }
    // 연결 성공 → 기체 이름 입력 (기본값 = FC의 craft_name)
    setFcName(c.value.craftName)
    setPhase('naming')
  }

  async function startRead(craftName: string) {
    setPhase('reading')
    const r = await window.bfview.readAll()
    if (!r.ok) {
      setError(r.message)
      setPhase('idle')
      return
    }
    onRead({ craftName, raw: r.value })
  }

  async function cancelNaming() {
    await window.bfview.disconnect()
    setPhase('idle')
    setError('연결을 취소했습니다. 기체는 CLI 모드에 남아 있으니 USB를 뽑았다 다시 꽂으세요.')
  }

  const busy = phase !== 'idle'

  return (
    <div className="connect">
      <div className="panel connect-card">
        <div className="panel-title">기체 연결</div>
        <div className="panel-body">
          {!hasBridge && <p className="notice warn">데스크톱 앱(Electron)에서 실행해야 시리얼 포트를 쓸 수 있습니다.</p>}

          <label className="field-label" htmlFor="port">
            COM 포트
          </label>
          <div className="row">
            <select
              id="port"
              className="select"
              value={selected}
              disabled={busy || ports.length === 0}
              onChange={(e) => setSelected(e.target.value)}
            >
              {ports.length === 0 && <option value="">포트 없음</option>}
              {ports.map((p) => (
                <option key={p.path} value={p.path}>
                  {p.label}
                </option>
              ))}
            </select>
            <button type="button" className="btn" onClick={() => void refresh()} disabled={busy} title="새로고침">
              <RefreshCw size={16} aria-hidden />
              새로고침
            </button>
          </div>
          {hasBridge && ports.length === 0 && (
            <p className="muted small">
              COM 포트가 보이지 않으면 USB 케이블(데이터용인지)과 장치 관리자의 STM32 Virtual COM Port 드라이버를 확인하세요.
            </p>
          )}
          {listError && <p className="notice error">{listError}</p>}

          <div className="row actions">
            <button
              type="button"
              className="btn btn-primary"
              disabled={!hasBridge || busy || !selected}
              onClick={() => void connect()}
            >
              <Plug size={16} aria-hidden />
              기체 연결
            </button>
            <button type="button" className="btn" disabled={!hasBridge || busy} onClick={onOpenFile}>
              <FolderOpen size={16} aria-hidden />
              저장 파일 열기
            </button>
          </div>

          {busy && phase !== 'naming' && <ProgressView progress={progress} />}
          {error && <p className="notice error">{error}</p>}
          <p className="muted small">
            .bfview.json 저장 파일이나 Betaflight App CLI 탭에서 저장한 .txt를 창에 끌어다 놓아도 열립니다.
          </p>
          <p className="muted small">이 앱은 기체 설정을 읽기만 하며 FC에 아무것도 쓰지 않습니다.</p>
        </div>
      </div>

      {phase === 'naming' && (
        <NameModal
          title="기체 연결됨"
          initial={fcName}
          confirmLabel="읽기 시작"
          note={<p className="muted small">FC에 저장된 이름{fcName ? `(${fcName})` : '이 없어 빈칸'}으로 채웠습니다.</p>}
          onConfirm={(name) => void startRead(name)}
          onCancel={() => void cancelNaming()}
        />
      )}
    </div>
  )
}

function ProgressView({ progress }: { progress: ReadProgress | null }) {
  const stage = progress?.stage ?? 'opening'
  return (
    <div className="progress">
      <ol className="progress-steps">
        {READ_COMMANDS.map((cmd, i) => {
          const idx = progress?.index ?? -1
          const state =
            stage === 'done' || (stage === 'command' && i < idx) ? 'done' : stage === 'command' && i === idx ? 'active' : ''
          return (
            <li key={cmd} className={state}>
              <code>{cmd}</code>
              {state === 'active' && <span className="muted"> · {progress?.lines ?? 0}줄 수신</span>}
            </li>
          )
        })}
      </ol>
      {stage !== 'command' && <p className="muted">{STAGE_LABEL[stage]}…</p>}
      {stage === 'command' && progress?.index === undefined && <p className="muted">기체 이름 읽는 중…</p>}
    </div>
  )
}
