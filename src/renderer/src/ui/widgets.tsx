// 탭 화면 공용 부품. 모두 읽기 전용이며, 변경된 값(diff all에 있는 키)은 노란 점으로 표시한다.

import type { ReactNode } from 'react'
import { useSnap } from './snapshot'

export function ChangedDot({ on }: { on: boolean }) {
  return on ? <span className="dot" title="기본값과 다름 (diff all)" aria-label="변경됨" /> : null
}

export function Panel({ title, right, children, className }: { title: ReactNode; right?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={'panel' + (className ? ` ${className}` : '')}>
      <div className="panel-title">
        <span>{title}</span>
        {right && <span className="panel-title-right">{right}</span>}
      </div>
      <div className="panel-body">{children}</div>
    </div>
  )
}

/** 패널 여러 개를 App처럼 2열로 */
export function Columns({ children }: { children: ReactNode }) {
  return <div className="cols">{children}</div>
}

export function TabFrame({ title, en, children }: { title: string; en: string; children: ReactNode }) {
  return (
    <section className="tab">
      <header className="tab-header">
        <h1>{title}</h1>
        <span className="tab-en">{en}</span>
      </header>
      {children}
    </section>
  )
}

interface FieldProps {
  label: ReactNode
  value: ReactNode
  /** changed 판단용 전체 키 ("master.small_angle", "pid.0.p_roll") */
  k?: string | string[]
  unit?: string
  hint?: ReactNode
}

/** 이름 | 값 상자 한 줄 */
export function Field({ label, value, k, unit, hint }: FieldProps) {
  const { changed } = useSnap()
  const keys = k === undefined ? [] : Array.isArray(k) ? k : [k]
  const isChanged = keys.some((x) => changed.has(x))
  const empty = value === undefined || value === null || value === ''
  return (
    <div className={'field' + (isChanged ? ' changed' : '')}>
      <span className="field-name">
        {label}
        {hint && <span className="field-hint">{hint}</span>}
      </span>
      <span className="field-value">
        <span className="value-box">
          {empty ? '—' : value}
          {!empty && unit && <span className="unit">{unit}</span>}
        </span>
        <ChangedDot on={isChanged} />
      </span>
    </div>
  )
}

interface MasterFieldProps {
  /** master 키. 배열이면 처음 있는 키 사용 */
  name: string | string[]
  label: ReactNode
  unit?: string
  hint?: ReactNode
  format?(v: string): ReactNode
  /** 키가 없어도 줄을 보여 줌 */
  always?: boolean
}

/** 설명 + 키 이름 (키 이름은 항상 보여 준다 — CLI와 대조하기 쉽게) */
export function KeyHint({ name, hint }: { name?: string; hint?: ReactNode }) {
  return (
    <>
      {hint && <span>{hint}</span>}
      {name && <code className="key">{name}</code>}
    </>
  )
}

/** master 설정 한 개. 펌웨어에 없는 키면 줄을 숨긴다 */
export function MasterField({ name, label, unit, hint, format, always }: MasterFieldProps) {
  const { pick, m } = useSnap()
  const key = Array.isArray(name) ? pick(...name) : m(name) !== undefined ? name : undefined
  if (!key && !always) return null
  const v = key ? m(key) : undefined
  return (
    <Field
      label={label}
      k={key ? `master.${key}` : undefined}
      value={v === undefined ? undefined : format ? format(v) : v}
      unit={unit}
      hint={<KeyHint name={key} hint={hint} />}
    />
  )
}

/** 데이터로 적는 필드 목록: [키, 라벨, 옵션] */
export type FieldDef = [name: string, label: ReactNode, opts?: { unit?: string; hint?: ReactNode; format?(v: string): ReactNode }]

export function FieldList({ items }: { items: FieldDef[] }) {
  return (
    <>
      {items.map(([name, label, o]) => (
        <MasterField key={name} name={name} label={label} unit={o?.unit} hint={o?.hint} format={o?.format} />
      ))}
    </>
  )
}

/** 탭이 맡는 키 중 화면에 따로 배치하지 않은 나머지 */
export function RestOfMaster({ keys, used, title = '그 밖의 값' }: { keys: string[]; used: Iterable<string>; title?: string }) {
  const usedSet = new Set(used)
  const rest = keys.filter((k) => !usedSet.has(k))
  if (rest.length === 0) return null
  return (
    <Panel title={title} right={`${rest.length}개`}>
      {rest.map((k) => (
        <MasterField key={k} name={k} label={k} />
      ))}
    </Panel>
  )
}

/** FieldDef 목록들의 키 이름 */
export const namesOf = (...lists: FieldDef[][]) => lists.flat().map(([n]) => n)

/** 0.01 단위 (예: 430 → 4.30) */
export const cent = (v: string) => (num(v) / 100).toFixed(2)
/** 0.1 단위 (예: 15 → 1.5) */
export const deci = (v: string) => (num(v) / 10).toFixed(1)

export function Toggle({ on, label, k, hint }: { on: boolean | undefined; label: ReactNode; k?: string; hint?: ReactNode }) {
  const { changed } = useSnap()
  const isChanged = k !== undefined && changed.has(k)
  return (
    <div className={'toggle-row' + (isChanged ? ' changed' : '')}>
      <span className={'switch' + (on ? ' on' : '')} role="img" aria-label={on ? '켜짐' : '꺼짐'} />
      <span className="toggle-label">
        {label}
        {hint && <span className="field-hint">{hint}</span>}
      </span>
      <ChangedDot on={isChanged} />
    </div>
  )
}

/** ON/OFF 문자열 master 키를 토글로 */
export function MasterToggle({ name, label }: { name: string; label: ReactNode }) {
  const { m } = useSnap()
  const v = m(name)
  if (v === undefined) return null
  return <Toggle on={v === 'ON'} label={label} k={`master.${name}`} hint={<code className="key">{name}</code>} />
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="muted empty-note">{children}</p>
}

/** 숫자 문자열 → 숫자 (아니면 NaN) */
export const num = (v: string | undefined) => (v === undefined || v === '' ? NaN : Number(v))
