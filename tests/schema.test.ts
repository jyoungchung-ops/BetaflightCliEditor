// v2 2단계: 인수 없는 get → 설정별 형식(schema). SITL 4개 버전의 실측 원문(fixtures/sitl-<버전>/get.txt)으로 검사한다.
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildSnapshot } from '../src/shared/cli/parser'
import { parseGetSchema, validateValue } from '../src/shared/cli/schema'
import type { CraftSnapshot } from '../src/shared/cli/types'
import { fromSavedFile, toSavedFile, SCHEMA_VERSION } from '../src/shared/files'

const FIX = join(__dirname, '..', 'fixtures')
const dirs = readdirSync(FIX).filter((d) => d.startsWith('sitl-') && existsSync(join(FIX, d, 'get.txt')))
const read = (d: string, f: string) => readFileSync(join(FIX, d, f), 'utf8')

describe.each(dirs)('get 스키마: %s', (dir) => {
  const schema = parseGetSchema(read(dir, 'get.txt'))
  const raw = { version: read(dir, 'version.txt'), status: read(dir, 'status.txt'), diffAll: read(dir, 'diff.txt'), dumpAll: read(dir, 'dump.txt'), get: read(dir, 'get.txt') }
  const snap = buildSnapshot({ craftName: 's', readAt: '', raw })

  it('항목 수 = get 출력의 "이름 = 값" 줄 수 (빠지는 항목 없음)', () => {
    const names = raw.get.replace(/\r/g, '').split('\n').filter((l) => /^[A-Za-z0-9_]+ = /.test(l)).length
    expect(Object.keys(schema).length).toBe(names)
    expect(names).toBeGreaterThan(300)
  })

  it('대표 항목의 형식', () => {
    expect(schema.p_roll).toEqual({ section: 'pid', kind: 'number', min: 0, max: 250 })
    expect(schema.roll_srate).toMatchObject({ section: 'rate', kind: 'number' })
    expect(schema.gyro_lpf1_static_hz).toEqual({ section: 'master', kind: 'number', min: 0, max: 1000 })
    expect(schema.motor_pwm_protocol.kind).toBe('enum')
    expect(schema.motor_pwm_protocol.values).toContain('DSHOT600')
    // SITL 은 DShot 없이 빌드돼 dshot_bidir 이 없다 → 모든 버전에 있는 불 값으로 확인
    expect(schema.rc_smoothing).toEqual({ section: 'master', kind: 'bool', values: ['OFF', 'ON'] })
    // OFF/ON 외 값이 더 있으면 enum (예: yaw_spin_recovery = OFF, ON, AUTO)
    expect(schema.yaw_spin_recovery).toMatchObject({ kind: 'enum', values: ['OFF', 'ON', 'AUTO'] })
    expect(schema.craft_name).toMatchObject({ section: 'master', kind: 'string', minLength: 1, maxLength: 16 })
    expect(schema.acc_calibration).toEqual({ section: 'master', kind: 'array', length: 4 })
    expect(schema.gyro_1_i2cBus).toBeDefined() // 대문자가 섞인 이름
  })

  it('dump 의 모든 master·프로필 키에 형식이 있다', () => {
    const keys = [
      ...Object.keys(snap.master),
      ...snap.pidProfiles.flatMap((p) => Object.keys(p)),
      ...snap.rateProfiles.flatMap((p) => Object.keys(p)),
      ...(snap.batteryProfiles ?? []).flatMap((p) => Object.keys(p))
    ]
    expect([...new Set(keys)].filter((k) => !snap.schema?.[k])).toEqual([])
  })

  it('프로필 섹션이 dump 의 섹션과 같다', () => {
    for (const k of Object.keys(snap.pidProfiles[0])) expect(snap.schema![k].section, k).toBe('pid')
    for (const k of Object.keys(snap.rateProfiles[0])) expect(snap.schema![k].section, k).toBe('rate')
    for (const k of Object.keys(snap.batteryProfiles?.[0] ?? {})) expect(snap.schema![k].section, k).toBe('battery')
  })

  it('dump 의 현재 값은 모두 자기 형식에 맞는다 (검사 함수 확인)', () => {
    const bad = Object.entries(snap.master)
      .filter(([k]) => snap.schema?.[k])
      .map(([k, v]) => [k, v, validateValue(snap.schema![k], v)] as const)
      .filter(([, , err]) => err)
    expect(bad).toEqual([])
  })
})

describe('2026.6 배터리 섹션', () => {
  it.runIf(dirs.includes('sitl-2026.6.2'))('bat_capacity 는 battery 섹션', () => {
    const schema = parseGetSchema(read('sitl-2026.6.2', 'get.txt'))
    expect(schema.bat_capacity).toEqual({ section: 'battery', kind: 'number', min: 0, max: 20000 })
  })
})

describe('get 파서 단위', () => {
  it('Default value 줄은 있을 때만', () => {
    const s = parseGetSchema('get\ncraft_name = PROBE\nString length: 1 - 16\nDefault value: -\n\np_roll = 45\nprofile 0\nAllowed range: 0 - 250\n\n# ')
    expect(s.craft_name).toEqual({ section: 'master', kind: 'string', minLength: 1, maxLength: 16, default: '-' })
    expect(s.p_roll).toEqual({ section: 'pid', kind: 'number', min: 0, max: 250 })
  })
  it('음수 범위, 형식 줄 없는 항목은 건너뜀', () => {
    const s = parseGetSchema('osd_esc_temp_alarm = -128\nAllowed range: -128 - 127\n\nweird = 1\n\n')
    expect(s.osd_esc_temp_alarm).toMatchObject({ min: -128, max: 127 })
    expect(s.weird).toBeUndefined()
  })
})

describe('값 검사 (편집 모드 범위 검사)', () => {
  it.each([
    [{ section: 'pid', kind: 'number', min: 0, max: 250 }, '48', null],
    [{ section: 'pid', kind: 'number', min: 0, max: 250 }, '251', '250 이하여야 합니다'],
    [{ section: 'pid', kind: 'number', min: 0, max: 250 }, '-1', '0 이상이어야 합니다'],
    [{ section: 'pid', kind: 'number', min: 0, max: 250 }, '4.5', '숫자가 아닙니다'],
    [{ section: 'master', kind: 'enum', values: ['DSHOT300', 'DSHOT600'] }, 'dshot300', null],
    [{ section: 'master', kind: 'enum', values: ['DSHOT300', 'DSHOT600'] }, 'DSHOT9999', '허용된 값이 아닙니다'],
    [{ section: 'master', kind: 'bool', values: ['OFF', 'ON'] }, 'ON', null],
    [{ section: 'master', kind: 'string', minLength: 1, maxLength: 16 }, 'Meteor75 Pro', null],
    [{ section: 'master', kind: 'string', minLength: 1, maxLength: 16 }, '-', null],
    [{ section: 'master', kind: 'string', minLength: 1, maxLength: 16 }, 'x'.repeat(17), '16자 이하여야 합니다'],
    [{ section: 'master', kind: 'array', length: 4 }, '0,0,0,0', null],
    [{ section: 'master', kind: 'array', length: 4 }, '0,0,0', '값 4개를 쉼표로 구분해야 합니다']
  ] as const)('%j / %s', (schema, value, expected) => {
    expect(validateValue(schema as never, value)).toBe(expected)
  })
})

describe('저장 파일 schemaVersion 2', () => {
  const d = dirs[0]
  const raw = { version: read(d, 'version.txt'), status: read(d, 'status.txt'), diffAll: read(d, 'diff.txt'), dumpAll: read(d, 'dump.txt'), get: read(d, 'get.txt') }
  const snap = buildSnapshot({ craftName: 'SITL', readAt: '2026-10-20T00:00:00Z', raw })

  it('get 원문과 schema 를 담아 저장하고, 열면 같은 schema', () => {
    const saved = JSON.parse(JSON.stringify(toSavedFile(snap, '2.0.0')))
    expect(SCHEMA_VERSION).toBe(2)
    expect(saved.schemaVersion).toBe(2)
    expect(saved.raw.get).toBe(raw.get)
    const back: CraftSnapshot = fromSavedFile(saved)
    expect(back.schema).toEqual(snap.schema)
  })

  it('v1 파일(schemaVersion 1, get 없음)도 열린다 — schema 없이', () => {
    const v1 = { schemaVersion: 1, appVersion: '0.1.0', craftName: 'old', readAt: '', raw: { version: raw.version, status: raw.status, diffAll: raw.diffAll, dumpAll: raw.dumpAll } }
    const back = fromSavedFile(v1)
    expect(back.schema).toBeUndefined()
    expect(back.meta.version).toBe(snap.meta.version)
  })
})
