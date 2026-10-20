import { receiverMode } from '@shared/mapping/receiver'
import { portName, SERIAL_FUNCTION } from '@shared/mapping/serial'
import { Columns, Empty, Field, KeyHint, MasterField, MasterToggle, Panel, TabFrame, useEditMark } from '../ui/widgets'
import { useSnap } from '../ui/snapshot'
import { useEdit } from '../ui/editContext'

const MODE_HINT: Record<string, string | undefined> = {
  serial: '기능 줄이 없어 Serial RX 포트로 추정 (diff만 있는 파일)',
  setting: '기능 줄이 없어 SPI 설정으로 추정',
  unknown: 'diff에는 기본값이 적히지 않아 알 수 없음'
}

const MAP_LETTERS: Record<string, string> = {
  A: '롤 (A)',
  E: '피치 (E)',
  R: '요 (R)',
  T: '스로틀 (T)'
}
const mapLabel = (c: string) => MAP_LETTERS[c] ?? (/\d/.test(c) ? `AUX${c}` : c)

/** 채널 맵 편집: 8글자 (A E R T 1 2 3 4) */
function MapEditor({ map }: { map: string }) {
  const { setValue } = useEdit()
  const mark = useEditMark('map')
  return (
    <div className={'field' + (mark.edited ? ' edited' : '') + (mark.error ? ' invalid' : '')}>
      <span className="field-name">
        채널 맵 편집
        <span className="field-hint">
          <code className="key">map</code>
        </span>
        {mark.error && <span className="field-error">{mark.error}</span>}
      </span>
      <span className="field-value" title={mark.title}>
        <input
          className={'edit-input mono' + (mark.error ? ' invalid' : '')}
          value={map}
          maxLength={8}
          aria-label="채널 맵"
          onChange={(e) => setValue('map', `map ${e.target.value.toUpperCase()}`)}
        />
        {mark.revertButton}
      </span>
    </div>
  )
}

export function ReceiverTab() {
  const { snap, m, changed } = useSnap()
  const { editing } = useEdit()
  const mode = receiverMode(snap.features, snap.serial, snap.master)
  const rxModeKey = mode.feature ? `feature.${mode.feature}` : undefined
  const rxPorts = snap.serial.filter((p) => (p.functionMask & SERIAL_FUNCTION.RX_SERIAL) !== 0)
  const diffOnly = !snap.raw.dumpAll.trim()
  const rssi = m('rssi_channel')
  const map = snap.rxMap

  return (
    <TabFrame title="수신기" en="Receiver">
      <Columns>
        <Panel title="수신기">
          <Field label="수신기 방식" value={mode.label} k={rxModeKey} hint={MODE_HINT[mode.source]} />
          {mode.feature === 'RX_SERIAL' && (
            <Field
              label="수신기 포트"
              value={rxPorts.length ? rxPorts.map((p) => portName(p.id, p.name)).join(', ') : undefined}
              k={rxPorts.map((p) => `serial.${p.name ?? p.id}`)}
              hint="포트 탭의 Serial RX"
            />
          )}
          {/* 프로토콜은 기능 줄과 상관없이 값이 있으면 보여 준다 */}
          {m('serialrx_provider') !== undefined ? (
            <MasterField name="serialrx_provider" label="시리얼 수신기 프로토콜" />
          ) : (
            mode.feature === 'RX_SERIAL' &&
            diffOnly && <Field label="시리얼 수신기 프로토콜" value="펌웨어 기본값" hint={<KeyHint name="serialrx_provider" hint="diff에 없음 = 바꾸지 않음" />} />
          )}
          <MasterField name="rx_spi_protocol" label="SPI 수신기 프로토콜" />
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
          {editing && map !== undefined && <MapEditor map={map} />}
        </Panel>

        <Panel title="RSSI">
          <Field
            label="RSSI 채널"
            value={rssi === undefined ? undefined : rssi === '0' ? '사용 안 함' : `CH${rssi}${Number(rssi) > 4 ? ` (AUX${Number(rssi) - 4})` : ''}`}
            k="master.rssi_channel"
            hint={<KeyHint name="rssi_channel" hint={editing ? '0 = 사용 안 함, 5 = AUX1' : undefined} />}
            edit={rssi !== undefined ? { fullKey: 'master.rssi_channel', name: 'rssi_channel', raw: rssi } : undefined}
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
