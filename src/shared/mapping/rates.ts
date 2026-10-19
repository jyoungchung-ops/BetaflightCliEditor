// 레이트 곡선 계산 (Betaflight rc.c의 rates_type별 공식).
// stick: -1 ~ 1 → 회전 속도 deg/s

export interface AxisRate {
  rcRate: number
  srate: number
  expo: number
  /** 0이면 제한 없음 */
  limit: number
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))
const SETPOINT_RATE_LIMIT = 1998
const RC_RATE_INCREMENTAL = 14.54

function betaflight(r: AxisRate, x: number): number {
  const abs = Math.abs(x)
  const expo = r.expo / 100
  let cmd = x
  if (expo) cmd = x * abs ** 3 * expo + x * (1 - expo)
  let rcRate = r.rcRate / 100
  if (rcRate > 2) rcRate += RC_RATE_INCREMENTAL * (rcRate - 2)
  let angle = 200 * rcRate * cmd
  if (r.srate) angle *= 1 / clamp(1 - abs * (r.srate / 100), 0.01, 1)
  return angle
}

function actual(r: AxisRate, x: number): number {
  const abs = Math.abs(x)
  const e = r.expo / 100
  const expof = abs * (x ** 5 * e + x * (1 - e))
  const center = r.rcRate * 10
  const movement = Math.max(0, r.srate * 10 - center)
  return x * center + movement * expof
}

function kiss(r: AxisRate, x: number): number {
  const abs = Math.abs(x)
  const e = r.expo / 100
  const use = 1 / clamp(1 - abs * (r.srate / 100), 0.01, 1)
  const cmd = (x ** 3 * e + x * (1 - e)) * (r.rcRate / 1000)
  return 2000 * use * cmd
}

function quick(r: AxisRate, x: number): number {
  const abs = Math.abs(x)
  const rcRate = r.rcRate * 2
  if (rcRate === 0) return 0
  const maxDps = Math.max(r.srate * 10, rcRate)
  const e = r.expo / 100
  const superCfg = (maxDps / rcRate - 1) / (maxDps / rcRate)
  const curve = abs ** 3 * e + abs * (1 - e)
  return x * rcRate * (1 / clamp(1 - curve * superCfg, 0.01, 1))
}

const FORMULAS: Record<string, (r: AxisRate, x: number) => number> = {
  BETAFLIGHT: betaflight,
  ACTUAL: actual,
  KISS: kiss,
  QUICK: quick
}

export const supportsRateType = (type: string) => type in FORMULAS

export function rateAt(type: string, r: AxisRate, stick: number): number | null {
  const f = FORMULAS[type]
  if (!f) return null
  const v = clamp(f(r, stick), -SETPOINT_RATE_LIMIT, SETPOINT_RATE_LIMIT)
  return r.limit > 0 ? clamp(v, -r.limit, r.limit) : v
}

/** 최대 회전 속도 (스틱 끝) */
export const maxRate = (type: string, r: AxisRate) => rateAt(type, r, 1)

/**
 * 레이트 프로필 기본값 (fc/controlrate_profile.c:46–61, 4.5.3 · 2025.12.5 같음).
 * diff all 만 있는 파일은 기본값인 값을 적지 않으므로 이 값으로 채운다.
 */
export const RATE_DEFAULTS: Record<string, string> = {
  rates_type: 'ACTUAL',
  thr_mid: '50',
  thr_expo: '0',
  ...Object.fromEntries(
    (['roll', 'pitch', 'yaw'] as const).flatMap((a) => [
      [`${a}_rc_rate`, '7'],
      [`${a}_srate`, '67'],
      [`${a}_expo`, '0'],
      [`${a}_rate_limit`, '1998']
    ])
  )
}

/** 없는 값을 기본값으로 채운 프로필과, 채운 키 목록 */
export function withRateDefaults(profile: Record<string, string>): { profile: Record<string, string>; filled: Set<string> } {
  const filled = new Set(Object.keys(RATE_DEFAULTS).filter((k) => profile[k] === undefined))
  return { profile: { ...RATE_DEFAULTS, ...profile }, filled }
}

/** Actual 방식 곡선을 deg/s 값으로: center = 중앙 감도, max = 최대 레이트, expo 0~1 */
function actualCurve(center: number, max: number, expo: number, x: number): number {
  const abs = Math.abs(x)
  return x * center + Math.max(0, max - center) * (abs * (x ** 5 * expo + x * (1 - expo)))
}

export interface ActualEquivalent {
  /** 중앙 감도 deg/s */
  center: number
  /** 최대 레이트 deg/s */
  max: number
  /** 0~1 */
  expo: number
  /** Actual 방식으로 같은 값을 넣으려면 쓰는 CLI 값 */
  cli: { rc_rate: number; srate: number; expo: number }
  /** 원래 방식이 ACTUAL이면 true (환산 없음) */
  exact: boolean
  /** 환산 곡선과 원래 곡선의 최대 차이 deg/s */
  maxError: number
}

/**
 * 어떤 레이트 방식이든 Actual 방식 값(중앙 감도 / 최대 레이트 / 엑스포)으로 나타낸다.
 * 중앙 감도는 스틱 중앙의 기울기, 최대 레이트는 스틱 끝 값으로 정확히 맞추고,
 * 엑스포는 곡선 전체가 가장 비슷해지는 값을 0.01 단위로 찾는다(근사).
 */
export function toActual(type: string, r: AxisRate): ActualEquivalent | null {
  if (type === 'ACTUAL') {
    const center = r.rcRate * 10
    const max = Math.max(center, r.srate * 10)
    return { center, max, expo: r.expo / 100, cli: { rc_rate: r.rcRate, srate: r.srate, expo: r.expo }, exact: true, maxError: 0 }
  }
  if (!supportsRateType(type)) return null
  const at = (x: number) => rateAt(type, { ...r, limit: 0 }, x) ?? 0
  const h = 1e-4
  const center = at(h) / h
  const max = Math.max(center, maxRate(type, r) ?? 0)
  const xs = Array.from({ length: 41 }, (_, i) => i / 40)
  const target = xs.map((x) => Math.min(at(x), max))
  let best = { expo: 0, err: Infinity }
  for (let e = 0; e <= 100; e++) {
    const err = Math.max(...xs.map((x, i) => Math.abs(Math.min(actualCurve(center, max, e / 100, x), max) - target[i])))
    if (err < best.err) best = { expo: e / 100, err }
  }
  return {
    center,
    max,
    expo: best.expo,
    cli: { rc_rate: Math.round(center / 10), srate: Math.round(max / 10), expo: Math.round(best.expo * 100) },
    exact: false,
    maxError: best.err
  }
}

/** Actual 값(deg/s)으로 곡선 위 한 점 */
export function actualRateAt(a: ActualEquivalent, x: number): number {
  return Math.min(actualCurve(a.center, a.max, a.expo, x), a.max)
}

/** 레이트 프로필의 축별 값 */
export function axisRates(profile: Record<string, string>, axis: 'roll' | 'pitch' | 'yaw'): AxisRate {
  const n = (k: string) => Number(profile[k] ?? 0)
  return {
    rcRate: n(`${axis}_rc_rate`),
    srate: n(`${axis}_srate`),
    expo: n(`${axis}_expo`),
    limit: n(`${axis}_rate_limit`)
  }
}
