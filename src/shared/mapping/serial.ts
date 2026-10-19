// serial 줄 해석: 포트 id 이름, 기능 비트마스크 (펌웨어 serial.h 기준)

/**
 * 포트 표시 이름. 2025.12+는 serial 줄에 나온 이름(name)을 쓴다.
 * 숫자 식별자는 4.5(0~9 = UART1~10)와 2025.12+(50 = UART0, 51~60 = UART1~10)를 모두 해석한다.
 */
export function portName(id: number, name?: string): string {
  if (name) {
    const n = name.toUpperCase()
    if (n === 'VCP') return 'USB VCP'
    const soft = /^SOFT(\d+)$/.exec(n)
    return soft ? `SOFTSERIAL${soft[1]}` : n
  }
  if (id === 20) return 'USB VCP'
  if (id >= 0 && id <= 9) return `UART${id + 1}`
  if (id >= 30 && id <= 39) return `SOFTSERIAL${id - 29}`
  if (id >= 40 && id <= 49) return `LPUART${id - 39}`
  if (id >= 50 && id <= 60) return `UART${id - 50}`
  return `포트 ${id}`
}

/** 표에서 정렬할 때: VCP 먼저, 그다음 UART 번호 순 */
export function portSortKey(id: number): number {
  if (id === 20) return -1
  if (id >= 0 && id <= 9) return id + 1
  if (id >= 50 && id <= 60) return id - 50
  return id
}

export const SERIAL_FUNCTION = {
  MSP: 1,
  GPS: 2,
  TELEMETRY_FRSKY_HUB: 4,
  TELEMETRY_HOTT: 8,
  TELEMETRY_LTM: 16,
  TELEMETRY_SMARTPORT: 32,
  RX_SERIAL: 64,
  BLACKBOX: 128,
  TELEMETRY_MAVLINK: 512,
  ESC_SENSOR: 1024,
  VTX_SMARTAUDIO: 2048,
  TELEMETRY_IBUS: 4096,
  VTX_TRAMP: 8192,
  RCDEVICE: 16384,
  LIDAR_TF: 32768,
  FRSKY_OSD: 65536,
  VTX_MSP: 131072
} as const

type FnName = keyof typeof SERIAL_FUNCTION

const TELEMETRY: [FnName, string][] = [
  ['TELEMETRY_FRSKY_HUB', 'FrSky'],
  ['TELEMETRY_HOTT', 'HoTT'],
  ['TELEMETRY_LTM', 'LTM'],
  ['TELEMETRY_SMARTPORT', 'SmartPort'],
  ['TELEMETRY_MAVLINK', 'MAVLink'],
  ['TELEMETRY_IBUS', 'iBUS']
]
const SENSORS: [FnName, string][] = [
  ['GPS', 'GPS'],
  ['ESC_SENSOR', 'ESC 센서'],
  ['LIDAR_TF', 'TF 라이다']
]
const PERIPHERALS: [FnName, string][] = [
  ['BLACKBOX', '블랙박스'],
  ['VTX_SMARTAUDIO', 'VTX (SmartAudio)'],
  ['VTX_TRAMP', 'VTX (IRC Tramp)'],
  ['VTX_MSP', 'VTX (MSP + DisplayPort)'],
  ['RCDEVICE', '런캠 디바이스'],
  ['FRSKY_OSD', 'FrSky OSD']
]

const has = (mask: number, fn: FnName) => (mask & SERIAL_FUNCTION[fn]) !== 0
const names = (mask: number, list: [FnName, string][]) => list.filter(([f]) => has(mask, f)).map(([, n]) => n)

export function describeSerialFunctions(mask: number) {
  const known = Object.values(SERIAL_FUNCTION).reduce((a, b) => a | b, 0)
  return {
    msp: has(mask, 'MSP'),
    rx: has(mask, 'RX_SERIAL'),
    telemetry: names(mask, TELEMETRY),
    sensors: names(mask, SENSORS),
    peripherals: names(mask, PERIPHERALS),
    /** 표에 없는 비트 */
    unknownBits: mask & ~known
  }
}

/** 0 = 자동 */
export const baudLabel = (b: number) => (b === 0 ? 'AUTO' : String(b))
