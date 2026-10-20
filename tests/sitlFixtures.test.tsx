// SITL 실측 원문(fixtures/sitl-<버전>/, scripts/sitl/run-all.ps1 로 생성)으로 파서·화면을 검사한다.
// 합성 샘플이 아니라 실제 펌웨어가 출력한 dump all / diff all 이다 (SITL 빌드라 OSD·GPS 등 일부 기능은 빠져 있음).
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { buildSnapshot, parseCli } from '../src/shared/cli/parser'
import { TAB_VIEWS } from '../src/renderer/src/tabs'
import { PidTab } from '../src/renderer/src/tabs/PidTab'
import { SnapshotProvider } from '../src/renderer/src/ui/snapshot'
import type { TabId } from '../src/shared/tabs'

const FIX = join(__dirname, '..', 'fixtures')
const dirs = existsSync(FIX) ? readdirSync(FIX).filter((d) => d.startsWith('sitl-') && existsSync(join(FIX, d, 'dump.txt'))) : []
const read = (d: string, f: string) => readFileSync(join(FIX, d, f), 'utf8')

describe.each(dirs)('SITL 원문 %s', (dir) => {
  const tag = dir.replace('sitl-', '')
  const raw = { version: read(dir, 'version.txt'), status: read(dir, 'status.txt'), diffAll: read(dir, 'diff.txt'), dumpAll: read(dir, 'dump.txt') }
  const snap = buildSnapshot({ craftName: `SITL ${tag}`, readAt: '', raw })

  it('버전·타깃', () => {
    expect(snap.meta.version).toBe(tag)
    expect(snap.meta.target).toBe('SITL')
  })

  it('해석 못 한 줄 없음 (dump, diff)', () => {
    expect(snap.unknown).toEqual([])
    expect(parseCli(raw.diffAll).unknown).toEqual([])
  })

  it('diff 의 모든 키가 dump 에도 있다', () => {
    const dumpKeys = new Set(parseCli(raw.dumpAll).keys)
    expect(snap.changed.filter((k) => !dumpKeys.has(k))).toEqual([])
  })

  it('프로필이 섞이지 않는다: 레이트 프로필에는 레이트 키만', () => {
    for (const rp of snap.rateProfiles) {
      expect(Object.keys(rp).filter((k) => /^(vbat_|bat_|cbat_|battery_|force_battery)/.test(k))).toEqual([])
    }
  })

  it('모든 탭이 그려지고, 모든 master·배터리 키가 화면 어딘가에 나온다', () => {
    const wrap = (el: React.ReactElement) => renderToStaticMarkup(<SnapshotProvider snap={snap}>{el}</SnapshotProvider>)
    const html = [
      ...(Object.keys(TAB_VIEWS) as TabId[]).map((t) => {
        const V = TAB_VIEWS[t]
        return wrap(<V />)
      }),
      wrap(<PidTab initialSub="rates" />),
      wrap(<PidTab initialSub="filters" />)
    ].join('')
    const keys = [...Object.keys(snap.master), ...(snap.batteryProfiles?.flatMap((p) => Object.keys(p)) ?? [])]
    expect([...new Set(keys)].filter((k) => !html.includes(`<code class="key">${k}</code>`))).toEqual([])
  })
})

describe('2026.6 배터리 프로필', () => {
  it.runIf(dirs.includes('sitl-2026.6.2'))('battery_profile 0~2 를 따로 읽고 활성 프로필을 안다', () => {
    const d = 'sitl-2026.6.2'
    const snap = buildSnapshot({ craftName: 's', readAt: '', raw: { version: '', status: '', diffAll: read(d, 'diff.txt'), dumpAll: read(d, 'dump.txt') } })
    expect(snap.batteryProfiles).toHaveLength(3)
    expect(snap.batteryProfiles![0]).toMatchObject({ vbat_max_cell_voltage: '430', bat_capacity: '0' })
    expect(snap.meta.activeBatteryProfile).toBe(0)
    expect(snap.master.vbat_max_cell_voltage).toBeUndefined() // master 가 아니다
    expect(snap.waypoints).toEqual(['clear'])
  })

  it('battery.N.<키> 변경 키', () => {
    const p = parseCli('battery_profile 1\nset bat_capacity = 1300\nbattery_profile 0')
    expect(p.keys).toEqual(['battery.1.bat_capacity'])
    expect(p.batteryProfiles[1]).toEqual({ bat_capacity: '1300' })
    expect(p.meta.activeBatteryProfile).toBe(0)
  })
})

describe('SITL 실험 결과 (probe.json) — 0단계 근거 고정', () => {
  const probes = dirs.filter((d) => existsSync(join(FIX, d, 'probe.json')))
  it.each(probes)('%s: 오류 문구·batch 저장 거부', (dir) => {
    const r = JSON.parse(read(dir, 'probe.json'))
    const out = (k: string) => String(r[k].out)
    expect(out('enter')).toContain('Entering CLI Mode')
    expect(out('set_bad_name')).toContain('###ERROR IN set: INVALID NAME: no_such_setting')
    expect(out('set_out_of_range')).toContain('###ERROR IN set: INVALID VALUE###')
    expect(out('set_ok')).toContain('craft_name set to PROBE')
    expect(out('unknown_cmd')).toContain("###ERROR IN input: UNKNOWN COMMAND, TRY 'HELP'###")
    expect(out('batch_save_with_error')).toContain('###ERROR IN save: ERRORS WERE DETECTED')
    expect(out('batch_save_with_error')).not.toContain('saving')
    // 인수 없는 get: 값마다 범위 줄
    expect(out('get_all').match(/^Allowed (range|values): /gm)!.length).toBeGreaterThan(200)
  })
})
