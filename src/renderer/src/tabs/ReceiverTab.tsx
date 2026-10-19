import { Columns, Empty, Field, KeyHint, MasterField, MasterToggle, Panel, TabFrame } from '../ui/widgets'
import { useSnap } from '../ui/snapshot'

const RX_MODES: [string, string][] = [
  ['RX_SERIAL', '시리얼 수신기 (UART)'],
  ['RX_SPI', 'SPI 수신기 (내장)'],
  ['RX_PPM', 'PPM'],
  ['RX_PARALLEL_PWM', 'PWM'],
  ['RX_MSP', 'MSP']
]

const MAP_LETTERS: Record<string, string> = {
  A: '롤 (A)',
  E: '피치 (E)',
  R: '요 (R)',
  T: '스로틀 (T)'
}
const mapLabel = (c: string) => MAP_LETTERS[c] ?? (/\d/.test(c) ? `AUX${c}` : c)

export function ReceiverTab() {
  const { snap, m, changed } = useSnap()
  const mode = RX_MODES.find(([f]) => snap.features[f])
  const rxModeKey = mode ? `feature.${mode[0]}` : undefined
  const rssi = m('rssi_channel')
  const map = snap.rxMap

  return (
    <TabFrame title="수신기" en="Receiver">
      <Columns>
        <Panel title="수신기">
          <Field label="수신기 방식" value={mode?.[1] ?? '없음'} k={rxModeKey} />
          {snap.features.RX_SERIAL && <MasterField name="serialrx_provider" label="시리얼 수신기 프로토콜" />}
          {snap.features.RX_SPI && <MasterField name="rx_spi_protocol" label="SPI 수신기 프로토콜" />}
          <MasterField name="serialrx_inverted" label="신호 반전" />
          <MasterField name="serialrx_halfduplex" label="반이중" />
          <MasterField name="crsf_use_negotiated_baud" label="CRSF 보드레이트 협상" />
          <MasterField name="sbus_baud_fast" label="SBUS 고속" />
          <MasterField name="max_aux_channels" label="최대 AUX 채널" />
        </Panel>

        <Panel title="채널 맵" right={map ? <code>{map}</code> : undefined}>
          {map ? (
            <div className={'chmap' + (changed.has('map') ? ' changed' : '')}>
              {[...map].map((c, i) => (
                <div key={i} className={'chmap-cell' + (changed.has('map') ? ' cell-changed' : '')}>
                  <div className="ch">CH{i + 1}</div>
                  <div className="fn">{mapLabel(c)}</div>
                </div>
              ))}
            </div>
          ) : (
            <Empty>map 줄이 없습니다.</Empty>
          )}
          <p className="muted small">입력 채널 순서 → 기능. AETR1234가 기본입니다.</p>
        </Panel>

        <Panel title="RSSI">
          <Field
            label="RSSI 채널"
            value={rssi === undefined ? undefined : rssi === '0' ? '사용 안 함' : `CH${rssi}${Number(rssi) > 4 ? ` (AUX${Number(rssi) - 4})` : ''}`}
            k="master.rssi_channel"
            hint={<KeyHint name="rssi_channel" />}
          />
          <MasterToggle name="rssi_src_frame_errors" label="프레임 오류로 RSSI 계산" />
          <MasterField name="rssi_scale" label="RSSI 배율" />
          <MasterField name="rssi_offset" label="RSSI 오프셋" />
          <MasterField name="rssi_invert" label="RSSI 반전" />
        </Panel>

        <Panel title="RC 스무딩">
          <MasterField name="rc_smoothing" label="RC 스무딩" />
          <MasterField name="rc_smoothing_auto_factor" label="자동 스무딩 계수 (RPY)" />
          <MasterField name="rc_smoothing_auto_factor_throttle" label="자동 스무딩 계수 (스로틀)" />
          <MasterField name="rc_smoothing_setpoint_cutoff" label="세트포인트 컷오프" unit="Hz" hint="0 = 자동" />
          <MasterField name="rc_smoothing_feedforward_cutoff" label="피드포워드 컷오프" unit="Hz" hint="0 = 자동" />
          <MasterField name="rc_smoothing_throttle_cutoff" label="스로틀 컷오프" unit="Hz" hint="0 = 자동" />
        </Panel>

        <Panel title="스틱 범위">
          <MasterField name="deadband" label="롤·피치 데드밴드" />
          <MasterField name="yaw_deadband" label="요 데드밴드" />
          <MasterField name="min_check" label="스틱 최저 (min_check)" unit="µs" />
          <MasterField name="max_check" label="스틱 최고 (max_check)" unit="µs" />
          <MasterField name="rx_min_usec" label="유효 신호 최소" unit="µs" />
          <MasterField name="rx_max_usec" label="유효 신호 최대" unit="µs" />
          <MasterField name="airmode_start_throttle_percent" label="에어모드 시작 스로틀" unit="%" />
        </Panel>

        {snap.rxRange.length > 0 && (
          <Panel title="채널 범위 보정 (rxrange)">
            <table className="grid-table">
              <thead>
                <tr>
                  <th className="left">채널</th>
                  <th>최소</th>
                  <th>최대</th>
                </tr>
              </thead>
              <tbody>
                {snap.rxRange.map((r) => (
                  <tr key={r.channel} className={changed.has(`rxrange.${r.channel}`) ? 'changed' : ''}>
                    <th scope="row">{['롤', '피치', '요', '스로틀'][r.channel] ?? `CH${r.channel + 1}`}</th>
                    <td>{r.min}</td>
                    <td>{r.max}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Panel>
        )}
      </Columns>
    </TabFrame>
  )
}
