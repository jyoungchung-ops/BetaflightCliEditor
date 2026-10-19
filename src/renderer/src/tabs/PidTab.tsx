import { useState, type ReactNode } from 'react'
import { axisRates, maxRate, rateAt, supportsRateType } from '@shared/mapping/rates'
import { PID_PROFILE_SHOWN, RATE_PROFILE_SHOWN } from '@shared/mapping/tabKeys'
import { Columns, Field, MasterField, Panel, TabFrame, num } from '../ui/widgets'
import { useSnap } from '../ui/snapshot'

type Kind = 'pid' | 'rate'
export type PidSub = 'pid' | 'rates' | 'filters'
type Sub = PidSub

const AXES = [
  ['roll', '롤'],
  ['pitch', '피치'],
  ['yaw', '요']
] as const

const x100 = (v: string) => (num(v) / 100).toFixed(2)

/** 선택된 프로필의 값 한 개. 없으면 줄을 숨긴다 */
function ProfileField({
  kind,
  n,
  name,
  label,
  unit,
  hint,
  format
}: {
  kind: Kind
  n: number
  name: string
  label: ReactNode
  unit?: string
  hint?: ReactNode
  format?(v: string): ReactNode
}) {
  const { snap } = useSnap()
  const profile = (kind === 'pid' ? snap.pidProfiles : snap.rateProfiles)[n] ?? {}
  const v = profile[name]
  if (v === undefined) return null
  return (
    <Field
      label={label}
      value={format ? format(v) : v}
      unit={unit}
      k={`${kind}.${n}.${name}`}
      hint={hint === undefined ? <code className="key">{name}</code> : hint}
    />
  )
}

/** 화면에 따로 배치하지 않은 나머지 프로필 값 — 빠뜨리지 않기 위해 */
function RestOfProfile({ kind, n, shown }: { kind: Kind; n: number; shown: Set<string> }) {
  const { snap } = useSnap()
  const profile = (kind === 'pid' ? snap.pidProfiles : snap.rateProfiles)[n] ?? {}
  const rest = Object.keys(profile).filter((k) => !shown.has(k))
  if (rest.length === 0) return null
  return (
    <Panel title="그 밖의 프로필 값" right={`${rest.length}개`}>
      {rest.map((k) => (
        <ProfileField key={k} kind={kind} n={n} name={k} label={k} />
      ))}
    </Panel>
  )
}

function profileLabel(n: number, name: string | undefined, active: boolean) {
  return `${n + 1}${name && name !== '-' ? ` · ${name}` : ''}${active ? ' (활성)' : ''}`
}

export function PidTab({ initialSub = 'pid' }: { initialSub?: Sub }) {
  const { snap } = useSnap()
  const [pidN, setPidN] = useState(snap.meta.activePidProfile)
  const [rateN, setRateN] = useState(snap.meta.activeRateProfile)
  const [sub, setSub] = useState<Sub>(initialSub)

  return (
    <TabFrame title="PID 튜닝" en="PID Tuning">
      <div className="subtabs" role="tablist">
        {(
          [
            ['pid', 'PID 설정'],
            ['rates', '레이트'],
            ['filters', '필터']
          ] as [Sub, string][]
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={sub === id}
            className={'subtab' + (sub === id ? ' active' : '')}
            onClick={() => setSub(id)}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="toolbar">
        <label>
          PID 프로필
          <select className="select" value={pidN} onChange={(e) => setPidN(Number(e.target.value))}>
            {snap.pidProfiles.map((p, i) => (
              <option key={i} value={i}>
                {profileLabel(i, p?.profile_name, i === snap.meta.activePidProfile)}
              </option>
            ))}
          </select>
        </label>
        <label>
          레이트 프로필
          <select className="select" value={rateN} onChange={(e) => setRateN(Number(e.target.value))}>
            {snap.rateProfiles.map((p, i) => (
              <option key={i} value={i}>
                {profileLabel(i, p?.rateprofile_name, i === snap.meta.activeRateProfile)}
              </option>
            ))}
          </select>
        </label>
      </div>

      {sub === 'pid' && <PidSettings n={pidN} />}
      {sub === 'rates' && <Rates n={rateN} />}
      {sub === 'filters' && <Filters n={pidN} />}
    </TabFrame>
  )
}

// ── PID 설정 ──────────────────────────────────────────

/** 표 열: 후보 키 이름 (펌웨어 버전마다 다름) */
const PID_COLUMNS: { label: string; keys: (axis: string) => string[] }[] = [
  { label: 'P', keys: (a) => [`p_${a}`] },
  { label: 'I', keys: (a) => [`i_${a}`] },
  { label: 'D', keys: (a) => [`d_${a}`] },
  { label: 'D Max', keys: (a) => [`d_max_${a}`] },
  { label: '피드포워드', keys: (a) => [`f_${a}`] }
]

function PidTable({ n }: { n: number }) {
  const { snap, changed } = useSnap()
  const p = snap.pidProfiles[n] ?? {}
  const cols = PID_COLUMNS.map((c) => ({ ...c, key: (a: string) => c.keys(a).find((k) => p[k] !== undefined) })).filter((c) =>
    AXES.some(([a]) => c.key(a))
  )
  return (
    <table className="grid-table">
      <thead>
        <tr>
          <th className="left">축</th>
          {cols.map((c) => (
            <th key={c.label}>{c.label}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {AXES.map(([axis, label]) => (
          <tr key={axis}>
            <th scope="row">{label}</th>
            {cols.map((c) => {
              const k = c.key(axis)
              const isChanged = k !== undefined && changed.has(`pid.${n}.${k}`)
              return (
                <td key={c.label}>
                  <span className={'value-box' + (isChanged ? ' cell-changed' : '')}>{k ? p[k] : '—'}</span>
                </td>
              )
            })}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function PidSettings({ n }: { n: number }) {
  const F = (props: Omit<Parameters<typeof ProfileField>[0], 'kind' | 'n'>) => <ProfileField kind="pid" n={n} {...props} />
  return (
    <>
      <Columns>
        <Panel title="PID" right={`PID 프로필 ${n + 1}`}>
          <F name="profile_name" label="프로필 이름" />
          <PidTable n={n} />
          <p className="muted small">노란 테두리 = 기본값과 다른 값</p>
        </Panel>

        <Panel title="간편 튜닝 슬라이더">
          <F name="simplified_pids_mode" label="슬라이더 모드" />
          <F name="simplified_master_multiplier" label="마스터 배율" format={x100} />
          <F name="simplified_pi_gain" label="P·I 게인" format={x100} />
          <F name="simplified_i_gain" label="I 게인" format={x100} />
          <F name="simplified_d_gain" label="D 게인" format={x100} />
          <F name="simplified_dmax_gain" label="D Max 게인" format={x100} />
          <F name="simplified_feedforward_gain" label="피드포워드 게인" format={x100} />
          <F name="simplified_pitch_d_gain" label="피치 D 비율" format={x100} />
          <F name="simplified_pitch_pi_gain" label="피치 P·I 비율" format={x100} />
        </Panel>

        <Panel title="피드포워드">
          <F name="feedforward_transition" label="전환" />
          <F name="feedforward_averaging" label="평균" />
          <F name="feedforward_smooth_factor" label="스무딩 계수" />
          <F name="feedforward_jitter_factor" label="지터 감소" />
          <F name="feedforward_boost" label="부스트" />
          <F name="feedforward_max_rate_limit" label="최대 레이트 제한" unit="%" />
        </Panel>

        <Panel title="I-term · 안티 그래비티">
          <F name="iterm_relax" label="I-term 릴랙스" />
          <F name="iterm_relax_type" label="릴랙스 방식" />
          <F name="iterm_relax_cutoff" label="릴랙스 컷오프" unit="Hz" />
          <F name="iterm_rotation" label="I-term 회전" />
          <F name="iterm_windup" label="I-term 와인드업" unit="%" />
          <F name="anti_gravity_gain" label="안티 그래비티 게인" format={(v) => (num(v) / 10).toFixed(1)} />
          <F name="anti_gravity_cutoff_hz" label="안티 그래비티 컷오프" unit="Hz" />
          <F name="anti_gravity_p_gain" label="안티 그래비티 P 게인" />
        </Panel>

        <Panel title="D Max · TPA · 스로틀">
          <F name="d_max_gain" label="D Max 게인" />
          <F name="d_max_advance" label="D Max 어드밴스" />
          <F name="tpa_mode" label="TPA 모드" />
          <F name="tpa_rate" label="TPA 비율" unit="%" />
          <F name="tpa_breakpoint" label="TPA 시작점" unit="µs" />
          <F name="tpa_low_rate" label="TPA 저스로틀 비율" unit="%" />
          <F name="tpa_low_breakpoint" label="TPA 저스로틀 시작점" unit="µs" />
          <F name="tpa_low_always" label="TPA 저스로틀 항상" />
          <F name="throttle_boost" label="스로틀 부스트" />
          <F name="throttle_boost_cutoff" label="스로틀 부스트 컷오프" unit="Hz" />
          <F name="motor_output_limit" label="모터 출력 제한" unit="%" />
          <F name="thrust_linear" label="추력 선형화" unit="%" />
          <F name="vbat_sag_compensation" label="전압 강하 보상" unit="%" />
          <F name="auto_profile_cell_count" label="자동 프로필 셀 수" />
        </Panel>

        <Panel title="다이내믹 아이들">
          <F name="dyn_idle_min_rpm" label="최소 RPM" format={(v) => `${num(v) * 100}`} unit="rpm" hint="0 = 꺼짐" />
          <F name="dyn_idle_p_gain" label="P 게인" />
          <F name="dyn_idle_i_gain" label="I 게인" />
          <F name="dyn_idle_d_gain" label="D 게인" />
          <F name="dyn_idle_max_increase" label="최대 증가" />
          <F name="dyn_idle_start_increase" label="시작 증가" />
        </Panel>

        <Panel title="앵글 · 호라이즌">
          <F name="angle_p_gain" label="앵글 강도" />
          <F name="angle_feedforward" label="앵글 피드포워드" />
          <F name="angle_feedforward_smoothing_ms" label="앵글 FF 스무딩" unit="ms" />
          <F name="angle_limit" label="앵글 최대 기울기" unit="°" />
          <F name="angle_earth_ref" label="지구 기준 요" unit="%" />
          <F name="angle_level_strength" label="앵글 강도" />
          <F name="horizon_level_strength" label="호라이즌 강도" />
          <F name="horizon_limit_sticks" label="호라이즌 스틱 한계" unit="%" />
          <F name="horizon_limit_degrees" label="호라이즌 각도 한계" unit="°" />
          <F name="horizon_transition" label="호라이즌 전환" />
          <F name="horizon_delay_ms" label="호라이즌 지연" unit="ms" />
          <F name="horizon_ignore_sticks" label="스틱 무시" />
          <F name="level_race_mode" label="레이스 모드" />
          <F name="ez_landing_threshold" label="EZ 착륙 임계" />
          <F name="ez_landing_limit" label="EZ 착륙 한계" />
          <F name="ez_landing_speed" label="EZ 착륙 속도" />
        </Panel>

        <Panel title="기타 PID 설정">
          <F name="pidsum_limit" label="PID 합 제한" />
          <F name="pidsum_limit_yaw" label="PID 합 제한 (요)" />
          <F name="use_integrated_yaw" label="통합 요" />
          <F name="integrated_yaw_relax" label="통합 요 릴랙스" />
          <F name="acc_limit" label="가속 제한 (롤·피치)" />
          <F name="acc_limit_yaw" label="가속 제한 (요)" />
          <F name="pid_at_min_throttle" label="최저 스로틀에서 PID" />
          <F name="crash_recovery" label="크래시 복구" />
          <F name="acro_trainer_angle_limit" label="아크로 트레이너 각도" unit="°" />
        </Panel>
      </Columns>
      <div className="cols-gap" />
      <RestOfProfile kind="pid" n={n} shown={PID_PROFILE_SHOWN} />
    </>
  )
}

// ── 레이트 ──────────────────────────────────────────

const AXIS_COLORS: Record<string, string> = { roll: '#ff6b5b', pitch: '#59c46a', yaw: '#5aa9ff' }

/** rates_type별 표 열 이름과 표시 형식 */
function rateColumns(type: string): { key: 'rc_rate' | 'srate' | 'expo'; label: string; fmt(v: number): string }[] {
  const f2 = (v: number) => (v / 100).toFixed(2)
  switch (type) {
    case 'ACTUAL':
      return [
        { key: 'rc_rate', label: '중앙 감도', fmt: (v) => `${v * 10}` },
        { key: 'srate', label: '최대 레이트', fmt: (v) => `${v * 10}` },
        { key: 'expo', label: '엑스포', fmt: f2 }
      ]
    case 'KISS':
      return [
        { key: 'rc_rate', label: 'RC 레이트', fmt: f2 },
        { key: 'srate', label: '레이트', fmt: f2 },
        { key: 'expo', label: 'RC 커브', fmt: f2 }
      ]
    case 'QUICK':
      return [
        { key: 'rc_rate', label: 'RC 레이트', fmt: (v) => `${v * 2}` },
        { key: 'srate', label: '최대 레이트', fmt: (v) => `${v * 10}` },
        { key: 'expo', label: '엑스포', fmt: f2 }
      ]
    default:
      return [
        { key: 'rc_rate', label: 'RC 레이트', fmt: f2 },
        { key: 'srate', label: '슈퍼 레이트', fmt: f2 },
        { key: 'expo', label: 'RC 엑스포', fmt: f2 }
      ]
  }
}

function RateGraph({ type, profile }: { type: string; profile: Record<string, string> }) {
  const W = 420
  const H = 260
  const PAD = { l: 44, r: 12, t: 12, b: 26 }
  const maxima = AXES.map(([a]) => maxRate(type, axisRates(profile, a)) ?? 0)
  const top = Math.max(200, Math.ceil(Math.max(...maxima) / 200) * 200)
  const sx = (x: number) => PAD.l + x * (W - PAD.l - PAD.r)
  const sy = (y: number) => H - PAD.b - (y / top) * (H - PAD.t - PAD.b)
  const gridY = Array.from({ length: top / 200 + 1 }, (_, i) => i * 200)

  return (
    <>
      <svg className="rate-graph" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="레이트 곡선">
        {gridY.map((y) => (
          <g key={y}>
            <line x1={sx(0)} x2={sx(1)} y1={sy(y)} y2={sy(y)} stroke="#3a3a3a" />
            <text x={PAD.l - 6} y={sy(y) + 4} fill="#8a8a8a" fontSize="10" textAnchor="end">
              {y}
            </text>
          </g>
        ))}
        {[0, 0.25, 0.5, 0.75, 1].map((x) => (
          <text key={x} x={sx(x)} y={H - 8} fill="#8a8a8a" fontSize="10" textAnchor="middle">
            {Math.round(x * 100)}%
          </text>
        ))}
        {AXES.map(([a]) => {
          const r = axisRates(profile, a)
          const pts = Array.from({ length: 101 }, (_, i) => {
            const x = i / 100
            return `${sx(x).toFixed(1)},${sy(rateAt(type, r, x) ?? 0).toFixed(1)}`
          })
          return <polyline key={a} points={pts.join(' ')} fill="none" stroke={AXIS_COLORS[a]} strokeWidth="2" />
        })}
      </svg>
      <div className="legend">
        {AXES.map(([a, label], i) => (
          <span key={a}>
            <i style={{ background: AXIS_COLORS[a] }} />
            {label} {Math.round(maxima[i])}°/s
          </span>
        ))}
        <span className="muted">가로: 스틱 위치 · 세로: deg/s</span>
      </div>
    </>
  )
}

function Rates({ n }: { n: number }) {
  const { snap, changed } = useSnap()
  const profile = snap.rateProfiles[n] ?? {}
  const type = profile.rates_type ?? 'BETAFLIGHT'
  const cols = rateColumns(type)
  const R = (props: Omit<Parameters<typeof ProfileField>[0], 'kind' | 'n'>) => <ProfileField kind="rate" n={n} {...props} />

  return (
    <>
      <Columns>
        <Panel title="레이트" right={`레이트 프로필 ${n + 1}`}>
          <R name="rates_type" label="레이트 방식" />
          <table className="grid-table">
            <thead>
              <tr>
                <th className="left">축</th>
                {cols.map((c) => (
                  <th key={c.key}>{c.label}</th>
                ))}
                <th>최대 속도</th>
                <th>제한</th>
              </tr>
            </thead>
            <tbody>
              {AXES.map(([axis, label]) => {
                const r = axisRates(profile, axis)
                const max = maxRate(type, r)
                return (
                  <tr key={axis}>
                    <th scope="row">{label}</th>
                    {cols.map((c) => {
                      const k = `${axis}_${c.key}`
                      const v = profile[k]
                      return (
                        <td key={c.key}>
                          <span className={'value-box' + (changed.has(`rate.${n}.${k}`) ? ' cell-changed' : '')}>
                            {v === undefined ? '—' : c.fmt(Number(v))}
                          </span>
                        </td>
                      )
                    })}
                    <td>{max === null ? '—' : `${Math.round(max)}°/s`}</td>
                    <td className={changed.has(`rate.${n}.${axis}_rate_limit`) ? 'yes' : ''}>
                      {profile[`${axis}_rate_limit`] ?? '—'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {!supportsRateType(type) && <p className="muted small">{type} 방식은 최대 속도·그래프를 계산하지 않습니다.</p>}
        </Panel>

        <Panel title="레이트 곡선">
          {supportsRateType(type) ? <RateGraph type={type} profile={profile} /> : <p className="muted">지원하지 않는 레이트 방식</p>}
        </Panel>

        <Panel title="스로틀">
          <R name="rateprofile_name" label="레이트 프로필 이름" />
          <R name="thr_mid" label="스로틀 중간" format={x100} />
          <R name="thr_expo" label="스로틀 엑스포" format={x100} />
          <R name="throttle_limit_type" label="스로틀 제한 방식" />
          <R name="throttle_limit_percent" label="스로틀 제한" unit="%" />
          <R name="quickrates_rc_expo" label="Quick 레이트 RC 엑스포" />
        </Panel>
      </Columns>
      <div className="cols-gap" />
      <RestOfProfile kind="rate" n={n} shown={RATE_PROFILE_SHOWN} />
    </>
  )
}

// ── 필터 ──────────────────────────────────────────

function lpfState(dynMin?: string, staticHz?: string): string {
  if (num(dynMin) > 0) return '동적'
  if (num(staticHz) > 0) return '정적'
  return '꺼짐'
}

function Filters({ n }: { n: number }) {
  const { m } = useSnap()
  const p = useSnap().snap.pidProfiles[n] ?? {}
  const F = (props: Omit<Parameters<typeof ProfileField>[0], 'kind' | 'n'>) => <ProfileField kind="pid" n={n} {...props} />
  const rpmOn = num(m('rpm_filter_harmonics')) > 0
  const bidir = m('dshot_bidir') === 'ON'

  return (
    <Columns>
      <Panel title="간편 필터 슬라이더">
        <MasterField name="simplified_gyro_filter" label="자이로 필터 슬라이더" />
        <MasterField name="simplified_gyro_filter_multiplier" label="자이로 필터 배율" format={x100} />
        <F name="simplified_dterm_filter" label="D-term 필터 슬라이더" />
        <F name="simplified_dterm_filter_multiplier" label="D-term 필터 배율" format={x100} />
      </Panel>

      <Panel title="자이로 로우패스" right={`LPF1 ${lpfState(m('gyro_lpf1_dyn_min_hz'), m('gyro_lpf1_static_hz'))} · LPF2 ${num(m('gyro_lpf2_static_hz')) > 0 ? '켜짐' : '꺼짐'}`}>
        <MasterField name="gyro_hardware_lpf" label="하드웨어 LPF" />
        <p className="subhead">로우패스 1</p>
        <MasterField name="gyro_lpf1_type" label="종류" />
        <MasterField name="gyro_lpf1_static_hz" label="정적 컷오프" unit="Hz" />
        <MasterField name="gyro_lpf1_dyn_min_hz" label="동적 최소" unit="Hz" hint="0 = 동적 꺼짐" />
        <MasterField name="gyro_lpf1_dyn_max_hz" label="동적 최대" unit="Hz" />
        <MasterField name="gyro_lpf1_dyn_expo" label="동적 커브 엑스포" />
        <p className="subhead">로우패스 2</p>
        <MasterField name="gyro_lpf2_type" label="종류" />
        <MasterField name="gyro_lpf2_static_hz" label="컷오프" unit="Hz" hint="0 = 꺼짐" />
      </Panel>

      <Panel title="자이로 노치">
        <MasterField name="gyro_notch1_hz" label="노치 1 중심" unit="Hz" hint="0 = 꺼짐" />
        <MasterField name="gyro_notch1_cutoff" label="노치 1 컷오프" unit="Hz" />
        <MasterField name="gyro_notch2_hz" label="노치 2 중심" unit="Hz" hint="0 = 꺼짐" />
        <MasterField name="gyro_notch2_cutoff" label="노치 2 컷오프" unit="Hz" />
      </Panel>

      <Panel title="동적 노치" right={num(m('dyn_notch_count')) > 0 ? '켜짐' : '꺼짐'}>
        <MasterField name="dyn_notch_count" label="노치 개수" hint="0 = 꺼짐" />
        <MasterField name="dyn_notch_q" label="Q" />
        <MasterField name="dyn_notch_min_hz" label="최소 주파수" unit="Hz" />
        <MasterField name="dyn_notch_max_hz" label="최대 주파수" unit="Hz" />
      </Panel>

      <Panel title="RPM 필터" right={rpmOn ? (bidir ? '켜짐' : '양방향 DShot 꺼짐 — 동작 안 함') : '꺼짐'}>
        <MasterField name="rpm_filter_harmonics" label="고조파 수" hint="0 = 꺼짐" />
        <MasterField name="rpm_filter_weights" label="고조파 가중치" unit="%" />
        <MasterField name="rpm_filter_q" label="Q" />
        <MasterField name="rpm_filter_min_hz" label="최소 주파수" unit="Hz" />
        <MasterField name="rpm_filter_fade_range_hz" label="페이드 범위" unit="Hz" />
        <MasterField name="rpm_filter_lpf_hz" label="RPM 로우패스" unit="Hz" />
        <MasterField name="dshot_bidir" label="양방향 DShot" />
      </Panel>

      <Panel title="D-term 로우패스" right={`LPF1 ${lpfState(p.dyn_lpf_dterm_min_hz, p.dterm_lpf1_static_hz)} · LPF2 ${num(p.dterm_lpf2_static_hz) > 0 ? '켜짐' : '꺼짐'}`}>
        <p className="subhead">로우패스 1</p>
        <F name="dterm_lpf1_type" label="종류" />
        <F name="dterm_lpf1_static_hz" label="정적 컷오프" unit="Hz" />
        <F name="dyn_lpf_dterm_min_hz" label="동적 최소" unit="Hz" hint="0 = 동적 꺼짐" />
        <F name="dyn_lpf_dterm_max_hz" label="동적 최대" unit="Hz" />
        <F name="dyn_lpf_dterm_curve_expo" label="동적 커브 엑스포" />
        <p className="subhead">로우패스 2</p>
        <F name="dterm_lpf2_type" label="종류" />
        <F name="dterm_lpf2_static_hz" label="컷오프" unit="Hz" hint="0 = 꺼짐" />
      </Panel>

      <Panel title="D-term 노치 · 요 로우패스">
        <F name="dterm_notch_hz" label="D-term 노치 중심" unit="Hz" hint="0 = 꺼짐" />
        <F name="dterm_notch_cutoff" label="D-term 노치 컷오프" unit="Hz" />
        <F name="yaw_lowpass_hz" label="요 로우패스" unit="Hz" />
      </Panel>
    </Columns>
  )
}
