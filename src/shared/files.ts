// 저장 파일 이름 규칙과 저장 형식 (SPEC 6절)

import { buildSnapshot, detectCliKind, parseCli } from './cli/parser'
import type { CraftSnapshot, RawCli } from './cli/types'

export const SAVE_EXT = '.bfview.json'
export const SCHEMA_VERSION = 1

const RESERVED = /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i
const MAX_LEN = 100

/**
 * Windows 파일 이름으로 쓸 수 있게 다듬는다.
 * 금지 문자 → _, 제어 문자 제거, 앞뒤 공백·끝 마침표 제거, 최대 100자, 예약어면 뒤에 _
 */
export function sanitizeFileName(name: string): string {
  let s = name
    .replace(/[\u0000-\u001f]/g, '')
    .replace(/[/\\:*?"<>|]/g, '_')
    .trim()
    .replace(/[. ]+$/, '')
  if (s.length > MAX_LEN) s = s.slice(0, MAX_LEN).trim().replace(/[. ]+$/, '')
  if (!s) s = 'craft'
  if (RESERVED.test(s)) s += '_'
  return s
}

export const saveFileName = (craftName: string) => sanitizeFileName(craftName) + SAVE_EXT

/**
 * 저장창이 돌려준 경로를 <이름>.bfview.json 으로 정리한다.
 * Windows 저장창은 두 단계 확장자(.bfview.json)를 다시 붙이는 일이 있어 "X.bfview.bfview.json"이 생겼다.
 * 반복된 .bfview 는 하나로, 확장자가 없으면 .bfview.json 을 붙인다. 사용자가 고른 다른 .json 이름은 그대로 둔다.
 */
export function normalizeSavePath(path: string): string {
  const collapsed = path.replace(/(\.bfview(\.json)?)+$/i, SAVE_EXT)
  return /\.json$/i.test(collapsed) ? collapsed : collapsed + SAVE_EXT
}
export const diffFileName = (craftName: string) => sanitizeFileName(craftName) + '_diff.txt'

export interface SavedFile extends CraftSnapshot {
  schemaVersion: number
  appVersion: string
}

export function toSavedFile(snap: CraftSnapshot, appVersion: string): SavedFile {
  return { schemaVersion: SCHEMA_VERSION, appVersion, ...snap }
}

export class FileFormatError extends Error {}

const isStr = (v: unknown): v is string => typeof v === 'string'

/**
 * 저장 파일 → 스냅샷. 원문(raw)에서 다시 파싱하므로 파서가 좋아지면 옛 파일도 새 결과로 보인다.
 */
export function fromSavedFile(json: unknown): CraftSnapshot {
  if (!json || typeof json !== 'object') throw new FileFormatError('JSON 객체가 아닙니다.')
  const f = json as Partial<SavedFile>
  if (typeof f.schemaVersion !== 'number') throw new FileFormatError('이 앱의 저장 파일이 아닙니다 (schemaVersion 없음).')
  if (f.schemaVersion > SCHEMA_VERSION)
    throw new FileFormatError(`더 새 버전 앱에서 저장한 파일입니다 (형식 ${f.schemaVersion}). 앱을 업데이트하세요.`)
  const raw = f.raw as Partial<RawCli> | undefined
  if (!raw || !isStr(raw.dumpAll) || !isStr(raw.diffAll)) throw new FileFormatError('원문(raw)이 없습니다.')
  return buildSnapshot({
    craftName: isStr(f.craftName) && f.craftName.trim() ? f.craftName : '이름 없는 기체',
    readAt: isStr(f.readAt) ? f.readAt : '',
    raw: { version: raw.version ?? '', status: raw.status ?? '', diffAll: raw.diffAll, dumpAll: raw.dumpAll }
  })
}

/** Betaflight App에서 저장한 CLI 텍스트 → 원문. dump인지 diff인지 추정해 자리를 정한다 */
export function rawFromCliText(text: string): { raw: RawCli; kind: 'dump' | 'diff'; fcCraftName: string } {
  const kind = detectCliKind(text)
  if (kind === 'unknown') throw new FileFormatError('Betaflight CLI 덤프로 보이지 않습니다 (set 줄이 없음).')
  const parsed = parseCli(text)
  const fcCraftName = parsed.master.craft_name && parsed.master.craft_name !== '-' ? parsed.master.craft_name : ''
  const raw: RawCli = { version: '', status: '', diffAll: kind === 'diff' ? text : '', dumpAll: kind === 'dump' ? text : '' }
  return { raw, kind, fcCraftName }
}

/** 파일 내용이 이 앱의 저장 파일(JSON)인가 */
export function looksLikeSavedFile(name: string, content: string): boolean {
  return name.toLowerCase().endsWith('.json') || content.trimStart().startsWith('{')
}
