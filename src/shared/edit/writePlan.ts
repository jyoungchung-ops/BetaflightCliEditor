// v2 5단계: 기체에 쓰기 전 일치 검사와 쓴 뒤 재검증 (SPEC 11절 3·8단계). 화면과 메인 프로세스가 같은 함수를 쓴다.
// 순수 함수만 둔다 — 시리얼·파일은 main/serial/writeFlow.ts.

import type { CraftSnapshot } from '../cli/types'
import { parseSetKey, tabOfKey, valueOf, type Edits } from './session'

/** 쓰기를 허용하는 펌웨어 (SITL 로 실측한 계열, docs/cli-compat.md 0단계 결론 6) */
const SUPPORTED = [/^4\.5\.\d+$/, /^2025\.12\.\d+$/, /^2026\.6\.\d+$/]

export interface WriteSupport {
  ok: boolean
  reason?: string
  /** 4.5.4+ 는 save noreboot 으로 같은 연결에서 재검증. 4.5.3 은 save 가 늘 재부팅 */
  noreboot: boolean
}

export function writeSupport(meta: CraftSnapshot['meta']): WriteSupport {
  const v = meta.version ?? ''
  if (!SUPPORTED.some((r) => r.test(v)))
    return { ok: false, noreboot: false, reason: v ? `이 펌웨어(${v})는 아직 쓰기를 지원하지 않습니다` : '펌웨어 버전을 알 수 없어 쓸 수 없습니다' }
  const [a, b, c] = v.split('.').map(Number)
  return { ok: true, noreboot: a > 4 || b > 5 || c >= 4 }
}

export interface Conflict {
  key: string
  /** 편집 원본 값 */
  before: string
  /** 지금 기체 값 */
  now: string | undefined
  /** 내 편집 */
  after: string
}

export interface PreCheck {
  /** 하나라도 있으면 쓸 수 없다 */
  blockers: string[]
  /** 원본을 읽은 뒤 기체에서 바뀐 값 — 사용자에게 "내 편집으로 덮기 / 취소"를 묻는다 */
  conflicts: Conflict[]
  support: WriteSupport
}

/** 펌웨어 헤더 한 줄 ("Betaflight / STM32F405 (S405) 4.5.1 Nov 1 2024 / 12:00:00 (abc123) MSP API: 1.46") — 버전·타깃·빌드 */
export function firmwareHeader(s: CraftSnapshot): string {
  for (const t of [s.raw.version, s.raw.diffAll, s.raw.dumpAll]) {
    const m = /^#?\s*(\S+ \/ .+)$/m.exec(t ?? '')
    if (m) return m[1].trim()
  }
  return ''
}

/** 11절 3단계: 펌웨어 헤더·보드 이름·편집 대상 키의 현재 값 */
export function checkBeforeWrite(base: CraftSnapshot, current: CraftSnapshot, edits: Edits): PreCheck {
  const blockers: string[] = []
  const support = writeSupport(current.meta)
  if (!support.ok) blockers.push(support.reason!)
  const hb = firmwareHeader(base)
  const hc = firmwareHeader(current)
  if (!hb || hb !== hc) blockers.push(`펌웨어(버전·타깃·빌드)가 다릅니다 — 편집 원본: ${hb || '(없음)'} / 지금 기체: ${hc || '(없음)'}`)
  if ((base.meta.board ?? '') !== (current.meta.board ?? ''))
    blockers.push(`보드가 다릅니다 — 편집 원본: ${base.meta.board || '(없음)'} / 지금 기체: ${current.meta.board || '(없음)'}. 다른 기체일 수 있습니다`)
  if (!current.raw.dumpAll.trim()) blockers.push('기체의 dump all 을 읽지 못했습니다')
  if (Object.keys(edits).length === 0) blockers.push('쓸 편집이 없습니다')

  const conflicts: Conflict[] = []
  for (const e of Object.values(edits)) {
    const now = valueOf(current, e.key)
    if (now !== e.before) conflicts.push({ key: e.key, before: e.before, now, after: e.after })
  }
  return { blockers, conflicts, support }
}

export interface Mismatch {
  key: string
  /** 기대한 값 (편집 = 새 값, 편집 안 함 = 쓰기 전 값) */
  expected: string | undefined
  actual: string | undefined
  edited: boolean
}

/** dump 에서 비교할 키 (줄 편집 키 + 모든 set 키) */
function comparableKeys(s: CraftSnapshot): string[] {
  const keys = new Set<string>()
  for (const k of Object.keys(s.master)) keys.add(`master.${k}`)
  s.pidProfiles.forEach((p, i) => p && Object.keys(p).forEach((k) => keys.add(`pid.${i}.${k}`)))
  s.rateProfiles.forEach((p, i) => p && Object.keys(p).forEach((k) => keys.add(`rate.${i}.${k}`)))
  s.batteryProfiles?.forEach((p, i) => p && Object.keys(p).forEach((k) => keys.add(`battery.${i}.${k}`)))
  for (const f of Object.keys(s.features)) keys.add(`feature.${f}`)
  for (const a of s.aux) keys.add(`aux.${a.index}`)
  for (const p of s.serial) keys.add(`serial.${p.name ?? p.id}`)
  if (s.rxMap) keys.add('map')
  for (const r of s.rxFail) keys.add(`rxfail.${r.channel}`)
  return [...keys]
}

/**
 * 11절 8단계: 편집한 값은 새 값과, 편집하지 않은 값은 쓰기 전(백업)과 같은가.
 * before = 쓰기 직전에 읽은 기체, after = 쓴 뒤 다시 읽은 기체 (둘 다 dump all 기준)
 */
export function verifyAfterWrite(before: CraftSnapshot, after: CraftSnapshot, edits: Edits): Mismatch[] {
  const out: Mismatch[] = []
  for (const e of Object.values(edits)) {
    const actual = valueOf(after, e.key)
    if (actual !== e.after) out.push({ key: e.key, expected: e.after, actual, edited: true })
  }
  const keys = new Set([...comparableKeys(before), ...comparableKeys(after)])
  for (const k of keys) {
    if (edits[k]) continue
    const b = valueOf(before, k)
    const a = valueOf(after, k)
    if (a !== b) out.push({ key: k, expected: b, actual: a, edited: false })
  }
  return out
}

// ── 12절: 추가 경고가 필요한 값 ─────────────────────────

const WARN_MOTOR = '모터 방향·동작이 바뀔 수 있음. 프롭 없이 모터 탭에서 확인'
const WARN_ALIGN = '자세 인식이 틀리면 이륙 즉시 추락'
const WARN_RX = '조종기가 인식되지 않거나 O4 항전기 연결이 끊길 수 있음'
const WARN_MODE = '시동 스위치가 바뀜'
const WARN_FAILSAFE = '신호 상실 시 동작이 바뀜'
const WARN_FILTER = '모터 과열 위험. 첫 비행은 짧게 하고 모터 온도 확인'

const SET_WARNINGS: [RegExp, string][] = [
  [/^(motor_pwm_protocol|dshot_bidir|motor_poles|yaw_motors_reversed|mixer|mixer_type)$/, WARN_MOTOR],
  [/^(align_board_|gyro_\d_sensor_align|gyro_\d_align_)/, WARN_ALIGN],
  [/^(serialrx_provider|serialrx_inverted|serialrx_halfduplex|rx_spi_protocol)$/, WARN_RX],
  [/^(failsafe_)/, WARN_FAILSAFE],
  [/^(gyro_lpf|dterm_lpf|dyn_notch_|rpm_filter_|gyro_lowpass|dterm_lowpass|simplified_gyro_filter|simplified_dterm_filter)/, WARN_FILTER]
]
/** ARM · BEEPER · FAILSAFE (modes.ts 의 모드 id) */
const CRITICAL_MODES = new Set([0, 13, 27])

/** 편집 하나의 경고 문구 (없으면 null). before/after 를 모두 봐서 ARM 을 지우는 것도 잡는다 */
export function writeWarning(key: string, before: string, after: string): string | null {
  const s = parseSetKey(key)
  if (s) return SET_WARNINGS.find(([re]) => re.test(s.name))?.[1] ?? null
  if (key.startsWith('serial.') || key === 'map' || key === 'feature.RX_SERIAL' || key === 'feature.RX_SPI' || key === 'feature.RX_PPM') return WARN_RX
  if (key.startsWith('rxfail.')) return WARN_FAILSAFE
  if (key.startsWith('aux.')) {
    const mode = (line: string) => Number(line.split(/\s+/)[2])
    return CRITICAL_MODES.has(mode(before)) || CRITICAL_MODES.has(mode(after)) ? WARN_MODE : null
  }
  return null
}

// ── 백업으로 되돌리기 (11절 끝) ─────────────────────────

/**
 * 지금 기체(now) → 백업(backup) 으로 돌아가는 편집. 둘 다 dump all 기준으로, 다른 값만 만든다.
 * defaults 를 쓰는 전체 복원은 하지 않는다. 이 앱이 만들 수 없는 항목(범위 정보 없는 set 등)은 skipped 로 알려 준다.
 */
export function revertEdits(now: CraftSnapshot, backup: CraftSnapshot): { edits: Edits; skipped: string[] } {
  const edits: Edits = {}
  const skipped: string[] = []
  const keys = new Set([...comparableKeys(now), ...comparableKeys(backup)])
  for (const key of keys) {
    const cur = valueOf(now, key)
    const want = valueOf(backup, key)
    if (cur === want) continue
    const s = parseSetKey(key)
    if (cur === undefined || want === undefined || (s && !now.schema?.[s.name])) {
      skipped.push(key)
      continue
    }
    edits[key] = { key, before: cur, after: want, scope: s ? s.scope : 'line' }
  }
  return { edits, skipped }
}

/** 미리보기 표 한 줄 (탭 / 항목 / 원래 값 / 새 값) */
export interface PreviewRow {
  tab: string
  key: string
  label: string
  before: string
  after: string
  /** 12절 경고 */
  warning: string | null
}

export function previewRows(edits: Edits): PreviewRow[] {
  return Object.values(edits)
    .map((e) => {
      const s = parseSetKey(e.key)
      const label = s ? (s.scope === 'master' ? s.name : `${s.name} (${s.scope === 'pid' ? 'PID' : s.scope === 'rate' ? '레이트' : '배터리'} 프로필 ${s.profile + 1})`) : e.key
      return { tab: tabOfKey(e.key), key: e.key, label, before: e.before, after: e.after, warning: writeWarning(e.key, e.before, e.after) }
    })
    .sort((a, b) => a.tab.localeCompare(b.tab) || a.key.localeCompare(b.key))
}
