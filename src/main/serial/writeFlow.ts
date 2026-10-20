// v2 5단계: 기체에 쓰기 절차 (SPEC 11절). Electron 과 무관하게 만들어 SITL 통합 테스트에서 그대로 돌린다.
//
//   prepare : 연결 → CLI 진입 → version/status/diff all/dump all/get 읽기 (읽기 화이트리스트) — 연결은 열어 둔다
//   execute : 일치 검사(메인에서 다시) → 자동 백업 → writeSession 전송 → save → (재연결) → 다시 읽기 → 재검증
//   cancel  : save 없이 연결 종료
//   verify  : [재검증] — 다시 연결해 읽고 대조만 (쓰지 않음)
//
// 어느 단계든 실패하면 save 없이 연결을 끊는다. 명령은 렌더러가 아니라 여기서 buildCommands 로 만든다.

import { mkdir, writeFile, appendFile } from 'node:fs/promises'
import { join } from 'node:path'
import { buildSnapshot } from '@shared/cli/parser'
import type { CraftSnapshot, RawCli } from '@shared/cli/types'
import { buildCommands } from '@shared/edit/commands'
import { editsFromJson, type Edits } from '@shared/edit/session'
import { checkBeforeWrite, verifyAfterWrite, type Conflict, type Mismatch } from '@shared/edit/writePlan'
import { sanitizeFileName, toSavedFile } from '@shared/files'
import type { ReadProgress } from '@shared/serial'
import { CliReader } from './cliReader'
import { CliReadError, type CliTransport } from './transport'
import { WriteError, WriteSession, type WriteErrorCode } from './writeSession'

export interface WriteDeps {
  open(path: string): Promise<CliTransport>
  /**
   * save 로 재부팅한 뒤 같은 기체를 다시 찾아 연다 (COM 번호가 바뀔 수 있음 — VID/PID·시리얼 번호로).
   * 없으면 null. 호출하는 쪽이 15초 동안 되풀이한다.
   */
  reopen(path: string): Promise<CliTransport | null>
  saveDir(): Promise<string>
  appVersion: string
  now?(): Date
  sleep?(ms: number): Promise<void>
  /** 테스트용: 리더·쓰기 시간 제한 */
  readerTimeouts?: Record<string, number>
  lineTimeoutMs?: number
  reconnectMs?: number
}

export type WriteFlowErrorCode =
  | 'NOT_PREPARED'
  | 'BLOCKED'
  | 'CONFLICT'
  | 'BACKUP_FAILED'
  | 'READ_FAILED'
  | 'RECONNECT_FAILED'
  | WriteErrorCode

/** 기체에 적용됐는가: no = save 전 실패(재부팅하면 원래대로), unknown = save 뒤 확인 못 함 */
export type Applied = 'no' | 'unknown'

export interface WriteFailure {
  code: WriteFlowErrorCode
  message: string
  applied: Applied
  command?: string
  response?: string
  conflicts?: Conflict[]
  blockers?: string[]
  backup?: BackupPaths
  log?: string
}

export class WriteFlowError extends Error {
  constructor(readonly failure: WriteFailure) {
    super(failure.message)
    this.name = 'WriteFlowError'
  }
}

export interface BackupPaths {
  txt: string
  json: string
}

export interface WriteRequest {
  /** 편집 원본 (화면이 가진 것) */
  base: { craftName: string; readAt: string; raw: RawCli }
  edits: unknown
  /** 충돌이 있어도 내 편집으로 덮는다 (사용자가 고름) */
  overwriteConflicts: boolean
}

export interface WriteResult {
  status: 'ok' | 'mismatch'
  /** 쓴 뒤 다시 읽은 원문 — 성공이면 새 편집 원본 */
  afterRaw: RawCli
  mismatches: Mismatch[]
  commands: string[]
  rebooted: boolean
  backup: BackupPaths
  log: string
}

export type WriteProgress =
  | { stage: 'read'; read: ReadProgress }
  | { stage: 'backup' }
  | { stage: 'send'; done: number; total: number; command: string }
  | { stage: 'reconnect' }
  | { stage: 'verify'; read: ReadProgress }

const p2 = (n: number) => String(n).padStart(2, '0')
const stampSec = (d: Date) => `${d.getFullYear()}${p2(d.getMonth() + 1)}${p2(d.getDate())}-${p2(d.getHours())}${p2(d.getMinutes())}${p2(d.getSeconds())}`
const day = (d: Date) => `${d.getFullYear()}${p2(d.getMonth() + 1)}${p2(d.getDate())}`

export const MESSAGES = {
  notApplied: '쓰기가 적용되지 않았습니다(save 전에 멈춤). 기체 USB를 뽑았다 다시 꽂으면 원래 설정으로 돌아갑니다.',
  unknown: 'save 를 보낸 뒤 확인하지 못해 적용 여부를 알 수 없습니다. 기체를 다시 연결해 [재검증]하세요.'
}

export class WriteFlow {
  private transport: CliTransport | null = null
  private reader: CliReader | null = null
  private path = ''
  private current: RawCli | null = null
  private logPath = ''
  private busy = false

  constructor(private readonly deps: WriteDeps) {}

  private now = () => this.deps.now?.() ?? new Date()
  private sleep = (ms: number) => this.deps.sleep?.(ms) ?? new Promise<void>((r) => setTimeout(r, ms))

  private async log(dir: 'send' | 'recv' | 'info', text: string) {
    if (!this.logPath) return
    const t = this.now().toISOString()
    const body = dir === 'recv' ? text.replace(/\n/g, '\n  < ') : text
    await appendFile(this.logPath, `${t} ${dir === 'send' ? '>' : dir === 'recv' ? '<' : '#'} ${body}\n`, 'utf8').catch(() => {})
  }

  private async openLog() {
    const dir = join(await this.deps.saveDir(), 'logs')
    await mkdir(dir, { recursive: true })
    this.logPath = join(dir, `write_${day(this.now())}.log`)
  }

  private newReader(transport: CliTransport, onRead?: (p: ReadProgress) => void) {
    return new CliReader(transport, {
      onProgress: onRead,
      ...(this.deps.readerTimeouts ? { timeouts: this.deps.readerTimeouts } : {})
    })
  }

  /** 11절 2단계: 연결과 현재 설정 읽기 (연결은 열어 둔다) */
  async prepare(path: string, onProgress?: (p: WriteProgress) => void): Promise<RawCli> {
    await this.cancel()
    await this.openLog()
    await this.log('info', `=== 쓰기 준비: ${path}`)
    this.path = path
    try {
      this.transport = await this.deps.open(path)
      this.reader = this.newReader(this.transport, (read) => onProgress?.({ stage: 'read', read }))
      await this.reader.enterCli()
      this.current = await this.reader.readAll()
      await this.log('info', `읽기 완료: ${this.current.version.split('\n')[0] ?? ''}`)
      return this.current
    } catch (e) {
      await this.log('info', `읽기 실패: ${(e as Error).message}`)
      await this.cancel()
      throw e
    }
  }

  /** save 없이 연결을 닫는다 */
  async cancel(): Promise<void> {
    const t = this.transport
    this.transport = null
    this.reader = null
    this.current = null
    if (t) {
      await this.log('info', '연결 닫음 (save 없음)')
      await t.close().catch(() => {})
    }
  }

  private fail(f: Omit<WriteFailure, 'log'>): never {
    throw new WriteFlowError({ ...f, log: this.logPath || undefined })
  }

  /** 11절 3~9단계 */
  async execute(req: WriteRequest, onProgress?: (p: WriteProgress) => void): Promise<WriteResult> {
    if (this.busy) this.fail({ code: 'NOT_PREPARED', message: '이미 쓰는 중입니다.', applied: 'no' })
    if (!this.transport || !this.reader || !this.current) this.fail({ code: 'NOT_PREPARED', message: '먼저 기체를 연결해 읽어야 합니다.', applied: 'no' })
    this.busy = true
    try {
      return await this.executeInner(req, onProgress)
    } finally {
      this.busy = false
    }
  }

  private async executeInner(req: WriteRequest, onProgress?: (p: WriteProgress) => void): Promise<WriteResult> {
    const transport = this.transport!
    const base = buildSnapshot({ craftName: req.base.craftName, readAt: req.base.readAt, raw: req.base.raw })
    const current = buildSnapshot({ craftName: req.base.craftName, readAt: this.now().toISOString(), raw: this.current! })
    const edits: Edits = editsFromJson(req.edits)

    // 3. 일치 검사 (화면에서도 했지만 여기서 다시 — 메인이 기준)
    const check = checkBeforeWrite(base, current, edits)
    if (check.blockers.length) {
      await this.cancel()
      this.fail({ code: 'BLOCKED', message: check.blockers.join('\n'), applied: 'no', blockers: check.blockers })
    }
    if (check.conflicts.length && !req.overwriteConflicts) {
      // 연결은 열어 둔다: 사용자가 "내 편집으로 덮기"를 고르면 같은 연결로 이어서 쓴다 (취소 = cancel)
      this.fail({ code: 'CONFLICT', message: '원본을 읽은 뒤 기체 설정이 바뀌었습니다.', applied: 'no', conflicts: check.conflicts })
    }
    let commands: string[]
    try {
      commands = buildCommands(base, edits, { noreboot: check.support.noreboot })
    } catch (e) {
      await this.cancel()
      this.fail({ code: 'BLOCKED', message: (e as Error).message, applied: 'no' })
    }

    // 4. 자동 백업 (쓰기 직전에 읽은 값). 실패하면 중단
    onProgress?.({ stage: 'backup' })
    let backup: BackupPaths
    try {
      const dir = join(await this.deps.saveDir(), 'backups')
      await mkdir(dir, { recursive: true })
      const stem = `${sanitizeFileName(req.base.craftName)}_${stampSec(this.now())}_before-write`
      backup = { txt: join(dir, `${stem}.txt`), json: join(dir, `${stem}.bfview.json`) }
      await writeFile(backup.txt, current.raw.diffAll.replace(/\r?\n/g, '\r\n'), 'utf8')
      await writeFile(backup.json, JSON.stringify(toSavedFile(current, this.deps.appVersion), null, 2), 'utf8')
      await this.log('info', `백업: ${backup.txt}`)
    } catch (e) {
      await this.cancel()
      this.fail({ code: 'BACKUP_FAILED', message: `백업을 저장하지 못해 쓰지 않았습니다: ${(e as Error).message}`, applied: 'no' })
    }

    // 6~7. 전송 + save
    await this.log('info', `전송 시작: 명령 ${commands.length}줄 (편집 ${Object.keys(edits).length}개${check.conflicts.length ? `, 충돌 ${check.conflicts.length}개 덮어씀` : ''})`)
    const session = new WriteSession(transport, {
      lineTimeoutMs: this.deps.lineTimeoutMs,
      log: (d, t) => void this.log(d, t),
      onProgress: (done, total, command) => onProgress?.({ stage: 'send', done, total, command })
    })
    let rebooted: boolean
    try {
      const out = await session.run(commands)
      rebooted = out.rebooted
      await this.log('info', rebooted ? 'save 완료 — 재부팅' : 'save noreboot 완료')
    } catch (e) {
      await this.cancel()
      if (e instanceof WriteError) {
        const applied: Applied = e.saveSent ? 'unknown' : 'no'
        const what =
          e.code === 'COMMAND_ERROR' ? `기체가 오류로 답했습니다: ${e.command} → ${e.response}` :
          e.code === 'TIMEOUT' ? `기체 응답이 2초 안에 오지 않았습니다: ${e.command}` :
          e.code === 'DISCONNECTED' ? '전송 중 연결이 끊겼습니다.' :
          e.code === 'SAVE_FAILED' ? `기체가 저장을 거부했습니다: ${e.response}` :
          e.code === 'NOT_ALLOWED' ? `만들 수 없는 명령이라 보내지 않았습니다: ${e.command}` : '저장 응답을 받지 못했습니다.'
        await this.log('info', `실패: ${e.message}`)
        // 저장 거부는 save 가 적용되지 않은 것 (펌웨어가 거부)
        const appliedFinal: Applied = e.code === 'SAVE_FAILED' ? 'no' : applied
        this.fail({
          code: e.code,
          message: `${what}\n${appliedFinal === 'no' ? MESSAGES.notApplied : MESSAGES.unknown}`,
          applied: appliedFinal,
          command: e.command,
          response: e.response,
          backup
        })
      }
      throw e
    }

    // 7~8. (재부팅이면 다시 연결) → 다시 읽어 대조
    let afterRaw: RawCli
    try {
      afterRaw = await this.readAgain(rebooted, onProgress)
    } catch (e) {
      await this.cancel()
      const f = e instanceof WriteFlowError ? e.failure : null
      this.fail({
        code: f?.code ?? 'READ_FAILED',
        message: `${f?.message ?? `다시 읽지 못했습니다: ${(e as Error).message}`}\n${MESSAGES.unknown}`,
        applied: 'unknown',
        backup
      })
    }
    await this.cancel()
    const after = buildSnapshot({ craftName: req.base.craftName, readAt: this.now().toISOString(), raw: afterRaw })
    const mismatches = verifyAfterWrite(current, after, edits)
    await this.log('info', mismatches.length ? `재검증 불일치 ${mismatches.length}개: ${mismatches.map((m) => m.key).join(', ')}` : '재검증: 모두 일치')
    return { status: mismatches.length ? 'mismatch' : 'ok', afterRaw, mismatches, commands, rebooted, backup, log: this.logPath }
  }

  /** save 뒤: noreboot 이면 같은 연결, 재부팅이면 15초 안에 다시 찾아 연결 */
  private async readAgain(rebooted: boolean, onProgress?: (p: WriteProgress) => void): Promise<RawCli> {
    const onRead = (read: ReadProgress) => onProgress?.({ stage: 'verify', read })
    if (!rebooted) {
      const reader = this.newReader(this.transport!, onRead)
      return reader.readAll()
    }
    onProgress?.({ stage: 'reconnect' })
    await this.transport?.close().catch(() => {})
    this.transport = null
    const transport = await this.reconnect()
    this.transport = transport
    const reader = this.newReader(transport, onRead)
    return reader.readAll()
  }

  /** 재부팅한 기체를 다시 찾아 CLI 에 들어간다 (최대 15초) */
  private async reconnect(): Promise<CliTransport> {
    const until = Date.now() + (this.deps.reconnectMs ?? 15000)
    await this.sleep(1000) // 재부팅 시작 전에 다시 붙지 않게
    let lastErr = ''
    while (Date.now() < until) {
      const t = await this.deps.reopen(this.path).catch((e: Error) => ((lastErr = e.message), null))
      if (t) {
        try {
          await this.newReader(t).enterCli()
          await this.log('info', '다시 연결함')
          return t
        } catch (e) {
          lastErr = (e as Error).message
          await t.close().catch(() => {})
        }
      }
      await this.sleep(500)
    }
    await this.log('info', `다시 연결 실패: ${lastErr}`)
    throw new WriteFlowError({ code: 'RECONNECT_FAILED', message: '재부팅한 기체를 15초 안에 다시 찾지 못했습니다.', applied: 'unknown' })
  }

  /** [재검증]: 다시 연결해 읽고, 편집한 값이 들어갔는지만 본다 (쓰지 않음) */
  async verify(path: string, req: { base: WriteRequest['base']; edits: unknown }, onProgress?: (p: WriteProgress) => void): Promise<{ afterRaw: RawCli; mismatches: Mismatch[] }> {
    await this.cancel()
    await this.openLog()
    await this.log('info', `=== 재검증: ${path}`)
    const edits = editsFromJson(req.edits)
    try {
      this.transport = await this.deps.open(path)
      const reader = this.newReader(this.transport, (read) => onProgress?.({ stage: 'verify', read }))
      await reader.enterCli()
      const afterRaw = await reader.readAll()
      const after = buildSnapshot({ craftName: req.base.craftName, readAt: this.now().toISOString(), raw: afterRaw })
      const mismatches = verifyAfterWrite(buildSnapshot({ ...req.base, raw: req.base.raw }), after, edits).filter((m) => m.edited)
      await this.log('info', mismatches.length ? `재검증 불일치 ${mismatches.length}개` : '재검증: 편집 모두 반영됨')
      return { afterRaw, mismatches }
    } finally {
      await this.cancel()
    }
  }
}

export const isCliReadError = (e: unknown): e is CliReadError => e instanceof CliReadError
