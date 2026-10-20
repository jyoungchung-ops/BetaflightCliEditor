// 편집 모드 상태를 탭 부품에 나눠 준다. Provider 가 없으면(보기 전용 렌더, 테스트) 편집이 꺼진 기본값을 쓴다.
import { createContext, useContext, type ReactNode } from 'react'
import type { CraftSnapshot, SettingSchema } from '@shared/cli/types'
import type { Edits } from '@shared/edit/session'

export interface EditCtx {
  /** 편집 모드가 켜져 있는가 */
  editing: boolean
  /** 원본 (편집 전) */
  base: CraftSnapshot | null
  edits: Edits
  errors: Record<string, string>
  schema: Record<string, SettingSchema> | undefined
  /** merge: 끌기 중 이어지는 변경 (되돌리기 한 단계로 묶음) */
  setValue(key: string, value: string, opts?: { merge?: boolean }): void
  revert(key: string): void
}

const DEFAULT: EditCtx = {
  editing: false,
  base: null,
  edits: {},
  errors: {},
  schema: undefined,
  setValue: () => {},
  revert: () => {}
}

const Ctx = createContext<EditCtx>(DEFAULT)

export function EditProvider({ value, children }: { value: EditCtx; children: ReactNode }) {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export const useEdit = () => useContext(Ctx)
