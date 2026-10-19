import type { TabDef } from '@shared/tabs'
import type { CraftSnapshot } from '@shared/cli/types'
import { TabIcon } from '../components/TabIcon'

/** 아직 화면을 만들지 않은 탭 */
export function TabPlaceholder({ tab, snapshot }: { tab: TabDef; snapshot?: CraftSnapshot | null }) {
  return (
    <section className="tab">
      <header className="tab-header">
        <TabIcon id={tab.id} size={22} />
        <h1>{tab.label}</h1>
        <span className="tab-en">{tab.en}</span>
      </header>
      <div className="panel">
        <div className="panel-title">{tab.en}</div>
        <div className="panel-body empty">
          <p>{tab.summary}</p>
          <p className="muted">
            {snapshot ? '이 탭의 화면은 다음 단계에서 채워집니다.' : '기체를 연결하거나 저장 파일을 열면 값이 표시됩니다.'}
          </p>
        </div>
      </div>
    </section>
  )
}
