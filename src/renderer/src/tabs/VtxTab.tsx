import { masterKeysForTab } from '@shared/mapping/tabKeys'
import { Columns, Empty, Field, FieldList, Panel, RestOfMaster, TabFrame, namesOf, num, type FieldDef } from '../ui/widgets'
import { RangeBar } from './ModesTab'
import { useSnap } from '../ui/snapshot'

const SETTINGS: FieldDef[] = [
  ['vtx_band', '밴드', { hint: '0 = 주파수 직접 지정' }],
  ['vtx_channel', '채널'],
  ['vtx_power', '출력 단계'],
  ['vtx_freq', '주파수', { unit: 'MHz' }],
  ['vtx_pit_mode_freq', '피트 모드 주파수', { unit: 'MHz' }],
  ['vtx_low_power_disarm', '디스아밍 시 저출력'],
  ['vtx_softserial_alt', '소프트시리얼 대체 모드'],
  ['vtx_halfduplex', '반이중'],
  ['vtx_spi_bus', 'SPI 버스']
]

export function VtxTab() {
  const { snap, m, changed } = useSnap()
  const vt = snap.vtxTable
  const bands = vt?.band ?? []
  const band = bands.find((b) => b.number === num(m('vtx_band')))
  const ch = num(m('vtx_channel'))
  const freq = band && ch > 0 ? band.frequencies[ch - 1] : num(m('vtx_freq'))
  const powerIdx = num(m('vtx_power'))
  const powerLabel = vt && powerIdx > 0 ? vt.powerLabels[powerIdx - 1] : undefined
  const ranges = (vt?.ranges ?? []).filter((r) => r.end > r.start)
  const isDigital = m('osd_displayport_device') === 'MSP' && bands.length === 0

  return (
    <TabFrame title="영상송신기" en="Video Transmitter">
      {isDigital && (
        <p className="notice info banner">
          VTX 테이블이 비어 있습니다. DJI O4 같은 디지털 시스템은 채널·출력을 고글에서 정하므로 정상입니다.
        </p>
      )}
      <Columns>
        <Panel title="현재 설정">
          <Field label="현재 주파수" value={freq > 0 ? freq : undefined} unit="MHz" hint={band ? `${band.name} ${ch}` : undefined} />
          <Field label="현재 출력" value={powerLabel} hint={powerIdx > 0 ? `단계 ${powerIdx}` : undefined} />
          <FieldList items={SETTINGS} />
        </Panel>

        <Panel title="출력 단계" right={vt?.powerLevels !== undefined ? `${vt.powerLevels}단계` : undefined}>
          {vt && vt.powerValues.length > 0 ? (
            <table className={'grid-table' + (changed.has('vtxtable.powervalues') ? ' changed' : '')}>
              <thead>
                <tr>
                  <th className="left">단계</th>
                  <th>값</th>
                  <th>표시</th>
                </tr>
              </thead>
              <tbody>
                {vt.powerValues.map((v, i) => (
                  <tr key={i} className={i + 1 === powerIdx ? 'changed' : ''}>
                    <th scope="row">{i + 1}</th>
                    <td>{v}</td>
                    <td>{vt.powerLabels[i] ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <Empty>출력 표가 없습니다.</Empty>
          )}
        </Panel>
      </Columns>

      <Panel title="VTX 테이블" right={vt?.bands !== undefined ? `${vt.bands}밴드 × ${vt.channels ?? 0}채널` : undefined}>
        {bands.length === 0 ? (
          <Empty>vtxtable 밴드가 없습니다.</Empty>
        ) : (
          <div className="table-scroll">
            <table className="grid-table">
              <thead>
                <tr>
                  <th className="left">밴드</th>
                  <th>문자</th>
                  <th>종류</th>
                  {bands[0].frequencies.map((_, i) => (
                    <th key={i}>CH{i + 1}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {bands.map((b) => (
                  <tr key={b.number} className={changed.has(`vtxtable.band.${b.number}`) ? 'changed' : ''}>
                    <th scope="row">
                      {b.number}. {b.name}
                    </th>
                    <td>{b.letter}</td>
                    <td>{b.type}</td>
                    {b.frequencies.map((f, i) => (
                      <td key={i} className={b === band && i + 1 === ch ? 'yes' : f === 0 ? 'no' : ''}>
                        {f || '—'}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      {ranges.length > 0 && (
        <Panel title="스위치로 바꾸는 VTX 설정 (vtx)">
          {ranges.map((r) => (
            <div key={r.index} className="range-line">
              <div className="range-meta">
                AUX{r.channel + 1}
                <div className="field-hint">
                  밴드 {r.band || '유지'} · 채널 {r.vtxChannel || '유지'} · 출력 {r.power || '유지'}
                </div>
              </div>
              <RangeBar start={r.start} end={r.end} />
            </div>
          ))}
        </Panel>
      )}

      <div className="cols-gap" />
      <RestOfMaster keys={masterKeysForTab('vtx', snap.master)} used={namesOf(SETTINGS)} />
    </TabFrame>
  )
}
