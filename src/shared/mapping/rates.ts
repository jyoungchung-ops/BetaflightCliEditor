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
