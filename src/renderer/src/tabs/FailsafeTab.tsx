import { masterKeysForTab } from '@shared/mapping/tabKeys'
import { Columns, Empty, FieldList, Panel, RestOfMaster, TabFrame, deci, namesOf, type FieldDef } from '../ui/widgets'
import { useSnap } from '../ui/snapshot'

const SEC = { unit: 's', format: deci }

const STAGE1: FieldDef[] = [
  ['failsafe_delay', '신호 끊김 후 1단계 유지 시간', SEC],
  ['failsafe_switch_mode', '페일세이프 스위치 동작'],
  ['rx_min_usec', '유효 펄스 최소', { unit: 'µs' }],
  ['rx_max_usec', '유효 펄스 최대', { unit: 'µs' }]
]

const STAGE2: FieldDef[] = [
  ['failsafe_procedure', '2단계 절차', { hint: 'DROP = 모터 정지 · LAND = 착륙 · GPS-RESCUE = 귀환' }],
  ['failsafe_landing_time', '착륙 시간', { unit: 's' }],
  ['failsafe_off_delay', '착륙 후 모터 정지까지', SEC],
  ['failsafe_throttle', '착륙 스로틀', { unit: 'µs' }],
  ['failsafe_throttle_low_delay', '저스로틀이면 바로 정지하는 시간', SEC],
  ['failsafe_recovery_delay', '복구 판정 시간', SEC],
  ['failsafe_stick_threshold', '복구 스틱 임계', { unit: '%' }]
]

const CH_NAMES = ['롤', '피치', '요', '스로틀']
const MODE_LABEL: Record<string, string> = { a: '자동', h: '유지', s: '지정값' }

export function FailsafeTab() {
  const { snap, changed, m } = useSnap()
  const isRescue = m('failsafe_procedure') === 'GPS-RESCUE'

  return (
    <TabFrame title="페일세이프" en="Failsafe">
      <Columns>
        <Panel title="1단계 — 신호 끊김 직후">
          <FieldList items={STAGE1} />
        </Panel>
        <Panel title="2단계 — 계속 끊긴 경우">
          <FieldList items={STAGE2} />
          {isRescue && <p className="muted small">GPS 레스큐 세부 설정은 GPS 탭에 있습니다.</p>}
        </Panel>

        <Panel title="채널별 폴백 값 (rxfail)" right="1단계에서 쓰는 값">
          {snap.rxFail.length === 0 ? (
            <Empty>rxfail 줄이 없습니다.</Empty>
          ) : (
            <table className="grid-table">
              <thead>
                <tr>
                  <th className="left">채널</th>
                  <th>동작</th>
                  <th>값</th>
                </tr>
              </thead>
              <tbody>
                {snap.rxFail.map((r) => (
                  <tr key={r.channel} className={changed.has(`rxfail.${r.channel}`) ? 'changed' : ''}>
                    <th scope="row">{CH_NAMES[r.channel] ?? `AUX${r.channel - 3}`}</th>
                    <td>{MODE_LABEL[r.mode] ?? r.mode}</td>
                    <td>{r.mode === 's' ? `${r.value} µs` : <span className="no">—</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <p className="muted small">자동: 롤·피치·요는 중앙, 스로틀은 최저. 유지: 마지막 값.</p>
        </Panel>

        <RestOfMaster keys={masterKeysForTab('failsafe', snap.master)} used={namesOf(STAGE1, STAGE2)} />
      </Columns>
    </TabFrame>
  )
}
