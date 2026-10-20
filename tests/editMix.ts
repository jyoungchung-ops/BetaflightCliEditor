// 테스트용: SITL 원문에 여러 종류(master·PID·레이트·배터리·줄)를 섞은 편집을 만든다
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { buildSnapshot } from '../src/shared/cli/parser'
import type { CraftSnapshot } from '../src/shared/cli/types'
import { emptyEditState, setValue, type EditState } from '../src/shared/edit/session'

export const FIX = join(__dirname, '..', 'fixtures')

export function loadSitl(tag: string): CraftSnapshot {
  const r = (f: string) => readFileSync(join(FIX, `sitl-${tag}`, f), 'utf8')
  return buildSnapshot({
    craftName: `SITL ${tag}`,
    readAt: '2026-10-20T00:00:00.000Z',
    raw: { version: r('version.txt'), status: r('status.txt'), diffAll: r('diff.txt'), dumpAll: r('dump.txt'), get: r('get.txt') }
  })
}

export const apply = (base: CraftSnapshot, steps: [string, string][]) =>
  steps.reduce<EditState>((s, [k, v]) => setValue(s, base, k, v), emptyEditState())

/** 스키마에서 현재 값과 다른 유효한 값을 하나 고른다 */
function otherValue(base: CraftSnapshot, name: string, cur: string): string | undefined {
  const s = base.schema![name]
  if (s.kind === 'number' && s.min !== undefined && s.max !== undefined) {
    const n = Number(cur)
    return String(n < s.max ? n + 1 : n - 1)
  }
  if ((s.kind === 'enum' || s.kind === 'bool') && s.values && s.values.length > 1) return s.values.find((v) => v !== cur)
  if (s.kind === 'string') return cur === 'ZZ' ? 'YY' : 'ZZ'
  return undefined
}

export function mixedSteps(base: CraftSnapshot): [string, string][] {
  // 여러 종류를 섞은 편집: master · PID(활성 아닌 프로필 포함) · 레이트 · 배터리 · 줄
  const steps: [string, string][] = []
  const pick = (scope: 'master' | 'pid' | 'rate' | 'battery', n: number, count: number) => {
    const src = scope === 'master' ? base.master : scope === 'pid' ? base.pidProfiles[n] : scope === 'rate' ? base.rateProfiles[n] : base.batteryProfiles?.[n]
    if (!src) return
    let got = 0
    for (const [k, v] of Object.entries(src)) {
      if (got >= count || !base.schema?.[k]) continue
      const nv = otherValue(base, k, v)
      if (nv === undefined) continue
      steps.push([scope === 'master' ? `master.${k}` : `${scope}.${n}.${k}`, nv])
      got++
    }
  }
  pick('master', 0, 25)
  pick('pid', 0, 10)
  pick('pid', 2, 5)
  pick('rate', 0, 8)
  pick('rate', 1, 3)
  pick('battery', 1, 3)
  const port = base.serial.find((p) => !(p.name ? p.name === 'VCP' : p.id === 20))!
  const tok = port.name ?? String(port.id)
  // MOTOR_STOP 은 모든 SITL 빌드에 있다 (2025.12+ 는 빌드에 없는 기능에 'Unavailable X' 를 답하고 바꾸지 않음)
  const feat = 'MOTOR_STOP' in base.features ? 'MOTOR_STOP' : Object.keys(base.features)[0]
  steps.push(
    ['master.craft_name', 'ROUND TRIP'],
    ['aux.3', 'aux 3 0 1 1700 2100 0 0'],
    ['aux.1', 'aux 1 1 0 1300 1700 0 0'],
    [`serial.${tok}`, `serial ${tok} 64 ${port.mspBaud} ${port.gpsBaud} ${port.telemetryBaud} ${port.blackboxBaud}`],
    [`feature.${feat}`, `feature ${base.features[feat] ? '-' : ''}${feat}`],
    ['map', 'map TAER1234'],
    ['rxfail.4', 'rxfail 4 s 1800']
  )
  return steps
}
