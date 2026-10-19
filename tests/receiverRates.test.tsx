// 실기체 테스트에서 나온 문제:
//  1) diff만 있는 파일에서 수신기 프로토콜이 안 보임 (기본값인 feature RX_SERIAL 줄이 diff에 없음)
//  2) 레이트를 Actual 값으로 보고 싶음
//  3) 저장 파일 이름이 "X.bfview.bfview.json" 으로 겹침
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { buildSnapshot } from '../src/shared/cli/parser'
import type { CraftSnapshot } from '../src/shared/cli/types'
import { normalizeSavePath } from '../src/shared/files'
import { maxRate, toActual, withRateDefaults } from '../src/shared/mapping/rates'
import { receiverMode } from '../src/shared/mapping/receiver'
import { TAB_VIEWS } from '../src/renderer/src/tabs'
import { PidTab } from '../src/renderer/src/tabs/PidTab'
import { SnapshotProvider } from '../src/renderer/src/ui/snapshot'

const snapOf = (diffAll: string, dumpAll = '') =>
  buildSnapshot({ craftName: 't', readAt: '', raw: { version: '', status: '', diffAll, dumpAll } })
const html = (snap: CraftSnapshot, el: React.ReactElement) => renderToStaticMarkup(<SnapshotProvider snap={snap}>{el}</SnapshotProvider>)
const text = (h: string) => h.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')

// 실제 Meteor75 Pro(4.5.3) diff all 에서 수신기 관련 줄만 옮긴 것
const METEOR_DIFF = [
  '# Betaflight / STM32G47X (SG47) 4.5.3 Feb  2 2026 / 06:38:13 (0e533ba76) MSP API: 1.46',
  'board_name BETAFPVG473',
  'feature -AIRMODE',
  'feature OSD',
  'serial 0 64 115200 57600 0 115200',
  'serial 2 0 115200 57600 0 115200',
  'serial 3 131073 115200 57600 0 115200',
  'set serialrx_provider = SBUS',
  'profile 0',
  'rateprofile 0',
  'rateprofile 0'
].join('\n')

describe('수신기 방식', () => {
  it('feature 줄이 있으면 그대로', () => {
    expect(receiverMode({ RX_SERIAL: true }, [], {})).toMatchObject({ feature: 'RX_SERIAL', source: 'feature' })
    expect(receiverMode({ RX_SPI: true, RX_SERIAL: false }, [], { rx_spi_protocol: 'EXPRESSLRS' })).toMatchObject({ feature: 'RX_SPI', source: 'feature' })
  })
  it('diff에 feature 줄이 없으면 Serial RX 포트로 추정', () => {
    const port = { id: 0, functionMask: 64, mspBaud: 0, gpsBaud: 0, telemetryBaud: 0, blackboxBaud: 0 }
    expect(receiverMode({ OSD: true }, [port], {})).toMatchObject({ feature: 'RX_SERIAL', source: 'serial' })
    // RX_SERIAL 이 명시적으로 꺼져 있으면 추정하지 않음
    expect(receiverMode({ RX_SERIAL: false }, [port], {}).source).not.toBe('serial')
  })
  it('SPI 설정으로 추정, 모두 꺼짐, 알 수 없음', () => {
    expect(receiverMode({}, [], { rx_spi_protocol: 'EXPRESSLRS' })).toMatchObject({ feature: 'RX_SPI', source: 'setting' })
    const off = { RX_SERIAL: false, RX_SPI: false, RX_PPM: false, RX_PARALLEL_PWM: false, RX_MSP: false }
    expect(receiverMode(off, [], {}).source).toBe('none')
    expect(receiverMode({}, [], {}).source).toBe('unknown')
  })

  it('실기체 Meteor75 Pro diff: 수신기 탭에 SBUS 와 수신기 포트가 나온다', () => {
    const snap = snapOf(METEOR_DIFF)
    expect(snap.features.RX_SERIAL).toBeUndefined()
    const V = TAB_VIEWS.receiver
    const t = text(html(snap, <V />))
    expect(t).toContain('시리얼 수신기 (UART)')
    expect(t).toContain('Serial RX 포트로 추정')
    expect(t).toContain('UART1')
    expect(t).toMatch(/시리얼 수신기 프로토콜 .*serialrx_provider SBUS/)
  })

  it('diff에 프로토콜이 없으면 "펌웨어 기본값"으로 표시', () => {
    const snap = snapOf(METEOR_DIFF.replace('set serialrx_provider = SBUS', ''))
    const V = TAB_VIEWS.receiver
    expect(text(html(snap, <V />))).toMatch(/시리얼 수신기 프로토콜 diff에 없음 = 바꾸지 않음 serialrx_provider 펌웨어 기본값/)
  })

  it('dump 가 있으면 feature 줄 기준 (2025.12 Pavo20 형태)', () => {
    const dump = ['feature -RX_SERIAL', 'feature -RX_SPI', 'feature RX_SERIAL', 'serial UART1 64 115200 57600 0 115200', 'set serialrx_provider = CRSF'].join('\n')
    const snap = snapOf('', dump)
    const V = TAB_VIEWS.receiver
    const t = text(html(snap, <V />))
    expect(t).toContain('시리얼 수신기 (UART)')
    expect(t).not.toContain('추정')
    expect(t).toContain('CRSF')
  })
})

describe('Actual 환산', () => {
  it('ACTUAL 은 그대로 (중앙 = rc_rate×10, 최대 = srate×10)', () => {
    expect(toActual('ACTUAL', { rcRate: 7, srate: 67, expo: 20, limit: 1998 })).toMatchObject({
      center: 70, max: 670, expo: 0.2, exact: true, maxError: 0, cli: { rc_rate: 7, srate: 67, expo: 20 }
    })
  })

  it('BETAFLIGHT RC 1.00 / 슈퍼 0.70 → 중앙 200°/s, 최대 667°/s', () => {
    const a = toActual('BETAFLIGHT', { rcRate: 100, srate: 70, expo: 0, limit: 1998 })!
    expect(a.exact).toBe(false)
    expect(a.center).toBeCloseTo(200, 0)
    expect(Math.round(a.max)).toBe(667)
    expect(a.cli).toMatchObject({ rc_rate: 20, srate: 67 })
    expect(a.maxError).toBeLessThan(40)
  })

  it('KISS·QUICK 도 환산, 최대 레이트는 원래 곡선의 끝값과 같다', () => {
    for (const type of ['KISS', 'QUICK']) {
      const r = { rcRate: 100, srate: 67, expo: 10, limit: 1998 }
      const a = toActual(type, r)!
      expect(Math.round(a.max)).toBe(Math.round(maxRate(type, r)!))
      expect(a.center).toBeGreaterThan(0)
    }
  })

  it('레이트 탭: BETAFLIGHT 프로필도 기본은 Actual 환산 값으로', () => {
    const dump = ['rateprofile 0', 'set rates_type = BETAFLIGHT', 'set roll_rc_rate = 100', 'set roll_srate = 70', 'set roll_expo = 0',
      'set pitch_rc_rate = 100', 'set pitch_srate = 70', 'set pitch_expo = 0', 'set yaw_rc_rate = 100', 'set yaw_srate = 60', 'set yaw_expo = 0',
      'set roll_rate_limit = 1998', 'set pitch_rate_limit = 1998', 'set yaw_rate_limit = 1998'].join('\n')
    const t = text(html(snapOf('', dump), <PidTab initialSub="rates" />))
    expect(t).toContain('Actual 환산')
    expect(t).toContain('중앙 감도')
    expect(t).toContain('≈ 200°/s')
    expect(t).toContain('≈ 667°/s')
    expect(t).toContain('같은 느낌을 Actual로 넣으려면')
  })

  it('diff만 있으면 빠진 레이트를 펌웨어 기본값(ACTUAL 7/67/0)으로 채운다', () => {
    const { profile, filled } = withRateDefaults({ roll_srate: '80' })
    expect(profile).toMatchObject({ rates_type: 'ACTUAL', roll_rc_rate: '7', roll_srate: '80', pitch_srate: '67' })
    expect(filled.has('roll_srate')).toBe(false)
    expect(filled.has('pitch_srate')).toBe(true)
    const h = html(snapOf(METEOR_DIFF), <PidTab initialSub="rates" />)
    const t = text(h)
    expect(t).toContain('펌웨어 기본값')
    expect(t).toContain('70°/s')
    expect(t).toContain('670°/s')
    expect(h).toContain('default-value')
  })
})

describe('저장 파일 이름 정리', () => {
  it.each([
    ['C:\\FPV\\Meteor75 ProII.bfview.bfview.json', 'C:\\FPV\\Meteor75 ProII.bfview.json'],
    ['C:\\FPV\\Meteor75 ProII.bfview.json', 'C:\\FPV\\Meteor75 ProII.bfview.json'],
    ['C:\\FPV\\Meteor75 ProII.bfview', 'C:\\FPV\\Meteor75 ProII.bfview.json'],
    ['C:\\FPV\\Meteor75 ProII', 'C:\\FPV\\Meteor75 ProII.bfview.json'],
    ['C:\\FPV\\Meteor75 ProII.BFVIEW.json', 'C:\\FPV\\Meteor75 ProII.bfview.json'],
    ['C:\\FPV\\backup.json', 'C:\\FPV\\backup.json'],
    ['C:\\FPV\\v1.2 tune.bfview.json.bfview.json', 'C:\\FPV\\v1.2 tune.bfview.json']
  ])('%s → %s', (input, out) => {
    expect(normalizeSavePath(input)).toBe(out)
  })
})
