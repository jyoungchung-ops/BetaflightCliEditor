// Betaflight 4.5 형식의 "합성" 샘플 덤프를 만든다.
// 실제 기체에서 받은 덤프가 아니다 — 실제 파일이 생기면 fixtures/ 에 추가하고 이 샘플은 참고용으로만 둔다.
//
//   node scripts/make-sample-fixtures.mjs
//
// 각 기체마다 fixtures/sample/<id>.dump.txt, <id>.diff.txt, <id>.expected.json 을 쓴다.
// expected.json 의 changedKeys 는 기본값과 다른 항목의 키 목록으로, 파서 테스트의 정답이다.

import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'fixtures', 'sample')

// ── OSD 위치 인코딩 (4.4+: x 5비트 + HD 확장 비트 10, y 5비트, 프로필 표시 비트 11~13) ──
const osdPos = (x, y, visible) => (x & 31) | ((x & 32) << 5) | ((y & 31) << 5) | (visible ? 0x800 : 0)

// ── 기본값 ────────────────────────────────────────────────

const FEATURES = [
  ['RX_PPM', false], ['INFLIGHT_ACC_CAL', false], ['RX_SERIAL', true], ['MOTOR_STOP', false],
  ['SERVO_TILT', false], ['SOFTSERIAL', false], ['GPS', false], ['RANGEFINDER', false],
  ['TELEMETRY', true], ['3D', false], ['RX_PARALLEL_PWM', false], ['RX_MSP', false],
  ['RSSI_ADC', false], ['LED_STRIP', false], ['DISPLAY', false], ['OSD', true],
  ['CHANNEL_FORWARDING', false], ['TRANSPONDER', false], ['AIRMODE', true], ['RX_SPI', false],
  ['ESC_SENSOR', false], ['ANTI_GRAVITY', true]
]

const BEEPERS = [
  'GYRO_CALIBRATED', 'RX_LOST', 'RX_LOST_LANDING', 'DISARMING', 'ARMING', 'ARMING_GPS_FIX',
  'BAT_CRIT_LOW', 'BAT_LOW', 'GPS_STATUS', 'RX_SET', 'ACC_CALIBRATION', 'ACC_CALIBRATION_FAIL',
  'READY_BEEP', 'DISARM_REPEAT', 'ARMED', 'SYSTEM_INIT', 'ON_USB', 'BLACKBOX_ERASE', 'CRASH_FLIP',
  'CAM_CONNECTION_OPEN', 'CAM_CONNECTION_CLOSE', 'RC_SMOOTHING_INIT_FAIL'
]
const BEACONS = ['RX_LOST', 'RX_SET']

const MASTER = [
  ['gyro_hardware_lpf', 'NORMAL'], ['gyro_lpf1_type', 'PT1'], ['gyro_lpf1_static_hz', '250'],
  ['gyro_lpf2_type', 'PT1'], ['gyro_lpf2_static_hz', '500'], ['gyro_notch1_hz', '0'],
  ['gyro_notch1_cutoff', '0'], ['gyro_notch2_hz', '0'], ['gyro_notch2_cutoff', '0'],
  ['gyro_calib_duration', '125'], ['gyro_calib_noise_limit', '48'], ['gyro_offset_yaw', '0'],
  ['gyro_overflow_detect', 'ALL'], ['yaw_spin_recovery', 'AUTO'], ['yaw_spin_threshold', '1950'],
  ['gyro_to_use', 'FIRST'], ['dyn_notch_count', '3'], ['dyn_notch_q', '300'],
  ['dyn_notch_min_hz', '100'], ['dyn_notch_max_hz', '600'], ['gyro_lpf1_dyn_min_hz', '250'],
  ['gyro_lpf1_dyn_max_hz', '500'], ['gyro_lpf1_dyn_expo', '5'], ['gyro_filter_debug_axis', 'ROLL'],
  ['acc_hardware', 'AUTO'], ['acc_lpf_hz', '25'], ['acc_trim_pitch', '0'], ['acc_trim_roll', '0'],
  ['acc_calibration', '0,0,0,0'], ['mag_hardware', 'NONE'], ['baro_hardware', 'AUTO'],
  ['min_check', '1050'], ['max_check', '1900'], ['rssi_channel', '0'],
  ['rssi_src_frame_errors', 'OFF'], ['rssi_scale', '100'], ['rssi_offset', '0'], ['rssi_invert', 'OFF'],
  ['rssi_src_frame_lpf_period', '30'], ['rssi_smoothing', '125'], ['rc_smoothing', 'ON'],
  ['rc_smoothing_auto_factor', '30'], ['rc_smoothing_auto_factor_throttle', '30'],
  ['rc_smoothing_setpoint_cutoff', '0'], ['rc_smoothing_feedforward_cutoff', '0'],
  ['rc_smoothing_throttle_cutoff', '0'], ['rc_smoothing_debug_axis', 'ROLL'], ['fpv_mix_degrees', '0'],
  ['max_aux_channels', '14'], ['serialrx_provider', 'SBUS'], ['serialrx_inverted', 'OFF'],
  ['spektrum_sat_bind', '0'], ['spektrum_sat_bind_autoreset', 'ON'], ['srxl2_unit_id', '1'],
  ['srxl2_baud_fast', 'ON'], ['sbus_baud_fast', 'OFF'], ['crsf_use_negotiated_baud', 'OFF'],
  ['airmode_start_throttle_percent', '25'], ['rx_min_usec', '885'], ['rx_max_usec', '2115'],
  ['serialrx_halfduplex', 'OFF'], ['adc_device', '1'], ['input_filtering_mode', 'OFF'],
  ['blackbox_sample_rate', '1/4'], ['blackbox_device', 'SPIFLASH'], ['blackbox_disable_pids', 'OFF'],
  ['blackbox_disable_rc', 'OFF'], ['blackbox_disable_setpoint', 'OFF'], ['blackbox_disable_bat', 'OFF'],
  ['blackbox_disable_alt', 'OFF'], ['blackbox_disable_rssi', 'OFF'], ['blackbox_disable_gyro', 'OFF'],
  ['blackbox_disable_acc', 'OFF'], ['blackbox_disable_debug', 'OFF'], ['blackbox_disable_motors', 'OFF'],
  ['blackbox_disable_rpm', 'OFF'], ['blackbox_disable_gps', 'OFF'], ['blackbox_mode', 'NORMAL'],
  ['blackbox_high_resolution', 'OFF'], ['min_throttle', '1070'], ['max_throttle', '2000'],
  ['min_command', '1000'], ['dshot_idle_value', '550'], ['dshot_burst', 'AUTO'], ['dshot_bidir', 'OFF'],
  ['dshot_edt', 'OFF'], ['dshot_bitbang', 'AUTO'], ['dshot_bitbang_timer', 'AUTO'],
  ['use_unsynced_pwm', 'OFF'], ['motor_pwm_protocol', 'DSHOT600'], ['motor_pwm_rate', '480'],
  ['motor_pwm_inversion', 'OFF'], ['motor_poles', '14'], ['motor_output_reordering', '0,1,2,3,4,5,6,7'],
  ['thr_corr_value', '0'], ['thr_corr_angle', '800'], ['failsafe_delay', '15'],
  ['failsafe_off_delay', '10'], ['failsafe_throttle', '1000'], ['failsafe_switch_mode', 'STAGE1'],
  ['failsafe_throttle_low_delay', '100'], ['failsafe_procedure', 'DROP'],
  ['failsafe_recovery_delay', '5'], ['failsafe_stick_threshold', '30'], ['align_board_roll', '0'],
  ['align_board_pitch', '0'], ['align_board_yaw', '0'], ['gimbal_mode', 'NORMAL'], ['bat_capacity', '0'],
  ['vbat_max_cell_voltage', '430'], ['vbat_full_cell_voltage', '410'], ['vbat_min_cell_voltage', '330'],
  ['vbat_warning_cell_voltage', '350'], ['vbat_hysteresis', '1'], ['current_meter', 'ADC'],
  ['battery_meter', 'ADC'], ['vbat_detect_cell_voltage', '300'], ['use_vbat_alerts', 'ON'],
  ['use_cbat_alerts', 'OFF'], ['cbat_alert_percent', '10'], ['vbat_cutoff_percent', '100'],
  ['force_battery_cell_count', '0'], ['vbat_display_lpf_period', '30'], ['vbat_sag_lpf_period', '2'],
  ['ibat_lpf_period', '10'], ['vbat_duration_for_warning', '0'], ['vbat_duration_for_critical', '0'],
  ['vbat_scale', '110'], ['vbat_divider', '10'], ['vbat_multiplier', '1'], ['ibata_scale', '400'],
  ['ibata_offset', '0'], ['beeper_inversion', 'ON'], ['beeper_od', 'OFF'], ['beeper_frequency', '0'],
  ['beeper_dshot_beacon_tone', '1'], ['yaw_motors_reversed', 'OFF'], ['crashflip_motor_percent', '0'],
  ['crashflip_expo', '35'], ['3d_deadband_low', '1406'], ['3d_deadband_high', '1514'],
  ['3d_neutral', '1460'], ['servo_center_pulse', '1500'], ['servo_pwm_rate', '50'],
  ['servo_lowpass_hz', '0'], ['tri_unarmed_servo', 'ON'], ['channel_forwarding_start', '4'],
  ['reboot_character', '82'], ['serial_update_rate_hz', '100'], ['imu_dcm_kp', '2500'],
  ['imu_dcm_ki', '0'], ['small_angle', '25'], ['imu_process_denom', '2'], ['auto_disarm_delay', '5'],
  ['gyro_cal_on_first_arm', 'OFF'], ['gps_provider', 'UBLOX'], ['gps_sbas_mode', 'AUTO'],
  ['gps_sbas_integrity', 'OFF'], ['gps_auto_config', 'ON'], ['gps_auto_baud', 'OFF'],
  ['gps_ublox_use_galileo', 'OFF'], ['gps_ublox_flight_model', 'AIRBORNE_4G'], ['gps_set_home_point_once', 'OFF'],
  ['gps_use_3d_speed', 'OFF'], ['gps_rescue_min_start_dist', '15'], ['gps_rescue_alt_mode', 'MAX_ALT'],
  ['gps_rescue_initial_climb', '10'], ['gps_rescue_ascend_rate', '750'], ['gps_rescue_return_alt', '30'],
  ['gps_rescue_ground_speed', '750'], ['gps_rescue_descent_dist', '20'],
  ['gps_rescue_descend_rate', '150'], ['gps_rescue_landing_alt', '4'], ['gps_rescue_min_sats', '8'],
  ['gps_rescue_allow_arming_without_fix', 'OFF'], ['gps_rescue_sanity_checks', 'RESCUE_SANITY_FS_ONLY'],
  ['deadband', '0'], ['yaw_deadband', '0'], ['yaw_control_reversed', 'OFF'], ['pid_process_denom', '1'],
  ['runaway_takeoff_prevention', 'ON'], ['runaway_takeoff_deactivate_delay', '500'],
  ['runaway_takeoff_deactivate_throttle_percent', '20'], ['tlm_inverted', 'OFF'],
  ['tlm_halfduplex', 'ON'], ['pid_in_tlm', 'OFF'], ['report_cell_voltage', 'OFF'],
  ['ledstrip_visual_beeper', 'OFF'], ['ledstrip_grb_rgb', 'GRB'], ['ledstrip_profile', 'STATUS'],
  ['ledstrip_race_color', 'ORANGE'], ['ledstrip_beacon_color', 'WHITE'], ['ledstrip_brightness', '100'],
  ['sdcard_detect_inverted', 'OFF'], ['sdcard_mode', 'OFF'], ['osd_units', 'METRIC'],
  ['osd_warn_bitmask', '269500949'], ['osd_rssi_alarm', '20'],
  ['osd_link_quality_alarm', '80'], ['osd_cap_alarm', '2200'], ['osd_alt_alarm', '100'],
  ['osd_distance_alarm', '0'], ['osd_esc_temp_alarm', '-128'], ['osd_core_temp_alarm', '70'],
  ['osd_ah_max_pit', '20'], ['osd_ah_max_rol', '40'], ['osd_ah_invert', 'OFF'],
  ['osd_logo_on_arming', 'OFF'], ['osd_tim1', '2560'], ['osd_tim2', '2561'],
  ['osd_vbat_pos', String(osdPos(12, 12, false))], ['osd_rssi_pos', String(osdPos(8, 1, false))],
  ['osd_link_quality_pos', String(osdPos(1, 1, false))], ['osd_tim_1_pos', String(osdPos(23, 1, false))],
  ['osd_tim_2_pos', String(osdPos(23, 2, false))], ['osd_flymode_pos', String(osdPos(13, 11, false))],
  ['osd_throttle_pos', String(osdPos(1, 10, false))], ['osd_vtx_channel_pos', String(osdPos(25, 11, false))],
  ['osd_crosshairs_pos', String(osdPos(13, 6, false))], ['osd_ah_sbar_pos', String(osdPos(14, 6, false))],
  ['osd_ah_pos', String(osdPos(14, 2, false))], ['osd_current_pos', String(osdPos(1, 12, false))],
  ['osd_mah_drawn_pos', String(osdPos(1, 11, false))], ['osd_craft_name_pos', String(osdPos(9, 11, false))],
  ['osd_altitude_pos', String(osdPos(23, 7, false))], ['osd_warnings_pos', String(osdPos(9, 10, false))],
  ['osd_avg_cell_voltage_pos', String(osdPos(12, 2, false))], ['osd_disarmed_pos', String(osdPos(10, 4, false))],
  ['osd_rtc_date_time_pos', String(osdPos(1, 0, false))],
  ['osd_displayport_device', 'AUTO'], ['osd_rcchannels', '-1,-1,-1,-1'], ['osd_camera_frame_width', '24'],
  ['osd_camera_frame_height', '11'], ['osd_stat_bitmask', '14124'], ['osd_profile', '1'],
  ['osd_profile_1_name', '-'], ['osd_profile_2_name', '-'], ['osd_profile_3_name', '-'],
  ['displayport_msp_col_adjust', '0'], ['displayport_msp_row_adjust', '0'],
  ['displayport_msp_use_device_blink', 'OFF'], ['vcd_video_system', 'AUTO'], ['vcd_h_offset', '0'],
  ['vcd_v_offset', '0'], ['max7456_clock', 'DEFAULT'], ['vtx_band', '0'], ['vtx_channel', '0'],
  ['vtx_power', '0'], ['vtx_low_power_disarm', 'OFF'], ['vtx_softserial_alt', 'OFF'], ['vtx_freq', '0'],
  ['vtx_pit_mode_freq', '0'], ['vtx_halfduplex', 'ON'], ['craft_name', ''], ['pilot_name', ''],
  ['rpm_filter_harmonics', '3'], ['rpm_filter_weights', '100,100,100'], ['rpm_filter_q', '500'],
  ['rpm_filter_min_hz', '100'], ['rpm_filter_fade_range_hz', '50'], ['rpm_filter_lpf_hz', '150'],
  ['simplified_gyro_filter', 'ON'], ['simplified_gyro_filter_multiplier', '100'],
  ['debug_mode', 'NONE'], ['rate_6pos_switch', 'OFF'], ['cpu_overclock', 'OFF'],
  ['pwr_on_arm_grace', '5'], ['enable_stick_arming', 'OFF'], ['scheduler_relax_rx', '25'],
  ['scheduler_relax_osd', '25'], ['serialmsp_halfduplex', 'OFF'], ['timezone_offset_minutes', '0'],
  ['gyro_1_bustype', 'SPI'], ['gyro_1_spibus', '1'], ['gyro_1_sensor_align', 'CW0'],
  ['gyro_1_align_roll', '0'], ['gyro_1_align_pitch', '0'], ['gyro_1_align_yaw', '0'],
  ['flash_spi_bus', '3'], ['box_user_1_name', '-'], ['box_user_2_name', '-']
]

const PID_PROFILE = [
  ['profile_name', '-'], ['dterm_lpf1_dyn_min_hz', '75'], ['dterm_lpf1_dyn_max_hz', '150'],
  ['dterm_lpf1_dyn_expo', '5'], ['dterm_lpf1_type', 'PT1'], ['dterm_lpf1_static_hz', '75'],
  ['dterm_lpf2_type', 'PT1'], ['dterm_lpf2_static_hz', '150'], ['dterm_notch_hz', '0'],
  ['dterm_notch_cutoff', '0'], ['vbat_sag_compensation', '0'], ['pid_at_min_throttle', 'ON'],
  ['anti_gravity_gain', '80'], ['anti_gravity_cutoff_hz', '5'], ['anti_gravity_p_gain', '100'],
  ['acc_limit_yaw', '0'], ['acc_limit', '0'], ['crash_dthreshold', '50'], ['crash_gthreshold', '400'],
  ['crash_setpoint_threshold', '350'], ['crash_time', '500'], ['crash_delay', '0'],
  ['crash_recovery_angle', '10'], ['crash_recovery_rate', '100'], ['crash_limit_yaw', '200'],
  ['crash_recovery', 'OFF'], ['iterm_rotation', 'OFF'], ['iterm_relax', 'RP'],
  ['iterm_relax_type', 'SETPOINT'], ['iterm_relax_cutoff', '15'], ['iterm_windup', '85'],
  ['pidsum_limit', '500'], ['pidsum_limit_yaw', '400'], ['yaw_lowpass_hz', '100'],
  ['throttle_boost', '5'], ['throttle_boost_cutoff', '15'], ['p_pitch', '47'], ['i_pitch', '84'],
  ['d_pitch', '46'], ['f_pitch', '125'], ['p_roll', '45'], ['i_roll', '80'], ['d_roll', '40'],
  ['f_roll', '120'], ['p_yaw', '45'], ['i_yaw', '80'], ['d_yaw', '0'], ['f_yaw', '120'],
  ['angle_p_gain', '50'], ['angle_feedforward', '50'], ['angle_feedforward_smoothing_ms', '80'],
  ['angle_limit', '60'], ['angle_earth_ref', '100'], ['horizon_level_strength', '75'],
  ['horizon_limit_sticks', '75'], ['horizon_limit_degrees', '135'], ['horizon_ignore_sticks', 'OFF'],
  ['horizon_delay_ms', '500'], ['level_race_mode', 'OFF'], ['use_integrated_yaw', 'OFF'],
  ['integrated_yaw_relax', '200'], ['d_min_roll', '30'], ['d_min_pitch', '34'], ['d_min_yaw', '0'],
  ['d_max_gain', '37'], ['d_max_advance', '20'], ['motor_output_limit', '100'],
  ['auto_profile_cell_count', '0'], ['thrust_linear', '0'], ['feedforward_transition', '0'],
  ['feedforward_averaging', 'OFF'], ['feedforward_smooth_factor', '25'],
  ['feedforward_jitter_factor', '7'], ['feedforward_boost', '15'],
  ['feedforward_max_rate_limit', '90'], ['dyn_idle_min_rpm', '0'], ['dyn_idle_p_gain', '50'],
  ['dyn_idle_i_gain', '50'], ['dyn_idle_d_gain', '50'], ['dyn_idle_max_increase', '150'],
  ['dyn_idle_start_increase', '50'], ['simplified_pids_mode', 'RPY'],
  ['simplified_master_multiplier', '100'], ['simplified_i_gain', '100'], ['simplified_d_gain', '100'],
  ['simplified_pi_gain', '100'], ['simplified_dmax_gain', '100'], ['simplified_feedforward_gain', '100'],
  ['simplified_pitch_d_gain', '100'], ['simplified_pitch_pi_gain', '100'],
  ['simplified_dterm_filter', 'ON'], ['simplified_dterm_filter_multiplier', '100'], ['tpa_mode', 'D'],
  ['tpa_rate', '65'], ['tpa_breakpoint', '1350'], ['tpa_low_rate', '20'], ['tpa_low_breakpoint', '1050'],
  ['tpa_low_always', 'OFF'], ['ez_landing_threshold', '25'], ['ez_landing_limit', '15'],
  ['ez_landing_speed', '50']
]

const RATE_PROFILE = [
  ['rateprofile_name', '-'], ['thr_mid', '50'], ['thr_expo', '0'], ['rates_type', 'ACTUAL'],
  ['quickrates_rc_expo', 'OFF'], ['roll_rc_rate', '7'], ['pitch_rc_rate', '7'], ['yaw_rc_rate', '7'],
  ['roll_expo', '0'], ['pitch_expo', '0'], ['yaw_expo', '0'], ['roll_srate', '67'],
  ['pitch_srate', '67'], ['yaw_srate', '67'], ['throttle_limit_type', 'OFF'],
  ['throttle_limit_percent', '100'], ['roll_rate_limit', '1998'], ['pitch_rate_limit', '1998'],
  ['yaw_rate_limit', '1998']
]

// ── 2025.12 에서 바뀐 키 (betaflight 4.5.5 → 2025.12.5 settings.c 비교, docs/cli-compat.md) ──
const FW_2025 = {
  master: {
    rename: { dshot_idle_value: 'motor_idle', crashflip_expo: 'crashflip_rate' },
    replace: { failsafe_off_delay: ['failsafe_landing_time', '60'] }, // 0.1초 단위 → 초 단위
    remove: [
      'min_throttle', 'gyro_to_use', 'rc_smoothing_feedforward_cutoff', 'gps_rescue_landing_alt',
      'gyro_1_bustype', 'gyro_1_spibus', 'gyro_1_sensor_align', 'gyro_1_align_roll', 'gyro_1_align_pitch', 'gyro_1_align_yaw'
    ],
    add: [
      ['gyro_enabled_bitmask', '1'], ['ap_landing_altitude_m', '4'], ['ap_hover_throttle', '1275'],
      ['ap_throttle_min', '1100'], ['ap_throttle_max', '1700'], ['alt_hold_climb_rate', '50'],
      ['alt_hold_deadband', '20'], ['pos_hold_deadband', '5']
    ]
  },
  pid: {
    // D 의미가 바뀜: 4.5 d_=최대, d_min_=기본 → 2025.12 d_=기본, d_max_=최대
    rename: { simplified_dmax_gain: 'simplified_d_max_gain' },
    replace: { d_roll: ['d_roll', '30'], d_pitch: ['d_pitch', '34'] },
    remove: ['d_min_roll', 'd_min_pitch', 'd_min_yaw', 'dyn_idle_start_increase'],
    add: [
      ['d_max_roll', '40'], ['d_max_pitch', '46'], ['d_max_yaw', '0'],
      ['s_roll', '0'], ['s_pitch', '0'], ['s_yaw', '0'], ['tpa_curve_type', 'CLASSIC']
    ]
  },
  rate: { rename: {}, replace: {}, remove: [], add: [['thr_hover', '50']] }
}

function forFw(list, fw, rules) {
  if (fw !== '2025.12') return list
  const out = list
    .filter(([k]) => !rules.remove.includes(k))
    .map(([k, v]) => (rules.replace[k] ? rules.replace[k] : rules.rename[k] ? [rules.rename[k], v] : [k, v]))
  return [...out, ...rules.add]
}

/** serial 줄의 포트 표기: 4.5 = 숫자 id, 2025.12 = 이름 (io/serial.c serialPortNames) */
const serialToken = (id, fw) => (fw !== '2025.12' ? String(id) : id === 20 ? 'VCP' : `UART${id + 1}`)
const serialLine = (id, mask, fw) => [`serial.${serialToken(id, fw)}`, `serial ${serialToken(id, fw)} ${mask} 115200 57600 0 115200`]

// 섹션: [제목, [[키, 줄], ...]]. 키 체계는 파서(src/shared/cli/parser.ts)와 같다.
function defaults(board, fw) {
  const range = (n, fn) => Array.from({ length: n }, (_, i) => fn(i))
  const sections = [
    ['resources', board.resources.map(([name, idx, pin]) => [`resource.${name}.${idx}`, `resource ${name} ${idx} ${pin}`])],
    ['timer', board.timers.map(([pin, af]) => [`timer.${pin}`, `timer ${pin} ${af}`])],
    ['dma', board.dma.map((d) => [`dma.${d.split(' ').slice(0, -1).join('.')}`, `dma ${d}`])],
    ['mixer', [['mixer', 'mixer QUADX'], [null, 'mmix reset']]],
    ['servo', range(8, (i) => [`servo.${i}`, `servo ${i} 1000 2000 1500 100 -1`])],
    ['servo mixer', [[null, 'smix reset']]],
    ['feature', FEATURES.map(([f, on]) => [`feature.${f}`, `feature ${on ? '' : '-'}${f}`])],
    ['beeper', BEEPERS.map((b) => [`beeper.${b}`, `beeper ${b}`])],
    ['beacon', BEACONS.map((b) => [`beacon.${b}`, `beacon -${b}`])],
    ['map', [['map', 'map AETR1234']]],
    ['serial', board.serials.map((id) => serialLine(id, id === 20 ? 1 : 0, fw))],
    ['led', range(32, (i) => [`led.${i}`, `led ${i} 0,0::C:0`])],
    ['color', range(16, (i) => [`color.${i}`, `color ${i} ${DEFAULT_COLORS[i]}`])],
    ['mode_color', MODE_COLORS.map(([m, f, c]) => [`mode_color.${m}.${f}`, `mode_color ${m} ${f} ${c}`])],
    ['aux', range(20, (i) => [`aux.${i}`, `aux ${i} 0 0 900 900 0 0`])],
    ['adjrange', range(30, (i) => [`adjrange.${i}`, `adjrange ${i} 0 0 900 900 0 0 0 0`])],
    ['rxrange', range(4, (i) => [`rxrange.${i}`, `rxrange ${i} 1000 2000`])],
    ['vtxtable', [
      ['vtxtable.bands', 'vtxtable bands 0'], ['vtxtable.channels', 'vtxtable channels 0'],
      ['vtxtable.powerlevels', 'vtxtable powerlevels 0'], ['vtxtable.powervalues', 'vtxtable powervalues'],
      ['vtxtable.powerlabels', 'vtxtable powerlabels']
    ]],
    ['vtx', range(10, (i) => [`vtx.${i}`, `vtx ${i} 0 0 0 0 900 900`])],
    ['rxfail', range(18, (i) => [`rxfail.${i}`, `rxfail ${i} ${i < 4 ? 'a' : 'h'}`])],
    ['master', forFw(MASTER, fw, FW_2025.master).map(([k, v]) => [`master.${k}`, `set ${k} = ${v}`])]
  ]
  return {
    sections,
    pid: range(4, (n) => forFw(PID_PROFILE, fw, FW_2025.pid).map(([k, v]) => [`pid.${n}.${k}`, `set ${k} = ${v}`])),
    rate: range(4, (n) => forFw(RATE_PROFILE, fw, FW_2025.rate).map(([k, v]) => [`rate.${n}.${k}`, `set ${k} = ${v}`]))
  }
}

const DEFAULT_COLORS = [
  '0,0,0', '0,0,255', '0,255,255', '0,0,0', '60,255,255', '110,255,255', '120,255,255', '180,255,255',
  '220,255,255', '240,255,255', '300,255,255', '330,255,255', '0,0,0', '0,0,0', '0,0,0', '0,0,0'
]
const MODE_COLORS = [
  [0, 0, 1], [0, 1, 11], [0, 2, 2], [0, 3, 13], [0, 4, 10], [0, 5, 3], [1, 0, 5], [1, 1, 11],
  [6, 0, 1], [7, 0, 0], [7, 1, 3]
]

// ── 기체별 설정 ──────────────────────────────────────────

const F405 = {
  target: 'STM32F405', short: 'S405', mcu: 'F405', clock: 168,
  resources: [
    ['BEEPER', 1, 'C15'], ['MOTOR', 1, 'B06'], ['MOTOR', 2, 'B07'], ['MOTOR', 3, 'B08'], ['MOTOR', 4, 'B09'],
    ['LED_STRIP', 1, 'A08'], ['SERIAL_TX', 1, 'A09'], ['SERIAL_TX', 2, 'A02'], ['SERIAL_RX', 1, 'A10'],
    ['SERIAL_RX', 2, 'A03'], ['ADC_BATT', 1, 'C02'], ['ADC_CURR', 1, 'C01'], ['GYRO_EXTI', 1, 'C04']
  ],
  timers: [['B06', 'AF2'], ['B07', 'AF2'], ['B08', 'AF2'], ['B09', 'AF2'], ['A08', 'AF1']],
  dma: ['ADC 1 1', 'pin B06 0', 'pin B07 0', 'pin B08 0', 'pin B09 0', 'pin A08 0'],
  serials: [20, 0, 1, 2, 3, 4, 5]
}

const F7X2 = {
  target: 'STM32F7X2', short: 'S7X2', mcu: 'F722', clock: 216,
  resources: [
    ['BEEPER', 1, 'C13'], ['MOTOR', 1, 'C08'], ['MOTOR', 2, 'C09'], ['MOTOR', 3, 'B06'], ['MOTOR', 4, 'B07'],
    ['LED_STRIP', 1, 'A15'], ['SERIAL_TX', 1, 'A09'], ['SERIAL_TX', 2, 'A02'], ['SERIAL_TX', 3, 'B10'],
    ['SERIAL_RX', 1, 'A10'], ['SERIAL_RX', 2, 'A03'], ['SERIAL_RX', 3, 'B11'], ['ADC_BATT', 1, 'C02'],
    ['ADC_CURR', 1, 'C01'], ['GYRO_EXTI', 1, 'C04']
  ],
  timers: [['C08', 'AF3'], ['C09', 'AF3'], ['B06', 'AF2'], ['B07', 'AF2'], ['A15', 'AF1']],
  dma: ['ADC 1 1', 'pin C08 1', 'pin C09 0', 'pin B06 0', 'pin B07 0', 'pin A15 0'],
  serials: [20, 0, 1, 2, 3, 4, 5]
}

/** O4(DJI) 공통: MSP DisplayPort HD OSD */
function o4Osd(set, uartId, fw) {
  set(...serialLine(uartId, 131073, fw)) // MSP + VTX_MSP (DisplayPort UART은 이 기능 비트로 정한다)
  set('master.osd_displayport_device', 'set osd_displayport_device = MSP')
  set('master.vcd_video_system', 'set vcd_video_system = HD')
  const pos = {
    osd_vbat_pos: [24, 17], osd_link_quality_pos: [2, 1], osd_tim_2_pos: [46, 17],
    osd_flymode_pos: [24, 15], osd_current_pos: [2, 17], osd_mah_drawn_pos: [2, 16],
    osd_craft_name_pos: [22, 1], osd_warnings_pos: [19, 13], osd_avg_cell_voltage_pos: [45, 1],
    osd_crosshairs_pos: [25, 9], osd_rssi_pos: [8, 1]
  }
  for (const [k, [x, y]] of Object.entries(pos)) set(`master.${k}`, `set ${k} = ${osdPos(x, y, true)}`)
}

const CRAFTS = [
  {
    id: 'meteor75-pro',
    board: { ...F405, name: 'BETAFPVF405', manufacturer: 'BEFH' },
    version: '4.5.1', buildDate: 'Jul 28 2024 / 05:51:08', commit: '77d01ba3b',
    sensors: 'GYRO=ICM42688P, ACC=ICM42688P',
    activePid: 0, activeRate: 0,
    apply(set, fw) {
      set('master.craft_name', 'set craft_name = Meteor75 Pro')
      set('master.serialrx_provider', 'set serialrx_provider = CRSF')
      set(...serialLine(1, 64, fw))
      o4Osd(set, 0, fw)
      set('master.motor_pwm_protocol', 'set motor_pwm_protocol = DSHOT300')
      set('master.dshot_bidir', 'set dshot_bidir = ON')
      set('master.motor_poles', 'set motor_poles = 12')
      set('master.dshot_idle_value', 'set dshot_idle_value = 700')
      set('master.vbat_min_cell_voltage', 'set vbat_min_cell_voltage = 290')
      set('master.vbat_warning_cell_voltage', 'set vbat_warning_cell_voltage = 330')
      set('master.ibata_scale', 'set ibata_scale = 470')
      set('master.small_angle', 'set small_angle = 180')
      set('master.blackbox_device', 'set blackbox_device = NONE')
      set('master.yaw_motors_reversed', 'set yaw_motors_reversed = ON')
      set('feature.TELEMETRY', 'feature -TELEMETRY')
      set('feature.LED_STRIP', 'feature LED_STRIP')
      for (let i = 0; i < 8; i++) set(`led.${i}`, `led ${i} ${i % 4},${Math.floor(i / 4)}::C:${(i % 3) + 2}`)
      set('aux.0', 'aux 0 0 0 1700 2100 0 0')
      set('aux.1', 'aux 1 1 1 900 1300 0 0')
      set('aux.2', 'aux 2 35 2 1700 2100 0 0')
      set('aux.3', 'aux 3 13 3 1700 2100 0 0')
      set('rxfail.4', 'rxfail 4 s 1000')
      const pid = { p_roll: 60, i_roll: 70, d_roll: 60, f_roll: 90, p_pitch: 62, i_pitch: 72, d_pitch: 64, f_pitch: 95, p_yaw: 55, i_yaw: 70, f_yaw: 90, d_min_roll: 48, d_min_pitch: 52, thrust_linear: 25, tpa_breakpoint: 1500 }
      for (const [k, v] of Object.entries(pid)) set(`pid.0.${k}`, `set ${k} = ${v}`)
      set('pid.0.profile_name', 'set profile_name = 1S HV')
      const rate = { roll_rc_rate: 12, pitch_rc_rate: 12, yaw_rc_rate: 12, roll_srate: 75, pitch_srate: 75, yaw_srate: 60, roll_expo: 20, pitch_expo: 20 }
      for (const [k, v] of Object.entries(rate)) set(`rate.0.${k}`, `set ${k} = ${v}`)
      set('pid.0.dterm_lpf1_static_hz', 'set dterm_lpf1_static_hz = 90')
      set('master.gyro_lpf1_static_hz', 'set gyro_lpf1_static_hz = 0')
      set('master.gyro_lpf1_dyn_min_hz', 'set gyro_lpf1_dyn_min_hz = 0')
      set('master.dyn_notch_count', 'set dyn_notch_count = 1')
    }
  },
  {
    id: 'pavo20-pro2',
    board: { ...F405, name: 'BETAFPVF405', manufacturer: 'BEFH' },
    version: '4.5.2', buildDate: 'Mar 11 2025 / 10:02:41', commit: 'a1b2c3d4e',
    sensors: 'GYRO=ICM42688P, ACC=ICM42688P, BARO=DPS310',
    activePid: 1, activeRate: 1,
    apply(set, fw) {
      set('master.craft_name', 'set craft_name = Pavo20 Pro2')
      set('master.pilot_name', 'set pilot_name = Chloe')
      set('master.serialrx_provider', 'set serialrx_provider = CRSF')
      set(...serialLine(1, 64, fw))
      o4Osd(set, 2, fw)
      set('master.dshot_bidir', 'set dshot_bidir = ON')
      set('master.motor_poles', 'set motor_poles = 12')
      set('master.align_board_yaw', 'set align_board_yaw = 90')
      set('master.gyro_1_sensor_align', 'set gyro_1_sensor_align = CW90')
      set('master.gyro_1_align_yaw', 'set gyro_1_align_yaw = 900')
      set('master.bat_capacity', 'set bat_capacity = 1100')
      set('master.blackbox_sample_rate', 'set blackbox_sample_rate = 1/2')
      set('master.debug_mode', 'set debug_mode = GYRO_SCALED')
      set('aux.0', 'aux 0 0 0 1700 2100 0 0')
      set('aux.1', 'aux 1 1 1 1300 1700 0 0')
      set('aux.2', 'aux 2 2 1 1700 2100 0 0')
      set('aux.3', 'aux 3 35 2 1700 2100 0 0')
      set('aux.4', 'aux 4 26 3 1700 2100 0 0')
      set('adjrange.0', 'adjrange 0 0 4 900 2100 12 4 0 0')
      set('beeper.ON_USB', 'beeper -ON_USB')
      set('beacon.RX_LOST', 'beacon RX_LOST')
      // 프로필 1이 활성
      const pid = { p_roll: 52, i_roll: 85, d_roll: 38, p_pitch: 55, i_pitch: 90, d_pitch: 42, p_yaw: 50, i_yaw: 85 }
      for (const [k, v] of Object.entries(pid)) set(`pid.1.${k}`, `set ${k} = ${v}`)
      set('pid.1.profile_name', 'set profile_name = Cine')
      set('pid.0.profile_name', 'set profile_name = Default')
      set('rate.1.rateprofile_name', 'set rateprofile_name = Smooth')
      const rate = { roll_rc_rate: 5, pitch_rc_rate: 5, yaw_rc_rate: 5, roll_srate: 50, pitch_srate: 50, yaw_srate: 45, roll_expo: 35, pitch_expo: 35, yaw_expo: 20 }
      for (const [k, v] of Object.entries(rate)) set(`rate.1.${k}`, `set ${k} = ${v}`)
    }
  },
  {
    id: 'moz7',
    board: { ...F7X2, name: 'GEPRCF722', manufacturer: 'GEPR' },
    version: '4.5.1', buildDate: 'Jul 28 2024 / 05:51:08', commit: '77d01ba3b',
    sensors: 'GYRO=ICM42688P, ACC=ICM42688P, BARO=SPL06',
    activePid: 0, activeRate: 2,
    apply(set, fw) {
      set('master.craft_name', 'set craft_name = Moz7')
      set('master.serialrx_provider', 'set serialrx_provider = CRSF')
      set('master.crsf_use_negotiated_baud', 'set crsf_use_negotiated_baud = ON')
      set(...serialLine(1, 64, fw))
      set(...serialLine(2, 2, fw)) // GPS
      o4Osd(set, 0, fw)
      set('feature.GPS', 'feature GPS')
      set('master.gps_rescue_return_alt', 'set gps_rescue_return_alt = 60')
      set('master.gps_rescue_min_sats', 'set gps_rescue_min_sats = 10')
      set('master.gps_ublox_use_galileo', 'set gps_ublox_use_galileo = ON')
      set('master.failsafe_procedure', 'set failsafe_procedure = GPS-RESCUE')
      set('master.dshot_bidir', 'set dshot_bidir = ON')
      set('master.motor_pwm_protocol', 'set motor_pwm_protocol = DSHOT300')
      set('master.vbat_min_cell_voltage', 'set vbat_min_cell_voltage = 320')
      set('master.bat_capacity', 'set bat_capacity = 1300')
      set('master.ibata_scale', 'set ibata_scale = 210')
      set('master.osd_cap_alarm', 'set osd_cap_alarm = 1100')
      set('aux.0', 'aux 0 0 0 1700 2100 0 0')
      set('aux.1', 'aux 1 1 1 1300 1700 0 0')
      set('aux.2', 'aux 2 46 2 1700 2100 0 0')
      set('aux.3', 'aux 3 13 3 1700 2100 0 0')
      set('aux.4', 'aux 4 35 4 1700 2100 0 0')
      set('rxfail.5', 'rxfail 5 s 1100')
      set('vtx.0', 'vtx 0 4 0 0 1 1700 2100')
      const dTerm = fw === '2025.12' ? { d_roll: 36, d_pitch: 40, d_max_roll: 46, d_max_pitch: 52 } : { d_roll: 46, d_pitch: 52, d_min_roll: 36, d_min_pitch: 40 }
      const pid = { p_roll: 48, i_roll: 88, p_pitch: 52, i_pitch: 92, ...dTerm, dyn_idle_min_rpm: 30 }
      for (const [k, v] of Object.entries(pid)) set(`pid.0.${k}`, `set ${k} = ${v}`)
      const rate = { rates_type: 'BETAFLIGHT', roll_rc_rate: 100, pitch_rc_rate: 100, yaw_rc_rate: 100, roll_srate: 70, pitch_srate: 70, yaw_srate: 60 }
      for (const [k, v] of Object.entries(rate)) set(`rate.2.${k}`, `set ${k} = ${v}`)
      set('rate.2.rateprofile_name', 'set rateprofile_name = Freestyle')
      set('master.rpm_filter_harmonics', 'set rpm_filter_harmonics = 2')
      set('master.dyn_notch_count', 'set dyn_notch_count = 2')
    }
  }
]

// 같은 Moz7을 2025.12.5 형식으로 (serial 포트 이름, d_max, motor_idle, failsafe_landing_time, ap_* ...)
CRAFTS.push({ ...CRAFTS[2], id: "moz7-2025.12", fw: "2025.12", version: "2025.12.5", buildDate: "Apr 10 2026 / 08:12:30", commit: "7348054f2", mspApi: "1.47" })

// ── 출력 ─────────────────────────────────────────────────

function versionLine(c) {
  return `# Betaflight / ${c.board.target} (${c.board.short}) ${c.version} ${c.buildDate} (${c.commit}) MSP API: ${c.mspApi ?? '1.46'}`
}

function render(c, cfg, base, mode) {
  const out = []
  const isDiff = mode === 'diff'
  const pick = (items, baseItems) =>
    items.filter(([key, line], i) => !isDiff || key === null || line !== baseItems[i][1]).filter(([key]) => !(isDiff && key === null))

  out.push(`# ${isDiff ? 'diff' : 'dump'} all`, '', '# version', versionLine(c), '# config rev: 4c8a7f3', '')
  out.push('# start the command batch', 'batch start', '', '# reset configuration to default settings', 'defaults nosave', '')
  out.push(`board_name ${c.board.name}`, `manufacturer_id ${c.board.manufacturer}`, 'mcu_id 0039002b3133510a33383738', 'signature ', '')
  if (isDiff) out.push(`# name: ${c.craftName}`, '')

  cfg.sections.forEach(([title, items], si) => {
    const lines = pick(items, base.sections[si][1])
    if (isDiff && lines.length === 0) return
    out.push(`# ${title}`, ...lines.map(([, l]) => l), '')
  })

  for (let n = 0; n < 4; n++) {
    out.push(`profile ${n}`, '', `# profile ${n}`, ...pick(cfg.pid[n], base.pid[n]).map(([, l]) => l), '')
  }
  out.push('# restore original profile selection', `profile ${c.activePid}`, '')
  for (let n = 0; n < 4; n++) {
    out.push(`rateprofile ${n}`, '', `# rateprofile ${n}`, ...pick(cfg.rate[n], base.rate[n]).map(([, l]) => l), '')
  }
  out.push('# restore original rateprofile selection', `rateprofile ${c.activeRate}`, '')
  out.push('# end the command batch', 'batch end', '', '# save configuration', 'save', '# ')
  // 실제 CLI처럼 CRLF
  return out.join('\r\n')
}

function statusText(c) {
  return [
    `MCU ${c.board.mcu} Clock=${c.board.clock}MHz, Vref=3.30V, Core temp=41degC`,
    'Stack size: 2048, Stack address: 0x1000fff0',
    'Configuration: CONFIGURED, size: 3842, max available: 16384',
    'Devices detected: SPI:2, I2C:1',
    'Gyros detected: gyro 1 locked dma',
    c.sensors,
    'OSD: MSP (53 x 20)',
    'BUILD KEY: 7c2e64d2aa1c40c8b8d4f1c55cfa3a10 (4.5.1)',
    'System Uptime: 41 seconds, Current Time: 2026-10-19T09:12:03.000+00:00',
    'CPU:14%, cycle time: 125, GYRO rate: 8000, RX rate: 151, System rate: 9',
    'Voltage: 0 * 0.01V (0S battery - NOT PRESENT)',
    'I2C Errors: 0',
    'FLASH: JEDEC ID=0x00ef4018 16M',
    'Arming disable flags: RXLOSS CLI MSP'
  ].join('\r\n')
}

mkdirSync(OUT, { recursive: true })
for (const c of CRAFTS) {
  const base = defaults(c.board, c.fw)
  const cfg = defaults(c.board, c.fw)
  const index = new Map()
  cfg.sections.forEach(([, items]) => items.forEach((it) => it[0] && index.set(it[0], it)))
  cfg.pid.forEach((items) => items.forEach((it) => index.set(it[0], it)))
  cfg.rate.forEach((items) => items.forEach((it) => index.set(it[0], it)))
  c.apply((key, line) => {
    const it = index.get(key)
    if (!it) throw new Error(`${c.id}: 알 수 없는 키 ${key}`)
    it[1] = line
  }, c.fw)
  c.craftName = cfg.sections.find(([t]) => t === 'master')[1].find(([k]) => k === 'master.craft_name')[1].split(' = ')[1]

  const changedKeys = [...index.entries()]
    .filter(([key, [, line]]) => {
      const orig = [...base.sections.flatMap(([, i]) => i), ...base.pid.flat(), ...base.rate.flat()].find(([k]) => k === key)
      return orig[1] !== line
    })
    .map(([key]) => key)

  const dump = render(c, cfg, base, 'dump')
  const diff = render(c, cfg, base, 'diff')
  writeFileSync(join(OUT, `${c.id}.dump.txt`), dump)
  writeFileSync(join(OUT, `${c.id}.diff.txt`), diff)
  writeFileSync(join(OUT, `${c.id}.version.txt`), [versionLine(c), `# config: manufacturer_id: ${c.board.manufacturer}, board_name: ${c.board.name}, version: 4c8a7f3a, date: 2024-05-04T04:57:12Z`].join('\r\n'))
  writeFileSync(join(OUT, `${c.id}.status.txt`), statusText(c))
  writeFileSync(
    join(OUT, `${c.id}.expected.json`),
    JSON.stringify(
      {
        craftName: c.craftName,
        board: c.board.name,
        target: c.board.target,
        version: c.version,
        firmware: c.fw ?? "4.5",
        activePidProfile: c.activePid,
        activeRateProfile: c.activeRate,
        changedKeys
      },
      null,
      2
    ) + '\n'
  )
  console.log(`${c.id}: dump ${dump.split('\r\n').length}줄, diff ${diff.split('\r\n').length}줄, 변경 ${changedKeys.length}개`)
}
