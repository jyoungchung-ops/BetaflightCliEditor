import { useEffect, useRef, useState, type ReactNode } from 'react'
import { saveFileName } from '@shared/files'

interface Props {
  title: string
  initial: string
  confirmLabel: string
  note?: ReactNode
  onConfirm(name: string): void
  onCancel(): void
}

/** 기체 이름 입력. 빈 값이면 확인 버튼이 꺼진다. 이 이름이 화면 제목과 기본 저장 파일명이 된다 */
export function NameModal({ title, initial, confirmLabel, note, onConfirm, onCancel }: Props) {
  const [name, setName] = useState(initial)
  const input = useRef<HTMLInputElement>(null)
  const trimmed = name.trim()

  useEffect(() => {
    input.current?.focus()
    input.current?.select()
  }, [])

  return (
    <div className="modal-backdrop" role="presentation" onKeyDown={(e) => e.key === 'Escape' && onCancel()}>
      <form
        className="modal panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="name-modal-title"
        onSubmit={(e) => {
          e.preventDefault()
          if (trimmed) onConfirm(trimmed)
        }}
      >
        <div className="panel-title" id="name-modal-title">
          {title}
        </div>
        <div className="panel-body modal-body">
          <label className="field-label" htmlFor="craft-name">
            기체 이름
          </label>
          <input
            id="craft-name"
            ref={input}
            className="text-input"
            value={name}
            maxLength={100}
            placeholder="예: Meteor75 Pro"
            onChange={(e) => setName(e.target.value)}
          />
          <p className="muted small">
            저장 파일 이름: <code>{trimmed ? saveFileName(trimmed) : '—'}</code>
          </p>
          {note}
          <div className="row actions modal-actions">
            <button type="button" className="btn" onClick={onCancel}>
              취소
            </button>
            <button type="submit" className="btn btn-primary" disabled={!trimmed}>
              {confirmLabel}
            </button>
          </div>
        </div>
      </form>
    </div>
  )
}
