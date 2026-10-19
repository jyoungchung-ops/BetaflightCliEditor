import { masterKeysForTab } from '@shared/mapping/tabKeys'
import { Columns, Empty, FieldList, Panel, RestOfMaster, TabFrame, namesOf, type FieldDef } from '../ui/widgets'
import { useSnap } from '../ui/snapshot'

const SETTINGS: FieldDef[] = [
  ['servo_center_pulse', '중앙 펄스', { unit: 'µs' }],
  ['servo_pwm_rate', 'PWM 주파수', { unit: 'Hz' }],
  ['servo_lowpass_hz', '로우패스', { unit: 'Hz' }],
  ['tri_unarmed_servo', '디스아밍 중 트라이 서보 동작'],
  ['channel_forwarding_start', '채널 포워딩 시작']
]

export function ServosTab() {
  const { snap, changed } = useSnap()
  const servos = snap.mixer?.servos ?? []
  const smix = snap.mixer?.smix ?? []

  return (
    <TabFrame title="서보" en="Servos">
      <Columns>
        <Panel title="서보 설정">
          {servos.length === 0 ? (
            <Empty>servo 줄이 없습니다.</Empty>
          ) : (
            <table className="grid-table">
              <thead>
                <tr>
                  <th className="left">서보</th>
                  <th>최소</th>
                  <th>중앙</th>
                  <th>최대</th>
                  <th>비율</th>
                  <th>채널 포워딩</th>
                </tr>
              </thead>
              <tbody>
                {servos.map((s) => (
                  <tr key={s.index} className={changed.has(`servo.${s.index}`) ? 'changed' : ''}>
                    <th scope="row">{s.index + 1}</th>
                    <td>{s.min}</td>
                    <td>{s.middle}</td>
                    <td>{s.max}</td>
                    <td>{s.rate}%</td>
                    <td>{s.forwardFromChannel < 0 ? '—' : `CH${s.forwardFromChannel + 1}`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Panel>

        <Panel title="서보 믹서 (smix)">
          {smix.length === 0 ? (
            <Empty>사용자 서보 믹서가 없습니다.</Empty>
          ) : (
            <table className="grid-table">
              <thead>
                <tr>
                  <th className="left">#</th>
                  <th>서보</th>
                  <th>입력</th>
                  <th>비율</th>
                  <th>속도</th>
                  <th>최소</th>
                  <th>최대</th>
                  <th>박스</th>
                </tr>
              </thead>
              <tbody>
                {smix.map((r) => (
                  <tr key={r[0]} className={changed.has(`smix.${r[0]}`) ? 'changed' : ''}>
                    {r.slice(0, 8).map((v, i) => (i === 0 ? <th key={i} scope="row">{v}</th> : <td key={i}>{v}</td>))}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Panel>

        <Panel title="공통 설정">
          <FieldList items={SETTINGS} />
        </Panel>
        <RestOfMaster keys={masterKeysForTab('servos', snap.master)} used={namesOf(SETTINGS)} />
      </Columns>
    </TabFrame>
  )
}
