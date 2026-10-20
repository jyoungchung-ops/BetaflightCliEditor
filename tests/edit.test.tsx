// v2 3단계: 편집 모드 상태(원본 보존, 되돌리기, 검사)와 편집 화면을 SITL 실측 원문으로 검사한다.
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { buildSnapshot } from '../src/shared/cli/parser'
import type { CraftSnapshot } from '../src/shared/cli/types'
import {
  countByTab,
  effective,
  emptyEditState,
  redo,
  revertAll,
  revertKey,
  setValue,
  undo,
  validateEdit,
  validateEdits,
  type Edit,
  type EditState
} from '../src/shared/edit/session'
import { editsOfSavedFile, fromSavedFile, toSavedFile } from '../src/shared/files'
import { decodeOsdPos, encodeOsdPos } from '../src/shared/mapping/osd'
import { TAB_VIEWS } from '../src/renderer/src/tabs'
import { PidTab } from '../src/renderer/src/tabs/PidTab'
import { OsdTab } from '../src/renderer/src/tabs/OsdTab'
import { EditProvider, type EditCtx } from '../src/renderer/src/ui/editContext'
import { SnapshotProvider } from '../src/renderer/src/ui/snapshot'
import type { TabId } from '../src/shared/tabs'

const FIX = join(__dirname, '..', 'fixtures')
const TAGS = ['4.5.3', '4.5.5', '2025.12.5', '2026.6.2'].filter((t) => existsSync(join(FIX, `sitl-${t}`, 'get.txt')))

function load(tag: string): CraftSnapshot {
  const d = join(FIX, `sitl-${tag}`)
  const r = (f: string) => readFileSync(join(d, f), 'utf8')
  return buildSnapshot({
    craftName: `SITL ${tag}`,
    readAt: '2026-10-20T00:00:00.000Z',
    raw: { version: r('version.txt'), status: r('status.txt'), diffAll: r('diff.txt'), dumpAll: r('dump.txt'), get: r('get.txt') }
  })
}

const apply = (base: CraftSnapshot, ...steps: [string, string][]) =>
  steps.reduce<EditState>((s, [k, v]) => setValue(s, base, k, v), emptyEditState())

describe.each(TAGS)('편집 상태 — SITL %s', (tag) => {
  const base = load(tag)
  const frozen = JSON.stringify(base)

  it('범위 정보(schema)가 있다', () => {
    expect(Object.keys(base.schema ?? {}).length).toBeGreaterThan(300)
  })

  it('원본은 바뀌지 않고, 화면용 스냅샷에만 반영된다', () => {
    const p = base.pidProfiles.findIndex((x) => x.p_roll !== undefined)
    const s = apply(base, ['master.craft_name', 'EDITED'], [`pid.${p}.p_roll`, '50'], ['map', 'map TAER1234'])
    const eff = effective(base, s.edits)
    expect(eff.master.craft_name).toBe('EDITED')
    expect(eff.pidProfiles[p].p_roll).toBe('50')
    expect(eff.rxMap).toBe('TAER1234')
    expect(JSON.stringify(base)).toBe(frozen)
  })

  it('원래 값으로 돌아오면 편집에서 빠진다', () => {
    const before = base.master.craft_name ?? '-'
    let s = apply(base, ['master.craft_name', 'X'])
    expect(Object.keys(s.edits)).toEqual(['master.craft_name'])
    expect(s.edits['master.craft_name'].before).toBe(before)
    s = setValue(s, base, 'master.craft_name', before)
    expect(s.edits).toEqual({})
  })

  it('되돌리기·다시 하기·하나만 되돌리기·모두 되돌리기', () => {
    let s = apply(base, ['master.craft_name', 'A'], ['master.craft_name', 'B'], ['map', 'map TAER1234'])
    s = undo(s)
    expect(s.edits.map).toBeUndefined()
    expect(s.edits['master.craft_name'].after).toBe('B')
    s = undo(s)
    expect(s.edits['master.craft_name'].after).toBe('A')
    s = redo(redo(s))
    expect(s.edits.map?.after).toBe('map TAER1234')
    s = revertKey(s, 'map')
    expect(Object.keys(s.edits)).toEqual(['master.craft_name'])
    s = revertAll(s)
    expect(s.edits).toEqual({})
    expect(undo(s).edits['master.craft_name']).toBeDefined()
  })

  it('끌기(merge)는 되돌리기 한 단계', () => {
    let s = apply(base, ['aux.0', 'aux 0 0 0 1700 2100 0 0'])
    s = setValue(s, base, 'aux.0', 'aux 0 0 0 1600 2100 0 0')
    s = setValue(s, base, 'aux.0', 'aux 0 0 0 1500 2100 0 0', { merge: true })
    s = setValue(s, base, 'aux.0', 'aux 0 0 0 1400 2100 0 0', { merge: true })
    expect(undo(s).edits['aux.0'].after).toBe('aux 0 0 0 1700 2100 0 0')
  })

  it('범위를 벗어난 값은 오류', () => {
    const name = Object.entries(base.schema!).find(([k, v]) => v.section === 'master' && v.kind === 'number' && base.master[k] !== undefined)![0]
    const max = base.schema![name].max!
    const s = apply(base, [`master.${name}`, String(max + 1)])
    expect(validateEdits(base, s.edits)[`master.${name}`]).toMatch(/이하/)
    const ok = apply(base, [`master.${name}`, String(max)])
    expect(validateEdits(base, ok.edits)).toEqual({})
  })

  it('줄 편집 검사: aux · map · rxfail · serial', () => {
    const e = (key: string, after: string): Edit => ({ key, before: '', after, scope: 'line' })
    expect(validateEdit(base, e('aux.0', 'aux 0 0 0 1700 2100 0 0'))).toBeNull()
    expect(validateEdit(base, e('aux.0', 'aux 0 0 0 1710 2100 0 0'))).toMatch(/25/)
    expect(validateEdit(base, e('aux.0', 'aux 0 0 0 2100 1700 0 0'))).toMatch(/시작 < 끝/)
    expect(validateEdit(base, e('aux.0', 'aux 1 0 0 1700 2100 0 0'))).toMatch(/모드 범위/)
    expect(validateEdit(base, e('aux.0', 'aux 0 0 0 900 900 0 0'))).toBeNull()
    expect(validateEdit(base, e('map', 'map AETR1234'))).toBeNull()
    expect(validateEdit(base, e('map', 'map AETR1235'))).not.toBeNull()
    expect(validateEdit(base, e('map', 'map AATR1234'))).not.toBeNull()
    expect(validateEdit(base, e('rxfail.0', 'rxfail 0 h'))).toMatch(/유지/)
    expect(validateEdit(base, e('rxfail.4', 'rxfail 4 a'))).toMatch(/자동/)
    expect(validateEdit(base, e('rxfail.4', 'rxfail 4 s 3000'))).toMatch(/750/)
    expect(validateEdit(base, e('rxfail.4', 'rxfail 4 s 1500'))).toBeNull()
    expect(validateEdit(base, e('map', 'map AETR1234\nsave'))).toMatch(/문자/)
    // USB VCP 의 MSP 는 끌 수 없다 (4.5 숫자 id 20, 2025.12+ 이름 VCP)
    expect(validateEdit(base, e('serial.20', 'serial 20 0 115200 57600 0 115200'))).toMatch(/VCP/)
    expect(validateEdit(base, e('serial.VCP', 'serial VCP 0 115200 57600 0 115200'))).toMatch(/VCP/)
    expect(validateEdit(base, e('serial.VCP', 'serial VCP 1 115200 57600 0 115200'))).toBeNull()
    expect(validateEdit(base, e('serial.0', 'serial 0 64 115200 57600 0 115200'))).toBeNull()
  })

  it('줄 편집이 화면에 반영된다 (aux · serial · feature · rxfail)', () => {
    const port = base.serial.find((p) => !(p.name ? p.name === 'VCP' : p.id === 20))!
    const tok = port.name ?? String(port.id)
    const feat = Object.keys(base.features)[0]
    const s = apply(
      base,
      ['aux.5', 'aux 5 1 2 1300 1700 0 0'],
      [`serial.${tok}`, `serial ${tok} 64 ${port.mspBaud} ${port.gpsBaud} ${port.telemetryBaud} ${port.blackboxBaud}`],
      [`feature.${feat}`, `feature ${base.features[feat] ? '-' : ''}${feat}`],
      ['rxfail.5', 'rxfail 5 s 1234']
    )
    const eff = effective(base, s.edits)
    expect(eff.aux.find((a) => a.index === 5)).toMatchObject({ modeId: 1, channel: 2, start: 1300, end: 1700 })
    expect(eff.serial.find((p) => (p.name ?? String(p.id)) === tok)?.functionMask).toBe(64)
    expect(eff.features[feat]).toBe(!base.features[feat])
    expect(eff.rxFail.find((r) => r.channel === 5)).toMatchObject({ mode: 's', value: 1234 })
    expect(validateEdits(base, s.edits)).toEqual({})
    expect(countByTab(s.edits)).toMatchObject({ modes: 1, ports: 1, failsafe: 1 })
  })

  it('저장 파일: 원본과 편집을 따로 담고, 열면 그대로 돌아온다', () => {
    const s = apply(base, ['master.craft_name', 'SAVED'], ['map', 'map TAER1234'])
    const json = JSON.parse(JSON.stringify(toSavedFile(base, '2.0.0', s.edits)))
    expect(json.schemaVersion).toBe(2)
    expect(json.schema).toBeUndefined()
    expect(json.master.craft_name).toBe(base.master.craft_name)
    const back = fromSavedFile(json)
    expect(back.schema).toEqual(base.schema)
    expect(editsOfSavedFile(json)).toEqual(s.edits)
    expect(editsOfSavedFile({ edits: [{ key: 1 }, 'x', null] })).toEqual({})
  })

  it('편집 모드에서 모든 탭이 그려지고, 편집 입력이 나온다', () => {
    const s = apply(base, ['master.craft_name', 'EDITED'])
    const eff = effective(base, s.edits)
    const ctx: EditCtx = {
      editing: true,
      base,
      edits: s.edits,
      errors: validateEdits(base, s.edits),
      schema: base.schema,
      setValue: () => {},
      revert: () => {}
    }
    const wrap = (el: React.ReactElement) =>
      renderToStaticMarkup(
        <EditProvider value={ctx}>
          <SnapshotProvider snap={eff}>{el}</SnapshotProvider>
        </EditProvider>
      )
    const html = [
      ...(Object.keys(TAB_VIEWS) as TabId[]).map((t) => {
        const V = TAB_VIEWS[t]
        return wrap(<V />)
      }),
      wrap(<PidTab initialSub="rates" />),
      wrap(<PidTab initialSub="filters" />)
    ].join('')
    expect(html).toContain('class="edit-input')
    expect(html).toContain('aria-label="채널 맵"')
    expect(html).toContain('모드 범위 편집')
    expect(html).toContain('시리얼 포트 편집')
    expect(html).toContain('원래 값으로 되돌리기')
    // 편집 중에도 모든 master 키가 화면 어딘가에 나온다 (숨기는 키 없음)
    expect(Object.keys(eff.master).filter((k) => !html.includes(`<code class="key">${k}</code>`) && !html.includes(`aria-label="${k}"`))).toEqual([])
  })
})

describe('OSD 위치 인코딩', () => {
  it('decode ↔ encode 왕복, 다른 비트는 보존', () => {
    for (const v of [0, 2048, 0x3fff, 0x4000 | 0x800 | (5 << 5) | 12, 0x2000 | 0x400 | 3]) {
      expect(encodeOsdPos(v, decodeOsdPos(v))).toBe(v)
    }
    const v = encodeOsdPos(0xc000, { x: 40, y: 15, visible: [true, false, true] })
    expect(decodeOsdPos(v)).toEqual({ x: 40, y: 15, visible: [true, false, true] })
    expect(v & 0xc000).toBe(0xc000)
  })
})

describe('OSD 편집 화면 (샘플 덤프 — SITL 은 OSD 없음)', () => {
  it('요소마다 프로필 1~3 표시 체크박스, 끌 수 있는 미리보기', () => {
    const r = (f: string) => readFileSync(join(FIX, 'sample', `moz7.${f}.txt`), 'utf8')
    const snap = buildSnapshot({ craftName: 'moz7', readAt: '', raw: { version: r('version'), status: r('status'), diffAll: r('diff'), dumpAll: r('dump') } })
    const ctx: EditCtx = { editing: true, base: snap, edits: {}, errors: {}, schema: {}, setValue: () => {}, revert: () => {} }
    const html = renderToStaticMarkup(
      <EditProvider value={ctx}>
        <SnapshotProvider snap={snap}>
          <OsdTab />
        </SnapshotProvider>
      </EditProvider>
    )
    const n = Object.keys(snap.master).filter((k) => /^osd_.+_pos$/.test(k)).length
    expect(n).toBeGreaterThan(5)
    expect(html.match(/프로필 \d 표시"/g)?.length).toBe(n * 3)
    expect(html).toContain('osd-preview editable')
  })
})
