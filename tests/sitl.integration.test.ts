// SITL 통합 테스트 — 평소에는 건너뛴다. 실행: scripts/sitl/run.ps1 (SITL 을 띄우고 SITL_TAG 를 넣어 이 파일만 돌림)
// 앱의 CliReader(읽기 화이트리스트) + 개발용 TCP 전송으로 SITL 을 읽고, 원문을 fixtures/sitl-<버전>/ 에 저장한다.
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { CliReader } from '../src/main/serial/cliReader'
import { openTcpTransport } from '../src/main/serial/tcpTransport'
import { buildSnapshot } from '../src/shared/cli/parser'

const TAG = process.env.SITL_TAG
const TARGET = process.env.SITL_TARGET ?? 'tcp://127.0.0.1:5761'

describe.runIf(Boolean(TAG))(`SITL ${TAG}: 앱 리더로 읽기`, () => {
  it('# 진입 → get craft_name → version / status / diff all / dump all', async () => {
    const transport = await openTcpTransport(TARGET)
    const writes: string[] = []
    const orig = transport.write
    transport.write = (d) => (writes.push(d), orig(d))
    const reader = new CliReader(transport, { timeouts: { version: 5000, status: 5000, 'diff all': 20000, 'dump all': 30000 } })
    const t0 = Date.now()
    await reader.enterCli()
    const craftName = await reader.getValue('craft_name')
    const raw = await reader.readAll()
    const ms = Date.now() - t0
    await reader.close()

    const dir = join(__dirname, '..', 'fixtures', `sitl-${TAG}`)
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'version.txt'), raw.version)
    writeFileSync(join(dir, 'status.txt'), raw.status)
    writeFileSync(join(dir, 'diff.txt'), raw.diffAll)
    writeFileSync(join(dir, 'dump.txt'), raw.dumpAll)

    const snap = buildSnapshot({ craftName: craftName || `SITL ${TAG}`, readAt: new Date().toISOString(), raw })
    const result = {
      tag: TAG,
      ms,
      writes,
      craftName,
      firmware: snap.meta.firmware,
      target: snap.meta.target,
      lines: { version: raw.version.split('\n').length, status: raw.status.split('\n').length, diff: raw.diffAll.split('\n').length, dump: raw.dumpAll.split('\n').length },
      master: Object.keys(snap.master).length,
      pidProfiles: snap.pidProfiles.length,
      rateProfiles: snap.rateProfiles.length,
      serial: snap.serial.map((s) => s.name ?? s.id),
      unknown: snap.unknown
    }
    writeFileSync(join(dir, 'read-result.json'), JSON.stringify(result, null, 2))

    // 화이트리스트 밖 문자열을 보내지 않았다
    expect(writes).toEqual(['#', 'get craft_name\n', 'version\n', 'status\n', 'diff all\n', 'dump all\n'])
    expect(snap.meta.version).toBe(TAG)
    expect(Object.keys(snap.master).length).toBeGreaterThan(100) // SITL 은 OSD·GPS·VTX 등이 빠져 실기체보다 적다
    expect(snap.pidProfiles.length).toBeGreaterThan(0)
  }, 90_000)
})
