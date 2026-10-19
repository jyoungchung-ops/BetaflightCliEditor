import { useState, type ReactNode } from 'react'
import { actualRateAt, axisRates, maxRate, rateAt, supportsRateType, toActual, withRateDefaults } from '@shared/mapping/rates'
import { PID_PROFILE_SHOWN, RATE_PROFILE_SHOWN } from '@shared/mapping/tabKeys'
import { Columns, Field, KeyHint, MasterField, Panel, TabFrame, num } from '../ui/widgets'
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
      hint={hint === null ? undefined : <KeyHint name={name} hint={hint} />}
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

/**
 * D 항의 키와 의미는 2025.12에서 바뀌었다 (펌웨어 flight/pid.h, cli/settings.c):
 *   4.5:      d_<축> = 최대 D (pid[].D, 기본 40), d_min_<축> = 기본 D (기본 30)
 *   2025.12+: d_<축> = 기본 D (pid[].D, 기본 30), d_max_<축> = 최대 D (기본 40)
 * 열은 덤프에 있는 키로 고르고, D 열 이름은 어느 쪽인지에 맞춘다.
 */
type DScheme = 'dmin' | 'dmax' | 'plain'

function dScheme(p: Record<string, string>): DScheme {
  if (AXES.some(([a]) => p[`d_min_${a}`] !== undefined)) return 'dmin'
  if (AXES.some(([a]) => p[`d_max_${a}`] !== undefined)) return 'dmax'
  return 'plain'
}

const PID_COLUMNS: { id: string; label: (s: DScheme) => string; key: (axis: string) => string }[] = [
  { id: 'p', label: () => 'P', key: (a) => `p_${a}` },
  { id: 'i', label: () => 'I', key: (a) => `i_${a}` },
  { id: 'd', label: (s) => (s === 'dmin' ? 'D (최대)' : s === 'dmax' ? 'D (기본)' : 'D'), key: (a) => `d_${a}` },
  { id: 'dmin', label: () => 'D Min (기본)', key: (a) => `d_min_${a}` },
  { id: 'dmax', label: () => 'D Max (최대)', key: (a) => `d_max_${a}` },
  { id: 'f', label: () => '피드포워드', key: (a) => `f_${a}` },
  { id: 's', label: () => 'S', key: (a) => `s_${a}` }
]

const D_NOTE: Record<DScheme, string | null> = {
  dmin: '4.5 방식: D = 큰 움직임에서 쓰는 최대값, D Min = 평소 값',
  dmax: '2025.12+ 방식: D = 평소 값, D Max = 큰 움직임에서 쓰는 최대값 (4.5의 D·D Min과 자리가 바뀜)',
  plain: null
}

function PidTable({ n }: { n: number }) {
  const { snap, changed } = useSnap()
  const p = snap.pidProfiles[n] ?? {}
  const scheme = dScheme(p)
  const cols = PID_COLUMNS.filter((c) => AXES.some(([a]) => p[c.key(a)] !== undefined))
  return (
    <>
    <table className="grid-table">
      <thead>
        <tr>
          <th className="left">축</th>
          {cols.map((c) => (
            <th key={c.id}>{c.label(scheme)}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {AXES.map(([axis, label]) => (
          <tr key={axis}>
            <th scope="row">{label}</th>
            {cols.map((c) => {
              const k = c.key(axis)
              const v = p[k]
              const isChanged = changed.has(`pid.${n}.${k}`)
              return (
                <td key={c.id}>
                  <span className={'value-box' + (isChanged ? ' cell-changed' : '')} title={k}>
                    {v ?? '—'}
                  </span>
                </td>
              )
            })}
          </tr>
        ))}
      </tbody>
    </table>
    {D_NOTE[scheme] && <p className="muted small">{D_NOTE[scheme]}</p>}
    </>
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
          <F name="simplified_d_max_gain" label="D Max 게인" format={x100} />
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
          <F name="feedforward_yaw_hold_gain" label="요 홀드 게인" />
          <F name="feedforward_yaw_hold_time" label="요 홀드 시간" unit="ms" />
        </Panel>

        <Panel title="I-term · 안티 그래비티">
          <F name="iterm_relax" label="I-term 릴랙스" />
          <F name="iterm_relax_type" label="릴랙스 방식" />
          <F name="iterm_relax_cutoff" label="릴랙스 컷오프" unit="Hz" />
          <F name="iterm_rotation" label="I-term 회전" />
          <F name="iterm_windup" label="I-term 와인드업" unit="%" />
          <F name="iterm_limit" label="I-term 제한" />
          <F name="anti_gravity_gain" label="안티 그래비티 게인" format={(v) => (num(v) / 10).toFixed(1)} />
          <F name="anti_gravity_cutoff_hz" label="안티 그래비티 컷오프" unit="Hz" />
          <F name="anti_gravity_p_gain" label="안티 그래비티 P 게인" />
        </Panel>

        <Panel title="D Min/Max · TPA · 스로틀">
          <F name="d_max_gain" label="D Max 게인" />
          <F name="d_max_advance" label="D Max 어드밴스" />
          <F name="tpa_mode" label="TPA 모드" />
          <F name="tpa_rate" label="TPA 비율" unit="%" />
          <F name="tpa_breakpoint" label="TPA 시작점" unit="µs" />
          <F name="tpa_low_rate" label="TPA 저스로틀 비율" unit="%" />
          <F name="tpa_low_breakpoint" label="TPA 저스로틀 시작점" unit="µs" />
          <F name="tpa_low_always" label="TPA 저스로틀 항상" />
          <F name="tpa_curve_type" label="TPA 커브 방식" />
          <F name="tpa_curve_stall_throttle" label="TPA 커브 실속 스로틀" />
          <F name="tpa_curve_pid_thr0" label="TPA 커브 PID (스로틀 0)" />
          <F name="tpa_curve_pid_thr100" label="TPA 커브 PID (스로틀 100)" />
          <F name="tpa_curve_expo" label="TPA 커브 엑스포" />
          <F name="tpa_speed_type" label="TPA 속도 방식" />
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
          <F name="horizon_level_strength" label="호라이즌 강도" />
          <F name="horizon_limit_sticks" label="호라이즌 스틱 한계" unit="%" />
          <F name="horizon_limit_degrees" label="호라이즌 각도 한계" unit="°" />
          <F name="horizon_delay_ms" label="호라이즌 지연" unit="ms" />
          <F name="horizon_ignore_sticks" label="스틱 무시" />
          <F name="level_race_mode" label="레이스 모드" />
          <F name="ez_landing_threshold" label="EZ 착륙 임계" />
          <F name="ez_landing_limit" label="EZ 착륙 한계" />
          <F name="ez_landing_speed" label="EZ 착륙 속도" />
          <F name="angle_pitch_offset" label="앵글 피치 오프셋" />
          <F name="landing_disarm_threshold" label="착륙 디스아밍 임계" />
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

function RateGraph({ type, profile, overlayActual }: { type: string; profile: Record<string, string>; overlayActual?: boolean }) {
  const W = 420
  const H = 260
  const PAD = { l: 44, r: 12, t: 12, b: 26 }
  const maxima = AXES.map(([a]) => maxRate(type, axisRates(profile, a)) ?? 0)
  const actuals = AXES.map(([a]) => (overlayActual ? toActual(type, axisRates(profile, a)) : null))
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
        {/* Actual 환산 곡선 (점선) — 원래 곡선과 얼마나 겹치는지 보여 준다 */}
        {AXES.map(([a], i) => {
          const act = actuals[i]
          if (!act || act.exact) return null
          const pts = Array.from({ length: 101 }, (_, j) => `${sx(j / 100).toFixed(1)},${sy(actualRateAt(act, j / 100)).toFixed(1)}`)
          return <polyline key={`act-${a}`} points={pts.join(' ')} fill="none" stroke={AXIS_COLORS[a]} strokeWidth="1.5" strokeDasharray="4 3" opacity="0.9" />
        })}
      </svg>
      <div className="legend">
        {AXES.map(([a, label], i) => (
          <span key={a}>
            <i style={{ background: AXIS_COLORS[a] }} />
            {label} {Math.round(maxima[i])}°/s
          </span>
        ))}
        <span className="muted">
          가로: 스틱 위치 · 세로: deg/s{actuals.some((a) => a && !a.exact) ? ' · 점선: Actual 환산' : ''}
        </span>
      </div>
    </>
  )
}

type RateView = 'actual' | 'native'

/** Actual 방식 값으로 보여 주는 표 (어떤 레이트 방식이든) */
function ActualTable({ type, profile, n, filled }: { type: string; profile: Record<string, string>; n: number; filled: Set<string> }) {
  const { changed } = useSnap()
  const rows = AXES.map(([axis, label]) => ({ axis, label, act: toActual(type, axisRates(profile, axis)) }))
  if (rows.some((r) => !r.act)) return <p className="muted">{type} 방식은 Actual로 환산하지 않습니다.</p>
  const exact = type === 'ACTUAL'
  const worst = Math.max(...rows.map((r) => r.act!.maxError))
  const cell = (axis: string, field: string, text: string) => {
    const k = `${axis}_${field}`
    return (
      <span
        className={'value-box' + (exact && changed.has(`rate.${n}.${k}`) ? ' cell-changed' : '') + (exact && filled.has(k) ? ' default-value' : '')}
        title={exact ? k : '환산값'}
      >
        {exact ? '' : '≈ '}
        {text}
      </span>
    )
  }
  return (
    <>
      <table className="grid-table">
        <thead>
          <tr>
            <th className="left">축</th>
            <th>중앙 감도</th>
            <th>최대 레이트</th>
            <th>엑스포</th>
            <th>제한</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ axis, label, act }) => (
            <tr key={axis}>
              <th scope="row">{label}</th>
              <td>{cell(axis, 'rc_rate', `${Math.round(act!.center)}°/s`)}</td>
              <td>{cell(axis, 'srate', `${Math.round(act!.max)}°/s`)}</td>
              <td>{cell(axis, 'expo', act!.expo.toFixed(2))}</td>
              <td className={changed.has(`rate.${n}.${axis}_rate_limit`) ? 'yes' : ''}>{profile[`${axis}_rate_limit`] ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {!exact && (
        <p className="muted small">
          {type} 값을 Actual 방식으로 환산했습니다. 중앙 감도·최대 레이트는 정확하고, 엑스포는 곡선이 가장 비슷한 값입니다
          (최대 차이 {Math.round(worst)}°/s). 같은 느낌을 Actual로 넣으려면:{' '}
          {rows.map(({ axis, label, act }) => `${label} ${act!.cli.rc_rate}/${act!.cli.srate}/${act!.cli.expo}`).join(' · ')}
          <span className="field-hint"> (rc_rate / srate / expo)</span>
        </p>
      )}
    </>
  )
}

function Rates({ n }: { n: number }) {
  const { snap, changed } = useSnap()
  const raw = snap.rateProfiles[n] ?? {}
  // diff만 있으면 기본값인 레이트는 적혀 있지 않다 → 펌웨어 기본값으로 채워 보여 준다
  const diffOnly = !snap.raw.dumpAll.trim()
  const { profile, filled } = diffOnly ? withRateDefaults(raw) : { profile: raw, filled: new Set<string>() }
  const type = profile.rates_type ?? 'ACTUAL'
  const cols = rateColumns(type)
  const [view, setView] = useState<RateView>('actual')
  const R = (props: Omit<Parameters<typeof ProfileField>[0], 'kind' | 'n'>) => <ProfileField kind="rate" n={n} {...props} />

  return (
    <>
      <Columns>
        <Panel
          title="레이트"
          right={
            type === 'ACTUAL' ? (
              `레이트 프로필 ${n + 1}`
            ) : (
              <span className="seg" role="group" aria-label="표시 방식">
                <button type="button" className={view === 'actual' ? 'on' : ''} aria-pressed={view === 'actual'} onClick={() => setView('actual')}>
                  Actual 환산
                </button>
                <button type="button" className={view === 'native' ? 'on' : ''} aria-pressed={view === 'native'} onClick={() => setView('native')}>
                  {type} 원래 값
                </button>
              </span>
            )
          }
        >
          {raw.rates_type !== undefined ? <R name="rates_type" label="레이트 방식" /> : <Field label="레이트 방식" value={type} hint="diff에 없음 = 펌웨어 기본값" />}
          {filled.size > 0 && (
            <p className="muted small">diff에 없는 레이트 값은 펌웨어 기본값(ACTUAL 7 / 67 / 0)으로 채워 흐리게 표시했습니다.</p>
          )}
          {view === 'actual' || type === 'ACTUAL' ? (
            <ActualTable type={type} profile={profile} n={n} filled={filled} />
          ) : (
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
          )}
          {!supportsRateType(type) && <p className="muted small">{type} 방식은 최대 속도·그래프를 계산하지 않습니다.</p>}
        </Panel>

        <Panel title="레이트 곡선">
          {supportsRateType(type) ? <RateGraph type={type} profile={profile} overlayActual={view === 'actual'} /> : <p className="muted">지원하지 않는 레이트 방식</p>}
        </Panel>

        <Panel title="스로틀">
          <R name="rateprofile_name" label="레이트 프로필 이름" />
          <R name="thr_mid" label="스로틀 중간" format={x100} />
          <R name="thr_expo" label="스로틀 엑스포" format={x100} />
          <R name="throttle_limit_type" label="스로틀 제한 방식" />
          <R name="throttle_limit_percent" label="스로틀 제한" unit="%" />
          <R name="quickrates_rc_expo" label="Quick 레이트 RC 엑스포" />
          <R name="thr_hover" label="호버 스로틀" format={x100} />
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

      <Panel title="D-term 로우패스" right={`LPF1 ${lpfState(p.dterm_lpf1_dyn_min_hz, p.dterm_lpf1_static_hz)} · LPF2 ${num(p.dterm_lpf2_static_hz) > 0 ? '켜짐' : '꺼짐'}`}>
        <p className="subhead">로우패스 1</p>
        <F name="dterm_lpf1_type" label="종류" />
        <F name="dterm_lpf1_static_hz" label="정적 컷오프" unit="Hz" />
        <F name="dterm_lpf1_dyn_min_hz" label="동적 최소" unit="Hz" hint="0 = 동적 꺼짐" />
        <F name="dterm_lpf1_dyn_max_hz" label="동적 최대" unit="Hz" />
        <F name="dterm_lpf1_dyn_expo" label="동적 커브 엑스포" />
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
