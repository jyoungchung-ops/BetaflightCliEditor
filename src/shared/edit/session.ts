// v2 편집 모드의 상태 (SPEC 9절). 화면과 무관한 순수 함수만 둔다.
//
// - 원본(base: CraftSnapshot)은 절대 바꾸지 않는다. 화면은 effective(base, edits)를 그린다.
// - 편집 키는 변경 강조(changed)와 같은 체계: master.<키>, pid.N.<키>, rate.N.<키>, battery.N.<키>,
//   feature.<X>, aux.<i>, serial.<포트>, map, rxfail.<ch>
// - 줄 단위 편집(aux, serial ...)의 after 는 CLI 한 줄 전체다. 화면 반영은 그 줄을 CLI 파서로 읽어서 하므로,
//   화면과 나중에 보낼 명령이 서로 다를 수 없다 (4단계 buildCommands 와 왕복 테스트로 고정).

import { parseCli } from '../cli/parser'
import { validateValue } from '../cli/schema'
import type { CraftSnapshot } from '../cli/types'
import { TAB_MASTER_KEYS } from '../mapping/tabKeys'
import type { TabId } from '../tabs'

export type EditScope = 'master' | 'pid' | 'rate' | 'battery' | 'line'

export interface Edit {
  key: string
  /** 원본 값 (set 은 값, line 은 CLI 줄 전체) */
  before: string
  after: string
  scope: EditScope
}

export type Edits = Record<string, Edit>

export interface EditState {
  edits: Edits
  /** 되돌리기(Ctrl+Z) / 다시 하기(Ctrl+Y) — 편집 묶음 단위 */
  past: Edits[]
  future: Edits[]
}

export const emptyEditState = (): EditState => ({ edits: {}, past: [], future: [] })

const SET_KEY = /^(master)\.([A-Za-z0-9_]+)$|^(pid|rate|battery)\.(\d+)\.([A-Za-z0-9_]+)$/

/** 키의 범위 (set 이면 master/pid/rate/battery, 나머지는 line) */
export function scopeOf(key: string): EditScope {
  const m = SET_KEY.exec(key)
  if (!m) return 'line'
  return (m[1] ?? m[3]) as EditScope
}

/** set 키 → { section, profile, name } */
export function parseSetKey(key: string): { scope: Exclude<EditScope, 'line'>; profile: number; name: string } | null {
  const m = SET_KEY.exec(key)
  if (!m) return null
  if (m[1]) return { scope: 'master', profile: -1, name: m[2] }
  return { scope: m[3] as 'pid' | 'rate' | 'battery', profile: Number(m[4]), name: m[5] }
}

function profilesOf(snap: CraftSnapshot, scope: 'pid' | 'rate' | 'battery') {
  return scope === 'pid' ? snap.pidProfiles : scope === 'rate' ? snap.rateProfiles : (snap.batteryProfiles ?? [])
}

/** 줄 단위 키의 현재 CLI 줄 (펌웨어가 dump 에 쓰는 형식 그대로) */
export function lineOf(snap: CraftSnapshot, key: string): string | undefined {
  let m: RegExpExecArray | null
  if ((m = /^feature\.([A-Z0-9_]+)$/.exec(key))) {
    const on = snap.features[m[1]]
    return on === undefined ? undefined : `feature ${on ? '' : '-'}${m[1]}`
  }
  if ((m = /^aux\.(\d+)$/.exec(key))) {
    const i = Number(m[1])
    const a = snap.aux.find((x) => x.index === i)
    return a ? `aux ${i} ${a.modeId} ${a.channel} ${a.start} ${a.end} ${a.logic} ${a.linkedTo}` : `aux ${i} 0 0 900 900 0 0`
  }
  if ((m = /^serial\.([A-Za-z0-9]+)$/.exec(key))) {
    const p = snap.serial.find((s) => (s.name ?? String(s.id)) === m![1])
    return p ? `serial ${m[1]} ${p.functionMask} ${p.mspBaud} ${p.gpsBaud} ${p.telemetryBaud} ${p.blackboxBaud}` : undefined
  }
  if (key === 'map') return snap.rxMap ? `map ${snap.rxMap}` : undefined
  if ((m = /^rxfail\.(\d+)$/.exec(key))) {
    const r = snap.rxFail.find((x) => x.channel === Number(m![1]))
    return r ? `rxfail ${r.channel} ${r.mode}${r.value !== undefined ? ` ${r.value}` : ''}` : undefined
  }
  return undefined
}

/** 키의 현재 값 (set 은 값, line 은 CLI 줄) */
export function valueOf(snap: CraftSnapshot, key: string): string | undefined {
  const s = parseSetKey(key)
  if (!s) return lineOf(snap, key)
  if (s.scope === 'master') return snap.master[s.name]
  return profilesOf(snap, s.scope)[s.profile]?.[s.name]
}

/** 편집 하나를 스냅샷(사본)에 반영 */
function applyOne(snap: CraftSnapshot, e: Edit) {
  const s = parseSetKey(e.key)
  if (s) {
    if (s.scope === 'master') snap.master[s.name] = e.after
    else {
      const list = profilesOf(snap, s.scope)
      ;(list[s.profile] ??= {})[s.name] = e.after
    }
    return
  }
  // 줄 편집: 같은 CLI 파서로 읽어 해당 항목을 바꾼다
  const p = parseCli(e.after)
  for (const [f, on] of Object.entries(p.features)) snap.features[f] = on
  for (const a of p.aux) snap.aux = [...snap.aux.filter((x) => x.index !== a.index), a].sort((x, y) => x.index - y.index)
  for (const sp of p.serial) snap.serial = snap.serial.map((x) => ((x.name ?? String(x.id)) === (sp.name ?? String(sp.id)) ? sp : x))
  if (p.rxMap) snap.rxMap = p.rxMap
  for (const r of p.rxFail) snap.rxFail = snap.rxFail.map((x) => (x.channel === r.channel ? r : x))
}

/** 원본 + 편집 = 화면에 그릴 스냅샷. 원본은 바꾸지 않는다 */
export function effective(base: CraftSnapshot, edits: Edits): CraftSnapshot {
  const list = Object.values(edits)
  if (list.length === 0) return base
  const snap = structuredClone(base)
  if (snap.batteryProfiles === undefined && list.some((e) => e.scope === 'battery')) snap.batteryProfiles = []
  for (const e of list) applyOne(snap, e)
  return snap
}

/**
 * 값 바꾸기. 원래 값으로 돌아오면 편집에서 빠진다.
 * merge: 끌기처럼 이어지는 변경을 되돌리기 한 단계로 묶는다 (직전 단계를 덮어씀)
 */
export function setValue(state: EditState, base: CraftSnapshot, key: string, after: string, opts?: { merge?: boolean }): EditState {
  const before = state.edits[key]?.before ?? valueOf(base, key)
  if (before === undefined) return state
  const cur = state.edits[key]?.after ?? before
  if (cur === after) return state
  const edits = { ...state.edits }
  if (after === before) delete edits[key]
  else edits[key] = { key, before, after, scope: scopeOf(key) }
  if (opts?.merge && state.past.length > 0) return { edits, past: state.past, future: [] }
  return { edits, past: [...state.past, state.edits].slice(-200), future: [] }
}

export function revertKey(state: EditState, key: string): EditState {
  if (!state.edits[key]) return state
  const edits = { ...state.edits }
  delete edits[key]
  return { edits, past: [...state.past, state.edits].slice(-200), future: [] }
}

export function revertAll(state: EditState): EditState {
  if (Object.keys(state.edits).length === 0) return state
  return { edits: {}, past: [...state.past, state.edits].slice(-200), future: [] }
}

export function undo(state: EditState): EditState {
  const prev = state.past.at(-1)
  if (!prev) return state
  return { edits: prev, past: state.past.slice(0, -1), future: [state.edits, ...state.future] }
}

export function redo(state: EditState): EditState {
  const next = state.future[0]
  if (!next) return state
  return { edits: next, past: [...state.past, state.edits], future: state.future.slice(1) }
}

// ── 검사 ───────────────────────────────────────────────

const AUX_STEP = 25 // 펌웨어가 aux 범위를 25µs 단위로 저장 (CHANNEL_RANGE_STEP_WIDTH)

/** 편집 하나의 문제 (없으면 null) */
export function validateEdit(base: CraftSnapshot, e: Edit): string | null {
  const s = parseSetKey(e.key)
  if (s) {
    const schema = base.schema?.[s.name]
    if (!schema) return '범위 정보가 없는 설정입니다'
    if (/[\r\n\x00-\x1f]/.test(e.after)) return '사용할 수 없는 문자가 있습니다'
    if (e.after !== e.after.trim()) return '앞뒤에 공백을 둘 수 없습니다'
    return validateValue(schema, e.after)
  }
  if (/[\r\n#;]/.test(e.after)) return '사용할 수 없는 문자가 있습니다'
  const p = parseCli(e.after)
  if (p.unknown.length) return 'CLI 형식이 아닙니다'
  if (e.key.startsWith('aux.')) {
    const a = p.aux[0]
    if (!a || `aux.${a.index}` !== e.key) return '모드 범위 줄이 아닙니다'
    const unused = a.start === 900 && a.end === 900
    if (!unused) {
      if (a.start < 900 || a.end > 2100 || a.start >= a.end) return '범위는 900~2100µs, 시작 < 끝이어야 합니다'
      if (a.start % AUX_STEP || a.end % AUX_STEP) return `범위는 ${AUX_STEP}µs 단위여야 합니다`
    }
    if (a.channel < 0 || a.channel > 15) return 'AUX 채널이 범위를 벗어났습니다'
    return null
  }
  if (e.key.startsWith('serial.')) {
    const sp = p.serial[0]
    if (!sp || `serial.${sp.name ?? sp.id}` !== e.key) return '포트 줄이 아닙니다'
    if (!(sp.functionMask >= 0 && Number.isInteger(sp.functionMask))) return '포트 기능 값이 잘못되었습니다'
    // USB VCP 의 MSP 를 끄면 이 앱과 Configurator 모두 다시 연결할 수 없다
    const isVcp = sp.name ? sp.name.toUpperCase() === 'VCP' : sp.id === 20
    if (isVcp && (sp.functionMask & 1) === 0) return 'USB VCP의 MSP는 끌 수 없습니다'
    return null
  }
  if (e.key === 'map') {
    const m = p.rxMap ?? ''
    // 펌웨어 map 은 8글자, A E R T 1 2 3 4 (RX_MAPPABLE_CHANNEL_COUNT)
    if (!/^[AETR1234]{8}$/.test(m)) return '채널 맵은 A·E·T·R·1·2·3·4 로 8글자여야 합니다'
    if (!['A', 'E', 'T', 'R'].every((c) => m.includes(c))) return 'A·E·T·R이 모두 있어야 합니다'
    return new Set(m).size === m.length ? null : '같은 글자를 두 번 쓸 수 없습니다'
  }
  if (e.key.startsWith('rxfail.')) {
    const r = p.rxFail[0]
    if (!r || `rxfail.${r.channel}` !== e.key) return '페일세이프 채널 줄이 아닙니다'
    if (!['a', 'h', 's'].includes(r.mode)) return '동작은 자동·유지·지정값 중 하나입니다'
    // 펌웨어 규칙: 롤·피치·요·스로틀(0~3)은 자동/지정값, AUX 는 유지/지정값
    if (r.channel < 4 && r.mode === 'h') return '롤·피치·요·스로틀은 유지를 쓸 수 없습니다'
    if (r.channel >= 4 && r.mode === 'a') return 'AUX 채널은 자동을 쓸 수 없습니다'
    if (r.mode === 's' && (r.value === undefined || r.value < 750 || r.value > 2250)) return '지정값은 750~2250µs 입니다'
    return null
  }
  if (e.key.startsWith('feature.')) return Object.keys(p.features).length === 1 ? null : '기능 줄이 아닙니다'
  return '편집할 수 없는 항목입니다'
}

export function validateEdits(base: CraftSnapshot, edits: Edits): Record<string, string> {
  const out: Record<string, string> = {}
  for (const e of Object.values(edits)) {
    const err = validateEdit(base, e)
    if (err) out[e.key] = err
  }
  return out
}

// ── 탭 배지 ───────────────────────────────────────────────

const RX_FEATURES = new Set(['RX_PPM', 'RX_SERIAL', 'RX_PARALLEL_PWM', 'RX_MSP', 'RX_SPI'])

/** 편집 키가 속한 탭 (사이드바 변경 개수 배지) */
export function tabOfKey(key: string): TabId {
  const s = parseSetKey(key)
  if (s) {
    if (s.scope === 'pid' || s.scope === 'rate') return 'pid'
    if (s.scope === 'battery') return 'power'
    for (const [tab, rule] of Object.entries(TAB_MASTER_KEYS)) if (rule?.keys.includes(s.name)) return tab as TabId
    for (const [tab, rule] of Object.entries(TAB_MASTER_KEYS)) if (rule?.prefixes?.some((p) => s.name.startsWith(p))) return tab as TabId
    return 'other'
  }
  if (key.startsWith('feature.')) return RX_FEATURES.has(key.slice(8)) ? 'receiver' : 'configuration'
  if (key.startsWith('aux.')) return 'modes'
  if (key.startsWith('serial.')) return 'ports'
  if (key === 'map') return 'receiver'
  if (key.startsWith('rxfail.')) return 'failsafe'
  return 'other'
}

export function countByTab(edits: Edits): Partial<Record<TabId, number>> {
  const out: Partial<Record<TabId, number>> = {}
  for (const k of Object.keys(edits)) {
    const t = tabOfKey(k)
    out[t] = (out[t] ?? 0) + 1
  }
  return out
}

/** 저장 파일에서 읽은 편집 목록 검사 (모양이 틀린 항목은 버린다) */
export function editsFromJson(value: unknown): Edits {
  const out: Edits = {}
  if (!Array.isArray(value)) return out
  for (const v of value) {
    if (!v || typeof v !== 'object') continue
    const e = v as Partial<Edit>
    if (typeof e.key !== 'string' || typeof e.before !== 'string' || typeof e.after !== 'string') continue
    out[e.key] = { key: e.key, before: e.before, after: e.after, scope: scopeOf(e.key) }
  }
  return out
}
