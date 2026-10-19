import { createContext, useContext, useMemo, type ReactNode } from 'react'
import type { CraftSnapshot } from '@shared/cli/types'

interface SnapCtx {
  snap: CraftSnapshot
  changed: Set<string>
  /** master 값 (없으면 undefined) */
  m(key: string): string | undefined
  /** 후보 키 중 처음 있는 것 — 펌웨어 버전별 이름 차이 대응 (예: motor_idle / dshot_idle_value) */
  pick(...keys: string[]): string | undefined
}

const Ctx = createContext<SnapCtx | null>(null)

export function SnapshotProvider({ snap, children }: { snap: CraftSnapshot; children: ReactNode }) {
  const value = useMemo<SnapCtx>(() => {
    const changed = new Set(snap.changed)
    const m = (k: string) => snap.master[k]
    return {
      snap,
      changed,
      m,
      pick: (...keys) => keys.find((k) => snap.master[k] !== undefined)
    }
  }, [snap])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useSnap(): SnapCtx {
  const v = useContext(Ctx)
  if (!v) throw new Error('SnapshotProvider 밖에서 useSnap 호출')
  return v
}
