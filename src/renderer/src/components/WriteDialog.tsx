// v2 기체에 쓰기 화면 (SPEC 11절). 단계: 안전 확인 → 연결·읽기 → 일치 검사(충돌이면 묻기) → 미리보기·이름 입력 → 전송 → 결과.
// 명령은 렌더러가 보내지 않는다 — 메인(writeFlow)이 편집에서 다시 만들고 다시 검사한다. 여기 미리보기는 같은 함수로 만든 사본.
import { useEffect, useMemo, useState } from 'react'
import { buildSnapshot } from '@shared/cli/parser'
import type { CraftSnapshot, RawCli } from '@shared/cli/types'
import { buildCommands } from '@shared/edit/commands'
import type { Edits } from '@shared/edit/session'
import { checkBeforeWrite, previewRows, type Mismatch, type PreCheck } from '@shared/edit/writePlan'
import type { WriteFailureInfo, WriteProgressEvent, WriteResultInfo } from '@shared/ipc'
import { TABS } from '@shared/tabs'
import { usePorts } from '../hooks/usePorts'

type Step =
  | { kind: 'safety' }
  | { kind: 'reading' }
  | { kind: 'check'; current: CraftSnapshot; check: PreCheck }
  | { kind: 'preview'; current: CraftSnapshot; check: PreCheck; overwrite: boolean }
  | { kind: 'writing' }
  | { kind: 'done'; result: WriteResultInfo }
  | { kind: 'failed'; failure: WriteFailureInfo }
  | { kind: 'verified'; mismatches: Mismatch[] }

interface Props {
  base: CraftSnapshot
  edits: Edits
  onClose(): void
  /** 쓰기·재검증 뒤 기체의 새 원문 (성공이면 새 편집 원본) */
  onWritten(afterRaw: RawCli, result: WriteResultInfo): void
}

const tabLabel = (id: string) => TABS.find((t) => t.id === id)?.label ?? id

function progressText(p: WriteProgressEvent | null): string {
  if (!p) return ''
  switch (p.stage) {
    case 'read':
    case 'verify':
      return `${p.stage === 'read' ? '읽는 중' : '다시 읽어 대조하는 중'}: ${p.read.command ?? ''} (${p.read.lines}줄)`
    case 'backup':
      return '백업 저장 중'
    case 'send':
      return `보내는 중 ${p.done + 1}/${p.total}: ${p.command}`
    case 'reconnect':
      return '재부팅한 기체를 다시 찾는 중 (최대 15초)'
  }
}

function MismatchTable({ list }: { list: Mismatch[] }) {
  return (
    <div className="table-scroll write-table">
      <table className="grid-table">
        <thead>
          <tr>
            <th className="left">항목</th>
            <th>기대한 값</th>
            <th>기체 값</th>
            <th>종류</th>
          </tr>
        </thead>
        <tbody>
          {list.map((m) => (
            <tr key={m.key}>
              <td className="left mono">{m.key}</td>
              <td className="mono">{m.expected ?? '—'}</td>
              <td className="mono">{m.actual ?? '—'}</td>
              <td>{m.edited ? '편집한 값' : '편집하지 않은 값'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function WriteDialog({ base, edits, onClose, onWritten }: Props) {
  const [step, setStep] = useState<Step>({ kind: 'safety' })
  const [props, setProps] = useState(false)
  const [battery, setBattery] = useState(false)
  const [path, setPath] = useState('')
  const [typed, setTyped] = useState('')
  const [progress, setProgress] = useState<WriteProgressEvent | null>(null)
  const { ports, refresh } = usePorts(step.kind === 'safety')
  const rows = useMemo(() => previewRows(edits), [edits])
  const busy = step.kind === 'reading' || step.kind === 'writing'

  useEffect(() => window.bfview?.onWriteProgress(setProgress), [])
  useEffect(() => {
    if (!ports.some((p) => p.path === path)) setPath(ports[0]?.path ?? '')
  }, [ports, path])

  const close = () => {
    if (busy) return
    // 준비만 하고 닫으면 save 없이 연결을 끊는다
    if (step.kind === 'check' || step.kind === 'preview') void window.bfview.writeCancel()
    onClose()
  }

  async function prepare() {
    setProgress(null)
    setStep({ kind: 'reading' })
    const r = await window.bfview.writePrepare(path)
    if (!r.ok) return setStep({ kind: 'failed', failure: r.failure })
    const current = buildSnapshot({ craftName: base.craftName, readAt: new Date().toISOString(), raw: r.value })
    const check = checkBeforeWrite(base, current, edits)
    if (check.blockers.length || check.conflicts.length) setStep({ kind: 'check', current, check })
    else setStep({ kind: 'preview', current, check, overwrite: false })
  }

  async function write(overwrite: boolean) {
    setProgress(null)
    setStep({ kind: 'writing' })
    const r = await window.bfview.writeExecute({
      base: { craftName: base.craftName, readAt: base.readAt, raw: base.raw },
      edits: Object.values(edits),
      overwriteConflicts: overwrite
    })
    if (!r.ok) return setStep({ kind: 'failed', failure: r.failure })
    onWritten(r.value.afterRaw, r.value)
    setStep({ kind: 'done', result: r.value })
  }

  async function reverify() {
    setProgress(null)
    setStep({ kind: 'reading' })
    const r = await window.bfview.writeVerify({ path, base: { craftName: base.craftName, readAt: base.readAt, raw: base.raw }, edits: Object.values(edits) })
    if (!r.ok) return setStep({ kind: 'failed', failure: r.failure })
    setStep({ kind: 'verified', mismatches: r.value.mismatches })
  }

  const commands = useMemo(() => {
    if (step.kind !== 'preview') return []
    try {
      return buildCommands(base, edits, { noreboot: step.check.support.noreboot })
    } catch {
      return []
    }
  }, [step, base, edits])

  return (
    <div className="modal-backdrop" role="presentation" onKeyDown={(e) => e.key === 'Escape' && close()}>
      <div className="modal panel write-modal" role="dialog" aria-modal="true" aria-labelledby="write-title">
        <div className="panel-title" id="write-title">
          기체에 쓰기 — {base.craftName} · 변경 {rows.length}개
        </div>
        <div className="panel-body modal-body">
          {step.kind === 'safety' && (
            <>
              <p className="notice warn">쓰기 전에 꼭 확인하세요. 모터가 돌 수 있는 설정이 바뀔 수 있습니다.</p>
              <label className="check-line">
                <input type="checkbox" checked={props} onChange={(e) => setProps(e.target.checked)} /> 프로펠러를 분리했습니다
              </label>
              <label className="check-line">
                <input type="checkbox" checked={battery} onChange={(e) => setBattery(e.target.checked)} /> 배터리를 분리했습니다 (USB 전원만)
              </label>
              <label className="field-label" htmlFor="write-port">
                포트
              </label>
              <div className="row">
                <select id="write-port" className="select" value={path} onChange={(e) => setPath(e.target.value)}>
                  {ports.length === 0 && <option value="">포트 없음</option>}
                  {ports.map((p) => (
                    <option key={p.path} value={p.path}>
                      {p.label}
                    </option>
                  ))}
                </select>
                <button type="button" className="btn btn-small" onClick={() => void refresh()}>
                  새로고침
                </button>
              </div>
              <p className="muted small">연결해 지금 기체 설정을 다시 읽고, 편집 원본과 같은 기체·펌웨어인지 확인합니다. 이 단계에서는 아무것도 쓰지 않습니다.</p>
              <div className="row actions modal-actions">
                <button type="button" className="btn" onClick={close}>
                  취소
                </button>
                <button type="button" className="btn btn-primary" disabled={!props || !battery || !path} onClick={() => void prepare()}>
                  다음: 연결해 읽기
                </button>
              </div>
            </>
          )}

          {busy && (
            <div className="write-progress" role="status">
              <div className="spinner" aria-hidden />
              <div>{progressText(progress) || (step.kind === 'reading' ? '연결하는 중' : '쓰는 중')}</div>
              {step.kind === 'writing' && <p className="muted small">USB를 뽑지 마세요. 중간에 끊기면 save 전이라 기체는 원래 설정으로 돌아갑니다.</p>}
            </div>
          )}

          {step.kind === 'check' && (
            <>
              {step.check.blockers.length > 0 ? (
                <>
                  <div className="notice error">
                    쓸 수 없습니다:
                    <ul>
                      {step.check.blockers.map((b) => (
                        <li key={b}>{b}</li>
                      ))}
                    </ul>
                  </div>
                  <div className="row actions modal-actions">
                    <button type="button" className="btn btn-primary" onClick={close}>
                      닫기
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div className="notice warn">원본을 읽은 뒤 기체 설정이 바뀐 항목이 있습니다 ({step.check.conflicts.length}개).</div>
                  <div className="table-scroll write-table">
                    <table className="grid-table">
                      <thead>
                        <tr>
                          <th className="left">항목</th>
                          <th>편집 원본</th>
                          <th>지금 기체</th>
                          <th>내 편집</th>
                        </tr>
                      </thead>
                      <tbody>
                        {step.check.conflicts.map((c) => (
                          <tr key={c.key}>
                            <td className="left mono">{c.key}</td>
                            <td className="mono">{c.before}</td>
                            <td className="mono">{c.now ?? '—'}</td>
                            <td className="mono">{c.after}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="row actions modal-actions">
                    <button type="button" className="btn" onClick={close}>
                      취소
                    </button>
                    <button type="button" className="btn btn-primary" onClick={() => setStep({ kind: 'preview', current: step.current, check: step.check, overwrite: true })}>
                      내 편집으로 덮기
                    </button>
                  </div>
                </>
              )}
            </>
          )}

          {step.kind === 'preview' && (
            <>
              <div className="table-scroll write-table">
                <table className="grid-table">
                  <thead>
                    <tr>
                      <th className="left">탭</th>
                      <th className="left">항목</th>
                      <th>원래 값</th>
                      <th>새 값</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.key}>
                        <td className="left">{tabLabel(r.tab)}</td>
                        <td className="left mono">{r.label}</td>
                        <td className="mono">{r.before}</td>
                        <td className="mono">{r.after}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <details>
                <summary>보낼 명령 원문 ({commands.length}줄)</summary>
                <pre className="cli-pre">{commands.join('\n')}</pre>
              </details>
              <p className="muted small">
                {step.check.support.noreboot
                  ? 'save noreboot 으로 저장한 뒤 같은 연결에서 다시 읽어 대조합니다. 끝나면 USB를 뽑았다 다시 꽂아 재부팅하세요.'
                  : '이 펌웨어는 save 때 재부팅합니다. 다시 연결해 대조합니다 (최대 15초).'}{' '}
                쓰기 직전 설정은 저장 폴더의 backups 에 자동 백업됩니다.
              </p>
              <label className="field-label" htmlFor="write-confirm">
                확인: 기체 이름 <b>{base.craftName}</b> 을(를) 그대로 입력하세요
              </label>
              <input id="write-confirm" className="text-input" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />
              <div className="row actions modal-actions">
                <button type="button" className="btn" onClick={close}>
                  취소
                </button>
                <button type="button" className="btn btn-danger" disabled={typed !== base.craftName || commands.length === 0} onClick={() => void write(step.overwrite)}>
                  쓰기
                </button>
              </div>
            </>
          )}

          {step.kind === 'done' && (
            <>
              {step.result.status === 'ok' ? (
                <div className="notice info">쓰기 완료 — 다시 읽어 대조한 결과 모두 일치합니다.</div>
              ) : (
                <>
                  <div className="notice error">
                    저장은 됐지만 다시 읽은 값이 {step.result.mismatches.length}개 다릅니다. 펌웨어가 저장하면서 다른 설정에 맞춰 값을 고쳤을 수 있습니다.
                  </div>
                  <MismatchTable list={step.result.mismatches} />
                </>
              )}
              {!step.result.rebooted && <p className="notice warn">기체가 아직 CLI 모드입니다. USB를 뽑았다 다시 꽂아 재부팅하세요.</p>}
              <p className="muted small">
                백업: <code>{step.result.backup.txt}</code>
                <br />
                로그: <code>{step.result.log}</code>
              </p>
              <p className="muted small">화면은 이제 기체에서 다시 읽은 설정을 보여 줍니다.</p>
              <div className="row actions modal-actions">
                <button type="button" className="btn btn-primary" onClick={onClose}>
                  닫기
                </button>
              </div>
            </>
          )}

          {step.kind === 'failed' && (
            <>
              <div className={'notice ' + (step.failure.applied === 'unknown' ? 'warn' : 'error')} style={{ whiteSpace: 'pre-line' }}>
                {step.failure.message}
              </div>
              {step.failure.backup && (
                <p className="muted small">
                  백업: <code>{step.failure.backup.txt}</code>
                </p>
              )}
              {step.failure.log && (
                <p className="muted small">
                  로그: <code>{step.failure.log}</code>
                </p>
              )}
              {step.failure.code === 'CLI_ENTER_FAILED' && <p className="muted small">방금 연결을 끊은 기체는 CLI 모드에 남아 있습니다. USB를 뽑았다 다시 꽂고 다시 시도하세요.</p>}
              <div className="row actions modal-actions">
                {step.failure.applied === 'unknown' && (
                  <button type="button" className="btn" onClick={() => void reverify()}>
                    재검증
                  </button>
                )}
                <button type="button" className="btn btn-primary" onClick={onClose}>
                  닫기
                </button>
              </div>
            </>
          )}

          {step.kind === 'verified' && (
            <>
              {step.mismatches.length === 0 ? (
                <div className="notice info">재검증: 편집한 값이 모두 기체에 들어가 있습니다.</div>
              ) : (
                <>
                  <div className="notice error">재검증: 편집한 값 {step.mismatches.length}개가 기체에 없습니다 (쓰기가 적용되지 않았을 수 있음).</div>
                  <MismatchTable list={step.mismatches} />
                </>
              )}
              <div className="row actions modal-actions">
                <button type="button" className="btn btn-primary" onClick={onClose}>
                  닫기
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
