import { ADJUSTMENT_FUNCTIONS } from '@shared/mapping/modes'
import { ChangedDot, Empty, Panel, TabFrame } from '../ui/widgets'
import { RangeBar } from './ModesTab'
import { useSnap } from '../ui/snapshot'

export function AdjustmentsTab() {
  const { snap, changed } = useSnap()
  const used = snap.adjustments.filter((a) => a.end > a.start)

  return (
    <TabFrame title="조정" en="Adjustments">
      <Panel title="조정 범위" right={`${used.length}개 사용 (전체 슬롯 ${snap.adjustments.length}개)`}>
        {used.length === 0 ? (
          <Empty>설정된 조정이 없습니다.</Empty>
        ) : (
          used.map((a) => (
            <div key={a.index} className="mode-row">
              <div className="mode-name">
                {ADJUSTMENT_FUNCTIONS[a.func] ?? `기능 #${a.func}`}
                <ChangedDot on={changed.has(`adjrange.${a.index}`)} />
              </div>
              <div className="range-line">
                <div className="range-meta">
                  활성 AUX{a.channel + 1}
                  <div className="field-hint">
                    값 채널 AUX{a.switchChannel + 1} · 슬롯 {a.index}
                    {a.center || a.scale ? ` · 중앙 ${a.center} · 배율 ${a.scale}` : ''}
                  </div>
                </div>
                <RangeBar start={a.start} end={a.end} />
              </div>
            </div>
          ))
        )}
      </Panel>
    </TabFrame>
  )
}
