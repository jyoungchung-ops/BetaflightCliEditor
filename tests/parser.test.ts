import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  buildSnapshot,
  detectCliKind,
  parseCli,
  parseStatus,
  parseVersion,
  parseVersionLine
} from '../src/shared/cli/parser'

const FIXTURES = join(__dirname, '..', 'fixtures')
const SAMPLE = join(FIXTURES, 'sample')
const read = (dir: string, f: string) => readFileSync(join(dir, f), 'utf8')

interface Expected {
  craftName: string
  board: string
  target: string
  version: string
  activePidProfile: number
  activeRateProfile: number
  changedKeys: string[]
}

const samples = readdirSync(SAMPLE)
  .filter((f) => f.endsWith('.expected.json'))
  .map((f) => f.replace('.expected.json', ''))

describe.each(samples)('샘플 픽스처: %s', (id) => {
  const expected: Expected = JSON.parse(read(SAMPLE, `${id}.expected.json`))
  const raw = {
    version: read(SAMPLE, `${id}.version.txt`),
    status: read(SAMPLE, `${id}.status.txt`),
    diffAll: read(SAMPLE, `${id}.diff.txt`),
    dumpAll: read(SAMPLE, `${id}.dump.txt`)
  }
  const snap = buildSnapshot({ craftName: expected.craftName, readAt: '2026-10-19T00:00:00.000Z', raw })
  const dump = parseCli(raw.dumpAll)

  it('메타 정보', () => {
    expect(snap.meta.firmware).toBe(`Betaflight ${expected.version}`)
    expect(snap.meta.target).toBe(expected.target)
    expect(snap.meta.board).toBe(expected.board)
    expect(snap.meta.activePidProfile).toBe(expected.activePidProfile)
    expect(snap.meta.activeRateProfile).toBe(expected.activeRateProfile)
  })

  it('PID 프로필 4개, 레이트 프로필 4개', () => {
    expect(snap.pidProfiles).toHaveLength(4)
    expect(snap.rateProfiles).toHaveLength(4)
    for (const p of snap.pidProfiles) expect(p.p_roll).toMatch(/^\d+$/)
    for (const r of snap.rateProfiles) expect(r.rates_type).toBeTruthy()
  })

  it('craft_name이 master에 있음', () => {
    expect(snap.master.craft_name).toBe(expected.craftName)
  })

  it('모르는 줄 없음', () => {
    expect(snap.unknown).toEqual([])
    expect(parseCli(raw.diffAll).unknown).toEqual([])
  })

  it('diff all의 키 = 기본값과 다른 항목', () => {
    expect([...snap.changed].sort()).toEqual([...expected.changedKeys].sort())
  })

  it('diff all의 모든 키가 dump all에도 있음', () => {
    const dumpKeys = new Set(dump.keys)
    for (const k of snap.changed) expect(dumpKeys.has(k), k).toBe(true)
  })

  it('diff와 dump의 같은 키는 값이 같음', () => {
    const diff = parseCli(raw.diffAll)
    for (const [k, v] of Object.entries(diff.master)) expect(snap.master[k], k).toBe(v)
    diff.pidProfiles.forEach((p, n) => {
      for (const [k, v] of Object.entries(p ?? {})) expect(snap.pidProfiles[n][k], `pid.${n}.${k}`).toBe(v)
    })
    diff.rateProfiles.forEach((p, n) => {
      for (const [k, v] of Object.entries(p ?? {})) expect(snap.rateProfiles[n][k], `rate.${n}.${k}`).toBe(v)
    })
  })

  it('포트·모드·기능', () => {
    expect(snap.serial.find((s) => s.id === 20)?.functionMask).toBe(1)
    expect(snap.serial.find((s) => s.id === 1)?.functionMask).toBe(64) // UART2 = Serial RX
    expect(snap.aux.find((a) => a.index === 0)).toMatchObject({ modeId: 0, channel: 0, start: 1700, end: 2100 })
    expect(snap.features.RX_SERIAL).toBe(true)
    expect(snap.rxMap).toBe('AETR1234')
  })

  it('dump/diff 종류 추정', () => {
    expect(detectCliKind(raw.dumpAll)).toBe('dump')
    expect(detectCliKind(raw.diffAll)).toBe('diff')
  })

  it('status 파싱', () => {
    expect(snap.status?.sensors.GYRO).toBe('ICM42688P')
    expect(snap.status?.cpuLoad).toBe(14)
    expect(snap.status?.osd).toBe('MSP (53 x 20)')
    expect(snap.status?.armingDisableFlags).toContain('CLI')
  })
})

// 실제 기체 덤프: fixtures/<이름>.dump.txt (+ 선택 <이름>.diff.txt). 넣으면 자동으로 테스트된다.
const realDumps = existsSync(FIXTURES)
  ? readdirSync(FIXTURES).filter((f) => /\.dump\.txt$/i.test(f))
  : []

if (realDumps.length > 0) describe.each(realDumps)('실제 픽스처: %s', (file) => {
  const dumpAll = read(FIXTURES, file)
  const diffFile = file.replace(/\.dump\.txt$/i, '.diff.txt')
  const diffAll = existsSync(join(FIXTURES, diffFile)) ? read(FIXTURES, diffFile) : ''
  const snap = buildSnapshot({
    craftName: 'test',
    readAt: '2026-10-19T00:00:00.000Z',
    raw: { version: '', status: '', diffAll, dumpAll }
  })

  it('펌웨어·보드·프로필', () => {
    expect(snap.meta.firmware).toMatch(/\S/)
    expect(snap.meta.board).toMatch(/\S/)
    expect(snap.pidProfiles.length).toBeGreaterThan(0)
    expect(snap.rateProfiles.length).toBeGreaterThan(0)
    expect(Object.keys(snap.master).length).toBeGreaterThan(100)
  })

  it('모르는 줄 없음', () => {
    expect(snap.unknown).toEqual([])
  })

  it.runIf(diffAll !== '')('diff all의 모든 키가 dump all에도 있음', () => {
    const dumpKeys = new Set(parseCli(dumpAll).keys)
    const missing = snap.changed.filter((k) => !dumpKeys.has(k))
    expect(missing).toEqual([])
  })
})

describe('단위', () => {
  it('버전 줄', () => {
    expect(
      parseVersionLine('# Betaflight / STM32F405 (S405) 4.5.1 Jul 28 2024 / 05:51:08 (77d01ba3b) MSP API: 1.46')
    ).toMatchObject({ firmwareName: 'Betaflight', target: 'STM32F405', targetShort: 'S405', version: '4.5.1', mspApi: '1.46' })
    expect(
      parseVersionLine('# Betaflight / STM32H743 (SH74) 2025.12.0 Dec 20 2025 / 11:00:00 (abcdef012) MSP API: 1.47')
    ).toMatchObject({ version: '2025.12.0', target: 'STM32H743' })
    expect(parseVersionLine('# config rev: 4c8a7f3')).toBeNull()
  })

  it('version 명령의 보드 줄', () => {
    const v = parseVersion(
      '# Betaflight / STM32F7X2 (S7X2) 4.5.1 Jul 28 2024 / 05:51:08 (77d01ba3b) MSP API: 1.46\r\n# config: manufacturer_id: GEPR, board_name: GEPRCF722, version: 4c8a7f3a'
    )
    expect(v).toMatchObject({ board: 'GEPRCF722', manufacturerId: 'GEPR', version: '4.5.1' })
  })

  it('CRLF·공백 있는 값·빈 값', () => {
    const p = parseCli('set craft_name = Meteor75 Pro\r\nset pilot_name = \r\nset small_angle=25\r\n')
    expect(p.master).toEqual({ craft_name: 'Meteor75 Pro', pilot_name: '', small_angle: '25' })
  })

  it('프로필 범위와 활성 프로필', () => {
    const p = parseCli(
      ['set a = 1', 'profile 0', 'set p_roll = 40', 'profile 1', 'set p_roll = 50', 'profile 1', 'rateprofile 2', 'set roll_srate = 70', 'rateprofile 0'].join('\n')
    )
    expect(p.master).toEqual({ a: '1' })
    expect(p.pidProfiles[1].p_roll).toBe('50')
    expect(p.rateProfiles[2].roll_srate).toBe('70')
    expect(p.meta.activePidProfile).toBe(1)
    expect(p.meta.activeRateProfile).toBe(0)
    expect(p.keys).toEqual(['master.a', 'pid.0.p_roll', 'pid.1.p_roll', 'rate.2.roll_srate'])
  })

  it('목록형 줄', () => {
    const p = parseCli(
      [
        'feature -RX_PPM',
        'serial 0 131073 115200 57600 0 115200',
        'aux 3 13 3 1700 2100 0 0',
        'adjrange 0 0 4 900 2100 12 4 0 0',
        'rxfail 4 s 1000',
        'rxfail 0 a',
        'vtxtable band 1 BOSCAM_A A FACTORY 5865 5845 5825',
        'vtxtable powervalues 25 100 200',
        'vtxtable powerlabels 25 100 200',
        'vtx 0 4 0 0 1 1700 2100',
        'led 2 2,0::C:4',
        'color 1 0,0,255',
        'mode_color 7 1 3',
        'mmix 0 1.000 -1.000 1.000 -1.000',
        'smix 0 2 0 100 0 0 100 0',
        'servo 0 1000 2000 1500 100 -1',
        'beeper -ON_USB',
        'beacon RX_LOST',
        'resource MOTOR 1 B06',
        'timer B06 AF2',
        'dma pin B06 0'
      ].join('\n')
    )
    expect(p.unknown).toEqual([])
    expect(p.features).toEqual({ RX_PPM: false })
    expect(p.serial[0]).toEqual({ id: 0, functionMask: 131073, mspBaud: 115200, gpsBaud: 57600, telemetryBaud: 0, blackboxBaud: 115200 })
    expect(p.aux[0]).toEqual({ index: 3, modeId: 13, channel: 3, start: 1700, end: 2100, logic: 0, linkedTo: 0 })
    expect(p.adjustments[0]).toMatchObject({ index: 0, channel: 4, start: 900, end: 2100, func: 12, switchChannel: 4 })
    expect(p.rxFail).toEqual([{ channel: 4, mode: 's', value: 1000 }, { channel: 0, mode: 'a' }])
    expect(p.vtxTable?.band[0]).toEqual({ number: 1, name: 'BOSCAM_A', letter: 'A', type: 'FACTORY', frequencies: [5865, 5845, 5825] })
    expect(p.vtxTable?.powerLabels).toEqual(['25', '100', '200'])
    expect(p.vtxTable?.ranges[0]).toMatchObject({ index: 0, channel: 4, power: 1 })
    expect(p.led?.leds[0]).toEqual({ index: 2, config: '2,0::C:4' })
    expect(p.led?.colors[0]).toEqual({ index: 1, h: 0, s: 0, v: 255 })
    expect(p.mixer?.mmix[0]).toEqual({ index: 0, throttle: 1, roll: -1, pitch: 1, yaw: -1 })
    expect(p.mixer?.servos[0].forwardFromChannel).toBe(-1)
    expect(p.beeper).toEqual({ beeper: { ON_USB: false }, beacon: { RX_LOST: true } })
    expect(p.resources.map((r) => r.kind)).toEqual(['resource', 'timer', 'dma'])
    expect(p.keys).toContain('mode_color.7.1')
    expect(p.keys).toContain('dma.pin.B06')
  })

  it('무시할 명령과 모르는 줄', () => {
    const p = parseCli('batch start\ndefaults nosave\nsave\nfoo bar\n###ERROR IN diff: CORRUPTED CONFIG###\n')
    expect(p.unknown).toEqual(['foo bar', '###ERROR IN diff: CORRUPTED CONFIG###'])
  })

  it('status', () => {
    const s = parseStatus('MCU F405 Clock=168MHz\r\nGYRO=BMI270, ACC=BMI270\r\nCPU:9%, cycle time: 312, GYRO rate: 3200, RX rate: 50, System rate: 9\r\nArming disable flags: RXLOSS CLI')
    expect(s).toMatchObject({ mcu: 'F405', sensors: { GYRO: 'BMI270', ACC: 'BMI270' }, cpuLoad: 9, cycleTime: 312, gyroRate: 3200 })
    expect(s.armingDisableFlags).toEqual(['RXLOSS', 'CLI'])
  })

  it('dump가 없으면 diff로 화면 구성', () => {
    const snap = buildSnapshot({
      craftName: 'x',
      readAt: '',
      raw: { version: '', status: '', dumpAll: '', diffAll: 'board_name FOO\nset small_angle = 180\nprofile 0\nset p_roll = 50' }
    })
    expect(snap.master.small_angle).toBe('180')
    expect(snap.meta.board).toBe('FOO')
    expect(snap.changed).toEqual(['master.small_angle', 'pid.0.p_roll'])
  })
})
