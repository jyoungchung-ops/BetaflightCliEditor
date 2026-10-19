import { modeName } from '@shared/mapping/modes'
import type { AuxRange } from '@shared/cli/types'
import { ChangedDot, Empty, Panel, TabFrame } from '../ui/widgets'
import { useSnap } from '../ui/snapshot'

const MIN = 900
const MAX = 2100
const TICKS = [1000, 1200, 1500, 1800, 2000]
const pct = (us: number) => `${((Math.min(MAX, Math.max(MIN, us)) - MIN) / (MAX - MIN)) * 100}%`

/** 900~900 같은 빈 범위는 사용 안 함. 다른 모드에 연결된 범위는 사용 중 */
const isUsed = (a: AuxRange) => a.end > a.start || a.linkedTo !== 0

export function RangeBar({ start, end }: { start: number; end: number }) {
  return (
    <div>
      <div className="range-track">
        {TICKS.map((t) => (
          <span key={t} className="range-tick" style={{ left: pct(t) }} />
        ))}
        <span className="range-fill" style={{ left: pct(start), width: `calc(${pct(end)} - ${pct(start)})` }} />
        <span className="range-label" style={{ left: pct(start) }}>
          {start} – {end}
        </span>
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

export function ModesTab() {
  const { snap, changed } = useSnap()
  const used = snap.aux.filter(isUsed)

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
                  <div key={r.index} className="range-line">
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
