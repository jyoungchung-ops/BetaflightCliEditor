// Betaflight CLI 텍스트(dump all / diff all / version / status) 파서.
// 줄 단위로 읽고, 모르는 줄은 버리지 않고 unknown에 보관한다.

import type {
  AdjRange,
  CraftMeta,
  CraftSnapshot,
  LedCfg,
  MixerCfg,
  ParsedCli,
  RawCli,
  StatusInfo,
  VtxTable
} from './types'

/** 줄 분리 + \r 제거 */
export function splitLines(text: string): string[] {
  return text.replace(/\r/g, '').split('\n')
}

const VERSION_RE = /^#?\s*(\w+)\s*\/\s*(\S+)\s+\((\w+)\)\s+(\S+)\s+(.+?)\s*\((\w+)\)\s*MSP API:\s*(\S+)/

/** "# Betaflight / STM32F405 (S405) 4.5.1 Jul 28 2024 / 05:51:08 (77d01ba3b) MSP API: 1.46" */
export function parseVersionLine(line: string): Partial<CraftMeta> | null {
  const m = VERSION_RE.exec(line.trim())
  if (!m) return null
  const [, firmwareName, target, targetShort, version, buildDate, , mspApi] = m
  return {
    firmwareName,
    target,
    targetShort,
    version,
    buildDate,
    mspApi,
    firmware: `${firmwareName} ${version}`
  }
}

/** version 명령 출력 */
export function parseVersion(text: string): Partial<CraftMeta> {
  const meta: Partial<CraftMeta> = {}
  for (const line of splitLines(text)) {
    const v = parseVersionLine(line)
    if (v) Object.assign(meta, v)
    const board = /board_name:\s*([^,\s]+)/.exec(line)
    if (board) meta.board = board[1]
    const manu = /manufacturer_id:\s*([^,\s]+)/.exec(line)
    if (manu) meta.manufacturerId = manu[1]
  }
  return meta
}

/** status 명령 출력 */
export function parseStatus(text: string): StatusInfo {
  const info: StatusInfo = { sensors: {}, armingDisableFlags: [], lines: [] }
  for (const raw of splitLines(text)) {
    const line = raw.trim()
    if (!line || line === '#' || /^#?\s*status$/.test(line)) continue
    info.lines.push(line)

    let m: RegExpExecArray | null
    if ((m = /^MCU\s+(\S+)/.exec(line))) info.mcu = m[1]
    // "GYRO=ICM42688P, ACC=ICM42688P, BARO=DPS310"
    if (/^[A-Z]+=\S/.test(line)) {
      for (const part of line.split(',')) {
        const [k, v] = part.split('=').map((s) => s.trim())
        if (k && v) info.sensors[k] = v
      }
    }
    if ((m = /CPU:\s*(\d+)%/.exec(line))) info.cpuLoad = Number(m[1])
    if ((m = /cycle time:\s*(\d+)/.exec(line))) info.cycleTime = Number(m[1])
    if ((m = /GYRO rate:\s*(\d+)/.exec(line))) info.gyroRate = Number(m[1])
    if ((m = /RX rate:\s*(\d+)/.exec(line))) info.rxRate = Number(m[1])
    if ((m = /^OSD:\s*(.+)$/.exec(line))) info.osd = m[1]
    if ((m = /^Arming disable flags:\s*(.*)$/.exec(line))) {
      info.armingDisableFlags = m[1].split(/\s+/).filter(Boolean)
    }
  }
  return info
}

const nums = (tokens: string[]): number[] => tokens.map(Number)
const allNumeric = (tokens: string[]): boolean => tokens.length > 0 && tokens.every((t) => /^-?\d+(\.\d+)?$/.test(t))

/**
 * 2025.12+ serial 포트 이름 → 펌웨어 식별자 (io/serial.h serialPortIdentifier_e, io/serial.c serialPortNames)
 * VCP=20, SOFT1~=30~, LPUART1=40, UART0=50, UART1~10=51~60
 */
export function serialIdFromName(name: string): number | null {
  const n = name.toUpperCase()
  if (n === 'VCP') return 20
  let m: RegExpExecArray | null
  if ((m = /^UART(\d+)$/.exec(n))) return 50 + Number(m[1])
  if ((m = /^SOFT(\d+)$/.exec(n))) return 29 + Number(m[1])
  if ((m = /^LPUART(\d+)$/.exec(n))) return 39 + Number(m[1])
  if ((m = /^PIOUART(\d+)$/.exec(n))) return 70 + Number(m[1])
  return null
}

/** 명령 중 무시하는 것 (설정 값이 아님) */
const IGNORED = new Set(['batch', 'defaults', 'save', 'exit', 'diff', 'dump', 'version', 'status', 'get'])

function emptyParsed(): ParsedCli {
  return {
    meta: {},
    master: {},
    pidProfiles: [],
    rateProfiles: [],
    features: {},
    serial: [],
    aux: [],
    adjustments: [],
    rxFail: [],
    rxRange: [],
    resources: [],
    keys: [],
    unknown: []
  }
}

function ensureVtx(p: ParsedCli): VtxTable {
  return (p.vtxTable ??= { band: [], powerValues: [], powerLabels: [], ranges: [] })
}
function ensureLed(p: ParsedCli): LedCfg {
  return (p.led ??= { leds: [], colors: [], modeColors: [] })
}
function ensureMixer(p: ParsedCli): MixerCfg {
  return (p.mixer ??= { mmix: [], smix: [], servos: [] })
}
function ensureBeeper(p: ParsedCli) {
  return (p.beeper ??= { beeper: {}, beacon: {} })
}

/** "ON_USB" / "-ON_USB" → [이름, 켜짐] */
function onOff(token: string): [string, boolean] {
  return token.startsWith('-') ? [token.slice(1), false] : [token, true]
}

/**
 * dump all / diff all 텍스트를 파싱한다.
 * `set` 줄은 마지막으로 나온 `profile N` / `rateprofile N` 섹션에 들어간다.
 */
export function parseCli(text: string): ParsedCli {
  const p = emptyParsed()
  type Scope = { kind: 'master' } | { kind: 'pid'; n: number } | { kind: 'rate'; n: number }
  let scope: Scope = { kind: 'master' }
  const keys = new Set<string>()
  const key = (k: string) => keys.add(k)

  for (const raw of splitLines(text)) {
    const line = raw.trim()
    if (!line) continue

    if (line.startsWith('#')) {
      // 헤더 주석에서 펌웨어 정보, 오류 줄은 보관
      const v = parseVersionLine(line)
      if (v) Object.assign(p.meta, v)
      else if (line.startsWith('###')) p.unknown.push(line)
      continue
    }

    const sp = line.indexOf(' ')
    const cmd = sp < 0 ? line : line.slice(0, sp)
    const rest = sp < 0 ? '' : line.slice(sp + 1).trim()
    const t = rest ? rest.split(/\s+/) : []

    switch (cmd) {
      case 'set': {
        const m = /^(\S+)\s*=\s?(.*)$/.exec(rest)
        if (!m) break
        const [, k, v] = m
        if (scope.kind === 'master') {
          p.master[k] = v
          key(`master.${k}`)
        } else if (scope.kind === 'pid') {
          ;(p.pidProfiles[scope.n] ??= {})[k] = v
          key(`pid.${scope.n}.${k}`)
        } else {
          ;(p.rateProfiles[scope.n] ??= {})[k] = v
          key(`rate.${scope.n}.${k}`)
        }
        continue
      }
      case 'profile': {
        const n = Number(t[0])
        if (!Number.isInteger(n)) break
        scope = { kind: 'pid', n }
        p.pidProfiles[n] ??= {}
        p.meta.activePidProfile = n // 마지막 선택("restore original profile selection")이 활성 프로필
        continue
      }
      case 'rateprofile': {
        const n = Number(t[0])
        if (!Number.isInteger(n)) break
        scope = { kind: 'rate', n }
        p.rateProfiles[n] ??= {}
        p.meta.activeRateProfile = n
        continue
      }
      case 'board_name':
        p.meta.board = rest
        continue
      case 'manufacturer_id':
        p.meta.manufacturerId = rest
        continue
      case 'mcu_id':
        p.meta.mcuId = rest
        continue
      case 'signature':
        continue
      case 'feature': {
        if (!t[0]) break
        const [name, on] = onOff(t[0])
        p.features[name] = on
        key(`feature.${name}`)
        continue
      }
      case 'serial': {
        // 4.5: serial 1 64 115200 ...   2025.12+: serial UART2 64 115200 ...
        if (t.length < 6 || !allNumeric(t.slice(1))) break
        const [functionMask, mspBaud, gpsBaud, telemetryBaud, blackboxBaud] = nums(t.slice(1))
        const named = !allNumeric([t[0]])
        const id = named ? serialIdFromName(t[0]) : Number(t[0])
        if (id === null) break
        p.serial.push({ id, ...(named ? { name: t[0] } : {}), functionMask, mspBaud, gpsBaud, telemetryBaud, blackboxBaud })
        key(`serial.${t[0]}`)
        continue
      }
      case 'aux': {
        if (t.length < 5 || !allNumeric(t)) break
        const [index, modeId, channel, start, end, logic = 0, linkedTo = 0] = nums(t)
        p.aux.push({ index, modeId, channel, start, end, logic, linkedTo })
        key(`aux.${index}`)
        continue
      }
      case 'adjrange': {
        if (t.length < 6 || !allNumeric(t)) break
        const n = nums(t)
        // 4.x: index slot channel start end func switchCh center scale
        // 구형: index slot channel start end func switchCh
        const adj: AdjRange = {
          index: n[0],
          channel: n[2],
          start: n[3],
          end: n[4],
          func: n[5],
          switchChannel: n[6] ?? 0,
          center: n[7] ?? 0,
          scale: n[8] ?? 0
        }
        p.adjustments.push(adj)
        key(`adjrange.${adj.index}`)
        continue
      }
      case 'map':
        if (!t[0]) break
        p.rxMap = t[0]
        key('map')
        continue
      case 'rxfail': {
        if (t.length < 2) break
        const channel = Number(t[0])
        p.rxFail.push({ channel, mode: t[1], ...(t[2] !== undefined ? { value: Number(t[2]) } : {}) })
        key(`rxfail.${channel}`)
        continue
      }
      case 'rxrange': {
        if (t.length < 3 || !allNumeric(t)) break
        const [channel, min, max] = nums(t)
        p.rxRange.push({ channel, min, max })
        key(`rxrange.${channel}`)
        continue
      }
      case 'resource':
        p.resources.push({ kind: 'resource', text: rest })
        if (t.length >= 2) key(`resource.${t[0]}.${t[1]}`)
        continue
      case 'timer':
        p.resources.push({ kind: 'timer', text: rest })
        if (t[0]) key(`timer.${t[0]}`)
        continue
      case 'dma':
        p.resources.push({ kind: 'dma', text: rest })
        if (t.length >= 2) key(`dma.${t.slice(0, -1).join('.')}`)
        continue
      case 'vtxtable': {
        const vt = ensureVtx(p)
        const sub = t[0]
        const args = t.slice(1)
        switch (sub) {
          case 'bands':
            vt.bands = Number(args[0])
            break
          case 'channels':
            vt.channels = Number(args[0])
            break
          case 'powerlevels':
            vt.powerLevels = Number(args[0])
            break
          case 'powervalues':
            vt.powerValues = nums(args)
            break
          case 'powerlabels':
            vt.powerLabels = args
            break
          case 'band': {
            // vtxtable band 1 BOSCAM_A A FACTORY 5865 5845 ...
            const [num, name, letter, type, ...freqs] = args
            vt.band.push({ number: Number(num), name, letter, type, frequencies: nums(freqs) })
            key(`vtxtable.band.${num}`)
            continue
          }
          default:
            p.unknown.push(line)
            continue
        }
        key(`vtxtable.${sub}`)
        continue
      }
      case 'vtx': {
        if (t.length < 7 || !allNumeric(t)) break
        const [index, channel, band, vtxChannel, power, start, end] = nums(t)
        ensureVtx(p).ranges.push({ index, channel, band, vtxChannel, power, start, end })
        key(`vtx.${index}`)
        continue
      }
      case 'led': {
        if (t.length < 2) break
        const index = Number(t[0])
        ensureLed(p).leds.push({ index, config: t[1] })
        key(`led.${index}`)
        continue
      }
      case 'color': {
        if (t.length < 2) break
        const index = Number(t[0])
        const [h, s, v] = nums(t[1].split(','))
        ensureLed(p).colors.push({ index, h, s, v })
        key(`color.${index}`)
        continue
      }
      case 'mode_color': {
        if (t.length < 3 || !allNumeric(t)) break
        const [mode, func, color] = nums(t)
        ensureLed(p).modeColors.push({ mode, func, color })
        key(`mode_color.${mode}.${func}`)
        continue
      }
      case 'mixer':
        if (!t[0]) break
        ensureMixer(p).type = t[0]
        key('mixer')
        continue
      case 'mmix': {
        if (t[0] === 'reset') {
          ensureMixer(p)
          continue
        }
        if (t.length < 5) break
        const [index, throttle, roll, pitch, yaw] = nums(t)
        ensureMixer(p).mmix.push({ index, throttle, roll, pitch, yaw })
        key(`mmix.${index}`)
        continue
      }
      case 'smix': {
        if (t[0] === 'reset') {
          ensureMixer(p)
          continue
        }
        if (!allNumeric(t)) break
        ensureMixer(p).smix.push(nums(t))
        key(`smix.${t[0]}`)
        continue
      }
      case 'servo': {
        if (t.length < 6 || !allNumeric(t)) break
        const [index, min, max, middle, rate, forwardFromChannel] = nums(t)
        ensureMixer(p).servos.push({ index, min, max, middle, rate, forwardFromChannel })
        key(`servo.${index}`)
        continue
      }
      case 'beeper':
      case 'beacon': {
        if (!t[0]) break
        const [name, on] = onOff(t[0])
        ensureBeeper(p)[cmd][name] = on
        key(`${cmd}.${name}`)
        continue
      }
      default:
        if (IGNORED.has(cmd)) continue
    }
    p.unknown.push(line)
  }

  p.keys = [...keys]
  return p
}

export interface SnapshotInput {
  craftName: string
  readAt: string
  raw: RawCli
}

/**
 * 원문 4종으로 CraftSnapshot을 만든다. 화면 값은 dump all에서, 변경 강조는 diff all에서 온다.
 * dump가 없으면(App에서 저장한 diff 파일 등) diff로 대신한다.
 */
export function buildSnapshot({ craftName, readAt, raw }: SnapshotInput): CraftSnapshot {
  const main = parseCli(raw.dumpAll.trim() ? raw.dumpAll : raw.diffAll)
  const diff = raw.diffAll.trim() ? parseCli(raw.diffAll) : null
  const ver = raw.version.trim() ? parseVersion(raw.version) : {}

  const metaSrc = { ...main.meta, ...stripUndefined(ver) }
  const meta: CraftMeta = {
    ...metaSrc,
    firmware: metaSrc.firmware ?? '',
    target: metaSrc.target ?? '',
    board: metaSrc.board ?? '',
    activePidProfile: main.meta.activePidProfile ?? 0,
    activeRateProfile: main.meta.activeRateProfile ?? 0
  }

  return {
    craftName,
    readAt,
    raw,
    meta,
    ...(raw.status.trim() ? { status: parseStatus(raw.status) } : {}),
    master: main.master,
    pidProfiles: main.pidProfiles,
    rateProfiles: main.rateProfiles,
    features: main.features,
    serial: main.serial,
    aux: main.aux,
    adjustments: main.adjustments,
    rxMap: main.rxMap,
    rxFail: main.rxFail,
    rxRange: main.rxRange,
    resources: main.resources,
    vtxTable: main.vtxTable,
    led: main.led,
    mixer: main.mixer,
    beeper: main.beeper,
    changed: diff ? diff.keys : [],
    unknown: main.unknown
  }
}

function stripUndefined<T extends object>(o: T): Partial<T> {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as Partial<T>
}

/** CLI 텍스트가 dump인지 diff인지 추정 (App에서 저장한 .txt 열기용) */
export function detectCliKind(text: string): 'dump' | 'diff' | 'unknown' {
  const head = text.slice(0, 2000)
  if (/^#\s*dump\b/m.test(head)) return 'dump'
  if (/^#\s*diff\b/m.test(head)) return 'diff'
  // 헤더가 없으면 set 줄 수로 추정 (dump all은 수백 줄 이상)
  const sets = text.match(/^\s*set \S+\s*=/gm)?.length ?? 0
  if (sets >= 300) return 'dump'
  if (sets > 0 || /^defaults nosave/m.test(text)) return 'diff'
  return 'unknown'
}
