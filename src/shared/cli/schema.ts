// 인수 없는 `get` 출력 → 설정별 형식(SettingSchema).
// 실측 형식 (SITL 4.5.3 ~ 2026.6.2, docs/cli-compat.md "v2 0단계"):
//
//   gyro_lpf1_static_hz = 250
//   Allowed range: 0 - 1000
//
//   p_roll = 45
//   profile 0                       ← PID·레이트·배터리 프로필 값이면 이 줄
//   Allowed range: 0 - 250
//
//   motor_pwm_protocol = DSHOT600
//   Allowed values: PWM, ONESHOT125, ..., DISABLED
//
//   craft_name = PROBE
//   String length: 1 - 16
//   Default value: -                ← 현재 값이 기본값과 다를 때만
//
// 이름에 대문자가 섞인 설정도 있다 (gyro_1_i2cBus).

import type { SettingSchema } from './types'

const splitLines = (text: string) => text.replace(/\r/g, '').split('\n')

const NAME_LINE = /^([A-Za-z0-9_]+) = (.*)$/
const SECTION_LINE = /^(profile|rateprofile|battery_profile) \d+$/
const SECTION: Record<string, SettingSchema['section']> = { profile: 'pid', rateprofile: 'rate', battery_profile: 'battery' }

export function parseGetSchema(text: string): Record<string, SettingSchema> {
  const out: Record<string, SettingSchema> = {}
  let cur: { name: string; s: Partial<SettingSchema> & { section: SettingSchema['section'] } } | null = null

  const flush = () => {
    if (cur?.s.kind) out[cur.name] = cur.s as SettingSchema
    cur = null
  }

  for (const raw of splitLines(text)) {
    const line = raw.trimEnd()
    let m: RegExpExecArray | null
    if ((m = NAME_LINE.exec(line))) {
      flush()
      cur = { name: m[1], s: { section: 'master' } }
      continue
    }
    if (!cur) continue
    if ((m = SECTION_LINE.exec(line))) {
      cur.s.section = SECTION[m[1]]
    } else if ((m = /^Allowed range: (-?\d+) - (-?\d+)$/.exec(line))) {
      Object.assign(cur.s, { kind: 'number', min: Number(m[1]), max: Number(m[2]) })
    } else if ((m = /^Allowed values: (.*)$/.exec(line))) {
      const values = m[1].split(',').map((v) => v.trim()).filter(Boolean)
      const isBool = values.length === 2 && values[0] === 'OFF' && values[1] === 'ON'
      Object.assign(cur.s, isBool ? { kind: 'bool', values } : { kind: 'enum', values })
    } else if ((m = /^String length: (\d+) - (\d+)$/.exec(line))) {
      Object.assign(cur.s, { kind: 'string', minLength: Number(m[1]), maxLength: Number(m[2]) })
    } else if ((m = /^Array length: (\d+)$/.exec(line))) {
      Object.assign(cur.s, { kind: 'array', length: Number(m[1]) })
    } else if ((m = /^Default value: (.*)$/.exec(line))) {
      cur.s.default = m[1]
    }
  }
  flush()
  return out
}

/** 값이 형식에 맞는지 (편집 모드 범위 검사용). 맞으면 null, 아니면 이유 */
export function validateValue(schema: SettingSchema, value: string): string | null {
  switch (schema.kind) {
    case 'number': {
      if (!/^-?\d+$/.test(value.trim())) return '숫자가 아닙니다'
      const n = Number(value)
      if (schema.min !== undefined && n < schema.min) return `${schema.min} 이상이어야 합니다`
      if (schema.max !== undefined && n > schema.max) return `${schema.max} 이하여야 합니다`
      return null
    }
    case 'enum':
    case 'bool':
      return schema.values?.some((v) => v.toUpperCase() === value.trim().toUpperCase()) ? null : '허용된 값이 아닙니다'
    case 'string': {
      // '-' 는 빈 문자열 (cli.c: "STRING MUST BE 1-n CHARACTERS OR '-' FOR EMPTY")
      if (value === '-' || value === '') return null
      if (schema.maxLength !== undefined && value.length > schema.maxLength) return `${schema.maxLength}자 이하여야 합니다`
      if (schema.minLength !== undefined && value.length < schema.minLength) return `${schema.minLength}자 이상이어야 합니다`
      return null
    }
    case 'array': {
      const parts = value.split(',')
      if (schema.length !== undefined && parts.length !== schema.length) return `값 ${schema.length}개를 쉼표로 구분해야 합니다`
      return parts.every((p) => /^-?\d+$/.test(p.trim())) ? null : '숫자만 넣을 수 있습니다'
    }
  }
}
