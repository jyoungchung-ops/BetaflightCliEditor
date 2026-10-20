import { useState } from 'react'
import { masterKeysForTab } from '@shared/mapping/tabKeys'
import { Columns, Field, FieldList, KeyHint, RestOfMaster, TabFrame, Panel, cent, namesOf, type FieldDef } from '../ui/widgets'
import { useSnap } from '../ui/snapshot'

const V = { unit: 'V', format: cent }

/** 2026.6+ 배터리 프로필 키 (cli/settings.c PROFILE_BATTERY_VALUE) */
const BATTERY_PROFILE: FieldDef[] = [
  ['battery_profile_name', '프로필 이름'],
  ['vbat_max_cell_voltage', '셀 최대 전압', V],
  ['vbat_full_cell_voltage', '셀 완충 전압', V],
  ['vbat_warning_cell_voltage', '셀 경고 전압', V],
  ['vbat_min_cell_voltage', '셀 최저 전압', V],
  ['bat_capacity', '배터리 용량', { unit: 'mAh', hint: '0 = 사용 안 함' }],
  ['cbat_alert_percent', '용량 경고 시점', { unit: '%' }],
  ['force_battery_cell_count', '셀 수 고정', { hint: '0 = 자동 감지' }]
]

/** 배터리 프로필(2026.6+) 값 — 프로필을 골라 본다. 정해진 키 밖의 값도 빠짐없이 아래에 나온다 */
function BatteryProfiles({ profiles, active }: { profiles: Record<string, string>[]; active: number }) {
  const { changed } = useSnap()
  const [n, setN] = useState(active)
  const p = profiles[n] ?? {}
  const shown = new Set(BATTERY_PROFILE.map(([k]) => k))
  const rows: FieldDef[] = [...BATTERY_PROFILE.filter(([k]) => p[k] !== undefined), ...Object.keys(p).filter((k) => !shown.has(k)).map((k): FieldDef => [k, k])]
  return (
    <Panel
      title="배터리 프로필"
      right={
        <select className="select" value={n} onChange={(e) => setN(Number(e.target.value))} aria-label="배터리 프로필">
          {profiles.map((bp, i) => (
            <option key={i} value={i}>
              {i + 1}
              {bp?.battery_profile_name && bp.battery_profile_name !== '-' ? ` · ${bp.battery_profile_name}` : ''}
              {i === active ? ' (활성)' : ''}
            </option>
          ))}
        </select>
      }
    >
      {rows.map(([k, label, o]) => (
        <Field
          key={k}
          label={label}
          value={o?.format ? o.format(p[k]) : p[k]}
          unit={o?.unit}
          k={`battery.${n}.${k}`}
          hint={<KeyHint name={k} hint={o?.hint} />}
          edit={p[k] !== undefined ? { fullKey: `battery.${n}.${k}`, name: k, raw: p[k] } : undefined}
        />
      ))}
      {rows.some(([k]) => changed.has(`battery.${n}.${k}`)) && <p className="muted small">노란 테두리 = 기본값과 다른 값</p>}
    </Panel>
  )
}

const BATTERY: FieldDef[] = [
  ['battery_meter', '전압계 종류'],
  ['vbat_max_cell_voltage', '셀 최대 전압', V],
  ['vbat_full_cell_voltage', '셀 완충 전압', V],
  ['vbat_warning_cell_voltage', '셀 경고 전압', V],
  ['vbat_min_cell_voltage', '셀 최저 전압', V],
  ['vbat_detect_cell_voltage', '셀 수 감지 전압', V],
  ['force_battery_cell_count', '셀 수 고정', { hint: '0 = 자동 감지' }],
  ['bat_capacity', '배터리 용량', { unit: 'mAh', hint: '0 = 사용 안 함' }]
]

const VOLTAGE: FieldDef[] = [
  ['vbat_scale', '전압 배율'],
  ['vbat_divider', '분배 비율'],
  ['vbat_multiplier', '곱셈 비율'],
  ['vbat_display_lpf_period', '표시 필터 주기', { hint: '0.1초 단위' }],
  ['vbat_sag_lpf_period', '전압 강하 필터 주기', { hint: '0.1초 단위' }]
]

const CURRENT: FieldDef[] = [
  ['current_meter', '전류계 종류'],
  ['ibata_scale', '전류 배율', { hint: 'mV/10A' }],
  ['ibata_offset', '전류 오프셋', { unit: 'mA' }],
  ['ibat_lpf_period', '전류 필터 주기', { hint: '0.1초 단위' }]
]

const ALERTS: FieldDef[] = [
  ['use_vbat_alerts', '전압 경고'],
  ['use_cbat_alerts', '용량 경고'],
  ['cbat_alert_percent', '용량 경고 시점', { unit: '%' }],
  ['vbat_hysteresis', '전압 히스테리시스', { hint: '0.01V 단위' }],
  ['vbat_cutoff_percent', '전압 차단 비율', { unit: '%' }],
  ['vbat_duration_for_warning', '경고 판정 시간', { hint: '0.1초 단위' }],
  ['vbat_duration_for_critical', '위험 판정 시간', { hint: '0.1초 단위' }]
]

export function PowerTab() {
  const { snap } = useSnap()
  return (
    <TabFrame title="전원·배터리" en="Power & Battery">
      <Columns>
        {snap.batteryProfiles?.length ? (
          <BatteryProfiles profiles={snap.batteryProfiles} active={snap.meta.activeBatteryProfile ?? 0} />
        ) : null}
        <Panel title={snap.batteryProfiles?.length ? '배터리 (공통)' : '배터리'}>
          <FieldList items={BATTERY} />
        </Panel>
        <Panel title="전압계">
          <FieldList items={VOLTAGE} />
        </Panel>
        <Panel title="전류계">
          <FieldList items={CURRENT} />
        </Panel>
        <Panel title="경고">
          <FieldList items={ALERTS} />
        </Panel>
        <RestOfMaster keys={masterKeysForTab('power', snap.master)} used={namesOf(BATTERY, VOLTAGE, CURRENT, ALERTS)} />
      </Columns>
    </TabFrame>
  )
}
