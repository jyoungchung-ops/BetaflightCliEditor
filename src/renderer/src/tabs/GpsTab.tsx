import { masterKeysForTab } from '@shared/mapping/tabKeys'
import { Columns, Field, FieldList, Panel, RestOfMaster, TabFrame, namesOf, type FieldDef } from '../ui/widgets'
import { useSnap } from '../ui/snapshot'

const GPS: FieldDef[] = [
  ['gps_provider', '프로토콜'],
  ['gps_sbas_mode', 'SBAS 지역'],
  ['gps_sbas_integrity', 'SBAS 무결성'],
  ['gps_auto_config', '자동 설정'],
  ['gps_auto_baud', '자동 보드레이트'],
  ['gps_ublox_use_galileo', 'Galileo 사용'],
  ['gps_ublox_flight_model', 'u-blox 비행 모델'],
  ['gps_ublox_acquire_model', 'u-blox 위성 찾기 모델'],
  ['gps_ublox_utc_standard', 'u-blox UTC 기준'],
  ['gps_set_home_point_once', '홈 위치 한 번만 설정'],
  ['gps_use_3d_speed', '3D 속도 사용']
]

const RESCUE: FieldDef[] = [
  ['gps_rescue_alt_mode', '고도 방식'],
  ['gps_rescue_return_alt', '귀환 고도', { unit: 'm' }],
  ['gps_rescue_initial_climb', '처음 상승', { unit: 'm' }],
  ['gps_rescue_ascend_rate', '상승 속도', { unit: 'cm/s' }],
  ['gps_rescue_ground_speed', '귀환 속도', { unit: 'cm/s' }],
  ['gps_rescue_descent_dist', '하강 시작 거리', { unit: 'm' }],
  ['gps_rescue_descend_rate', '하강 속도', { unit: 'cm/s' }],
  ['gps_rescue_landing_alt', '착륙 고도', { unit: 'm', hint: '4.5 — 2025.12+는 ap_landing_altitude_m' }],
  ['gps_rescue_min_start_dist', '최소 시작 거리', { unit: 'm' }],
  ['gps_rescue_min_sats', '최소 위성 수'],
  ['gps_rescue_allow_arming_without_fix', '위성 고정 없이 아밍 허용'],
  ['gps_rescue_sanity_checks', '안전 검사'],
  ['gps_rescue_max_angle', '최대 기울기', { unit: '°' }],
  ['gps_rescue_throttle_hover', '호버 스로틀', { hint: '4.5 — 2025.12+는 ap_hover_throttle' }],
  ['gps_rescue_throttle_min', '최소 스로틀', { hint: '4.5' }],
  ['gps_rescue_throttle_max', '최대 스로틀', { hint: '4.5' }],
  ['gps_rescue_disarm_threshold', '착륙 디스아밍 임계']
]

/** 2025.12+ 오토파일럿: GPS 레스큐의 고도·스로틀 제어가 여기로 옮겨졌다. 2026.6에서는 위치 제어도 */
const AUTOPILOT: FieldDef[] = [
  ['ap_landing_altitude_m', '착륙 시작 고도', { unit: 'm' }],
  ['ap_hover_throttle', '호버 스로틀'],
  ['ap_throttle_min', '최소 스로틀'],
  ['ap_throttle_max', '최대 스로틀'],
  ['ap_max_angle', '최대 기울기', { unit: '°' }],
  ['alt_hold_climb_rate', '고도 유지 상승 속도'],
  ['alt_hold_deadband', '고도 유지 데드밴드'],
  ['pos_hold_deadband', '위치 유지 데드밴드']
]

export function GpsTab() {
  const { snap, m } = useSnap()
  const on = Boolean(snap.features.GPS)

  return (
    <TabFrame title="GPS" en="GPS">
      {!on && <p className="notice info banner">GPS 기능이 꺼져 있습니다. 아래 값은 저장만 되어 있고 쓰이지 않습니다.</p>}
      <div className={on ? '' : 'disabled-area'}>
        <Columns>
          <Panel title="GPS">
            <Field label="GPS 기능" value={on ? '켜짐' : '꺼짐'} k="feature.GPS" />
            <FieldList items={GPS} />
          </Panel>
          <Panel title="GPS 레스큐" right={m('failsafe_procedure') === 'GPS-RESCUE' ? '페일세이프 절차로 사용 중' : undefined}>
            <FieldList items={RESCUE} />
          </Panel>
          {AUTOPILOT.some(([k]) => m(k) !== undefined) && (
            <Panel title="오토파일럿 · 고도/위치 유지" right="2025.12+">
              <FieldList items={AUTOPILOT} />
            </Panel>
          )}
          <RestOfMaster keys={masterKeysForTab('gps', snap.master)} used={namesOf(GPS, RESCUE, AUTOPILOT)} />
        </Columns>
      </div>
    </TabFrame>
  )
}
