// v2 5·6단계: 쓰기 전 일치 검사, 재검증, 12절 경고, 백업으로 되돌리기 (순수 함수)
import { describe, expect, it } from 'vitest'
import { buildSnapshot } from '../src/shared/cli/parser'
import type { CraftSnapshot } from '../src/shared/cli/types'
import { effective } from '../src/shared/edit/session'
import { checkBeforeWrite, firmwareHeader, previewRows, revertEdits, verifyAfterWrite, writeSupport, writeWarning } from '../src/shared/edit/writePlan'
import { apply, loadSitl, mixedSteps } from './editMix'

const base = loadSitl('4.5.5')
const edits = apply(base, mixedSteps(base)).edits
/** 편집이 적용된 기체를 dump 로 흉내 (원문까지 바꾸지는 않음 — valueOf 기준 비교만) */
const asWritten = (s: CraftSnapshot) => effective(s, edits)

describe('writeSupport', () => {
  it.each([
    ['4.5.3', true, false],
    ['4.5.4', true, true],
    ['4.5.5', true, true],
    ['2025.12.5', true, true],
    ['2026.6.2', true, true],
    ['4.4.3', false, false],
    ['2027.1.0', false, false],
    ['', false, false]
  ])('%s → 쓰기 %s, noreboot %s', (version, ok, noreboot) => {
    const r = writeSupport({ ...base.meta, version })
    expect(r.ok).toBe(ok)
    if (ok) expect(r.noreboot).toBe(noreboot)
  })
})

describe('checkBeforeWrite', () => {
  it('같은 기체면 막는 것도 충돌도 없다', () => {
    expect(checkBeforeWrite(base, base, edits)).toMatchObject({ blockers: [], conflicts: [] })
  })

  it('펌웨어 빌드가 다르면 막는다 (헤더 전체 비교)', () => {
    const other = buildSnapshot({ ...base, raw: { ...base.raw, version: base.raw.version.replace(/\d\d:\d\d:\d\d/, '01:02:03') } })
    expect(firmwareHeader(other)).not.toBe(firmwareHeader(base))
    expect(checkBeforeWrite(base, other, edits).blockers.join()).toMatch(/펌웨어/)
  })

  it('보드가 다르면 막는다', () => {
    const other = { ...base, meta: { ...base.meta, board: 'OTHERBOARD' } }
    expect(checkBeforeWrite(base, other, edits).blockers.join()).toMatch(/보드가 다릅니다/)
  })

  it('편집 대상의 지금 값이 원본과 다르면 충돌', () => {
    const now = { ...base, master: { ...base.master, craft_name: 'CHANGED' } }
    expect(checkBeforeWrite(base, now, edits).conflicts).toEqual([{ key: 'master.craft_name', before: base.master.craft_name, now: 'CHANGED', after: 'ROUND TRIP' }])
  })

  it('지원하지 않는 펌웨어·편집 없음은 막는다', () => {
    const old = { ...base, meta: { ...base.meta, version: '4.4.3' } }
    expect(checkBeforeWrite(old, old, edits).blockers.join()).toMatch(/지원하지 않습니다/)
    expect(checkBeforeWrite(base, base, {}).blockers.join()).toMatch(/편집이 없습니다/)
  })
})

describe('verifyAfterWrite', () => {
  it('편집이 모두 들어갔고 다른 값은 그대로면 불일치 없음', () => {
    expect(verifyAfterWrite(base, asWritten(base), edits)).toEqual([])
  })

  it('편집이 빠졌거나, 편집하지 않은 값이 바뀌면 알려 준다', () => {
    const after = asWritten(base)
    const k = Object.keys(base.master).find((x) => !edits[`master.${x}`])!
    const bad = { ...after, master: { ...after.master, craft_name: base.master.craft_name, [k]: 'X' } }
    const m = verifyAfterWrite(base, bad, edits)
    expect(m).toContainEqual({ key: 'master.craft_name', expected: 'ROUND TRIP', actual: base.master.craft_name, edited: true })
    expect(m).toContainEqual({ key: `master.${k}`, expected: base.master[k], actual: 'X', edited: false })
  })
})

describe('12절 경고', () => {
  it.each([
    ['master.motor_pwm_protocol', '', '', /모터/],
    ['master.align_board_yaw', '', '', /추락/],
    ['master.gyro_1_sensor_align', '', '', /추락/],
    ['master.serialrx_provider', '', '', /조종기/],
    ['serial.UART1', '', '', /조종기/],
    ['map', '', '', /조종기/],
    ['master.failsafe_procedure', '', '', /신호 상실/],
    ['rxfail.4', '', '', /신호 상실/],
    ['master.gyro_lpf1_static_hz', '', '', /과열/],
    ['master.dyn_notch_count', '', '', /과열/],
    ['pid.0.dterm_lpf1_static_hz', '', '', /과열/],
    ['aux.0', 'aux 0 1 0 1300 1700 0 0', 'aux 0 0 0 1700 2100 0 0', /시동/],
    ['aux.0', 'aux 0 0 0 1700 2100 0 0', 'aux 0 0 0 900 900 0 0', /시동/], // ARM 삭제
    ['aux.0', 'aux 0 27 1 1700 2100 0 0', 'aux 0 27 2 1700 2100 0 0', /시동/]
  ])('%s → 경고', (key, before, after, re) => {
    expect(writeWarning(key, before, after)).toMatch(re)
  })

  it.each([['master.craft_name'], ['pid.0.p_roll'], ['rate.0.roll_rc_rate']])('%s → 경고 없음', (key) => {
    expect(writeWarning(key, '', '')).toBeNull()
  })

  it('ANGLE 모드 범위는 경고 없음, 미리보기 줄에 경고가 붙는다', () => {
    expect(writeWarning('aux.1', 'aux 1 1 0 1300 1700 0 0', 'aux 1 1 0 1300 1800 0 0')).toBeNull()
    const rows = previewRows(edits)
    expect(rows.find((r) => r.key === 'map')?.warning).toMatch(/조종기/)
    expect(rows.find((r) => r.key === 'master.craft_name')?.warning).toBeNull()
  })
})

describe('백업으로 되돌리기', () => {
  it('지금 기체 → 백업과 다른 값만, 원래 값으로 돌아가는 편집', () => {
    const now = asWritten(base)
    const { edits: back, skipped } = revertEdits(now, base)
    expect(skipped).toEqual([])
    expect(Object.keys(back).sort()).toEqual(Object.keys(edits).sort())
    for (const e of Object.values(back)) {
      expect(e.before).toBe(edits[e.key].after)
      expect(e.after).toBe(edits[e.key].before)
    }
    expect(verifyAfterWrite(now, effective(now, back), back)).toEqual([])
  })

  it('같으면 되돌릴 것 없음', () => {
    expect(revertEdits(base, base).edits).toEqual({})
  })
})

describe('파일 내용으로 기체 맞추기 (원본 + 편집 → 지금 기체와 다른 값만)', () => {
  // 파일: 원본 + 이름·레이트 몇 개 편집 / 기체: 파일을 저장한 뒤 다른 값들이 바뀐 상태
  const fileEdits = apply(base, [
    ['master.craft_name', 'SYNCED'],
    [`rate.${base.meta.activeRateProfile}.roll_srate`, '80']
  ]).edits
  const target = effective(base, fileEdits)
  const craftNow = effective(base, edits) // mixedSteps 로 많이 바뀐 기체

  it('맞출 편집 = 기체 → 파일 차이, 충돌·막는 것 없음, 적용하면 파일과 같아진다', () => {
    const { edits: plan, skipped } = revertEdits(craftNow, target)
    expect(skipped).toEqual([])
    expect(plan['master.craft_name']).toMatchObject({ before: 'ROUND TRIP', after: 'SYNCED' })
    expect(Object.keys(plan).length).toBeGreaterThan(40)
    expect(checkBeforeWrite(base, craftNow, plan)).toMatchObject({ blockers: [], conflicts: [] })
    expect(verifyAfterWrite(target, effective(craftNow, plan), {})).toEqual([])
  })

  it('이미 같으면 맞출 것이 없다', () => {
    expect(revertEdits(target, target).edits).toEqual({})
  })

  it('펌웨어 빌드가 다른 기체는 막는다', () => {
    const other = buildSnapshot({ ...base, raw: { ...base.raw, version: base.raw.version.replace(/\d\d:\d\d:\d\d/, '01:02:03') } })
    const { edits: plan } = revertEdits(other, target)
    expect(checkBeforeWrite(base, other, plan).blockers.join()).toMatch(/펌웨어/)
  })
})
