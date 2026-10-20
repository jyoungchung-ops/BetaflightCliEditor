import { useRef } from 'react'
import { MODE_NAMES, modeName } from '@shared/mapping/modes'
import type { AuxRange } from '@shared/cli/types'
import { ChangedDot, Empty, Panel, TabFrame, useEditMark } from '../ui/widgets'
import { useSnap } from '../ui/snapshot'
import { useEdit } from '../ui/editContext'

const MIN = 900
const MAX = 2100
const STEP = 25 // 펌웨어가 aux 범위를 25µs 단위로 저장
const TICKS = [1000, 1200, 1500, 1800, 2000]
const pct = (us: number) => `${((Math.min(MAX, Math.max(MIN, us)) - MIN) / (MAX - MIN)) * 100}%`
const snap25 = (us: number) => Math.min(MAX, Math.max(MIN, Math.round(us / STEP) * STEP))

/** 900~900 같은 빈 범위는 사용 안 함. 다른 모드에 연결된 범위는 사용 중 */
const isUsed = (a: AuxRange) => a.end > a.start || a.linkedTo !== 0

/** 범위 막대. onChange 가 있으면 양 끝 손잡이를 끌어 바꿀 수 있다 (25µs 단위) */
export function RangeBar({ start, end, onChange }: { start: number; end: number; onChange?(start: number, end: number, merge: boolean): void }) {
  const track = useRef<HTMLDivElement>(null)
  const drag = (which: 'start' | 'end') => (ev: React.PointerEvent) => {
    if (!onChange || !track.current) return
    ev.preventDefault()
    const el = track.current
    el.setPointerCapture?.(ev.pointerId)
    let first = true // 한 번 끌기 = 되돌리기 한 단계
    const move = (e: PointerEvent) => {
      const r = el.getBoundingClientRect()
      const us = snap25(MIN + ((e.clientX - r.left) / r.width) * (MAX - MIN))
      if (which === 'start') onChange(Math.min(us, end - STEP), end, !first)
      else onChange(start, Math.max(us, start + STEP), !first)
      first = false
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }
  return (
    <div>
      <div className={'range-track' + (onChange ? ' editable' : '')} ref={track}>
        {TICKS.map((t) => (
          <span key={t} className="range-tick" style={{ left: pct(t) }} />
        ))}
        <span className="range-fill" style={{ left: pct(start), width: `calc(${pct(end)} - ${pct(start)})` }} />
        <span className="range-label" style={{ left: pct(start) }}>
          {start} – {end}
        </span>
        {onChange && (
          <>
            <span className="range-handle" style={{ left: pct(start) }} onPointerDown={drag('start')} role="slider" aria-label="시작" aria-valuenow={start} aria-valuemin={MIN} aria-valuemax={MAX} />
            <span className="range-handle" style={{ left: pct(end) }} onPointerDown={drag('end')} role="slider" aria-label="끝" aria-valuenow={end} aria-valuemin={MIN} aria-valuemax={MAX} />
          </>
        )}
      </div>
      <div className="range-scale">
        {TICKS.map((t) => (
          <span key={t} style={{ left: pct(t) }}>
            {t}
          </span>
        ))}
      </div>
    </div>
  )
}

const auxLine = (a: AuxRange) => `aux ${a.index} ${a.modeId} ${a.channel} ${a.start} ${a.end} ${a.logic} ${a.linkedTo}`
const MODE_OPTIONS = Object.entries(MODE_NAMES).map(([id, name]) => [Number(id), name] as const)

/** 편집 모드의 범위 한 줄: 모드 · AUX 채널 · 시작/끝 · 끌기 · 삭제 */
function AuxEditRow({ a }: { a: AuxRange }) {
  const { setValue } = useEdit()
  const key = `aux.${a.index}`
  const mark = useEditMark(key)
  const set = (patch: Partial<AuxRange>, merge = false) => setValue(key, auxLine({ ...a, ...patch }), { merge })
  const unused = !isUsed(a)
  return (
    <div className={'mode-row' + (mark.edited ? ' edited' : '') + (mark.error ? ' invalid' : '')} title={mark.error ?? mark.title}>
      <div className="mode-name">
        <select className="edit-input" value={a.modeId} aria-label={`${key} 모드`} onChange={(e) => set({ modeId: Number(e.target.value) })}>
          {!MODE_NAMES[a.modeId] && <option value={a.modeId}>{modeName(a.modeId)}</option>}
          {MODE_OPTIONS.map(([id, name]) => (
            <option key={id} value={id}>
              {name}
            </option>
          ))}
        </select>
        {mark.revertButton}
      </div>
      <div className="range-line">
        <div className="range-meta">
          <select className="edit-input" value={a.channel} aria-label={`${key} 채널`} onChange={(e) => set({ channel: Number(e.target.value) })}>
            {Array.from({ length: 12 }, (_, i) => (
              <option key={i} value={i}>
                AUX{i + 1}
              </option>
            ))}
          </select>
          <div className="field-hint">슬롯 {a.index}</div>
          {mark.error && <div className="field-error">{mark.error}</div>}
        </div>
        {unused ? (
          <div className="muted small">
            삭제됨 (900–900)
            <button type="button" className="link" onClick={() => set({ start: 1700, end: 2100 })}>
              다시 쓰기
            </button>
          </div>
        ) : (
          <div>
            <RangeBar start={a.start} end={a.end} onChange={(s, e, merge) => set({ start: s, end: e }, merge)} />
            <div className="row range-inputs">
              <input className="edit-input" type="number" step={STEP} min={MIN} max={MAX} value={a.start} aria-label={`${key} 시작`} onChange={(e) => set({ start: Number(e.target.value) })} />
              <span className="muted">–</span>
              <input className="edit-input" type="number" step={STEP} min={MIN} max={MAX} value={a.end} aria-label={`${key} 끝`} onChange={(e) => set({ end: Number(e.target.value) })} />
              <span className="muted small">µs</span>
              <button type="button" className="btn btn-small" onClick={() => set({ start: 900, end: 900 })}>
                삭제
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export function ModesTab() {
  const { snap, changed } = useSnap()
  const { editing, edits, setValue } = useEdit()
  const used = snap.aux.filter(isUsed)

  if (editing) {
    // 편집 중에는 사용 중인 슬롯 + 이번에 편집한 슬롯(삭제 포함)을 슬롯 순서로
    const shown = snap.aux.filter((a) => isUsed(a) || edits[`aux.${a.index}`])
    const free = snap.aux.find((a) => !isUsed(a) && !edits[`aux.${a.index}`])
    return (
      <TabFrame title="모드" en="Modes">
        <Panel
          title="모드 범위 편집"
          right={
            free ? (
              <button type="button" className="btn btn-small" onClick={() => setValue(`aux.${free.index}`, auxLine({ ...free, modeId: 13, channel: 0, start: 1700, end: 2100 }))}>
                범위 추가 (슬롯 {free.index})
              </button>
            ) : (
              '빈 슬롯 없음'
            )
          }
        >
          <p className="muted small">손잡이를 끌거나 숫자를 바꿉니다. 25µs 단위. 새 범위는 BEEPER로 만들어지니 모드를 골라 주세요.</p>
          {shown.length === 0 ? <Empty>설정된 모드가 없습니다.</Empty> : shown.map((a) => <AuxEditRow key={a.index} a={a} />)}
        </Panel>
      </TabFrame>
    )
  }

  // App처럼 모드별로 묶는다 (모드 id 순)
  const byMode = new Map<number, AuxRange[]>()
  for (const a of used) byMode.set(a.modeId, [...(byMode.get(a.modeId) ?? []), a])
  const groups = [...byMode.entries()].sort(([a], [b]) => a - b)

  return (
    <TabFrame title="모드" en="Modes">
      <Panel title="설정된 모드" right={`${groups.length}개 모드 · 범위 ${used.length}개 (전체 슬롯 ${snap.aux.length}개)`}>
        {groups.length === 0 ? (
          <Empty>설정된 모드가 없습니다.</Empty>
        ) : (
          groups.map(([modeId, ranges]) => (
            <div key={modeId} className="mode-row">
              <div className="mode-name">
                {modeName(modeId)}
                <ChangedDot on={ranges.some((r) => changed.has(`aux.${r.index}`))} />
              </div>
              <div>
                {ranges.map((r, i) => (
                  <div key={r.index} className={'range-line' + (edits[`aux.${r.index}`] ? ' edited' : '')}>
                    <div className="range-meta">
                      {i > 0 && <span className="chip">{r.logic === 1 ? 'AND' : 'OR'}</span>} AUX{r.channel + 1}
                      <div className="field-hint">슬롯 {r.index}</div>
                    </div>
                    {r.linkedTo !== 0 ? (
                      <div className="muted">연결됨 → {modeName(r.linkedTo)}</div>
                    ) : (
                      <RangeBar start={r.start} end={r.end} />
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </Panel>
    </TabFrame>
  )
}
