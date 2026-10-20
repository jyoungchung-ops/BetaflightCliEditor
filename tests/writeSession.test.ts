// v2 5단계: 쓰기 송신(writeSession) — 오류에서 멈추고 save 를 보내지 않는지, 차단 명령이 나갈 수 없는지
import { describe, expect, it } from 'vitest'
import { isGeneratedCommand } from '../src/shared/edit/commands'
import { WriteError, WriteSession, responseError } from '../src/main/serial/writeSession'
import { FakeFc, type FakeFcOptions } from './fakeFc'

/** CLI 에 들어가 있는 가짜 FC (쓰기는 이미 진입한 연결에서 한다) */
async function fcInCli(handler: FakeFcOptions['handler']) {
  const fc = new FakeFc({ responses: {}, handler })
  await fc.write('#')
  await new Promise((r) => setTimeout(r, 20))
  fc.writes.length = 0
  return fc
}

/** 펌웨어처럼 답하는 기본 처리 */
const firmware = (save: 'noreboot' | 'reboot' = 'noreboot') => (cmd: string) => {
  if (cmd === 'batch start') return ''
  let m: RegExpExecArray | null
  if ((m = /^set (\S+) = (.*)$/.exec(cmd))) return `${m[1]} set to ${m[2]}`
  if (/^(profile|rateprofile|battery_profile) \d$/.test(cmd)) return ''
  if (/^(aux|serial|rxfail|map) /.test(cmd)) return cmd
  if (/^feature /.test(cmd)) return ''
  if (cmd === 'save noreboot' && save === 'noreboot') return '# saving'
  if (cmd === 'save') return { text: '\r\n# saving\r\n\r\nRebooting', close: true as const }
  return undefined
}

const CMDS = ['batch start', 'feature -GPS', 'aux 0 0 0 1700 2100 0 0', 'set craft_name = TEST', 'profile 1', 'set p_roll = 50', 'profile 0', 'save noreboot']
const sent = (fc: FakeFc) => fc.writes.map((w) => w.replace(/\n$/, ''))
const FAST = { lineTimeoutMs: 300, saveTimeoutMs: 500, quietMs: 10 }

describe('WriteSession', () => {
  it('모든 줄 성공 → save noreboot, 재부팅 없음', async () => {
    const fc = await fcInCli(firmware())
    const out = await new WriteSession(fc, FAST).run(CMDS)
    expect(out).toMatchObject({ saved: true, rebooted: false })
    expect(sent(fc)).toEqual(CMDS)
    expect(out.responses.find((r) => r.command === 'set craft_name = TEST')?.response).toBe('craft_name set to TEST')
  })

  it('save (4.5.3) → Rebooting 뒤 끊김 = 저장·재부팅', async () => {
    const fc = await fcInCli(firmware('reboot'))
    const out = await new WriteSession(fc, FAST).run([...CMDS.slice(0, -1), 'save'])
    expect(out).toMatchObject({ saved: true, rebooted: true })
  })

  it('###ERROR 가 나오면 그 줄에서 멈추고 save 를 보내지 않는다', async () => {
    const fc = await fcInCli((c) => (c === 'set craft_name = TEST' ? '###ERROR IN set: INVALID NAME: craft_name###' : firmware()(c)))
    const err = await new WriteSession(fc, FAST).run(CMDS).catch((e) => e)
    expect(err).toBeInstanceOf(WriteError)
    expect(err).toMatchObject({ code: 'COMMAND_ERROR', command: 'set craft_name = TEST', saveSent: false })
    expect(sent(fc)).toEqual(CMDS.slice(0, 4))
    expect(sent(fc)).not.toContain('save noreboot')
  })

  it('2025.12+ "Unavailable X" (###ERROR 아님)도 오류로 멈춘다', async () => {
    const fc = await fcInCli((c) => (c === 'feature -GPS' ? 'Unavailable GPS' : firmware()(c)))
    await expect(new WriteSession(fc, FAST).run(CMDS)).rejects.toMatchObject({ code: 'COMMAND_ERROR', command: 'feature -GPS' })
    expect(sent(fc)).toEqual(['batch start', 'feature -GPS'])
  })

  it('줄 응답이 없으면 TIMEOUT, save 안 보냄', async () => {
    const fc = await fcInCli((c) => (c === 'set p_roll = 50' ? { silent: true } : firmware()(c)))
    await expect(new WriteSession(fc, FAST).run(CMDS)).rejects.toMatchObject({ code: 'TIMEOUT', saveSent: false })
    expect(sent(fc)).not.toContain('save noreboot')
  })

  it('전송 중 연결이 끊기면 DISCONNECTED, save 안 보냄', async () => {
    const fc = await fcInCli((c) => (c === 'profile 1' ? { text: '', close: true } : firmware()(c)))
    await expect(new WriteSession(fc, FAST).run(CMDS)).rejects.toMatchObject({ code: 'DISCONNECTED', saveSent: false })
    expect(sent(fc)).not.toContain('save noreboot')
  })

  it('save 가 거부되면 SAVE_FAILED', async () => {
    const fc = await fcInCli((c) =>
      c === 'save noreboot' ? '###ERROR IN save: ERRORS WERE DETECTED - PLEASE REVIEW BEFORE CONTINUING###\r\nPLEASE FIX ERRORS THEN \'SAVE\'' : firmware()(c)
    )
    await expect(new WriteSession(fc, FAST).run(CMDS)).rejects.toMatchObject({ code: 'SAVE_FAILED', saveSent: true })
  })

  it('save noreboot 응답에 saving 이 없으면 저장 안 된 것으로 본다', async () => {
    const fc = await fcInCli((c) => (c === 'save noreboot' ? '' : firmware()(c)))
    await expect(new WriteSession(fc, FAST).run(CMDS)).rejects.toMatchObject({ code: 'SAVE_FAILED' })
  })

  it('save 뒤 응답 없이 끊기면 SAVE_UNKNOWN (적용 여부 모름)', async () => {
    const fc = await fcInCli((c) => (c === 'save' ? { text: '', close: true } : firmware()(c)))
    await expect(new WriteSession(fc, FAST).run([...CMDS.slice(0, -1), 'save'])).rejects.toMatchObject({ code: 'SAVE_UNKNOWN', saveSent: true })
  })
})

describe('차단 명령 (SPEC 12절) — 어떤 경로로도 나가지 않는다', () => {
  const BLOCKED = [
    'defaults',
    'defaults nosave',
    'bl',
    'dfu',
    'flash_erase',
    'resource MOTOR 1 B04',
    'resource list',
    'timer A00 AF1',
    'dma ADC 1 0',
    'msc',
    'serialpassthrough 1 115200',
    'motor 0 1500',
    'play_sound 1',
    'vtx_info',
    'exit',
    'batch end',
    'save\nbl',
    'set craft_name = X\ndefaults',
    'set craft_name = X\rbl',
    'led 0 0,0::C:0',
    'vtxtable bands 5',
    'servo 0 1000 2000 1500 100 -1',
    'mixer CUSTOM',
    'mmix 0 1 0 0 0',
    'adjrange 0 0 0 900 900 0 0 0 0 0',
    'get',
    '#'
  ]

  it.each(BLOCKED)('형식 검사에서 막힘: %j', (c) => {
    expect(isGeneratedCommand(c)).toBe(false)
  })

  it.each(BLOCKED)('run() 에 섞여 있으면 아무것도 보내지 않는다: %j', async (c) => {
    const fc = await fcInCli(firmware())
    await expect(new WriteSession(fc, FAST).run(['batch start', 'set craft_name = A', c, 'save noreboot'])).rejects.toMatchObject({ code: 'NOT_ALLOWED' })
    expect(fc.writes).toEqual([])
  })

  it('순서가 batch start … save 가 아니면 보내지 않는다', async () => {
    const fc = await fcInCli(firmware())
    for (const cmds of [['set craft_name = A', 'save'], ['batch start', 'set craft_name = A'], ['batch start', 'save'], []])
      await expect(new WriteSession(fc, FAST).run(cmds)).rejects.toMatchObject({ code: 'NOT_ALLOWED' })
    expect(fc.writes).toEqual([])
  })
})

describe('응답 오류 판정', () => {
  it.each([
    ['###ERROR IN set: INVALID VALUE###', true],
    ['ERR_CMD_NA: foo', true],
    ['Unavailable OSD', true],
    ['###ERROR IN save: ERRORS WERE DETECTED - PLEASE REVIEW BEFORE CONTINUING###', true],
    ['craft_name set to X', false],
    ['Enabled MOTOR_STOP', false],
    ['aux 0 0 0 1700 2100 0 0', false],
    ['# saving', false]
  ])('%s → 오류 %s', (text, isErr) => {
    expect(responseError(text) !== null).toBe(isErr)
  })
})
