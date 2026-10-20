import type { TabDef, TabId } from '@shared/tabs'
import { TabIcon } from './TabIcon'

interface Props {
  tabs: TabDef[]
  active: TabId
  onSelect(id: TabId): void
  /** 탭별 편집 개수 */
  badges?: Partial<Record<TabId, number>>
}

export function Sidebar({ tabs, active, onSelect, badges }: Props) {
  return (
    <nav className="sidebar" aria-label="탭">
      <ul>
        {tabs.map((t) => (
          <li key={t.id}>
            <button
              type="button"
              className={'sidebar-item' + (t.id === active ? ' active' : '')}
              aria-current={t.id === active ? 'page' : undefined}
              onClick={() => onSelect(t.id)}
              title={t.en}
            >
              <TabIcon id={t.id} />
              <span>{t.label}</span>
              {badges?.[t.id] ? (
                <span className="tab-badge" title={`편집 ${badges[t.id]}개`}>
                  {badges[t.id]}
                </span>
              ) : null}
            </button>
          </li>
        ))}
      </ul>
    </nav>
  )
}
