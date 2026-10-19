import { useMemo, useState, type ReactNode } from 'react'
import { Check, Copy } from 'lucide-react'
import type { RawCli } from '@shared/cli/types'
import { TabFrame } from '../ui/widgets'
import { useSnap } from '../ui/snapshot'

const SOURCES: [keyof RawCli, string][] = [
  ['diffAll', 'diff all'],
  ['dumpAll', 'dump all'],
  ['version', 'version'],
  ['status', 'status']
]

function highlight(line: string, q: string): ReactNode {
  if (!q) return line
  const parts: ReactNode[] = []
  const lower = line.toLowerCase()
  let i = 0
  for (let at = lower.indexOf(q); at >= 0; at = lower.indexOf(q, at + q.length)) {
    parts.push(line.slice(i, at), <mark key={at}>{line.slice(at, at + q.length)}</mark>)
    i = at + q.length
  }
  parts.push(line.slice(i))
  return parts
}

export function CliTab() {
  const { snap } = useSnap()
  const [source, setSource] = useState<keyof RawCli>(snap.raw.diffAll.trim() ? 'diffAll' : 'dumpAll')
  const [query, setQuery] = useState('')
  const [onlyMatches, setOnlyMatches] = useState(true)
  const [copied, setCopied] = useState(false)

  const text = snap.raw[source]
  const lines = useMemo(() => text.replace(/\r/g, '').replace(/\n$/, '').split('\n'), [text])
  const q = query.trim().toLowerCase()
  const shown = lines.map((l, i) => ({ l, n: i + 1 })).filter(({ l }) => !q || !onlyMatches || l.toLowerCase().includes(q))
  const matchCount = q ? lines.filter((l) => l.toLowerCase().includes(q)).length : 0

  async function copy() {
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <TabFrame title="CLI" en="CLI">
      <div className="toolbar">
        <div className="subtabs inline" role="tablist">
          {SOURCES.map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={source === id}
              className={'subtab' + (source === id ? ' active' : '')}
              onClick={() => setSource(id)}
              disabled={!snap.raw[id].trim()}
            >
              {label}
            </button>
          ))}
        </div>
        <input
          className="search"
          type="search"
          placeholder="검색 (예: osd_, p_roll)"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="원문 검색"
        />
        <label>
          <input type="checkbox" checked={onlyMatches} onChange={(e) => setOnlyMatches(e.target.checked)} />
          일치하는 줄만
        </label>
        <span className="muted">{q ? `${matchCount}줄 일치 / ${lines.length}줄` : `${lines.length}줄`}</span>
        <button type="button" className="btn" onClick={() => void copy()} disabled={!text}>
          {copied ? <Check size={16} aria-hidden /> : <Copy size={16} aria-hidden />}
          {copied ? '복사됨' : '전체 복사'}
        </button>
      </div>

      <pre className="cli-text" aria-label={`${source} 원문`}>
        {shown.map(({ l, n }) => (
          <div key={n} className={'cli-line' + (l.startsWith('#') ? ' comment' : '')}>
            <span className="ln">{n}</span>
            <span>{highlight(l, q)}</span>
          </div>
        ))}
      </pre>
    </TabFrame>
  )
}
