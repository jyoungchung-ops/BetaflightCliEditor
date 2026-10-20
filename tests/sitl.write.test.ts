// SITL 통합 테스트 (5단계: SPEC 11절 쓰기 절차 전체 + 오류 주입) — 평소에는 건너뛴다.
// 실행: scripts/sitl/run-write.ps1 (SITL_TAG 를 넣어 이 파일만 돌림). SITL 은 감시 루프로 띄워 save 재부팅을 흉내 낸다(scripts/sitl/sitl.sh).
// 루프백 TCP(SITL)에만 연결한다. 실제 기체에는 쓰지 않는다.
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { CliReader } from '../src/main/serial/cliReader'
import { openTcpTransport } from '../src/main/serial/tcpTransport'
import type { CliTransport } from '../src/main/serial/transport'
import { WriteFlow, WriteFlowError, type WriteDeps } from '../src/main/serial/writeFlow'
import { buildSnapshot } from '../src/shared/cli/parser'
import type { CraftSnapshot, RawCli } from '../src/shared/cli/types'
import { valueOf, type Edits } from '../src/shared/edit/session'
import { apply, loadSitl, mixedSteps } from './editMix'

const TAG = process.env.SITL_TAG
const TARGET = 'tcp://127.0.0.1:5761'
const dir = mkdtempSync(join(tmpdir(), 'bf-write-'))
afterAll(() => rmSync(dir, { recursive: true, force: true }))

const wsl = (cmd: string) =>
  execFileSync('wsl.exe', ['-d', 'Ubuntu-24.04', '--', 'bash', '-c', cmd], { encoding: 'utf8' }).replace(/\0/g, '').trim()
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** WSL 안에서 열려도 Windows 쪽 포워딩은 조금 늦다 — 될 때까지 */
async function openRetry(): Promise<CliTransport> {
  for (let i = 0; ; i++) {
    try {
      return await openTcpTransport(TARGET)
    } catch (e) {
      if (i > 40) throw e
      await sleep(250)
    }
  }
}
async function freshSitl() {
  wsl(`~/sitl.sh start ${TAG}`)
  ;(await openRetry()).close()
  await sleep(300)
}
/** USB 뽑았다 꽂기 = SITL 프로세스만 다시 (같은 eeprom) — 저장 안 한 값은 사라진다 */
async function powercycle() {
  wsl('~/sitl.sh powercycle')
  ;(await openRetry()).close()
  await sleep(300)
}

/** 앱 리더로 지금 기체를 읽는다 */
async function readNow(): Promise<CraftSnapshot> {
  const t = await openRetry()
  const r = new CliReader(t)
  await r.enterCli()
  const raw = await r.readAll()
  await r.close()
  return buildSnapshot({ craftName: 'now', readAt: '', raw })
}

/** 오류 주입: 쓴 바이트를 기록하고, 필요하면 바꾸거나 끊는다 (테스트 전용 포장) */
function wrap(t: CliTransport, opt: { rewrite?: (s: string) => string; afterWrite?: (s: string) => void; log: string[] }): CliTransport {
  return {
    ...t,
    onData: (cb) => t.onData(cb),
    onClose: (cb) => t.onClose(cb),
    close: () => t.close(),
    async write(d: string) {
      opt.log.push(d)
      await t.write(opt.rewrite ? opt.rewrite(d) : d)
      opt.afterWrite?.(d)
    }
  }
}

function deps(over: Partial<WriteDeps> & { log?: string[] } = {}): WriteDeps {
  const log = over.log ?? []
  return {
    open: async () => wrap(await openRetry(), { log }),
    reopen: async () => openTcpTransport(TARGET).catch(() => null),
    saveDir: async () => dir,
    appVersion: 'test',
    ...over
  }
}

const baseOf = (s: CraftSnapshot): { craftName: string; readAt: string; raw: RawCli } => ({ craftName: s.craftName, readAt: s.readAt, raw: s.raw })
const editList = (e: Edits) => Object.values(e)

describe.runIf(Boolean(TAG))(`SITL ${TAG}: 기체에 쓰기 (SPEC 11절)`, () => {
  const base = loadSitl(TAG!) // 빈 eeprom SITL 을 읽은 원문 = freshSitl() 직후와 같은 상태
  const edits = apply(base, mixedSteps(base)).edits
  const editedKeys = Object.keys(edits)
  const changedFrom = (s: CraftSnapshot) => editedKeys.filter((k) => valueOf(s, k) !== valueOf(base, k))

  it('정상: 백업 → 전송 → save → (재연결) → 재검증 모두 일치, 다시 켜도 값이 남는다', async () => {
    await freshSitl()
    const flow = new WriteFlow(deps())
    const current = await flow.prepare(TARGET)
    expect(buildSnapshot({ craftName: '', readAt: '', raw: current }).meta.firmware).toBe(base.meta.firmware)
    const r = await flow.execute({ base: baseOf(base), edits: editList(edits), overwriteConflicts: false })
    expect(r.mismatches).toEqual([])
    expect(r.status).toBe('ok')
    expect(r.rebooted).toBe(TAG === '4.5.3') // 4.5.4+ 는 save noreboot
    expect(r.commands[0]).toBe('batch start')
    expect(r.commands).not.toContain('batch end')
    expect(existsSync(r.backup.txt) && existsSync(r.backup.json)).toBe(true)
    expect(readFileSync(r.backup.txt, 'utf8')).toContain('batch start')
    expect(readFileSync(r.log, 'utf8')).toMatch(/> set /)

    await powercycle()
    const after = await readNow()
    expect(editedKeys.filter((k) => valueOf(after, k) !== edits[k].after)).toEqual([])
  }, 120_000)

  it('기체가 오류로 답하면 save 없이 멈추고, 다시 켜면 원래 설정 그대로', async () => {
    await freshSitl()
    const log: string[] = []
    // craft_name 줄을 펌웨어가 모르는 이름으로 바꿔 보낸다 → ###ERROR IN set: INVALID NAME
    const flow = new WriteFlow(
      deps({ log, open: async () => wrap(await openRetry(), { log, rewrite: (s) => s.replace(/^set craft_name = /, 'set craft_namex = ') }) })
    )
    await flow.prepare(TARGET)
    const err = await flow.execute({ base: baseOf(base), edits: editList(edits), overwriteConflicts: false }).catch((e) => e)
    expect(err).toBeInstanceOf(WriteFlowError)
    expect(err.failure).toMatchObject({ code: 'COMMAND_ERROR', applied: 'no' })
    expect(err.failure.response).toMatch(/###ERROR/)
    expect(log.some((w) => /^save/.test(w))).toBe(false)
    await powercycle()
    expect(changedFrom(await readNow())).toEqual([])
  }, 120_000)

  it('전송 중 연결이 끊기면 save 없이 멈추고, 다시 켜면 원래 설정 그대로', async () => {
    await freshSitl()
    const log: string[] = []
    let n = 0
    // 다섯 번째 set 을 보낸 직후 기체 쪽에서 끊는다 (SITL 프로세스 종료 = USB 분리)
    const flow = new WriteFlow(
      deps({ log, open: async () => wrap(await openRetry(), { log, afterWrite: (s) => void (/^set /.test(s) && ++n === 5 && wsl('pkill -x betaflight_SITL')) }) })
    )
    await flow.prepare(TARGET)
    const err = await flow.execute({ base: baseOf(base), edits: editList(edits), overwriteConflicts: false }).catch((e) => e)
    expect(err.failure).toMatchObject({ code: 'DISCONNECTED', applied: 'no' })
    expect(log.some((w) => /^save/.test(w))).toBe(false)
    await powercycle()
    expect(changedFrom(await readNow())).toEqual([])
  }, 120_000)

  it('펌웨어가 다르면 쓰지 않는다 (읽기 명령만 나감)', async () => {
    await freshSitl()
    const log: string[] = []
    const flow = new WriteFlow(deps({ log }))
    await flow.prepare(TARGET)
    // 같은 버전, 다른 빌드 (빌드 시각만 다름) — 헤더 전체를 비교해야 막힌다
    const other = { ...baseOf(base), raw: { ...base.raw, version: base.raw.version.replace(/\d\d:\d\d:\d\d/, '00:00:00') } }
    const err = await flow.execute({ base: other, edits: editList(edits), overwriteConflicts: false }).catch((e) => e)
    expect(err.failure).toMatchObject({ code: 'BLOCKED', applied: 'no' })
    expect(err.failure.message).toMatch(/펌웨어\(버전·타깃·빌드\)가 다릅니다/)
    expect(log.map((w) => w.trim())).toEqual(['#', 'version', 'status', 'diff all', 'dump all', 'get'])
  }, 120_000)

  it('원본을 읽은 뒤 기체 값이 바뀌었으면 충돌 → 묻기, "덮기"를 고르면 쓴다', async () => {
    await freshSitl()
    // 편집 원본에서는 craft_name 이 다른 값이었던 것처럼 (원본을 읽은 뒤 누가 기체에서 바꾼 상황)
    const stale = buildSnapshot({ ...baseOf(base), raw: { ...base.raw, dumpAll: base.raw.dumpAll.replace(/^set craft_name = .*$/m, 'set craft_name = OLDNAME') } })
    const e2 = apply(stale, [['master.craft_name', 'NEWNAME'], ...mixedSteps(base).filter(([k]) => k !== 'master.craft_name')]).edits
    const log: string[] = []
    const flow = new WriteFlow(deps({ log }))
    await flow.prepare(TARGET)
    const err = await flow.execute({ base: baseOf(stale), edits: editList(e2), overwriteConflicts: false }).catch((e) => e)
    expect(err.failure.code).toBe('CONFLICT')
    expect(err.failure.conflicts).toEqual([{ key: 'master.craft_name', before: 'OLDNAME', now: base.master.craft_name, after: 'NEWNAME' }])
    expect(log.some((w) => /^(set|save|batch)/.test(w))).toBe(false)

    // 같은 연결에서 "내 편집으로 덮기"
    const r = await flow.execute({ base: baseOf(stale), edits: editList(e2), overwriteConflicts: true })
    expect(r.status).toBe('ok')
    await powercycle()
    expect((await readNow()).master.craft_name).toBe('NEWNAME')
  }, 120_000)
})
