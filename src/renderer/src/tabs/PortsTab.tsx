import { baudLabel, describeSerialFunctions, portName, portSortKey, SERIAL_FUNCTION } from '@shared/mapping/serial'
import type { SerialPortCfg } from '@shared/cli/types'
import { Empty, MasterField, Panel, TabFrame, useEditMark } from '../ui/widgets'
import { useSnap } from '../ui/snapshot'
import { useEdit } from '../ui/editContext'

function Chips({ items, baud }: { items: string[]; baud?: string }) {
  if (items.length === 0) return <span className="no">—</span>
  return (
    <span className="chips">
      {items.map((n) => (
        <span key={n} className="chip">
          {n}
        </span>
      ))}
      {baud && <span className="muted small">{baud}</span>}
    </span>
  )
}

const Check = ({ on }: { on: boolean }) => <span className={on ? 'yes' : 'no'}>{on ? '●' : '○'}</span>

/** 편집 모드에서 켜고 끌 수 있는 기능 (SPEC 9절: 포트 탭은 MSP · Serial RX · GPS · VTX(MSP)) */
const EDIT_FUNCTIONS: [keyof typeof SERIAL_FUNCTION, string][] = [
  ['MSP', 'MSP'],
  ['RX_SERIAL', 'Serial RX'],
  ['GPS', 'GPS'],
  ['VTX_MSP', 'VTX (MSP)']
]

const portToken = (p: SerialPortCfg) => p.name ?? String(p.id)
const serialLine = (p: SerialPortCfg, mask: number) =>
  `serial ${portToken(p)} ${mask} ${p.mspBaud} ${p.gpsBaud} ${p.telemetryBaud} ${p.blackboxBaud}`

function PortEditRow({ p }: { p: SerialPortCfg }) {
  const { setValue } = useEdit()
  const key = `serial.${portToken(p)}`
  const mark = useEditMark(key)
  const f = describeSerialFunctions(p.functionMask)
  const flip = (bit: number) => setValue(key, serialLine(p, p.functionMask ^ bit))
  return (
    <tr className={(mark.edited ? 'edited-row' : '') + (mark.error ? ' invalid-row' : '')} title={mark.error ?? mark.title}>
      <th scope="row">
        {portName(p.id, p.name)}
        {mark.revertButton}
        {mark.error && <div className="field-error">{mark.error}</div>}
      </th>
      {EDIT_FUNCTIONS.map(([fn, label]) => {
        const bit = SERIAL_FUNCTION[fn]
        return (
          <td key={fn}>
            <label className="check-edit">
              <input type="checkbox" checked={(p.functionMask & bit) !== 0} aria-label={`${portName(p.id, p.name)} ${label}`} onChange={() => flip(bit)} />
            </label>
          </td>
        )
      })}
      <td className="muted small">
        {[...f.telemetry, ...f.sensors.filter((x) => x !== 'GPS'), ...f.peripherals.filter((x) => x !== 'VTX (MSP + DisplayPort)')].join(', ') || '—'}
      </td>
    </tr>
  )
}

export function PortsTab() {
  const { snap, changed } = useSnap()
  const { editing } = useEdit()
  const ports = [...snap.serial].sort((a, b) => portSortKey(a.id) - portSortKey(b.id))

  if (editing)
    return (
      <TabFrame title="포트" en="Ports">
        <Panel title="시리얼 포트 편집" right="체크 = 켜기">
          {ports.length === 0 ? (
            <Empty>serial 줄이 없습니다.</Empty>
          ) : (
            <div className="table-scroll">
              <table className="grid-table">
                <thead>
                  <tr>
                    <th className="left">식별자</th>
                    {EDIT_FUNCTIONS.map(([fn, label]) => (
                      <th key={fn}>{label}</th>
                    ))}
                    <th>그 밖의 기능 (보기 전용)</th>
                  </tr>
                </thead>
                <tbody>
                  {ports.map((p) => (
                    <PortEditRow key={portToken(p)} p={p} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="muted small">보드레이트와 텔레메트리·블랙박스 등 다른 기능은 이 버전에서 바꾸지 않습니다. USB VCP의 MSP는 끌 수 없습니다(끄면 다시 연결할 수 없음).</p>
        </Panel>
        <Panel title="관련 설정">
          <MasterField name="serialrx_halfduplex" label="Serial RX 반이중" />
          <MasterField name="serialmsp_halfduplex" label="MSP 반이중" />
          <MasterField name="tlm_halfduplex" label="텔레메트리 반이중" />
          <MasterField name="tlm_inverted" label="텔레메트리 반전" />
          <MasterField name="vtx_halfduplex" label="VTX 반이중" />
        </Panel>
      </TabFrame>
    )

  return (
    <TabFrame title="포트" en="Ports">
      <Panel title="시리얼 포트" right="● 켜짐  ○ 꺼짐">
        {ports.length === 0 ? (
          <Empty>serial 줄이 없습니다.</Empty>
        ) : (
          <div className="table-scroll">
            <table className="grid-table">
              <thead>
                <tr>
                  <th className="left">식별자</th>
                  <th>구성 / MSP</th>
                  <th>Serial RX</th>
                  <th>텔레메트리 출력</th>
                  <th>센서 입력</th>
                  <th>주변기기</th>
                </tr>
              </thead>
              <tbody>
                {ports.map((p) => {
                  const f = describeSerialFunctions(p.functionMask)
                  const gpsOn = f.sensors.includes('GPS')
                  return (
                    <tr key={p.id} className={changed.has(`serial.${p.name ?? p.id}`) ? 'changed' : ''}>
                      <th scope="row">
                        {portName(p.id, p.name)}
                        <span className="field-hint"> {p.name ? `serial ${p.name}` : `id ${p.id}`}</span>
                      </th>
                      <td>
                        <Check on={f.msp} /> {f.msp && <span className="muted small">{baudLabel(p.mspBaud)}</span>}
                      </td>
                      <td>
                        <Check on={f.rx} />
                      </td>
                      <td>
                        <Chips items={f.telemetry} baud={f.telemetry.length ? baudLabel(p.telemetryBaud) : undefined} />
                      </td>
                      <td>
                        <Chips items={f.sensors} baud={gpsOn ? baudLabel(p.gpsBaud) : undefined} />
                      </td>
                      <td>
                        <Chips
                          items={f.peripherals}
                          baud={f.peripherals.includes('블랙박스') ? baudLabel(p.blackboxBaud) : undefined}
                        />
                        {f.unknownBits !== 0 && <span className="muted small"> 기타 비트 {f.unknownBits}</span>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <Panel title="관련 설정">
        <MasterField name="serialrx_halfduplex" label="Serial RX 반이중" />
        <MasterField name="serialmsp_halfduplex" label="MSP 반이중" />
        <MasterField name="tlm_halfduplex" label="텔레메트리 반이중" />
        <MasterField name="tlm_inverted" label="텔레메트리 반전" />
        <MasterField name="vtx_halfduplex" label="VTX 반이중" />
      </Panel>
    </TabFrame>
  )
}
