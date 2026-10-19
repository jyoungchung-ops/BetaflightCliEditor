import { useState } from 'react'
import { decodeOsdPos, osdCanvas, osdElementLabel, osdElementName } from '@shared/mapping/osd'
import { masterKeysForTab } from '@shared/mapping/tabKeys'
import { ChangedDot, Columns, Empty, FieldList, MasterToggle, Panel, RestOfMaster, TabFrame, namesOf, type FieldDef } from '../ui/widgets'
import { useSnap } from '../ui/snapshot'

const VIDEO: FieldDef[] = [
  ['osd_displayport_device', 'OSD 장치', { hint: 'MSP = DJI·HDZero·Walksnail 등 디지털' }],
  ['vcd_video_system', '영상 방식'],
  ['osd_units', '단위'],
  ['osd_profile', '활성 OSD 프로필'],
  ['osd_profile_1_name', '프로필 1 이름'],
  ['osd_profile_2_name', '프로필 2 이름'],
  ['osd_profile_3_name', '프로필 3 이름'],
  ['displayport_msp_col_adjust', 'DisplayPort 열 보정'],
  ['displayport_msp_row_adjust', 'DisplayPort 행 보정'],
  ['displayport_msp_fonts', 'DisplayPort 글꼴'],
  ['displayport_msp_use_device_blink', '장치 깜빡임 사용'],
  ['vcd_h_offset', '가로 오프셋'],
  ['vcd_v_offset', '세로 오프셋'],
  ['max7456_clock', 'MAX7456 클럭']
]

interface Element {
  key: string
  name: string
  label: string
  preview: string
  x: number
  y: number
  visible: [boolean, boolean, boolean]
}

function Preview({ elements, cols, rows, profile }: { elements: Element[]; cols: number; rows: number; profile: number }) {
  const shown = elements.filter((e) => e.visible[profile])
  return (
    <div className="osd-preview" style={{ ['--cols' as string]: cols, ['--rows' as string]: rows }}>
      <div className="osd-grid" />
      {shown.map((e) => (
        <span
          key={e.key}
          className={'osd-el' + (e.x >= cols || e.y >= rows ? ' out' : '')}
          style={{ left: `${(Math.min(e.x, cols - 1) / cols) * 100}%`, top: `${(Math.min(e.y, rows - 1) / rows) * 100}%` }}
          title={`${e.label} (${e.x}, ${e.y})`}
        >
          {e.preview}
        </span>
      ))}
    </div>
  )
}

export function OsdTab() {
  const { snap, changed, m } = useSnap()
  const canvas = osdCanvas(snap.master, snap.status?.osd)
  const activeProfile = Math.max(1, Math.min(3, Number(m('osd_profile') ?? 1)))
  const [profile, setProfile] = useState(activeProfile - 1)

  const posKeys = Object.keys(snap.master).filter((k) => /^osd_.+_pos$/.test(k))
  const elements: Element[] = posKeys.map((key) => {
    const name = osdElementName(key)
    const [label, preview] = osdElementLabel(name)
    const p = decodeOsdPos(Number(snap.master[key]))
    return { key, name, label, preview: name === 'craft_name' && m('craft_name') ? m('craft_name')!.toUpperCase() : preview, ...p }
  })
  const visibleCount = elements.filter((e) => e.visible[profile]).length
  const sorted = [...elements].sort((a, b) => Number(b.visible[profile]) - Number(a.visible[profile]) || a.label.localeCompare(b.label))

  // 경고·통계는 펌웨어에 따라 ON/OFF 키 여러 개이거나 비트마스크(osd_warn_bitmask, osd_stat_bitmask) 하나다.
  // ON/OFF 값만 토글로 그리고, 비트마스크는 "그 밖의 OSD 설정"에 숫자로 나온다.
  const isOnOff = (k: string) => snap.master[k] === 'ON' || snap.master[k] === 'OFF'
  const warnKeys = Object.keys(snap.master).filter((k) => k.startsWith('osd_warn_') && isOnOff(k))
  const alarmKeys = Object.keys(snap.master).filter((k) => /^osd_.+_alarm$/.test(k))
  const statKeys = Object.keys(snap.master).filter((k) => k.startsWith('osd_stat_') && isOnOff(k))

  return (
    <TabFrame title="OSD" en="OSD">
      <div className="toolbar">
        <label>
          OSD 프로필
          <select className="select" value={profile} onChange={(e) => setProfile(Number(e.target.value))}>
            {[0, 1, 2].map((i) => {
              const name = m(`osd_profile_${i + 1}_name`)
              return (
                <option key={i} value={i}>
                  {i + 1}
                  {name && name !== '-' ? ` · ${name}` : ''}
                  {i === activeProfile - 1 ? ' (활성)' : ''}
                </option>
              )
            })}
          </select>
        </label>
        <span className="muted">
          캔버스 {canvas.label} · 표시 요소 {visibleCount}개
        </span>
      </div>

      <Panel title="미리보기" right="위치만 표시 — 실제 글꼴·아이콘과 다름">
        <Preview elements={elements} cols={canvas.cols} rows={canvas.rows} profile={profile} />
      </Panel>

      <Columns>
        <Panel title="요소" right={`${elements.length}개 중 ${visibleCount}개 표시`}>
          {elements.length === 0 ? (
            <Empty>osd_*_pos 키가 없습니다.</Empty>
          ) : (
            <div className="table-scroll osd-table">
              <table className="grid-table">
                <thead>
                  <tr>
                    <th className="left">요소</th>
                    <th>P1</th>
                    <th>P2</th>
                    <th>P3</th>
                    <th>X, Y</th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((e) => (
                    <tr key={e.key} className={e.visible[profile] ? '' : 'dim'}>
                      <td className="left">
                        <div>{e.label}</div>
                        <div className="cell">
                          <code className="key">{e.key}</code>
                          <ChangedDot on={changed.has(`master.${e.key}`)} />
                        </div>
                      </td>
                      {e.visible.map((v, i) => (
                        <td key={i} className={v ? 'yes' : 'no'}>
                          {v ? '●' : '○'}
                        </td>
                      ))}
                      <td>
                        {e.x}, {e.y}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>

        <Panel title="영상 · DisplayPort">
          <FieldList items={VIDEO} />
        </Panel>

        {warnKeys.length > 0 && (
          <Panel title="경고">
            {warnKeys.map((k) => (
              <MasterToggle key={k} name={k} label={k.replace('osd_warn_', '').replace(/_/g, ' ')} />
            ))}
          </Panel>
        )}

        {alarmKeys.length > 0 && (
          <Panel title="알람">
            <FieldList items={alarmKeys.map((k): FieldDef => [k, k.replace(/^osd_|_alarm$/g, '').replace(/_/g, ' ')])} />
          </Panel>
        )}

        {statKeys.length > 0 && (
          <Panel title="비행 후 통계">
            {statKeys.map((k) => (
              <MasterToggle key={k} name={k} label={k.replace('osd_stat_', '').replace(/_/g, ' ')} />
            ))}
          </Panel>
        )}

        <RestOfMaster
          keys={masterKeysForTab('osd', snap.master)}
          used={[...posKeys, ...warnKeys, ...alarmKeys, ...statKeys, ...namesOf(VIDEO)]}
          title="그 밖의 OSD 설정"
        />
      </Columns>
    </TabFrame>
  )
}
