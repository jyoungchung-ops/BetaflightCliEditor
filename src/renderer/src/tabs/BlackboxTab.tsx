import { masterKeysForTab } from '@shared/mapping/tabKeys'
import { Columns, FieldList, Panel, RestOfMaster, TabFrame, Toggle, KeyHint, namesOf, type FieldDef } from '../ui/widgets'
import { useSnap } from '../ui/snapshot'

const SETTINGS: FieldDef[] = [
  ['blackbox_device', '기록 장치'],
  ['blackbox_sample_rate', '기록 비율'],
  ['blackbox_mode', '기록 방식'],
  ['blackbox_high_resolution', '고해상도'],
  ['debug_mode', '디버그 모드'],
  ['sdcard_mode', 'SD 카드 모드'],
  ['sdcard_detect_inverted', 'SD 카드 감지 반전']
]

export function BlackboxTab() {
  const { snap } = useSnap()
  const disableKeys = Object.keys(snap.master).filter((k) => k.startsWith('blackbox_disable_'))

  return (
    <TabFrame title="블랙박스" en="Blackbox">
      <Columns>
        <Panel title="로깅 설정">
          <FieldList items={SETTINGS} />
        </Panel>
        {disableKeys.length > 0 && (
          <Panel title="기록할 항목" right="켜짐 = 기록함">
            <div className="toggle-grid">
              {disableKeys.map((k) => (
                <Toggle
                  key={k}
                  on={snap.master[k] === 'OFF'}
                  label={k.replace('blackbox_disable_', '').toUpperCase()}
                  k={`master.${k}`}
                  hint={<KeyHint name={k} />}
                />
              ))}
            </div>
          </Panel>
        )}
        <RestOfMaster keys={masterKeysForTab('blackbox', snap.master)} used={[...namesOf(SETTINGS), ...disableKeys]} />
      </Columns>
    </TabFrame>
  )
}
