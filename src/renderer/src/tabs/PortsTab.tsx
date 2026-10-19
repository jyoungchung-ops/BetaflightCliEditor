import { baudLabel, describeSerialFunctions, portName } from '@shared/mapping/serial'
import { Empty, MasterField, Panel, TabFrame } from '../ui/widgets'
import { useSnap } from '../ui/snapshot'

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

export function PortsTab() {
  const { snap, changed } = useSnap()
  const ports = [...snap.serial].sort((a, b) => (a.id === 20 ? -1 : b.id === 20 ? 1 : a.id - b.id))

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
                    <tr key={p.id} className={changed.has(`serial.${p.id}`) ? 'changed' : ''}>
                      <th scope="row">
                        {portName(p.id)}
                        <span className="field-hint"> id {p.id}</span>
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
        <MasterField name="displayport_msp_serial" label="MSP DisplayPort 포트" format={(v) => (Number(v) < 0 ? '자동' : portName(Number(v)))} />
        <MasterField name="serialrx_halfduplex" label="Serial RX 반이중" />
        <MasterField name="serialmsp_halfduplex" label="MSP 반이중" />
        <MasterField name="tlm_halfduplex" label="텔레메트리 반이중" />
        <MasterField name="tlm_inverted" label="텔레메트리 반전" />
        <MasterField name="vtx_halfduplex" label="VTX 반이중" />
      </Panel>
    </TabFrame>
  )
}
