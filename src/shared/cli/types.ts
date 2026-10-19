// CLI 파싱 결과 데이터 모델 (SPEC 4절).
// 값은 문자열 그대로 두고 화면에서 해석한다 — 펌웨어 버전마다 키·열거값이 달라서다.

export interface SerialPortCfg {
  /**
   * 펌웨어 포트 식별자.
   * 4.5: 0~9 = UART1~10, 20 = USB VCP, 30+ = 소프트시리얼, 40 = LPUART1
   * 2025.12+: 20 = VCP, 30+ = SOFT, 40 = LPUART1, 50 = UART0, 51~60 = UART1~10 (CLI에는 이름으로 나옴)
   */
  id: number
  /** 2025.12+ serial 줄의 포트 이름 (VCP, UART1, SOFT1, LPUART1 ...) */
  name?: string
  /** serialPortFunction 비트마스크 */
  functionMask: number
  mspBaud: number
  gpsBaud: number
  telemetryBaud: number
  blackboxBaud: number
}

export interface AuxRange {
  index: number
  modeId: number
  /** 0 = AUX1 */
  channel: number
  start: number
  end: number
  /** 0 = OR, 1 = AND */
  logic: number
  linkedTo: number
}

export interface AdjRange {
  index: number
  /** 0 = AUX1 */
  channel: number
  start: number
  end: number
  func: number
  /** 조정값을 읽을 채널 (0 = AUX1) */
  switchChannel: number
  center: number
  scale: number
}

export interface RxFail {
  channel: number
  /** a=auto, h=hold, s=set */
  mode: string
  value?: number
}

export interface RxRange {
  channel: number
  min: number
  max: number
}

export interface VtxBand {
  number: number
  name: string
  letter: string
  /** FACTORY | CUSTOM */
  type: string
  frequencies: number[]
}

export interface VtxRange {
  index: number
  channel: number
  band: number
  vtxChannel: number
  power: number
  start: number
  end: number
}

export interface VtxTable {
  bands?: number
  channels?: number
  band: VtxBand[]
  powerLevels?: number
  powerValues: number[]
  powerLabels: string[]
  ranges: VtxRange[]
}

export interface LedColor {
  index: number
  h: number
  s: number
  v: number
}

export interface LedModeColor {
  mode: number
  func: number
  color: number
}

export interface LedCfg {
  /** led 줄의 설정 문자열 (예: "0,0::C:0"), 인덱스 순 */
  leds: { index: number; config: string }[]
  colors: LedColor[]
  modeColors: LedModeColor[]
}

export interface MotorMix {
  index: number
  throttle: number
  roll: number
  pitch: number
  yaw: number
}

export interface ServoCfg {
  index: number
  min: number
  max: number
  middle: number
  rate: number
  forwardFromChannel: number
}

export interface MixerCfg {
  type?: string
  mmix: MotorMix[]
  /** smix 줄의 숫자 열 그대로 */
  smix: number[][]
  servos: ServoCfg[]
}

export interface BeeperCfg {
  beeper: Record<string, boolean>
  beacon: Record<string, boolean>
}

export interface ResourceLine {
  kind: 'resource' | 'timer' | 'dma'
  /** 명령 이름을 뺀 나머지 (예: "MOTOR 1 B04") */
  text: string
}

export interface CraftMeta {
  firmware: string
  target: string
  board: string
  activePidProfile: number
  activeRateProfile: number
  /** 예: "Betaflight" */
  firmwareName?: string
  /** 예: "4.5.1" */
  version?: string
  /** 예: "S405" */
  targetShort?: string
  buildDate?: string
  mspApi?: string
  manufacturerId?: string
  mcuId?: string
}

export interface StatusInfo {
  mcu?: string
  sensors: Record<string, string>
  cpuLoad?: number
  cycleTime?: number
  gyroRate?: number
  rxRate?: number
  osd?: string
  armingDisableFlags: string[]
  lines: string[]
}

/** CLI 텍스트 하나(dump 또는 diff)를 파싱한 결과 */
export interface ParsedCli {
  meta: Partial<CraftMeta>
  master: Record<string, string>
  pidProfiles: Record<string, string>[]
  rateProfiles: Record<string, string>[]
  features: Record<string, boolean>
  serial: SerialPortCfg[]
  aux: AuxRange[]
  adjustments: AdjRange[]
  rxMap?: string
  rxFail: RxFail[]
  rxRange: RxRange[]
  resources: ResourceLine[]
  vtxTable?: VtxTable
  led?: LedCfg
  mixer?: MixerCfg
  beeper?: BeeperCfg
  /** 이 텍스트에 나온 설정 항목 키 ("master.x", "pid.0.p_roll", "serial.20" ...) */
  keys: string[]
  unknown: string[]
}

export interface RawCli {
  version: string
  status: string
  diffAll: string
  dumpAll: string
}

export interface CraftSnapshot {
  craftName: string
  readAt: string
  raw: RawCli
  meta: CraftMeta
  status?: StatusInfo
  master: Record<string, string>
  pidProfiles: Record<string, string>[]
  rateProfiles: Record<string, string>[]
  features: Record<string, boolean>
  serial: SerialPortCfg[]
  aux: AuxRange[]
  adjustments: AdjRange[]
  rxMap?: string
  rxFail: RxFail[]
  rxRange: RxRange[]
  resources: ResourceLine[]
  vtxTable?: VtxTable
  led?: LedCfg
  mixer?: MixerCfg
  beeper?: BeeperCfg
  /** diff all에 나온 키 — 화면에서 변경 강조 */
  changed: string[]
  unknown: string[]
}
