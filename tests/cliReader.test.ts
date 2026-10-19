import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'
import { CliReader, cleanResponse } from '../src/main/serial/cliReader'
import { isAllowedCommand } from '../src/main/serial/whitelist'
import { CliReadError, type CliTransport } from '../src/main/serial/transport'
import { buildSnapshot } from '../src/shared/cli/parser'
import type { ReadProgress } from '../src/shared/serial'
import { FakeFc, type FakeFcOptions } from './fakeFc'

const SAMPLE = join(__dirname, '..', 'fixtures', 'sample')
const read = (f: string) => readFileSync(join(SAMPLE, f), 'utf8')

const RESPONSES = {
  version: read('meteor75-pro.version.txt'),
  status: read('meteor75-pro.status.txt'),
  'diff all': read('meteor75-pro.diff.txt'),
  'dump all': read('meteor75-pro.dump.txt'),
  'get:craft_name': 'Meteor75 Pro'
}

const FAST = { quietMs: 15, enterTimeoutMs: 300, timeouts: { version: 500, status: 500, 'diff all': 2000, 'dump all': 2000 } }

function setup(opts: Partial<FakeFcOptions> = {}, progress?: (p: ReadProgress) => void) {
  const fc = new FakeFc({ responses: RESPONSES, ...opts })
  const reader = new CliReader(fc, { ...FAST, onProgress: progress, progressIntervalMs: 0 })
  return { fc, reader }
}

const norm = (s: string) => s.replace(/\r/g, '').trim()

describe('명령 화이트리스트', () => {
  it.each(['#', 'version', 'status', 'diff all', 'dump all', 'get craft_name', 'get osd_vbat_pos'])('허용: %s', (c) => {
    expect(isAllowedCommand(c)).toBe(true)
  })

  it.each([
    'save',
    'exit',
    'defaults',
    'defaults nosave',
    'set craft_name = x',
    'bl',
    'dfu',
    'flash_erase',
    'reboot',
    'msc',
    'feature -OSD',
    'aux 0 0 0 900 900 0 0',
    'dump',
    'diff',
    'dump all\nsave',
    'version\n',
    'get craft_name\nsave',
    'get craft_name; save',
    'get craft name',
    'get ',
    'get',
    'GET craft_name',
    ' version',
    '##',
    ''
  ])('거부: %j', (c) => {
    expect(isAllowedCommand(c)).toBe(false)
  })

  it('허용 안 된 명령은 FC에 한 글자도 쓰지 않는다', async () => {
    const { fc, reader } = setup()
    await reader.enterCli()
    fc.writes.length = 0
    for (const cmd of ['save', 'set small_angle = 180', 'exit', 'get x\nsave']) {
      await expect(reader.exec(cmd)).rejects.toMatchObject({ code: 'NOT_ALLOWED' })
    }
    expect(fc.writes).toEqual([])
  })
})

describe('CLI 읽기 절차', () => {
  it('진입 → 이름 → 4개 명령, 보낸 문자열은 정해진 순서뿐', async () => {
    const events: ReadProgress[] = []
    const { fc, reader } = setup({ chunkSize: 97 }, (p) => events.push(p))
    await reader.enterCli()
    expect(await reader.getValue('craft_name')).toBe('Meteor75 Pro')
    const raw = await reader.readAll()
    await reader.close()

    expect(fc.writes).toEqual(['#', 'get craft_name\n', 'version\n', 'status\n', 'diff all\n', 'dump all\n'])
    for (const w of fc.writes) expect(isAllowedCommand(w.replace(/\n$/, ''))).toBe(true)
    expect(fc.closed).toBe(true)

    expect(norm(raw.version)).toBe(norm(RESPONSES.version))
    expect(norm(raw.status)).toBe(norm(RESPONSES.status))
    expect(norm(raw.diffAll)).toBe(norm(RESPONSES['diff all']))
    expect(norm(raw.dumpAll)).toBe(norm(RESPONSES['dump all']))

    const snap = buildSnapshot({ craftName: 'Meteor75 Pro', readAt: '', raw })
    expect(snap.meta.firmware).toBe('Betaflight 4.5.1')
    expect(snap.unknown).toEqual([])

    // 진행 이벤트: 명령 0~3 순서, 수신 줄 수 증가, 마지막 done
    const indices = [...new Set(events.filter((e) => e.stage === 'command' && e.index !== undefined).map((e) => e.index))]
    expect(indices).toEqual([0, 1, 2, 3])
    const dumpLines = events.filter((e) => e.index === 3).map((e) => e.lines)
    expect(Math.max(...dumpLines)).toBeGreaterThan(1000)
    expect(events.at(-1)?.stage).toBe('done')
  })

  it('청크가 주석 줄 "# "에서 끊겨도 응답을 끝까지 받는다', async () => {
    // 청크 크기 1: 모든 "\n# " 주석 경계에서 프롬프트처럼 보이는 순간이 생긴다
    const { reader } = setup({ chunkSize: 1, responses: { ...RESPONSES, 'diff all': RESPONSES['diff all'] } })
    await reader.enterCli()
    const diff = await reader.exec('diff all')
    expect(norm(diff)).toBe(norm(RESPONSES['diff all']))
  }, 20000)

  it('CLI 진입은 1회 재시도한다', async () => {
    const { fc, reader } = setup({ ignoreHashes: 1 })
    await reader.enterCli()
    expect(fc.writes).toEqual(['#', '#'])
  })

  it('두 번 모두 응답이 없으면 CLI_ENTER_FAILED', async () => {
    const { fc, reader } = setup({ ignoreHashes: 5 })
    await expect(reader.enterCli()).rejects.toMatchObject({ code: 'CLI_ENTER_FAILED' })
    expect(fc.writes).toEqual(['#', '#'])
  })

  it('응답이 멈추면 TIMEOUT', async () => {
    const { reader } = setup({ chunkSize: 64, stallDuring: { command: 'dump all', afterChunks: 10 } })
    await reader.enterCli()
    await expect(reader.exec('dump all')).rejects.toMatchObject({ code: 'TIMEOUT' })
  })

  it('읽는 중 USB가 빠지면 DISCONNECTED, 이후 송신도 막힌다', async () => {
    const { fc, reader } = setup({ chunkSize: 64, disconnectDuring: { command: 'dump all', afterChunks: 20 } })
    await reader.enterCli()
    await expect(reader.readAll()).rejects.toMatchObject({ code: 'DISCONNECTED' })
    const before = fc.writes.length
    await expect(reader.exec('version')).rejects.toBeInstanceOf(CliReadError)
    expect(fc.writes.length).toBe(before)
  })
})

describe('cleanResponse', () => {
  it('에코와 끝 프롬프트 제거', () => {
    expect(cleanResponse('version\n# Betaflight / X\n\n# ', 'version')).toBe('# Betaflight / X\n')
    expect(cleanResponse('\nset a = 1\n# ', 'get a')).toBe('set a = 1\n')
  })
})

describe('FC 쓰기 경로 (소스 검사)', () => {
  const SRC = join(__dirname, '..', 'src')
  const files = (dir: string): string[] =>
    readdirSync(dir).flatMap((f) => {
      const p = join(dir, f)
      return statSync(p).isDirectory() ? files(p) : /\.tsx?$/.test(f) ? [p] : []
    })
  const sources = files(SRC).map((p) => ({ path: relative(SRC, p).replace(/\\/g, '/'), text: readFileSync(p, 'utf8') }))

  it('시리얼 write 호출은 송신 함수와 포트 어댑터에만 있다', () => {
    const hits = sources.flatMap((s) =>
      [...s.text.matchAll(/\.write\s*\(/g)].map(() => s.path)
    )
    expect(hits.sort()).toEqual(['main/serial/cliReader.ts', 'main/serial/serialTransport.ts'])
  })

  it('cliReader의 transport.write는 send() 안 한 곳뿐이고 그 앞에서 화이트리스트를 검사한다', () => {
    const src = sources.find((s) => s.path === 'main/serial/cliReader.ts')!.text
    expect(src.match(/transport\.write\(/g)).toHaveLength(1)
    const send = /private async send\(cmd: string\)[^]*?\n {2}\}/.exec(src)![0]
    expect(send).toMatch(/isAllowedCommand\(cmd\)[^]*transport\.write/)
  })

  it('serialport는 메인 프로세스의 어댑터에서만 import 한다', () => {
    const importers = sources.filter((s) => /from 'serialport'/.test(s.text)).map((s) => s.path)
    expect(importers).toEqual(['main/serial/serialTransport.ts'])
  })

  it('IPC로 임의 명령을 실행할 수 없다 (exec를 직접 부르지 않음)', () => {
    const ipc = sources.find((s) => s.path === 'main/serial/ipc.ts')!.text
    expect(ipc).not.toMatch(/\.exec\(/)
    expect(ipc).not.toMatch(/getValue\((?!'craft_name'\))/)
  })
})

// 타입 확인용: FakeFc가 CliTransport를 구현
const _t: CliTransport = new FakeFc({ responses: {} })
void _t
