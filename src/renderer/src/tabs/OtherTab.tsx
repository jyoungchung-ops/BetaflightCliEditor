import { useState } from 'react'
import { isMappedMasterKey } from '@shared/mapping/tabKeys'
import { ChangedDot, Empty, Panel, TabFrame } from '../ui/widgets'
import { useSnap } from '../ui/snapshot'

const KIND_LABEL = { resource: '리소스', timer: '타이머', dma: 'DMA' } as const

export function OtherTab() {
  const { snap, changed } = useSnap()
  const [query, setQuery] = useState('')
  const q = query.trim().toLowerCase()
  const match = (s: string) => !q || s.toLowerCase().includes(q)

  const unmapped = Object.keys(snap.master)
    .filter((k) => !isMappedMasterKey(k))
    .sort()
  const rows = unmapped.filter((k) => match(k) || match(snap.master[k]))
  const changedCount = unmapped.filter((k) => changed.has(`master.${k}`)).length
  const resources = snap.resources.filter((r) => match(r.text))

  return (
    <TabFrame title="기타" en="Other">
      <div className="toolbar">
        <input
          className="search"
          type="search"
          placeholder="키·값 검색"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="기타 값 검색"
        />
        <span className="muted">탭에 매핑되지 않은 set 키, 해석 못 한 줄, 리소스</span>
      </div>

      <Panel title="매핑되지 않은 설정" right={`${unmapped.length}개 · 변경 ${changedCount}개`}>
        {rows.length === 0 ? (
          <Empty>{unmapped.length === 0 ? '모든 키가 탭에 매핑되어 있습니다.' : '검색 결과가 없습니다.'}</Empty>
        ) : (
          <table className="grid-table">
            <thead>
              <tr>
                <th className="left">키</th>
                <th className="left">값</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((k) => (
                <tr key={k}>
                  <td className="left">
                    <span className="cell">
                      <code className="key">{k}</code>
                      <ChangedDot on={changed.has(`master.${k}`)} />
                    </span>
                  </td>
                  <td className="left">{snap.master[k] === '' ? <span className="no">(빈 값)</span> : snap.master[k]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>

      <Panel title="해석 못 한 줄" right={`${snap.unknown.length}줄`}>
        {snap.unknown.length === 0 ? (
          <Empty>없음 — 덤프의 모든 줄을 해석했습니다.</Empty>
        ) : (
          <pre className="cli-text">
            {snap.unknown.filter(match).map((l, i) => (
              <div key={i} className="cli-line">
                <span>{l}</span>
              </div>
            ))}
          </pre>
        )}
      </Panel>

      <Panel title="리소스 · 타이머 · DMA" right={`${snap.resources.length}줄`}>
        {resources.length === 0 ? (
          <Empty>없음</Empty>
        ) : (
          <table className="grid-table">
            <tbody>
              {resources.map((r, i) => (
                <tr key={i}>
                  <th scope="row" className="left">
                    {KIND_LABEL[r.kind]}
                  </th>
                  <td className="left">
                    <code>{r.text}</code>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>
    </TabFrame>
  )
}
