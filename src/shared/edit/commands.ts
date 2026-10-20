// v2 4단계: 편집 → CLI 명령 (SPEC 10절). 내보내기와 기체 쓰기(writeSession)가 같은 함수를 쓴다.
//
// - 파서의 역방향이다. 만든 명령을 parseCli 에 넣으면 편집한 값이 그대로 나와야 한다 (tests/commands.test.ts 왕복).
// - 순서는 펌웨어 diff all 과 같다: batch start → feature → map → serial → aux → rxfail → master set
//   → profile N … → rateprofile N … → battery_profile N … → save. 프로필을 바꿨으면 원래 활성 프로필로 되돌린다.
// - batch end 는 넣지 않는다: batch end 가 오류 플래그를 지워, 오류가 있어도 save 가 저장해 버린다 (docs/cli-compat.md).
// - 검사 오류가 하나라도 있으면 명령을 만들지 않는다 (SPEC 9절: 범위 밖 값이 있으면 내보내기·쓰기 막기).

import { parseCli } from '../cli/parser'
import type { CraftSnapshot } from '../cli/types'
import { sanitizeFileName } from '../files'
import { parseSetKey, validateEdits, type Edit, type Edits } from './session'

export class EditValidationError extends Error {
  constructor(public readonly errors: Record<string, string>) {
    super(`편집에 오류가 ${Object.keys(errors).length}개 있어 명령을 만들 수 없습니다`)
  }
}

/** 이 앱이 만들 수 있는 명령 (그 밖은 절대 만들지 않음 — 12절 차단 목록은 여기 없음) */
const ALLOWED_COMMAND =
  /^(batch start|save|save noreboot|set [A-Za-z0-9_]+ = [^\r\n]*|feature -?[A-Z0-9_]+|aux \d+( -?\d+){6}|serial [A-Za-z0-9]+( \d+){5}|map [AETR1234]{8}|rxfail \d+ [ahs]( \d+)?|profile \d|rateprofile \d|battery_profile \d)$/

export const isGeneratedCommand = (cmd: string) => ALLOWED_COMMAND.test(cmd)

/** 문자열 설정의 빈 값은 '-' (cli.c: "STRING MUST BE 1-n CHARACTERS OR '-' FOR EMPTY") */
const setLine = (name: string, value: string) => `set ${name} = ${value === '' ? '-' : value}`

const LINE_ORDER = ['feature.', 'map', 'serial.', 'aux.', 'rxfail.']
const lineRank = (key: string) => LINE_ORDER.findIndex((p) => key === p || key.startsWith(p))
const lineIndex = (key: string) => Number(/\.(\d+)$/.exec(key)?.[1] ?? 0)

/** 펌웨어 dump 와 같은 순서로 정렬 (줄 → master → 프로필) */
function sortLines(list: Edit[]): Edit[] {
  return [...list].sort((a, b) => lineRank(a.key) - lineRank(b.key) || lineIndex(a.key) - lineIndex(b.key) || a.key.localeCompare(b.key))
}

/**
 * 변경 명령만 (batch start · save 없이). 편집이 없으면 빈 목록.
 * 오류가 있으면 EditValidationError.
 */
export function changeCommands(base: CraftSnapshot, edits: Edits): string[] {
  const errors = validateEdits(base, edits)
  if (Object.keys(errors).length) throw new EditValidationError(errors)

  const lines: Edit[] = []
  const master: [string, string][] = []
  const profiles = { pid: new Map<number, [string, string][]>(), rate: new Map<number, [string, string][]>(), battery: new Map<number, [string, string][]>() }
  for (const e of Object.values(edits)) {
    const s = parseSetKey(e.key)
    if (!s) lines.push(e)
    else if (s.scope === 'master') master.push([s.name, e.after])
    else {
      const m = profiles[s.scope]
      m.set(s.profile, [...(m.get(s.profile) ?? []), [s.name, e.after]])
    }
  }

  const out: string[] = sortLines(lines).map((e) => e.after.trim())
  for (const [k, v] of master.sort(([a], [b]) => a.localeCompare(b))) out.push(setLine(k, v))

  const section = (cmd: 'profile' | 'rateprofile' | 'battery_profile', m: Map<number, [string, string][]>, active: number | undefined) => {
    if (m.size === 0) return
    const ns = [...m.keys()].sort((a, b) => a - b)
    for (const n of ns) {
      out.push(`${cmd} ${n}`)
      for (const [k, v] of m.get(n)!.sort(([a], [b]) => a.localeCompare(b))) out.push(setLine(k, v))
    }
    // 원래 활성 프로필로 되돌린다 (profile N 은 활성 프로필을 바꾸고 save 때 저장된다)
    const act = active ?? 0
    if (ns.at(-1) !== act) out.push(`${cmd} ${act}`)
  }
  section('profile', profiles.pid, base.meta.activePidProfile)
  section('rateprofile', profiles.rate, base.meta.activeRateProfile)
  section('battery_profile', profiles.battery, base.meta.activeBatteryProfile)

  const bad = out.filter((c) => !isGeneratedCommand(c))
  if (bad.length) throw new Error(`만들 수 없는 명령: ${bad.join(' / ')}`)
  return out
}

/** 기체에 보낼 전체 순서: batch start → 변경 → save (batch end 없음) */
export function buildCommands(base: CraftSnapshot, edits: Edits, opts?: { noreboot?: boolean }): string[] {
  const body = changeCommands(base, edits)
  if (body.length === 0) return []
  return ['batch start', ...body, opts?.noreboot ? 'save noreboot' : 'save']
}

/** 2026-10-20 13:05 → 20261020-1305 */
export function stamp(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`
}

export const changesFileName = (craftName: string, d: Date) => `${sanitizeFileName(craftName)}_changes_${stamp(d)}.txt`
export const fullDiffFileName = (craftName: string, d: Date) => `${sanitizeFileName(craftName)}_diff-edited_${stamp(d)}.txt`

/** 펌웨어 헤더 줄 ("# Betaflight / STM32F405 (S405) 4.5.1 ...") */
const firmwareLine = (base: CraftSnapshot) => base.meta.firmware || '(알 수 없음)'

/** 변경분 파일 (SPEC 10절). Betaflight App CLI 탭에 그대로 붙여 넣을 수 있다 */
export function changesFileText(base: CraftSnapshot, edits: Edits, appVersion: string): string {
  const body = changeCommands(base, edits)
  const head = [
    `# Betaflight CLI Editor ${appVersion}`,
    `# craft: ${base.craftName}`,
    `# firmware: ${firmwareLine(base)}`,
    `# based on: ${base.readAt || '(알 수 없음)'}`,
    `# changes: ${Object.keys(edits).length}`,
    '#',
    '# 오류(###ERROR)가 하나라도 나오면 save 가 거부됩니다. 오류를 고친 뒤 다시 붙여 넣으세요.'
  ]
  return [...head, '', 'batch start', '', ...spaced(body), '', 'save', ''].join('\n')
}

/** 보기 좋게: 프로필 전환 앞에 빈 줄 */
function spaced(cmds: string[]): string[] {
  const out: string[] = []
  cmds.forEach((c, i) => {
    if (i > 0 && /^(profile|rateprofile|battery_profile) /.test(c)) out.push('')
    out.push(c)
  })
  return out
}

/**
 * 편집 전체가 적용된 diff all 형식 백업 (SPEC 10절 [전체 diff로 내보내기]).
 * 원본 diff all 을 한 줄씩 따라가며, 편집한 항목의 줄은 그 자리에서 새 값으로 바꾸고,
 * 원본 diff 에 없던 항목(기본값이었던 것)은 알맞은 섹션 끝에 넣는다 — 펌웨어 diff all 과 같은 모양이 된다.
 * 원본에 diff all 이 없으면(dump 만 있는 파일) null.
 */
export function fullDiffText(base: CraftSnapshot, edits: Edits, appVersion: string): string | null {
  const diff = base.raw.diffAll.replace(/\r\n/g, '\n')
  if (!diff.trim()) return null
  changeCommands(base, edits) // 검사 (오류면 EditValidationError)

  const pending = new Map(Object.values(edits).map((e) => [e.key, e]))
  const newLine = (e: Edit) => {
    const s = parseSetKey(e.key)
    return s ? setLine(s.name, e.after) : e.after.trim()
  }
  const take = (pred: (e: Edit) => boolean) => {
    const got = sortLines([...pending.values()].filter(pred))
    for (const e of got) pending.delete(e.key)
    return got.map(newLine)
  }
  type Sec = { kind: 'master' } | { kind: 'pid' | 'rate' | 'battery'; n: number }
  const inSection = (sec: Sec) => (e: Edit) => {
    const s = parseSetKey(e.key)
    if (!s) return false
    return sec.kind === 'master' ? s.scope === 'master' : s.scope === sec.kind && s.profile === sec.n
  }

  const src = diff.split('\n')
  const out: string[] = []
  let sec: Sec = { kind: 'master' }
  let linesDone = false
  const flushSection = () => {
    // 섹션이 끝날 때: 원본에 없던 그 섹션의 set 을 끝에 붙인다 (빈 줄 앞)
    const add = take(inSection(sec))
    if (!add.length) return
    let at = out.length
    while (at > 0 && out[at - 1].trim() === '') at--
    out.splice(at, 0, ...add)
  }
  const flushLines = () => {
    if (linesDone) return
    linesDone = true
    const add = take((e) => !parseSetKey(e.key))
    if (add.length) out.push(...add, '')
  }

  for (const line of src) {
    const t = line.trim()
    let m: RegExpExecArray | null
    if ((m = /^(profile|rateprofile|battery_profile) (\d+)$/.exec(t))) {
      flushLines()
      flushSection()
      sec = { kind: m[1] === 'profile' ? 'pid' : m[1] === 'rateprofile' ? 'rate' : 'battery', n: Number(m[2]) }
      out.push(line)
      continue
    }
    if (t === '# master' || /^set /.test(t)) flushLines() // 줄 명령은 master 섹션 앞
    if (/^(# restore original|# save configuration)/.test(t) || /^save\b/.test(t)) {
      flushLines()
      flushSection()
      sec = { kind: 'master' }
    }
    if ((m = /^set ([A-Za-z0-9_]+) = /.exec(t))) {
      const key = sec.kind === 'master' ? `master.${m[1]}` : `${sec.kind}.${sec.n}.${m[1]}`
      const e = pending.get(key)
      if (e) {
        pending.delete(key)
        out.push(newLine(e))
        continue
      }
    } else if (t && !t.startsWith('#')) {
      const key = parseCli(t).keys.find((k) => pending.has(k) && !parseSetKey(k))
      if (key) {
        out.push(newLine(pending.get(key)!))
        pending.delete(key)
        continue
      }
    }
    out.push(line)
  }

  // 원본 diff 에 해당 프로필 섹션이 없던 편집 (드문 경우): save 앞에 프로필을 골라 넣고 원래 프로필로 되돌린다
  if (pending.size) {
    const rest: Edits = Object.fromEntries(pending)
    const block = changeCommands(base, rest)
    let at = out.findIndex((l) => /^save\b/.test(l.trim()))
    if (at < 0) at = out.length
    while (at > 0 && /^(# save configuration)?$/.test(out[at - 1].trim())) at--
    out.splice(at, 0, '', ...spaced(block))
  }
  out.splice(out[0]?.startsWith('# version') ? 2 : 0, 0, `# Betaflight CLI Editor ${appVersion}: 편집 ${Object.keys(edits).length}개 적용`)
  return out.join('\n')
}
