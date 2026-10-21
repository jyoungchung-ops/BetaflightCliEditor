// 탭 화면 공용 부품. 보기 모드에서는 읽기 전용이고, 변경된 값(diff all에 있는 키)은 노란 점으로 표시한다.
// 편집 모드(v2)에서는 형식(schema)이 있는 값이 입력 컨트롤로 바뀌고, 편집한 값은 파란 테두리로 표시한다.

import { useState, type ReactNode } from 'react'
import { RotateCcw } from 'lucide-react'
import { useSnap } from './snapshot'
import { useEdit } from './editContext'

/** 편집 상태 표시용: 편집됨 / 오류 / 원래 값 */
export function useEditMark(fullKey: string | undefined) {
  const { edits, errors, revert } = useEdit()
  const e = fullKey ? edits[fullKey] : undefined
  return {
    edited: Boolean(e),
    error: fullKey ? errors[fullKey] : undefined,
    title: e ? `원래 값 ${e.before || '(빈 값)'} → 새 값 ${e.after || '(빈 값)'}` : undefined,
    revertButton: e ? (
      <button type="button" className="revert-btn" title="원래 값으로 되돌리기" aria-label="원래 값으로 되돌리기" onClick={() => revert(fullKey!)}>
        <RotateCcw size={13} aria-hidden />
      </button>
    ) : null
  }
}

/** 편집 모드의 값 입력. 형식(schema)에 따라 숫자·목록·켜짐/꺼짐·문자열 입력 */
export function ValueEditor({ fullKey, name, raw }: { fullKey: string; name: string; raw: string }) {
  const { schema, setValue } = useEdit()
  const s = schema?.[name]
  const { error } = useEditMark(fullKey)
  const cls = 'edit-input' + (error ? ' invalid' : '')
  if (!s) return null
  const set = (v: string) => setValue(fullKey, v)
  switch (s.kind) {
    case 'number':
      return (
        <input
          className={cls}
          type="number"
          value={raw}
          min={s.min}
          max={s.max}
          step={1}
          aria-label={name}
          title={error ?? `${s.min} ~ ${s.max}`}
          onChange={(e) => set(e.target.value)}
        />
      )
    case 'enum': {
      const values = s.values ?? []
      const has = values.some((v) => v.toUpperCase() === raw.toUpperCase())
      return (
        <select className={cls} value={raw} aria-label={name} title={error} onChange={(e) => set(e.target.value)}>
          {!has && <option value={raw}>{raw}</option>}
          {values.map((v) => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </select>
      )
    }
    case 'bool':
      return (
        <button
          type="button"
          className={'switch switch-btn' + (raw === 'ON' ? ' on' : '')}
          role="switch"
          aria-checked={raw === 'ON'}
          aria-label={name}
          onClick={() => set(raw === 'ON' ? 'OFF' : 'ON')}
        />
      )
    case 'string':
      return (
        <input
          className={cls}
          type="text"
          value={raw}
          maxLength={s.maxLength}
          aria-label={name}
          title={error ?? `${s.maxLength}자까지, 비우려면 -`}
          onChange={(e) => set(e.target.value)}
        />
      )
    case 'array':
      return <input className={cls} type="text" value={raw} aria-label={name} title={error ?? `값 ${s.length}개, 쉼표로 구분`} onChange={(e) => set(e.target.value)} />
  }
}

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
  /** 편집 가능한 값이면: 전체 키, 설정 이름(schema), CLI 원래 형식의 값 */
  edit?: { fullKey: string; name: string; raw: string }
}

/** 이름 | 값 상자 한 줄 */
export function Field({ label, value, k, unit, hint, edit }: FieldProps) {
  const { changed } = useSnap()
  const { editing, schema } = useEdit()
  const mark = useEditMark(edit?.fullKey)
  const keys = k === undefined ? [] : Array.isArray(k) ? k : [k]
  const isChanged = keys.some((x) => changed.has(x))
  const empty = value === undefined || value === null || value === ''
  const editable = Boolean(editing && edit && schema?.[edit.name])
  return (
    <div className={'field' + (isChanged ? ' changed' : '') + (mark.edited ? ' edited' : '') + (mark.error ? ' invalid' : '')}>
      <span className="field-name">
        {label}
        {hint && <span className="field-hint">{hint}</span>}
        {mark.error && <span className="field-error">{mark.error}</span>}
      </span>
      <span className="field-value" title={mark.title}>
        {editable ? (
          <>
            <ValueEditor fullKey={edit!.fullKey} name={edit!.name} raw={edit!.raw} />
            {/* 표시 형식이 CLI 값과 다르면(예: 430 → 4.30 V) 옆에 보여 준다 */}
            {value !== edit!.raw && !empty && (
              <span className="edit-preview">
                = {value}
                {unit && <span className="unit">{unit}</span>}
              </span>
            )}
          </>
        ) : (
          <span className="value-box">
            {empty ? '—' : value}
            {!empty && unit && <span className="unit">{unit}</span>}
          </span>
        )}
        {mark.revertButton}
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
      edit={key && v !== undefined ? { fullKey: `master.${key}`, name: key, raw: v } : undefined}
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

/**
 * 켜짐/꺼짐 줄. onToggle 이 있고 편집 모드면 눌러서 바꿀 수 있다.
 * editKey: 편집 표시용 전체 키 (변경 강조 키 k 와 같지 않을 수 있음)
 */
export function Toggle({
  on,
  label,
  k,
  hint,
  onToggle,
  editKey
}: {
  on: boolean | undefined
  label: ReactNode
  k?: string
  hint?: ReactNode
  onToggle?(): void
  editKey?: string
}) {
  const { changed } = useSnap()
  const { editing } = useEdit()
  const mark = useEditMark(editKey ?? k)
  const isChanged = k !== undefined && changed.has(k)
  const clickable = editing && onToggle
  return (
    <div className={'toggle-row' + (isChanged ? ' changed' : '') + (mark.edited ? ' edited' : '')} title={mark.title}>
      {clickable ? (
        <button type="button" className={'switch switch-btn' + (on ? ' on' : '')} role="switch" aria-checked={Boolean(on)} onClick={onToggle} />
      ) : (
        <span className={'switch' + (on ? ' on' : '')} role="img" aria-label={on ? '켜짐' : '꺼짐'} />
      )}
      <span className="toggle-label">
        {label}
        {hint && <span className="field-hint">{hint}</span>}
      </span>
      {mark.revertButton}
      <ChangedDot on={isChanged} />
    </div>
  )
}

/** ON/OFF 문자열 master 키를 토글로 */
export function MasterToggle({ name, label }: { name: string; label: ReactNode }) {
  const { m } = useSnap()
  const { schema, setValue } = useEdit()
  const v = m(name)
  if (v === undefined) return null
  const key = `master.${name}`
  return (
    <Toggle
      on={v === 'ON'}
      label={label}
      k={key}
      hint={<code className="key">{name}</code>}
      onToggle={schema?.[name] ? () => setValue(key, v === 'ON' ? 'OFF' : 'ON') : undefined}
    />
  )
}

/** feature 켜기/끄기 (줄 단위 편집: "feature X" / "feature -X") */
export function FeatureToggle({ name, label, hint }: { name: string; label: ReactNode; hint?: ReactNode }) {
  const { snap } = useSnap()
  const { setValue } = useEdit()
  const on = snap.features[name]
  const key = `feature.${name}`
  return (
    <Toggle
      on={on}
      label={label}
      k={key}
      hint={hint}
      onToggle={on === undefined ? undefined : () => setValue(key, `feature ${on ? '-' : ''}${name}`)}
    />
  )
}

/**
 * 표 칸 하나의 값. 편집 모드 + 형식이 있으면 입력, 아니면 값 상자.
 * display: 보기 모드에서 보여 줄 형식(없으면 raw)
 */
export function CellValue({ fullKey, name, raw, display, changed }: { fullKey: string; name: string; raw: string | undefined; display?: ReactNode; changed?: boolean }) {
  const { editing, schema } = useEdit()
  const mark = useEditMark(fullKey)
  if (raw !== undefined && editing && schema?.[name]) {
    return (
      <span className={'cell' + (mark.edited ? ' edited' : '') + (mark.error ? ' invalid' : '')} title={mark.error ?? mark.title}>
        <ValueEditor fullKey={fullKey} name={name} raw={raw} />
        {mark.revertButton}
      </span>
    )
  }
  return (
    <span
      className={'value-box' + (changed ? ' cell-changed' : '') + (mark.edited ? ' cell-edited' : '') + (mark.error ? ' cell-invalid' : '')}
      title={mark.title ?? name}
    >
      {raw === undefined ? '—' : (display ?? raw)}
    </span>
  )
}

/**
 * 표시 단위로 고치는 칸 (예: Actual 레이트 rc_rate 7 → 70°/s). 기체에는 CLI 정수 값(표시 ÷ scale)을 쓴다.
 * 입력 중에는 그대로 두고, 정수로 딱 떨어지거나 칸을 벗어날 때 반영한다.
 */
export function ScaledCell({
  fullKey,
  name,
  raw,
  scale,
  digits = 0,
  unit,
  changed
}: {
  fullKey: string
  name: string
  raw: string | undefined
  scale: number
  digits?: number
  unit?: string
  changed?: boolean
}) {
  const { editing, schema, setValue } = useEdit()
  const mark = useEditMark(fullKey)
  const [draft, setDraft] = useState<string | null>(null)
  const s = schema?.[name]
  const shown = raw === undefined ? '' : (Number(raw) * scale).toFixed(digits)
  if (raw === undefined || !editing || !s || s.kind !== 'number') {
    return (
      <span className={'value-box' + (changed ? ' cell-changed' : '') + (mark.edited ? ' cell-edited' : '')} title={mark.title ?? name}>
        {raw === undefined ? '—' : `${shown}${unit ?? ''}`}
      </span>
    )
  }
  const commit = (text: string) => {
    const v = Number(text)
    if (text.trim() === '' || Number.isNaN(v)) return
    setValue(fullKey, String(Math.round(v / scale)))
  }
  return (
    <span className={'cell' + (mark.edited ? ' edited' : '') + (mark.error ? ' invalid' : '')} title={mark.error ?? mark.title ?? `${name} = ${raw}`}>
      <input
        className={'edit-input' + (mark.error ? ' invalid' : '')}
        type="number"
        step={scale}
        min={s.min !== undefined ? s.min * scale : undefined}
        max={s.max !== undefined ? s.max * scale : undefined}
        value={draft ?? shown}
        aria-label={name}
        onChange={(e) => {
          const t = e.target.value
          // 화살표·정확한 값이면 바로, 아니면 입력이 끝날 때
          if (Number.isInteger(Math.round((Number(t) / scale) * 1e6) / 1e6)) {
            setDraft(null)
            commit(t)
          } else setDraft(t)
        }}
        onBlur={() => {
          if (draft !== null) commit(draft)
          setDraft(null)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && draft !== null) {
            commit(draft)
            setDraft(null)
          }
        }}
      />
      {unit && <span className="unit">{unit}</span>}
      {mark.revertButton}
    </span>
  )
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="muted empty-note">{children}</p>
}

/** 숫자 문자열 → 숫자 (아니면 NaN) */
export const num = (v: string | undefined) => (v === undefined || v === '' ? NaN : Number(v))
