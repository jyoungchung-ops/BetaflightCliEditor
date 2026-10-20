// OSD 요소 위치 해석 (Betaflight 4.4+ osd.h)
//   x: 비트 0~4 + 확장 비트 10 (HD 53칸용), y: 비트 5~9, 프로필 표시: 비트 11·12·13

export interface OsdPos {
  x: number
  y: number
  /** OSD 프로필 1~3에서 보이는가 */
  visible: [boolean, boolean, boolean]
}

export function decodeOsdPos(value: number): OsdPos {
  const x = (value & 0x1f) | ((value & 0x400) >> 5)
  const y = (value >> 5) & 0x1f
  return { x, y, visible: [(value & 0x800) !== 0, (value & 0x1000) !== 0, (value & 0x2000) !== 0] }
}

const POS_BITS = 0x1f | 0x3e0 | 0x400 | 0x800 | 0x1000 | 0x2000

/** decodeOsdPos 의 역. 위치·표시 비트 밖의 비트(요소 형태 등)는 원래 값에서 그대로 둔다 */
export function encodeOsdPos(original: number, pos: OsdPos): number {
  const x = Math.max(0, Math.min(63, Math.round(pos.x)))
  const y = Math.max(0, Math.min(31, Math.round(pos.y)))
  let v = (original & ~POS_BITS & 0xffff) | (x & 0x1f) | ((x & 0x20) << 5) | ((y & 0x1f) << 5)
  pos.visible.forEach((on, i) => {
    if (on) v |= 0x800 << i
  })
  return v
}

export interface Canvas {
  cols: number
  rows: number
  label: string
}

export const CANVAS = {
  HD: { cols: 53, rows: 20, label: 'HD (53×20)' },
  PAL: { cols: 30, rows: 16, label: 'PAL (30×16)' },
  NTSC: { cols: 30, rows: 13, label: 'NTSC (30×13)' }
} satisfies Record<string, Canvas>

/** 캔버스 크기: status의 "OSD: MSP (53 x 20)" → vcd_video_system → displayport */
export function osdCanvas(master: Record<string, string>, statusOsd?: string): Canvas {
  const m = statusOsd && /\((\d+)\s*x\s*(\d+)\)/.exec(statusOsd)
  if (m) {
    const cols = Number(m[1])
    const rows = Number(m[2])
    return { cols, rows, label: `${cols}×${rows} (status)` }
  }
  const vs = master.vcd_video_system
  if (vs === 'HD' || (master.osd_displayport_device === 'MSP' && vs !== 'PAL' && vs !== 'NTSC')) return CANVAS.HD
  if (vs === 'NTSC') return CANVAS.NTSC
  return CANVAS.PAL
}

/** 요소 이름(osd_<이름>_pos) → [표시 이름, 미리보기 문자열] */
export const OSD_ELEMENTS: Record<string, [string, string]> = {
  vbat: ['배터리 전압', '16.8V'],
  avg_cell_voltage: ['평균 셀 전압', '4.20V'],
  rssi: ['RSSI', '99'],
  link_quality: ['링크 품질', 'LQ 9'],
  rssi_dbm: ['RSSI dBm', '-60'],
  tim_1: ['타이머 1', '00:00'],
  tim_2: ['타이머 2', '00:00'],
  flymode: ['비행 모드', 'ACRO'],
  throttle: ['스로틀', 'THR 0'],
  vtx_channel: ['VTX 채널', 'R:2:1'],
  crosshairs: ['십자선', '-+-'],
  ah_sbar: ['인공수평 사이드바', '|  |'],
  ah: ['인공수평', '-----'],
  current: ['전류', '0.0A'],
  mah_drawn: ['소모 용량', '0mAh'],
  wh_drawn: ['소모 Wh', '0.0Wh'],
  craft_name: ['기체 이름', 'CRAFT'],
  pilot_name: ['파일럿 이름', 'PILOT'],
  display_name: ['표시 이름', 'NAME'],
  altitude: ['고도', '0.0m'],
  warnings: ['경고', 'WARNINGS'],
  disarmed: ['디스아밍', 'DISARMED'],
  rtc_date_time: ['날짜·시간', '2026-10-19 12:00'],
  home_dir: ['홈 방향', '↑'],
  home_dist: ['홈 거리', '0m'],
  gps_speed: ['GPS 속도', '0km/h'],
  gps_sats: ['GPS 위성', 'SAT 0'],
  gps_lat: ['위도', '0.0000000'],
  gps_lon: ['경도', '0.0000000'],
  compass_bar: ['나침반', 'N  E  S'],
  heading: ['방위', '000'],
  numerical_heading: ['방위 숫자', '000'],
  numerical_vario: ['상승률', '0.0'],
  vario: ['상승률 바', '^'],
  power: ['전력', '0W'],
  pid_roll: ['롤 PID', 'ROL 45 80 30'],
  pid_pitch: ['피치 PID', 'PIT 47 84 34'],
  pid_yaw: ['요 PID', 'YAW 45 80 0'],
  pidrate_profile: ['PID·레이트 프로필', '1-1'],
  profile_name: ['PID 프로필 이름', 'PROFILE'],
  rate_profile_name: ['레이트 프로필 이름', 'RATE'],
  battery_usage: ['배터리 사용량', '[====]'],
  remaining_time_estimate: ['남은 시간', '00:00'],
  esc_tmp: ['ESC 온도', '0C'],
  esc_rpm: ['ESC RPM', '0'],
  esc_rpm_freq: ['ESC RPM 주파수', '0'],
  core_temp: ['코어 온도', '40C'],
  anti_gravity: ['안티 그래비티', 'AG'],
  g_force: ['G 포스', '1.0G'],
  motor_diag: ['모터 진단', '....'],
  log_status: ['블랙박스 상태', 'B'],
  flip_arrow: ['플립 화살표', '>'],
  stick_overlay_left: ['스틱 오버레이 왼쪽', '+'],
  stick_overlay_right: ['스틱 오버레이 오른쪽', '+'],
  camera_frame: ['카메라 프레임', '[ ]'],
  efficiency: ['효율', '0mAh/km'],
  total_flights: ['총 비행 수', '#0'],
  up_down_reference: ['상하 기준', 'U'],
  ready_mode: ['준비 모드', 'READY'],
  lidar_dist: ['라이다 거리', '0cm'],
  sys_goggle_voltage: ['고글 전압', 'G 7.4V'],
  sys_vtx_voltage: ['VTX 전압', 'V 12V'],
  sys_bitrate: ['비트레이트', '50Mb'],
  sys_delay: ['지연', '25ms'],
  sys_distance: ['거리', '0m'],
  sys_lq: ['DJI 링크', 'LQ'],
  sys_goggle_dvr: ['고글 DVR', 'DVR'],
  sys_vtx_dvr: ['VTX DVR', 'DVR'],
  sys_warnings: ['DJI 경고', 'WARN'],
  sys_vtx_temp: ['VTX 온도', '40C'],
  sys_fan_speed: ['팬 속도', 'F3']
}

/** osd_<이름>_pos 키에서 이름 */
export const osdElementName = (key: string) => key.replace(/^osd_/, '').replace(/_pos$/, '')

export function osdElementLabel(name: string): [string, string] {
  return OSD_ELEMENTS[name] ?? [name, name.toUpperCase().replace(/_/g, ' ').slice(0, 12)]
}
