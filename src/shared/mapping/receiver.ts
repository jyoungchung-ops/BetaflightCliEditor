// 수신기 방식 판정.
// dump all 에는 feature 줄이 모두 있지만, diff all 만 있는 파일(Betaflight App에서 저장한 diff 등)은
// 기본값인 기능을 적지 않는다. 그래서 RX_SERIAL 이 보드 기본값이면 feature 줄이 없고,
// serial 포트의 Serial RX 기능 비트나 설정 키로 추정해야 한다.

import type { SerialPortCfg } from '../cli/types'
import { SERIAL_FUNCTION } from './serial'

export const RX_MODES: [feature: string, label: string][] = [
  ['RX_SERIAL', '시리얼 수신기 (UART)'],
  ['RX_SPI', 'SPI 수신기 (내장)'],
  ['RX_PPM', 'PPM'],
  ['RX_PARALLEL_PWM', 'PWM'],
  ['RX_MSP', 'MSP']
]

export interface RxMode {
  feature?: string
  label: string
  /** feature = 기능 줄로 확인, serial = Serial RX 포트로 추정, setting = SPI 설정으로 추정, none / unknown */
  source: 'feature' | 'serial' | 'setting' | 'none' | 'unknown'
}

export function receiverMode(
  features: Record<string, boolean>,
  serial: SerialPortCfg[],
  master: Record<string, string>
): RxMode {
  const on = RX_MODES.find(([f]) => features[f] === true)
  if (on) return { feature: on[0], label: on[1], source: 'feature' }

  const allKnownOff = RX_MODES.every(([f]) => features[f] === false)
  if (allKnownOff) return { label: '없음', source: 'none' }

  const rxSerialOff = features.RX_SERIAL === false
  if (!rxSerialOff && serial.some((p) => (p.functionMask & SERIAL_FUNCTION.RX_SERIAL) !== 0)) {
    return { feature: 'RX_SERIAL', label: '시리얼 수신기 (UART)', source: 'serial' }
  }
  if (features.RX_SPI !== false && master.rx_spi_protocol !== undefined && features.RX_SERIAL !== true) {
    return { feature: 'RX_SPI', label: 'SPI 수신기 (내장)', source: 'setting' }
  }
  return { label: '알 수 없음', source: 'unknown' }
}
