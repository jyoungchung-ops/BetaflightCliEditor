import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  FileFormatError,
  diffFileName,
  fromSavedFile,
  looksLikeSavedFile,
  rawFromCliText,
  sanitizeFileName,
  saveFileName,
  toSavedFile
} from '../src/shared/files'
import { buildSnapshot } from '../src/shared/cli/parser'

const SAMPLE = join(__dirname, '..', 'fixtures', 'sample')
const read = (f: string) => readFileSync(join(SAMPLE, f), 'utf8')

describe('파일 이름 규칙', () => {
  it('기본 = <기체이름>.bfview.json', () => {
    expect(saveFileName('Meteor75 Pro')).toBe('Meteor75 Pro.bfview.json')
    expect(diffFileName('Meteor75 Pro')).toBe('Meteor75 Pro_diff.txt')
  })
  it('Windows 금지 문자 → _', () => {
    expect(sanitizeFileName('a/b\\c:d*e?f"g<h>i|j')).toBe('a_b_c_d_e_f_g_h_i_j')
  })
  it('앞뒤 공백·끝 마침표 제거', () => {
    expect(sanitizeFileName('  Moz7 ...  ')).toBe('Moz7')
    expect(sanitizeFileName('v1.2.')).toBe('v1.2')
  })
  it('최대 100자', () => {
    expect(sanitizeFileName('x'.repeat(150))).toHaveLength(100)
  })
  it('예약어면 뒤에 _', () => {
    for (const n of ['CON', 'prn', 'AUX', 'NUL', 'COM1', 'com9', 'LPT1', 'LPT9']) expect(sanitizeFileName(n)).toBe(n + '_')
    expect(sanitizeFileName('COM10')).toBe('COM10')
    expect(sanitizeFileName('Console')).toBe('Console')
  })
  it('한글 이름은 그대로', () => {
    expect(saveFileName('파보20 프로2')).toBe('파보20 프로2.bfview.json')
  })
  it('비면 대체 이름', () => {
    expect(sanitizeFileName('...')).toBe('craft')
  })
})

describe('저장 / 열기', () => {
  const raw = {
    version: read('pavo20-pro2.version.txt'),
    status: read('pavo20-pro2.status.txt'),
    diffAll: read('pavo20-pro2.diff.txt'),
    dumpAll: read('pavo20-pro2.dump.txt')
  }
  const snap = buildSnapshot({ craftName: '내 파보', readAt: '2026-10-19T09:00:00.000Z', raw })

  it('저장 → 열기 하면 같은 스냅샷', () => {
    const json = JSON.parse(JSON.stringify(toSavedFile(snap, '0.1.0')))
    expect(json.schemaVersion).toBe(2) // v2: raw.get · schema 추가
    expect(json.appVersion).toBe('0.1.0')
    const back = fromSavedFile(json)
    expect(back).toEqual(snap)
  })

  it('열 때 원문에서 다시 파싱한다 (저장된 파싱 결과는 믿지 않음)', () => {
    const json = { ...toSavedFile(snap, '0.1.0'), master: { bogus: '1' }, changed: [] }
    const back = fromSavedFile(json)
    expect(back.master.bogus).toBeUndefined()
    expect(back.changed).toEqual(snap.changed)
  })

  it('형식 오류', () => {
    expect(() => fromSavedFile(null)).toThrow(FileFormatError)
    expect(() => fromSavedFile({ craftName: 'x' })).toThrow(/schemaVersion/)
    expect(() => fromSavedFile({ schemaVersion: 99, raw })).toThrow(/새 버전/)
    expect(() => fromSavedFile({ schemaVersion: 1 })).toThrow(/원문/)
  })

  it('App에서 저장한 CLI 텍스트: dump / diff 구분과 craft_name', () => {
    const d = rawFromCliText(raw.dumpAll)
    expect(d.kind).toBe('dump')
    expect(d.raw.dumpAll).toBe(raw.dumpAll)
    expect(d.raw.diffAll).toBe('')
    expect(d.fcCraftName).toBe('Pavo20 Pro2')
    const f = rawFromCliText(raw.diffAll)
    expect(f.kind).toBe('diff')
    expect(f.raw.diffAll).toBe(raw.diffAll)
    expect(() => rawFromCliText('hello world')).toThrow(FileFormatError)
  })

  it('저장 파일 판별', () => {
    expect(looksLikeSavedFile('a.bfview.json', '{}')).toBe(true)
    expect(looksLikeSavedFile('dump.txt', '# dump all')).toBe(false)
  })
})
