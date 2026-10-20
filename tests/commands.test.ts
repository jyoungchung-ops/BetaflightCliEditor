// v2 4단계: buildCommands 왕복 (생성 → 파싱 → 같은 값), 순서, 내보내기 형식
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseCli } from '../src/shared/cli/parser'
import type { CraftSnapshot } from '../src/shared/cli/types'
import {
  buildCommands,
  changeCommands,
  changesFileName,
  changesFileText,
  EditValidationError,
  fullDiffText,
  isGeneratedCommand
} from '../src/shared/edit/commands'
import { effective, valueOf } from '../src/shared/edit/session'
import { apply, FIX, loadSitl as load, mixedSteps } from './editMix'

const TAGS = ['4.5.3', '4.5.5', '2025.12.5', '2026.6.2'].filter((t) => existsSync(join(FIX, `sitl-${t}`, 'get.txt')))

describe.each(TAGS)('명령 생성 — SITL %s', (tag) => {
  const base = load(tag)

  const steps = mixedSteps(base)
  const state = apply(base, steps)
  const edits = state.edits

  it('편집이 충분히 섞여 있다', () => {
    expect(Object.keys(edits).length).toBeGreaterThan(40)
  })

  it('왕복: 만든 명령을 파서에 넣으면 편집한 값이 그대로, 그 밖의 키는 없다', () => {
    const cmds = changeCommands(base, edits)
    const p = parseCli(cmds.join('\n'))
    expect(p.unknown).toEqual([])
    const asSnap = { ...base, ...p, meta: base.meta } as unknown as CraftSnapshot
    for (const e of Object.values(edits)) {
      const got = valueOf(asSnap, e.key)
      expect([e.key, got]).toEqual([e.key, e.after])
    }
    // 편집하지 않은 키는 명령에 나오지 않는다
    expect(p.keys.filter((k) => !k.startsWith('meta.') && !edits[k]).sort()).toEqual([])
  })

  it('왕복: 원본 dump + 명령 = 화면(effective)과 같은 설정', () => {
    // 펌웨어처럼 dump 를 먼저 적용하고 명령을 적용한 결과를 파서로 흉내 낸다 (master 는 프로필 섹션 앞에 둔다)
    const cmds = changeCommands(base, edits)
    const p = parseCli(cmds.join('\n'))
    const eff = effective(base, edits)
    const after = structuredClone(base)
    Object.assign(after.master, p.master)
    p.pidProfiles.forEach((x, i) => x && Object.assign((after.pidProfiles[i] ??= {}), x))
    p.rateProfiles.forEach((x, i) => x && Object.assign((after.rateProfiles[i] ??= {}), x))
    p.batteryProfiles.forEach((x, i) => x && Object.assign(((after.batteryProfiles ??= [])[i] ??= {}), x))
    Object.assign(after.features, p.features)
    for (const a of p.aux) after.aux = [...after.aux.filter((x) => x.index !== a.index), a].sort((x, y) => x.index - y.index)
    for (const s of p.serial) after.serial = after.serial.map((x) => ((x.name ?? String(x.id)) === (s.name ?? String(s.id)) ? s : x))
    if (p.rxMap) after.rxMap = p.rxMap
    for (const r of p.rxFail) after.rxFail = after.rxFail.map((x) => (x.channel === r.channel ? r : x))
    for (const k of ['master', 'pidProfiles', 'rateProfiles', 'batteryProfiles', 'features', 'aux', 'serial', 'rxMap', 'rxFail'] as const) {
      expect([k, after[k]]).toEqual([k, eff[k]])
    }
  })

  it('순서: batch start → 줄 → master → 프로필 → save, batch end 없음, 활성 프로필 복원', () => {
    const cmds = buildCommands(base, edits)
    expect(cmds[0]).toBe('batch start')
    expect(cmds.at(-1)).toBe('save')
    expect(cmds).not.toContain('batch end')
    const first = (re: RegExp) => cmds.findIndex((c) => re.test(c))
    expect(first(/^feature /)).toBeLessThan(first(/^map /))
    expect(first(/^map /)).toBeLessThan(first(/^serial /))
    expect(first(/^serial /)).toBeLessThan(first(/^aux /))
    expect(first(/^aux /)).toBeLessThan(first(/^rxfail /))
    expect(first(/^rxfail /)).toBeLessThan(first(/^set /))
    expect(first(/^set /)).toBeLessThan(first(/^profile /))
    expect(first(/^profile /)).toBeLessThan(first(/^rateprofile /))
    expect(cmds.filter((c) => c.startsWith('aux '))).toEqual(['aux 1 1 0 1300 1700 0 0', 'aux 3 0 1 1700 2100 0 0'])
    // profile 0, profile 2 를 편집했으면 마지막에 활성 프로필(0)로 돌아온다
    const prof = cmds.filter((c) => /^profile /.test(c))
    expect(prof.at(-1)).toBe(`profile ${base.meta.activePidProfile}`)
    const rate = cmds.filter((c) => /^rateprofile /.test(c))
    expect(rate.at(-1)).toBe(`rateprofile ${base.meta.activeRateProfile}`)
    if (base.batteryProfiles?.length) expect(cmds.filter((c) => /^battery_profile /.test(c)).at(-1)).toBe(`battery_profile ${base.meta.activeBatteryProfile ?? 0}`)
    expect(buildCommands(base, edits, { noreboot: true }).at(-1)).toBe('save noreboot')
    expect(cmds.every(isGeneratedCommand)).toBe(true)
  })

  it('변경분 파일: 헤더 + batch start … save (batch end 없음)', () => {
    const text = changesFileText(base, edits, '2.0.0')
    expect(text).toMatch(/^# Betaflight CLI Editor 2\.0\.0\n# craft: SITL /)
    expect(text).toContain(`# firmware: ${base.meta.firmware}`)
    expect(text).toContain(`# changes: ${Object.keys(edits).length}`)
    expect(text).not.toMatch(/^batch end/m)
    const cmdLines = text.split('\n').filter((l) => l && !l.startsWith('#'))
    expect(cmdLines).toEqual(buildCommands(base, edits))
  })

  it('전체 diff: 원본 diff all 의 save 앞에 변경이 들어가고, save 는 하나', () => {
    const text = fullDiffText(base, edits, '2.0.0')!
    expect(text.startsWith(base.raw.diffAll.split('\n')[0])).toBe(true)
    expect(text.match(/^save$/gm)?.length).toBe(1)
    expect(text.trimEnd().endsWith('save')).toBe(true)
    // 이 앱으로 다시 열면: 편집한 값은 새 값, 편집하지 않은 원본 diff 값은 그대로
    const p = parseCli(text)
    expect(p.unknown).toEqual([])
    const asSnap = { ...base, ...p, meta: base.meta } as unknown as CraftSnapshot
    for (const e of Object.values(edits)) expect([e.key, valueOf(asSnap, e.key)]).toEqual([e.key, e.after])
    const orig = parseCli(base.raw.diffAll)
    const origSnap = { ...base, ...orig, meta: base.meta } as unknown as CraftSnapshot
    for (const k of orig.keys.filter((k) => !edits[k] && !k.startsWith('meta.'))) expect([k, valueOf(asSnap, k)]).toEqual([k, valueOf(origSnap, k)])
    expect(p.meta.activePidProfile).toBe(base.meta.activePidProfile)
    expect(p.meta.activeRateProfile).toBe(base.meta.activeRateProfile)
    expect(text).toMatch(/^# Betaflight CLI Editor 2\.0\.0: 편집 \d+개 적용$/m)
  })

  it('오류가 있으면 명령을 만들지 않는다', () => {
    const name = Object.entries(base.schema!).find(([k, v]) => v.kind === 'number' && v.section === 'master' && base.master[k] !== undefined)![0]
    const bad = apply(base, [[`master.${name}`, String(base.schema![name].max! + 1)]])
    expect(() => buildCommands(base, bad.edits)).toThrow(EditValidationError)
    expect(() => changesFileText(base, bad.edits, '2.0.0')).toThrow(EditValidationError)
    const nl = apply(base, [['master.craft_name', 'A\nsave']])
    expect(() => buildCommands(base, nl.edits)).toThrow(EditValidationError)
  })

  it('편집이 없으면 명령도 없다', () => {
    expect(buildCommands(base, {})).toEqual([])
  })
})

describe('명령 형식', () => {
  it('허용되는 명령만', () => {
    for (const ok of ['batch start', 'save', 'set p_roll = 45', 'set craft_name = -', 'feature -GPS', 'aux 0 0 0 1700 2100 0 0', 'serial UART1 64 115200 57600 0 115200', 'serial 20 1 115200 57600 0 115200', 'map AETR1234', 'rxfail 4 s 1500', 'rxfail 0 a', 'profile 2', 'rateprofile 1', 'battery_profile 0'])
      expect([ok, isGeneratedCommand(ok)]).toEqual([ok, true])
    for (const no of ['defaults', 'defaults nosave', 'batch end', 'bl', 'dfu', 'flash_erase', 'resource MOTOR 1 B04', 'timer A00 AF1', 'dma ADC 1 0', 'msc', 'serialpassthrough 1 115200', 'motor 0 1500', 'play_sound', 'vtx_info', 'save\nbl', 'set x = 1\ndefaults', 'exit', 'led 0 0,0::C:0', 'vtxtable bands 5'])
      expect([no, isGeneratedCommand(no)]).toEqual([no, false])
  })

  it('파일 이름', () => {
    expect(changesFileName('Meteor75 Pro', new Date(2026, 9, 20, 13, 5))).toBe('Meteor75 Pro_changes_20261020-1305.txt')
  })
})
