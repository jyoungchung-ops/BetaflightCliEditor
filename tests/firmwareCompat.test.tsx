// 펌웨어 버전 호환성: 화면·샘플이 쓰는 키 이름이 실제 펌웨어에 있는지,
// 2025.12에서 바뀐 항목(serial 포트 이름, D 의미, failsafe, GPS 레스큐)이 제대로 보이는지 검사한다.
// 실제 키 목록 fixtures/settings-names/*.json 은 betaflight cli/settings.c 에서 뽑은 이름 목록이다.

import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { buildSnapshot, parseCli, serialIdFromName } from '../src/shared/cli/parser'
import { portName } from '../src/shared/mapping/serial'
import { PID_PROFILE_SHOWN, RATE_PROFILE_SHOWN, TAB_MASTER_KEYS } from '../src/shared/mapping/tabKeys'
import { PidTab } from '../src/renderer/src/tabs/PidTab'
import { TAB_VIEWS } from '../src/renderer/src/tabs'
import { SnapshotProvider } from '../src/renderer/src/ui/snapshot'
import type { TabId } from '../src/shared/tabs'

type Names = { master: string[]; pid: string[]; rate: string[]; battery?: string[] }
type Section = 'master' | 'pid' | 'rate'

const ROOT = join(__dirname, '..')
const NAMES_DIR = join(ROOT, 'fixtures', 'settings-names')
const SAMPLE = join(ROOT, 'fixtures', 'sample')
const TABS_DIR = join(ROOT, 'src', 'renderer', 'src', 'tabs')

const VERSIONS = readdirSync(NAMES_DIR).filter((f) => f.endsWith('.json')).map((f) => f.replace('.json', ''))
const NAMES: Record<string, Names> = Object.fromEntries(
  VERSIONS.map((v) => [v, JSON.parse(readFileSync(join(NAMES_DIR, `${v}.json`), 'utf8'))])
)
// 2026.6+ 배터리 키는 battery 섹션(battery_profile N)에 있다 — 화면에서는 master 처럼 쓰므로 master 검사에 포함
const inAny = (section: Section, key: string) =>
  VERSIONS.some((v) => NAMES[v][section].includes(key) || (section === 'master' && (NAMES[v].battery ?? []).includes(key)))

/** 샘플의 펌웨어 계열 → 비교할 실제 목록 */
const NAMES_FOR: Record<string, string> = { '4.5': '4.5.5', '2025.12': '2025.12.5' }

const read = (f: string) => readFileSync(join(SAMPLE, f), 'utf8')
const samples = readdirSync(SAMPLE).filter((f) => f.endsWith('.expected.json')).map((f) => f.replace('.expected.json', ''))

function sampleSnapshot(id: string) {
  const expected = JSON.parse(read(`${id}.expected.json`))
  const snap = buildSnapshot({
    craftName: expected.craftName,
    readAt: '2026-10-19T00:00:00.000Z',
    raw: { version: read(`${id}.version.txt`), status: read(`${id}.status.txt`), diffAll: read(`${id}.diff.txt`), dumpAll: read(`${id}.dump.txt`) }
  })
  return { expected, snap }
}

describe('실제 펌웨어 키 목록', () => {
  it('세 버전이 있다', () => {
    expect(VERSIONS.sort()).toEqual(['2025.12.5', '2026.6.2', '4.5.5'])
    for (const v of VERSIONS) {
      expect(NAMES[v].master.length).toBeGreaterThan(500)
      expect(NAMES[v].pid.length).toBeGreaterThan(100)
      expect(NAMES[v].rate.length).toBeGreaterThan(15)
    }
  })
})

describe.each(samples)('샘플 %s 의 키가 실제 펌웨어에 있다', (id) => {
  const { expected, snap } = sampleSnapshot(id)
  const real = NAMES[NAMES_FOR[expected.firmware]]

  it('비교할 목록이 정해져 있다', () => {
    expect(real, expected.firmware).toBeDefined()
  })
  it('master', () => {
    expect(Object.keys(snap.master).filter((k) => !real.master.includes(k))).toEqual([])
  })
  it('PID 프로필', () => {
    const keys = new Set(snap.pidProfiles.flatMap((p) => Object.keys(p)))
    expect([...keys].filter((k) => !real.pid.includes(k))).toEqual([])
  })
  it('레이트 프로필', () => {
    const keys = new Set(snap.rateProfiles.flatMap((p) => Object.keys(p)))
    expect([...keys].filter((k) => !real.rate.includes(k))).toEqual([])
  })
})

// ── 화면이 쓰는 키 이름이 실제로 있는지 (오타·없는 키 방지) ─────────────────
function tabSource(file: string) {
  return readFileSync(join(TABS_DIR, file), 'utf8')
}
const tabFiles = readdirSync(TABS_DIR).filter((f) => f.endsWith('Tab.tsx'))

/** 탭 소스에서 [섹션, 키] 를 모은다 */
function keysUsedInTabs(): [Section, string, string][] {
  const out: [Section, string, string][] = []
  for (const file of tabFiles) {
    const src = tabSource(file)
    for (const m of src.matchAll(/<Master(?:Field|Toggle)\s+name="([a-z0-9_]+)"/g)) out.push(['master', m[1], file])
    // FieldDef 배열: ['키', '라벨', ...]
    for (const block of src.matchAll(/:\s*FieldDef\[\]\s*=\s*\[([\s\S]*?)\n\]/g)) {
      for (const m of block[1].matchAll(/\[\s*'([a-z0-9_]+)'\s*,/g)) out.push(['master', m[1], file])
    }
    for (const m of src.matchAll(/<(?:F|ProfileField kind="pid" n=\{n\})\s+name="([a-z0-9_]+)"/g)) out.push(['pid', m[1], file])
    for (const m of src.matchAll(/<(?:R|ProfileField kind="rate" n=\{n\})\s+name="([a-z0-9_]+)"/g)) out.push(['rate', m[1], file])
  }
  return out
}

describe('화면이 쓰는 키 이름', () => {
  const used = keysUsedInTabs()

  it('탭 소스에서 키를 충분히 찾았다 (검사 자체 확인)', () => {
    expect(used.filter(([s]) => s === 'master').length).toBeGreaterThan(150)
    expect(used.filter(([s]) => s === 'pid').length).toBeGreaterThan(80)
  })

  it('모든 키가 적어도 한 버전의 실제 펌웨어에 있다', () => {
    const missing = used.filter(([s, k]) => !inAny(s, k)).map(([s, k, f]) => `${f}: ${s}.${k}`)
    expect(missing).toEqual([])
  })

  it('매핑 표(tabKeys)의 정확한 키도 실제로 있다', () => {
    const missing = Object.entries(TAB_MASTER_KEYS).flatMap(([tab, r]) => (r?.keys ?? []).filter((k) => !inAny('master', k)).map((k) => `${tab}.${k}`))
    expect(missing).toEqual([])
    expect([...PID_PROFILE_SHOWN].filter((k) => !inAny('pid', k))).toEqual([])
    expect([...RATE_PROFILE_SHOWN].filter((k) => !inAny('rate', k))).toEqual([])
  })
})

// ── 2025.12 변경 항목이 제대로 보이는지 ─────────────────────────────
describe('serial 포트 이름 (2025.12+)', () => {
  it('이름 → 식별자 (io/serial.h)', () => {
    expect(['VCP', 'UART0', 'UART1', 'UART10', 'SOFT1', 'SOFT2', 'LPUART1'].map(serialIdFromName)).toEqual([20, 50, 51, 60, 30, 31, 40])
    expect(serialIdFromName('FOO')).toBeNull()
  })
  it('표시 이름: 4.5 숫자와 2025.12 이름을 모두 해석', () => {
    expect(portName(1)).toBe('UART2') // 4.5: 0 = UART1
    expect(portName(52)).toBe('UART2') // 2025.12: 51 = UART1
    expect(portName(52, 'UART2')).toBe('UART2')
    expect(portName(20, 'VCP')).toBe('USB VCP')
    expect(portName(30, 'SOFT1')).toBe('SOFTSERIAL1')
  })
  it('serial UART2 64 ... 줄을 파싱하고 키는 이름으로', () => {
    const p = parseCli('serial VCP 1 115200 57600 0 115200\nserial UART2 64 115200 57600 0 115200\nserial UART9X 1 1 1 1 1')
    expect(p.serial).toEqual([
      { id: 20, name: 'VCP', functionMask: 1, mspBaud: 115200, gpsBaud: 57600, telemetryBaud: 0, blackboxBaud: 115200 },
      { id: 52, name: 'UART2', functionMask: 64, mspBaud: 115200, gpsBaud: 57600, telemetryBaud: 0, blackboxBaud: 115200 }
    ])
    expect(p.keys).toEqual(['serial.VCP', 'serial.UART2'])
    expect(p.unknown).toEqual(['serial UART9X 1 1 1 1 1'])
  })
})

describe('4.5 / 2025.12 같은 기체 비교 (Moz7 샘플)', () => {
  const old = sampleSnapshot('moz7').snap
  const neu = sampleSnapshot('moz7-2025.12').snap
  const render = (snap: typeof old, el: React.ReactElement) =>
    renderToStaticMarkup(<SnapshotProvider snap={snap}>{el}</SnapshotProvider>)

  it('펌웨어 버전', () => {
    expect(old.meta.version).toBe('4.5.1')
    expect(neu.meta.version).toBe('2025.12.5')
  })

  it('포트 탭: 둘 다 UART2 = Serial RX, UART3 = GPS', () => {
    for (const s of [old, neu]) {
      const byName = Object.fromEntries(s.serial.map((p) => [portName(p.id, p.name), p.functionMask]))
      expect(byName).toMatchObject({ 'USB VCP': 1, UART1: 131073, UART2: 64, UART3: 2 })
    }
    expect(render(neu, <>{(() => { const V = TAB_VIEWS.ports; return <V /> })()}</>)).toContain('serial UART2')
  })

  it('PID 표: 같은 튜닝이 버전에 맞는 열 이름으로 나온다', () => {
    const a = render(old, <PidTab />)
    const b = render(neu, <PidTab />)
    expect(a).toContain('D (최대)')
    expect(a).toContain('D Min (기본)')
    expect(a).not.toContain('D Max (최대)')
    expect(b).toContain('D (기본)')
    expect(b).toContain('D Max (최대)')
    expect(b).toContain('>S<')
    // 최대 D 46 / 기본 D 36 은 같은 값이지만 다른 키에 있다
    expect(old.pidProfiles[0]).toMatchObject({ d_roll: '46', d_min_roll: '36' })
    expect(neu.pidProfiles[0]).toMatchObject({ d_roll: '36', d_max_roll: '46' })
  })

  it('PID 필터: dterm_lpf1_dyn_* 가 D-term 패널에 나온다 (4.5, 2025.12 모두)', () => {
    for (const s of [old, neu]) expect(render(s, <PidTab initialSub="filters" />)).toContain('<code class="key">dterm_lpf1_dyn_min_hz</code>')
  })

  it('모터 아이들: dshot_idle_value(4.5) / motor_idle(2025.12) 모두 % 로', () => {
    const V = TAB_VIEWS.configuration
    expect(render(old, <V />)).toContain('<code class="key">dshot_idle_value</code>')
    expect(render(neu, <V />)).toContain('<code class="key">motor_idle</code>')
    expect(render(neu, <V />)).toContain('5.50')
  })

  it('페일세이프: failsafe_off_delay(0.1초) → failsafe_landing_time(초)', () => {
    const V = TAB_VIEWS.failsafe
    const a = render(old, <V />)
    const b = render(neu, <V />)
    expect(a).toContain('<code class="key">failsafe_off_delay</code>')
    expect(a).toMatch(/1\.0<span class="unit">s</)
    expect(b).toContain('<code class="key">failsafe_landing_time</code>')
    expect(b).toMatch(/60<span class="unit">s</)
  })

  it('GPS: 2025.12 오토파일럿(ap_*) 패널, 4.5 에는 없음', () => {
    const V = TAB_VIEWS.gps
    expect(render(old, <V />)).not.toContain('오토파일럿')
    const b = render(neu, <V />)
    expect(b).toContain('오토파일럿')
    expect(b).toContain('<code class="key">ap_hover_throttle</code>')
    expect(render(old, <V />)).toContain('<code class="key">gps_rescue_landing_alt</code>')
  })

  it('구성: 2025.12 는 자이로 정렬 키가 없다는 안내', () => {
    const V = TAB_VIEWS.configuration
    expect(render(neu, <V />)).toContain('자이로 정렬을 set 값으로 내보내지 않습니다')
    expect(render(old, <V />)).not.toContain('자이로 정렬을 set 값으로 내보내지 않습니다')
  })

  it('두 버전 모두 모든 탭이 그려진다', () => {
    for (const s of [old, neu]) {
      for (const t of Object.keys(TAB_VIEWS) as TabId[]) {
        const V = TAB_VIEWS[t]
        expect(render(s, <V />).length, t).toBeGreaterThan(200)
      }
    }
  })
})
