import type { TabDef, TabId } from '@shared/tabs'
import { TabIcon } from './TabIcon'

interface Props {
  tabs: TabDef[]
  active: TabId
  onSelect(id: TabId): void
}

export function Sidebar({ tabs, active, onSelect }: Props) {
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
            </button>
          </li>
        ))}
      </ul>
    </nav>
  )
}
