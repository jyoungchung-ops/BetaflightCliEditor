// 탭별로 보여 주는 master 키 (SPEC 4·5절). 여기 없는 set 키는 "기타" 탭에 나온다.
// 펌웨어마다 키 이름이 바뀌므로 정확한 이름과 접두어(prefix)를 함께 쓴다.
// tests/tabKeys.test.ts가 탭 화면 소스의 키가 이 표에 있는지 검사한다.

import type { TabId } from '../tabs'

export interface KeyRule {
  keys: string[]
  prefixes?: string[]
}

export const TAB_MASTER_KEYS: Partial<Record<TabId, KeyRule>> = {
  setup: { keys: ['craft_name', 'pilot_name', 'acc_trim_roll', 'acc_trim_pitch', 'acc_calibration'] },
  ports: {
    keys: ['displayport_msp_serial', 'serialrx_halfduplex', 'serialmsp_halfduplex', 'tlm_halfduplex', 'tlm_inverted', 'vtx_halfduplex']
  },
  configuration: {
    keys: [
      'gyro_to_use', 'acc_hardware', 'baro_hardware', 'mag_hardware', 'pid_process_denom',
      'motor_pwm_protocol', 'motor_pwm_rate', 'use_unsynced_pwm', 'dshot_bidir', 'motor_poles', 'motor_idle',
      'dshot_idle_value', 'min_throttle', 'max_throttle', 'min_command', 'dshot_bitbang', 'dshot_edt',
      'yaw_motors_reversed', 'align_board_roll', 'align_board_pitch', 'align_board_yaw', 'gyro_1_sensor_align',
      'gyro_1_align_roll', 'gyro_1_align_pitch', 'gyro_1_align_yaw', 'gyro_2_sensor_align', 'small_angle',
      'auto_disarm_delay', 'enable_stick_arming', 'runaway_takeoff_prevention', 'craft_name', 'pilot_name',
      'fpv_mix_degrees', 'beeper_dshot_beacon_tone'
    ]
  },
  receiver: {
    keys: [
      'serialrx_provider', 'rx_spi_protocol', 'serialrx_inverted', 'serialrx_halfduplex', 'crsf_use_negotiated_baud',
      'sbus_baud_fast', 'max_aux_channels', 'rssi_channel', 'rssi_src_frame_errors', 'rssi_scale', 'rssi_offset',
      'rssi_invert', 'rc_smoothing', 'rc_smoothing_auto_factor', 'rc_smoothing_auto_factor_throttle',
      'rc_smoothing_setpoint_cutoff', 'rc_smoothing_feedforward_cutoff', 'rc_smoothing_throttle_cutoff', 'deadband',
      'yaw_deadband', 'min_check', 'max_check', 'rx_min_usec', 'rx_max_usec', 'airmode_start_throttle_percent'
    ]
  },
  pid: {
    keys: [
      'simplified_gyro_filter', 'simplified_gyro_filter_multiplier', 'gyro_hardware_lpf', 'gyro_lpf1_type',
      'gyro_lpf1_static_hz', 'gyro_lpf1_dyn_min_hz', 'gyro_lpf1_dyn_max_hz', 'gyro_lpf1_dyn_expo', 'gyro_lpf2_type',
      'gyro_lpf2_static_hz', 'gyro_notch1_hz', 'gyro_notch1_cutoff', 'gyro_notch2_hz', 'gyro_notch2_cutoff',
      'dyn_notch_count', 'dyn_notch_q', 'dyn_notch_min_hz', 'dyn_notch_max_hz', 'rpm_filter_harmonics',
      'rpm_filter_weights', 'rpm_filter_q', 'rpm_filter_min_hz', 'rpm_filter_fade_range_hz', 'rpm_filter_lpf_hz',
      'dshot_bidir'
    ]
  },
  // 아래 탭은 아직 화면이 없다 — SPEC 5절 기준으로 미리 잡아 둔다
  power: {
    keys: ['vbat_scale', 'vbat_divider', 'vbat_multiplier', 'ibata_scale', 'ibata_offset', 'battery_meter', 'current_meter', 'bat_capacity', 'force_battery_cell_count', 'use_vbat_alerts', 'use_cbat_alerts', 'cbat_alert_percent'],
    prefixes: ['vbat_', 'ibat']
  },
  failsafe: { keys: ['rx_min_usec', 'rx_max_usec'], prefixes: ['failsafe_'] },
  motors: { keys: ['motor_pwm_protocol', 'motor_idle', 'dshot_idle_value', 'yaw_motors_reversed', 'motor_output_reordering', 'crashflip_motor_percent', 'crashflip_expo'], prefixes: ['3d_'] },
  servos: { keys: ['servo_center_pulse', 'servo_pwm_rate', 'servo_lowpass_hz', 'tri_unarmed_servo', 'channel_forwarding_start'] },
  osd: { keys: ['vcd_video_system', 'vcd_h_offset', 'vcd_v_offset', 'max7456_clock'], prefixes: ['osd_', 'displayport_msp_'] },
  vtx: { keys: [], prefixes: ['vtx_'] },
  led: { keys: [], prefixes: ['ledstrip_'] },
  blackbox: { keys: ['debug_mode', 'sdcard_mode', 'sdcard_detect_inverted'], prefixes: ['blackbox_'] },
  gps: { keys: [], prefixes: ['gps_'] }
}

/**
 * 이 탭이 맡는 master 키 (정확한 이름 + 접두어). 접두어로 잡힌 키 중 다른 탭이 이름으로 가져간 것은 뺀다.
 * 접두어 탭은 화면에 따로 배치하지 않은 키를 "그 밖의 값"으로 보여 줄 때 쓴다.
 */
export function masterKeysForTab(tab: TabId, master: Record<string, string>): string[] {
  const rule = TAB_MASTER_KEYS[tab]
  if (!rule) return []
  const claimedElsewhere = new Set(
    Object.entries(TAB_MASTER_KEYS)
      .filter(([t]) => t !== tab)
      .flatMap(([, r]) => r?.keys ?? [])
  )
  return Object.keys(master).filter(
    (k) => rule.keys.includes(k) || ((rule.prefixes ?? []).some((p) => k.startsWith(p)) && !claimedElsewhere.has(k))
  )
}

/** master 키가 어느 탭에든 매핑되어 있는가 */
export function isMappedMasterKey(key: string): boolean {
  return Object.values(TAB_MASTER_KEYS).some(
    (r) => r && (r.keys.includes(key) || (r.prefixes ?? []).some((p) => key.startsWith(p)))
  )
}

/** PID 탭에서 자리를 잡아 보여 주는 PID 프로필 키. 나머지는 PID 탭 "그 밖의 프로필 값"에 나온다 */
export const PID_PROFILE_SHOWN = new Set([
  'profile_name', 'p_roll', 'i_roll', 'd_roll', 'd_max_roll', 'f_roll', 'p_pitch', 'i_pitch', 'd_pitch',
  'd_max_pitch', 'f_pitch', 'p_yaw', 'i_yaw', 'd_yaw', 'd_max_yaw', 'f_yaw',
  'simplified_pids_mode', 'simplified_master_multiplier', 'simplified_pi_gain', 'simplified_i_gain',
  'simplified_d_gain', 'simplified_dmax_gain', 'simplified_feedforward_gain', 'simplified_pitch_d_gain',
  'simplified_pitch_pi_gain', 'feedforward_transition', 'feedforward_averaging', 'feedforward_smooth_factor',
  'feedforward_jitter_factor', 'feedforward_boost', 'feedforward_max_rate_limit', 'iterm_relax',
  'iterm_relax_type', 'iterm_relax_cutoff', 'iterm_rotation', 'iterm_windup', 'anti_gravity_gain',
  'anti_gravity_cutoff_hz', 'anti_gravity_p_gain', 'd_max_gain', 'd_max_advance', 'tpa_mode', 'tpa_rate',
  'tpa_breakpoint', 'tpa_low_rate', 'tpa_low_breakpoint', 'tpa_low_always', 'throttle_boost',
  'throttle_boost_cutoff', 'motor_output_limit', 'thrust_linear', 'vbat_sag_compensation',
  'auto_profile_cell_count', 'dyn_idle_min_rpm', 'dyn_idle_p_gain', 'dyn_idle_i_gain', 'dyn_idle_d_gain',
  'dyn_idle_max_increase', 'dyn_idle_start_increase', 'angle_p_gain', 'angle_feedforward',
  'angle_feedforward_smoothing_ms', 'angle_limit', 'angle_earth_ref', 'angle_level_strength',
  'horizon_level_strength', 'horizon_limit_sticks', 'horizon_limit_degrees', 'horizon_transition',
  'horizon_delay_ms', 'horizon_ignore_sticks', 'level_race_mode', 'ez_landing_threshold', 'ez_landing_limit',
  'ez_landing_speed', 'pidsum_limit', 'pidsum_limit_yaw', 'use_integrated_yaw', 'integrated_yaw_relax',
  'acc_limit', 'acc_limit_yaw', 'pid_at_min_throttle', 'crash_recovery', 'acro_trainer_angle_limit',
  // 필터 하위 탭
  'simplified_dterm_filter', 'simplified_dterm_filter_multiplier', 'dterm_lpf1_type', 'dterm_lpf1_static_hz',
  'dyn_lpf_dterm_min_hz', 'dyn_lpf_dterm_max_hz', 'dyn_lpf_dterm_curve_expo', 'dterm_lpf2_type',
  'dterm_lpf2_static_hz', 'dterm_notch_hz', 'dterm_notch_cutoff', 'yaw_lowpass_hz'
])

export const RATE_PROFILE_SHOWN = new Set([
  'rateprofile_name', 'rates_type', 'thr_mid', 'thr_expo', 'throttle_limit_type', 'throttle_limit_percent',
  'quickrates_rc_expo',
  ...['roll', 'pitch', 'yaw'].flatMap((a) => [`${a}_rc_rate`, `${a}_srate`, `${a}_expo`, `${a}_rate_limit`])
])
