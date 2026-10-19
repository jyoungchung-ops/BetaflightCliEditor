import { masterKeysForTab } from '@shared/mapping/tabKeys'
import { Columns, Field, FieldList, Panel, RestOfMaster, TabFrame, cent, namesOf, type FieldDef } from '../ui/widgets'
import { useSnap } from '../ui/snapshot'

const SETTINGS: FieldDef[] = [
  ['motor_pwm_protocol', 'ESC 프로토콜'],
  ['motor_idle', '모터 아이들', { unit: '%', format: cent }],
  ['dshot_idle_value', '모터 아이들', { unit: '%', format: cent }],
  ['dshot_bidir', '양방향 DShot'],
  ['motor_poles', '모터 극 수'],
  ['yaw_motors_reversed', '모터 방향 반전 (props out)'],
  ['motor_output_reordering', '모터 순서 재배치', { hint: '모터 1~8이 실제로 쓰는 출력' }],
  ['crashflip_motor_percent', '크래시 플립 모터 출력', { unit: '%' }],
  ['crashflip_expo', '크래시 플립 엑스포', { unit: '%' }]
]

/** QUADX 모터 위치 (Betaflight: 1 뒤오른쪽, 2 앞오른쪽, 3 뒤왼쪽, 4 앞왼쪽) */
const QUADX = [
  { n: 1, x: 150, y: 150, cw: true },
  { n: 2, x: 150, y: 50, cw: false },
  { n: 3, x: 50, y: 150, cw: false },
  { n: 4, x: 50, y: 50, cw: true }
]

function QuadXDiagram({ reversed }: { reversed: boolean }) {
  return (
    <svg viewBox="0 0 200 200" className="motor-diagram" role="img" aria-label="쿼드 X 모터 배치">
      <line x1="50" y1="50" x2="150" y2="150" stroke="#555" strokeWidth="8" strokeLinecap="round" />
      <line x1="150" y1="50" x2="50" y2="150" stroke="#555" strokeWidth="8" strokeLinecap="round" />
      <rect x="85" y="80" width="30" height="40" rx="5" fill="#333" stroke="#666" />
      <path d="M100 70 l-8 10 h16 z" fill="#ffbb00" />
      {QUADX.map((mt) => {
        const cw = reversed ? !mt.cw : mt.cw
        return (
          <g key={mt.n}>
            <circle cx={mt.x} cy={mt.y} r="30" fill="rgba(255,187,0,0.08)" stroke={cw ? '#ffbb00' : '#5aa9ff'} strokeWidth="2" />
            <text x={mt.x} y={mt.y + 5} fill="#e6e6e6" fontSize="16" fontWeight="600" textAnchor="middle">
              {mt.n}
            </text>
            <text x={mt.x} y={mt.y + 22} fill={cw ? '#ffbb00' : '#5aa9ff'} fontSize="12" textAnchor="middle">
              {cw ? '↻ CW' : '↺ CCW'}
            </text>
          </g>
        )
      })}
      <text x="100" y="196" fill="#8a8a8a" fontSize="10" textAnchor="middle">
        ▲ 앞
      </text>
    </svg>
  )
}

export function MotorsTab() {
  const { snap, m, changed } = useSnap()
  const type = snap.mixer?.type
  const reversed = m('yaw_motors_reversed') === 'ON'
  const mmix = snap.mixer?.mmix ?? []

  return (
    <TabFrame title="모터" en="Motors">
      <Columns>
        <Panel title="믹서" right={type}>
          <Field label="믹서 종류" value={type} k="mixer" />
          {type === 'QUADX' ? (
            <>
              <QuadXDiagram reversed={reversed} />
              <p className="muted small">{reversed ? '모터 방향 반전 (props out)' : '기본 방향 (props in)'} · 위에서 본 모습</p>
            </>
          ) : (
            <p className="muted">{type ?? '믹서 정보 없음'} 배치 그림은 아직 지원하지 않습니다.</p>
          )}
          {mmix.length > 0 && (
            <>
              <p className="subhead">사용자 믹서 (mmix)</p>
              <table className="grid-table">
                <thead>
                  <tr>
                    <th className="left">모터</th>
                    <th>스로틀</th>
                    <th>롤</th>
                    <th>피치</th>
                    <th>요</th>
                  </tr>
                </thead>
                <tbody>
                  {mmix.map((r) => (
                    <tr key={r.index} className={changed.has(`mmix.${r.index}`) ? 'changed' : ''}>
                      <th scope="row">{r.index + 1}</th>
                      <td>{r.throttle}</td>
                      <td>{r.roll}</td>
                      <td>{r.pitch}</td>
                      <td>{r.yaw}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </Panel>

        <Panel title="모터 설정">
          <FieldList items={SETTINGS} />
          <p className="muted small">모터 테스트 슬라이더는 없습니다 (읽기 전용).</p>
        </Panel>

        <RestOfMaster keys={masterKeysForTab('motors', snap.master)} used={namesOf(SETTINGS)} title="3D 모드 등" />
      </Columns>
    </TabFrame>
  )
}
