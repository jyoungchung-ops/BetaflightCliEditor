import { Columns, FeatureToggle, Field, MasterField, MasterToggle, Panel, TabFrame, Toggle, num } from '../ui/widgets'
import { useSnap } from '../ui/snapshot'

/** 기능 이름 → 설명. 여기 없는 기능도 아래 목록에 그대로 나온다 */
const FEATURE_LABELS: Record<string, string> = {
  RX_PPM: 'PPM 수신기',
  INFLIGHT_ACC_CAL: '비행 중 가속도계 보정',
  RX_SERIAL: '시리얼 수신기',
  MOTOR_STOP: '모터 정지 (아밍 시 스로틀 최저)',
  SERVO_TILT: '서보 틸트',
  SOFTSERIAL: '소프트시리얼',
  GPS: 'GPS',
  RANGEFINDER: '거리 센서',
  TELEMETRY: '텔레메트리',
  '3D': '3D 모드',
  RX_PARALLEL_PWM: 'PWM 수신기',
  RX_MSP: 'MSP 수신기',
  RSSI_ADC: 'RSSI ADC',
  LED_STRIP: 'LED 스트립',
  DISPLAY: '디스플레이',
  OSD: 'OSD',
  CHANNEL_FORWARDING: '채널 포워딩',
  TRANSPONDER: '트랜스폰더',
  AIRMODE: '에어모드 상시',
  RX_SPI: 'SPI 수신기',
  ESC_SENSOR: 'ESC 센서',
  ANTI_GRAVITY: '안티 그래비티 상시',
  DYNAMIC_FILTER: '동적 필터'
}

/** 수신기 탭에서 보여 주는 기능 */
const RX_FEATURES = new Set(['RX_PPM', 'RX_SERIAL', 'RX_PARALLEL_PWM', 'RX_MSP', 'RX_SPI'])

const BEEPER_LABELS: Record<string, string> = {
  GYRO_CALIBRATED: '자이로 보정 완료',
  RX_LOST: '수신 신호 끊김',
  RX_LOST_LANDING: '수신 끊김 착륙',
  DISARMING: '디스아밍',
  ARMING: '아밍',
  ARMING_GPS_FIX: 'GPS 고정 후 아밍',
  BAT_CRIT_LOW: '배터리 위험',
  BAT_LOW: '배터리 부족',
  GPS_STATUS: 'GPS 위성 수',
  RX_SET: 'AUX 비퍼 스위치',
  ACC_CALIBRATION: '가속도계 보정',
  ACC_CALIBRATION_FAIL: '가속도계 보정 실패',
  READY_BEEP: '준비 완료',
  DISARM_REPEAT: '디스아밍 반복',
  ARMED: '아밍 상태 (스로틀 0)',
  SYSTEM_INIT: '부팅',
  ON_USB: 'USB 연결 시',
  BLACKBOX_ERASE: '블랙박스 삭제',
  CRASH_FLIP: '크래시 플립',
  CAM_CONNECTION_OPEN: '카메라 연결',
  CAM_CONNECTION_CLOSE: '카메라 연결 해제',
  RC_SMOOTHING_INIT_FAIL: 'RC 스무딩 초기화 실패'
}

const IDLE_KEYS = ['motor_idle', 'dshot_idle_value']
const isDshot = (p?: string) => Boolean(p && /DSHOT|PROSHOT/i.test(p))
/** DShot에서는 쓰지 않는 PWM 전용 값 — 숨기지 않고 표시만 한다 */
const dshotNote = (p?: string) => (isDshot(p) ? 'DShot에서는 사용 안 함' : undefined)

/** 1800 → 180° (gyro_1_align_* 는 0.1도 단위) */
const deci = (v: string) => `${num(v) / 10}`

export function ConfigurationTab() {
  const { snap, m, pick } = useSnap()
  const protocol = m('motor_pwm_protocol')
  const gyroRate = snap.status?.gyroRate
  const denom = num(m('pid_process_denom'))
  const pidLoop = gyroRate && denom > 0 ? `${(gyroRate / denom / 1000).toFixed(2).replace(/\.?0+$/, '')} kHz` : undefined
  const idleKey = pick(...IDLE_KEYS)

  const features = Object.entries(snap.features).filter(([f]) => !RX_FEATURES.has(f))
  const beepers = Object.entries(snap.beeper?.beeper ?? {})
  const beacons = Object.entries(snap.beeper?.beacon ?? {})

  return (
    <TabFrame title="구성" en="Configuration">
      <Columns>
        <Panel title="시스템 설정">
          <Field label="자이로 업데이트 주기" value={gyroRate ? `${gyroRate / 1000} kHz` : undefined} hint="status 기준" />
          <MasterField name="pid_process_denom" label="PID 루프 분주" hint={pidLoop ? `PID 루프 ${pidLoop}` : undefined} />
          <MasterField name="gyro_to_use" label="사용 자이로" />
          <MasterField name="gyro_enabled_bitmask" label="사용 자이로 (비트마스크)" hint="2025.12+" />
          <MasterField name="acc_hardware" label="가속도계" />
          <MasterField name="baro_hardware" label="기압계" />
          <MasterField name="mag_hardware" label="지자기계" />
        </Panel>

        <Panel title="ESC / 모터">
          <MasterField name="motor_pwm_protocol" label="ESC 프로토콜" />
          <MasterField name="motor_pwm_rate" label="모터 PWM 주파수" unit="Hz" hint={dshotNote(protocol)} />
          <MasterField name="use_unsynced_pwm" label="비동기 PWM" hint={dshotNote(protocol)} />
          <MasterField name="dshot_bidir" label="양방향 DShot (RPM 텔레메트리)" />
          <MasterField name="motor_poles" label="모터 극 수" />
          {idleKey && (
            <MasterField name={idleKey} label="모터 아이들" unit="%" format={(v) => (num(v) / 100).toFixed(2)} />
          )}
          <MasterField name="min_throttle" label="최소 스로틀" unit="µs" hint={dshotNote(protocol)} />
          <MasterField name="max_throttle" label="최대 스로틀" unit="µs" />
          <MasterField name="min_command" label="최소 명령" unit="µs" />
          <MasterField name="dshot_bitbang" label="DShot 비트뱅" />
          <MasterField name="dshot_edt" label="DShot EDT" />
          <MasterToggle name="yaw_motors_reversed" label="모터 방향 반전" />
        </Panel>

        <Panel title="보드·센서 정렬">
          <MasterField name="align_board_roll" label="보드 롤" unit="°" />
          <MasterField name="align_board_pitch" label="보드 피치" unit="°" />
          <MasterField name="align_board_yaw" label="보드 요" unit="°" />
          <MasterField name="gyro_1_sensor_align" label="자이로 1 정렬" />
          <MasterField name="gyro_1_align_roll" label="자이로 1 롤" unit="°" format={deci} />
          <MasterField name="gyro_1_align_pitch" label="자이로 1 피치" unit="°" format={deci} />
          <MasterField name="gyro_1_align_yaw" label="자이로 1 요" unit="°" format={deci} />
          <MasterField name="gyro_2_sensor_align" label="자이로 2 정렬" />
          {m('gyro_1_sensor_align') === undefined && m('align_board_yaw') !== undefined && (
            <p className="muted small">이 펌웨어(2025.12+)는 자이로 정렬을 set 값으로 내보내지 않습니다.</p>
          )}
        </Panel>

        <Panel title="아밍·개인화">
          <MasterField name="small_angle" label="최대 아밍 각도" unit="°" hint="180 = 각도 제한 없음" />
          <MasterField name="auto_disarm_delay" label="자동 디스아밍 지연" unit="s" />
          <MasterField name="enable_stick_arming" label="스틱 아밍" />
          <MasterField name="runaway_takeoff_prevention" label="폭주 이륙 방지" />
          <MasterField name="craft_name" label="기체 이름" />
          <MasterField name="pilot_name" label="파일럿 이름" />
          <MasterField name="fpv_mix_degrees" label="FPV 카메라 각도 보정" unit="°" />
        </Panel>
      </Columns>

      <Panel title="기타 기능" right={`${features.filter(([, on]) => on).length}개 켜짐`}>
        <div className="toggle-grid">
          {features.map(([f]) => (
            <FeatureToggle key={f} name={f} label={FEATURE_LABELS[f] ?? f} hint={<code className="key">{f}</code>} />
          ))}
        </div>
      </Panel>

      {(beepers.length > 0 || beacons.length > 0) && (
        <Panel title="비퍼">
          {beepers.length > 0 && <p className="subhead">비퍼 상황</p>}
          <div className="toggle-grid">
            {beepers.map(([b, on]) => (
              <Toggle key={b} on={on} label={BEEPER_LABELS[b] ?? b} k={`beeper.${b}`} hint={<code className="key">{b}</code>} />
            ))}
          </div>
          {beacons.length > 0 && <p className="subhead">DShot 비콘</p>}
          <div className="toggle-grid">
            {beacons.map(([b, on]) => (
              <Toggle key={b} on={on} label={BEEPER_LABELS[b] ?? b} k={`beacon.${b}`} hint={<code className="key">{b}</code>} />
            ))}
          </div>
          <MasterField name="beeper_dshot_beacon_tone" label="DShot 비콘 톤" />
        </Panel>
      )}
    </TabFrame>
  )
}
