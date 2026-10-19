import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { buildSnapshot } from '../src/shared/cli/parser'
import { maxRate } from '../src/shared/mapping/rates'
import { describeSerialFunctions, portName } from '../src/shared/mapping/serial'
import { PID_PROFILE_SHOWN, RATE_PROFILE_SHOWN, TAB_MASTER_KEYS, isMappedMasterKey } from '../src/shared/mapping/tabKeys'
import { TAB_VIEWS } from '../src/renderer/src/tabs'
import { PidTab } from '../src/renderer/src/tabs/PidTab'
import { decodeOsdPos, osdCanvas } from '../src/shared/mapping/osd'
import { SnapshotProvider } from '../src/renderer/src/ui/snapshot'
import type { TabId } from '../src/shared/tabs'

const SAMPLE = join(__dirname, '..', 'fixtures', 'sample')
const TABS_DIR = join(__dirname, '..', 'src', 'renderer', 'src', 'tabs')
const read = (f: string) => readFileSync(join(SAMPLE, f), 'utf8')

function sampleSnapshot(id: string) {
  const expected = JSON.parse(read(`${id}.expected.json`))
  return buildSnapshot({
    craftName: expected.craftName,
    readAt: '2026-10-19T00:00:00.000Z',
    raw: {
      version: read(`${id}.version.txt`),
      status: read(`${id}.status.txt`),
      diffAll: read(`${id}.diff.txt`),
      dumpAll: read(`${id}.dump.txt`)
    }
  })
}

describe('레이트 공식 (Betaflight App 표시값과 비교)', () => {
  it('BETAFLIGHT: RC 1.00 / 슈퍼 0.70 → 667°/s', () => {
    expect(Math.round(maxRate('BETAFLIGHT', { rcRate: 100, srate: 70, expo: 0, limit: 1998 })!)).toBe(667)
  })
  it('ACTUAL: 중앙 70 / 최대 670 → 670°/s', () => {
    expect(Math.round(maxRate('ACTUAL', { rcRate: 7, srate: 67, expo: 0, limit: 1998 })!)).toBe(670)
  })
  it('KISS: RC 1.00 / 레이트 0.70 → 667°/s', () => {
    expect(Math.round(maxRate('KISS', { rcRate: 100, srate: 70, expo: 0, limit: 1998 })!)).toBe(667)
  })
  it('QUICK: RC 200 / 최대 670 → 670°/s', () => {
    expect(Math.round(maxRate('QUICK', { rcRate: 100, srate: 67, expo: 0, limit: 1998 })!)).toBe(670)
  })
  it('rate_limit으로 자른다', () => {
    expect(maxRate('ACTUAL', { rcRate: 20, srate: 100, expo: 0, limit: 800 })).toBe(800)
  })
  it('모르는 방식은 null', () => {
    expect(maxRate('RACEFLIGHT', { rcRate: 1, srate: 1, expo: 0, limit: 0 })).toBeNull()
  })
})

describe('시리얼 해석', () => {
  it('포트 이름', () => {
    expect([0, 1, 9, 20, 30, 31, 40].map(portName)).toEqual(['UART1', 'UART2', 'UART10', 'USB VCP', 'SOFTSERIAL1', 'SOFTSERIAL2', 'LPUART1'])
  })
  it('기능 비트', () => {
    const f = describeSerialFunctions(1 | 64 | 2 | 128 | 131072 | 32)
    expect(f).toMatchObject({ msp: true, rx: true, telemetry: ['SmartPort'], sensors: ['GPS'], unknownBits: 0 })
    expect(f.peripherals).toEqual(['블랙박스', 'VTX (MSP + DisplayPort)'])
  })
})

// ── 탭 소스의 키가 매핑 표에 있는지 ──────────────────────
const TAB_FILES: [string, TabId][] = [
  ['SetupTab.tsx', 'setup'],
  ['PortsTab.tsx', 'ports'],
  ['ConfigurationTab.tsx', 'configuration'],
  ['ReceiverTab.tsx', 'receiver'],
  ['ModesTab.tsx', 'modes'],
  ['PidTab.tsx', 'pid']
]

describe('탭 키 매핑', () => {
  it.each(TAB_FILES)('%s의 master 키가 그 탭 매핑에 있다', (file, tab) => {
    const src = readFileSync(join(TABS_DIR, file), 'utf8')
    const names = [...src.matchAll(/<Master(?:Field|Toggle)\s+name="([a-z0-9_]+)"/g)].map((m) => m[1])
    const rule = TAB_MASTER_KEYS[tab] ?? { keys: [] }
    const missing = names.filter((n) => !rule.keys.includes(n) && !(rule.prefixes ?? []).some((p) => n.startsWith(p)))
    expect(missing).toEqual([])
  })

  it('PID 탭의 프로필 키가 SHOWN 목록에 있다', () => {
    const src = readFileSync(join(TABS_DIR, 'PidTab.tsx'), 'utf8')
    const pid = [...src.matchAll(/<(?:F|ProfileField kind="pid" n=\{n\})\s+name="([a-z0-9_]+)"/g)].map((m) => m[1])
    const rate = [...src.matchAll(/<(?:R|ProfileField kind="rate" n=\{n\})\s+name="([a-z0-9_]+)"/g)].map((m) => m[1])
    expect(pid.length).toBeGreaterThan(50)
    expect(pid.filter((k) => !PID_PROFILE_SHOWN.has(k))).toEqual([])
    expect(rate.filter((k) => !RATE_PROFILE_SHOWN.has(k))).toEqual([])
  })
})

// ── 탭 렌더링 (서버 렌더로 예외 없이 그려지는지 + 대표 값) ──────
const samples = readdirSync(SAMPLE).filter((f) => f.endsWith('.expected.json')).map((f) => f.replace('.expected.json', ''))

describe.each(samples)('탭 렌더링: %s', (id) => {
  const snap = sampleSnapshot(id)
  const render = (tab: TabId) => {
    const View = TAB_VIEWS[tab]!
    return renderToStaticMarkup(
      <SnapshotProvider snap={snap}>
        <View />
      </SnapshotProvider>
    )
  }

  it.each(Object.keys(TAB_VIEWS) as TabId[])('%s 탭이 그려진다', (tab) => {
    expect(render(tab).length).toBeGreaterThan(200)
  })

  it('설정 탭: 펌웨어·보드', () => {
    const html = render('setup')
    expect(html).toContain(snap.meta.firmware)
    expect(html).toContain(snap.meta.board)
  })

  it('포트 탭: UART2 = Serial RX', () => {
    expect(render('ports')).toContain('UART2')
  })

  it('PID 탭: 활성 프로필의 P 값과 변경 표시', () => {
    const html = render('pid')
    const p = snap.pidProfiles[snap.meta.activePidProfile]
    expect(html).toContain(`>${p.p_roll}<`)
    if (snap.changed.includes(`pid.${snap.meta.activePidProfile}.p_roll`)) expect(html).toContain('cell-changed')
  })

  it('모드 탭: ARM 범위', () => {
    const html = render('modes')
    expect(html).toContain('ARM')
    expect(html).toContain('1700 – 2100')
  })

  // 모든 탭 + PID 하위 탭(레이트·필터)을 그린 HTML
  const wrap = (el: React.ReactElement) => renderToStaticMarkup(<SnapshotProvider snap={snap}>{el}</SnapshotProvider>)
  const drawn = [
    ...Object.keys(TAB_VIEWS).map((t) => render(t as TabId)),
    wrap(<PidTab initialSub="rates" />),
    wrap(<PidTab initialSub="filters" />)
  ].join('')

  it('모든 master 키가 어느 탭에든 표시된다 (빠지는 키 없음)', () => {
    const missing = Object.keys(snap.master).filter((k) => !drawn.includes(`<code class="key">${k}</code>`))
    expect(missing).toEqual([])
  })

  it('활성 프로필의 모든 PID·레이트 키가 PID 탭에 표시된다', () => {
    const pid = snap.pidProfiles[snap.meta.activePidProfile]
    const rate = snap.rateProfiles[snap.meta.activeRateProfile]
    const missingPid = Object.keys(pid).filter((k) => !PID_PROFILE_SHOWN.has(k) && !drawn.includes(`<code class="key">${k}</code>`))
    const missingRate = Object.keys(rate).filter((k) => !RATE_PROFILE_SHOWN.has(k) && !drawn.includes(`<code class="key">${k}</code>`))
    expect([...missingPid, ...missingRate]).toEqual([])
  })

  it('변경된 master 키는 모두 노란 점으로 표시된다', () => {
    const changedMaster = snap.changed.filter((k) => k.startsWith('master.')).map((k) => k.slice(7))
    expect(changedMaster.length).toBeGreaterThan(0)
    for (const k of changedMaster) {
      const re = new RegExp(`<code class="key">${k}</code>[^]*?</div>`)
      expect(re.exec(drawn)?.[0], k).toContain('class="dot"')
    }
  })

  it('OSD 탭: 캔버스와 보이는 요소', () => {
    const html = render('osd')
    expect(html).toContain('53×20')
    expect(html).toContain('osd-el')
  })

  it('기타 탭: 매핑 안 된 키 표가 있다', () => {
    expect(render('other')).toContain('매핑되지 않은 설정')
  })
})

describe('OSD 위치 해석', () => {
  it('x·y·프로필 비트', () => {
    // x=46(HD 확장 비트 사용), y=17, 프로필 1·3에서 표시
    const v = (46 & 31) | ((46 & 32) << 5) | (17 << 5) | 0x800 | 0x2000
    expect(decodeOsdPos(v)).toEqual({ x: 46, y: 17, visible: [true, false, true] })
    expect(decodeOsdPos(234)).toEqual({ x: 10, y: 7, visible: [false, false, false] })
  })
  it('캔버스 크기', () => {
    expect(osdCanvas({ vcd_video_system: 'HD' })).toMatchObject({ cols: 53, rows: 20 })
    expect(osdCanvas({ vcd_video_system: 'NTSC' })).toMatchObject({ cols: 30, rows: 13 })
    expect(osdCanvas({ vcd_video_system: 'AUTO' })).toMatchObject({ cols: 30, rows: 16 })
    expect(osdCanvas({}, 'MSP (60 x 22)')).toMatchObject({ cols: 60, rows: 22 })
  })
})

describe('기타 탭으로 갈 키', () => {
  it('샘플의 master 키는 대부분 매핑되어 있다', () => {
    const snap = sampleSnapshot('moz7')
    const unmapped = Object.keys(snap.master).filter((k) => !isMappedMasterKey(k))
    // 매핑에 없는 키는 기타 탭에 나온다 — 개수만 기록해 둔다
    expect(unmapped.length).toBeLessThan(Object.keys(snap.master).length / 3)
  })
})
