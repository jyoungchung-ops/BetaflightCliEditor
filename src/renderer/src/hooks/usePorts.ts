import { useCallback, useEffect, useRef, useState } from 'react'
import type { PortInfo } from '@shared/serial'

const POLL_MS = 2000

/** COM 포트 목록. 2초마다 갱신(USB 연결·분리 반영), enabled=false면 멈춘다 */
export function usePorts(enabled: boolean) {
  const [ports, setPorts] = useState<PortInfo[]>([])
  const [error, setError] = useState<string | null>(null)
  const lastJson = useRef('')

  const refresh = useCallback(async () => {
    if (!window.bfview) return
    const r = await window.bfview.listPorts()
    if (!r.ok) {
      setError(r.message)
      return
    }
    setError(null)
    const json = JSON.stringify(r.value)
    if (json !== lastJson.current) {
      lastJson.current = json
      setPorts(r.value)
    }
  }, [])

  useEffect(() => {
    if (!enabled) return
    void refresh()
    const id = setInterval(() => void refresh(), POLL_MS)
    return () => clearInterval(id)
  }, [enabled, refresh])

  return { ports, error, refresh }
}
