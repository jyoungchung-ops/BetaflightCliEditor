import type { LedColor } from '@shared/cli/types'
import { masterKeysForTab } from '@shared/mapping/tabKeys'
import { Columns, Empty, Field, FieldList, Panel, RestOfMaster, TabFrame, namesOf, type FieldDef } from '../ui/widgets'
import { useSnap } from '../ui/snapshot'

const SETTINGS: FieldDef[] = [
  ['ledstrip_profile', 'LED 프로필'],
  ['ledstrip_brightness', '밝기', { unit: '%' }],
  ['ledstrip_race_color', '레이스 색'],
  ['ledstrip_beacon_color', '비콘 색'],
  ['ledstrip_visual_beeper', '시각 비퍼'],
  ['ledstrip_grb_rgb', '색 순서']
]

const FUNCTIONS: Record<string, string> = {
  C: '색',
  F: '비행 모드',
  A: '아밍 상태',
  B: '배터리',
  R: 'RSSI',
  G: 'GPS',
  S: '레이스',
  L: '라슨 스캐너',
  O: '블링크',
  W: '경고',
  I: '방향 표시',
  Y: '스로틀',
  T: '스로틀'
}

/** "x,y:방향:기능:색" */
function parseLed(config: string) {
  const [pos = '', dirs = '', funcs = '', color = '0'] = config.split(':')
  const [x, y] = pos.split(',').map(Number)
  return { x, y, dirs, funcs, color: Number(color) }
}

/** Betaflight HSV: h 0~359, s 0(진함)~255(흰색), v 0~255 */
function hsvCss(c?: LedColor): string {
  if (!c) return '#000'
  const s = 1 - c.s / 255
  const v = c.v / 255
  const l = v * (1 - s / 2)
  const sl = l === 0 || l === 1 ? 0 : (v - l) / Math.min(l, 1 - l)
  return `hsl(${c.h} ${Math.round(sl * 100)}% ${Math.round(l * 100)}%)`
}

const GRID = 16

export function LedTab() {
  const { snap, changed } = useSnap()
  const led = snap.led
  const colors = new Map((led?.colors ?? []).map((c) => [c.index, c]))
  // 모든 비트가 0인 LED("0,0::C:0")는 사용하지 않는 슬롯
  const leds = (led?.leds ?? []).filter((l) => l.config !== '0,0::C:0').map((l) => ({ ...l, ...parseLed(l.config) }))
  const at = new Map(leds.map((l) => [`${l.x},${l.y}`, l]))

  return (
    <TabFrame title="LED 스트립" en="LED Strip">
      <Columns>
        <Panel title="LED 배치" right={`${leds.length}개 사용`}>
          <Field label="LED 스트립 기능" value={snap.features.LED_STRIP ? '켜짐' : '꺼짐'} k="feature.LED_STRIP" />
          {leds.length === 0 ? (
            <Empty>배치된 LED가 없습니다.</Empty>
          ) : (
            <div className="led-grid" style={{ ['--n' as string]: GRID }}>
              {Array.from({ length: GRID * GRID }, (_, i) => {
                const l = at.get(`${i % GRID},${Math.floor(i / GRID)}`)
                return (
                  <div
                    key={i}
                    className={'led-cell' + (l ? ' on' : '') + (l && changed.has(`led.${l.index}`) ? ' cell-changed' : '')}
                    style={l ? { background: hsvCss(colors.get(l.color)) } : undefined}
                    title={l ? `LED ${l.index} · ${l.funcs || '-'} · 색 ${l.color}` : undefined}
                  >
                    {l ? l.index : ''}
                  </div>
                )
              })}
            </div>
          )}
        </Panel>

        {leds.length > 0 && (
          <Panel title="LED 목록">
            <table className="grid-table">
              <thead>
                <tr>
                  <th className="left">LED</th>
                  <th>위치</th>
                  <th>기능</th>
                  <th>방향</th>
                  <th>색</th>
                </tr>
              </thead>
              <tbody>
                {leds.map((l) => (
                  <tr key={l.index} className={changed.has(`led.${l.index}`) ? 'changed' : ''}>
                    <th scope="row">{l.index}</th>
                    <td>
                      {l.x}, {l.y}
                    </td>
                    <td>{[...l.funcs].map((f) => FUNCTIONS[f] ?? f).join(', ') || '—'}</td>
                    <td>{l.dirs || '—'}</td>
                    <td>
                      <span className="swatch" style={{ background: hsvCss(colors.get(l.color)) }} /> {l.color}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Panel>
        )}

        <Panel title="색상표">
          {(led?.colors ?? []).length === 0 ? (
            <Empty>color 줄이 없습니다.</Empty>
          ) : (
            <div className="swatches">
              {led!.colors.map((c) => (
                <span key={c.index} className={'swatch-item' + (changed.has(`color.${c.index}`) ? ' cell-changed' : '')} title={`H ${c.h} S ${c.s} V ${c.v}`}>
                  <span className="swatch" style={{ background: hsvCss(c) }} />
                  {c.index}
                </span>
              ))}
            </div>
          )}
        </Panel>

        <Panel title="LED 설정">
          <FieldList items={SETTINGS} />
          {(led?.modeColors.length ?? 0) > 0 && <p className="muted small">모드별 색(mode_color) {led!.modeColors.length}개는 CLI 탭에서 확인하세요.</p>}
        </Panel>

        <RestOfMaster keys={masterKeysForTab('led', snap.master)} used={namesOf(SETTINGS)} />
      </Columns>
    </TabFrame>
  )
}
