// FC CLI 읽기 절차 (SPEC 3절).
//   '#' → "Entering CLI Mode" + 프롬프트 대기 → version / status / diff all / dump all 순차 실행
// save·exit는 보내지 않는다. 끝나면 포트만 닫고, FC는 CLI 모드에 남는다(재연결 안내 필요).
//
// FC로 쓰는 경로는 send() 하나뿐이며, send()는 화이트리스트를 통과한 명령만 보낸다.

import { READ_COMMANDS, type ReadProgress } from '@shared/serial'
import type { RawCli } from '@shared/cli/types'
import { CliReadError, type CliTransport } from './transport'
import { isAllowedCommand } from './whitelist'

export interface CliReaderOptions {
  onProgress?(p: ReadProgress): void
  /** 프롬프트를 본 뒤 추가 데이터가 없어야 하는 시간 — 주석 줄 "# ..."이 청크 경계에 걸릴 때 오판 방지 */
  quietMs?: number
  enterTimeoutMs?: number
  /** CLI 진입 시도 횟수 (기본 3). 재부팅 뒤 다시 연결할 때는 1 — 응답 없는 연결은 닫고 새로 연다 */
  enterAttempts?: number
  /** 명령별 최대 대기 */
  timeouts?: Record<string, number>
  /** 진행 이벤트 최소 간격 */
  progressIntervalMs?: number
}

const DEFAULT_TIMEOUTS: Record<string, number> = {
  version: 5000,
  status: 5000,
  'diff all': 20000,
  'dump all': 20000,
  // 인수 없는 get: 전체 설정 + 범위 (SITL 1000~1400줄, 0.4초 — 실기체 USB는 더 걸릴 수 있어 넉넉히)
  get: 20000
}
const GET_TIMEOUT = 3000

/** 응답 끝 프롬프트: "\r\n# " (\r 제거 후 "\n# ") */
const endsWithPrompt = (s: string) => /\n# $/.test(s)

/**
 * 응답이 끝났는가. diff all / dump all 은 "# master" 같은 주석 줄이 있어, 조각이 "\n# " 에서 끊긴 채
 * 잠시 멈추면 프롬프트로 오인할 수 있다. 이 둘은 언제나 save 줄로 끝나므로 save + 프롬프트를 기다린다
 * (SITL 4.5.3 에서 같은 판정을 쓰는 테스트 도구의 dump 가 중간에 잘린 일이 있었다).
 */
export function responseComplete(cmd: string, s: string): boolean {
  if (cmd === 'diff all' || cmd === 'dump all') return /\nsave\n[\n# ]*# $/.test(s)
  return endsWithPrompt(s)
}

interface Waiter {
  done(s: string): boolean
  resolve(): void
  reject(e: Error): void
  timer: ReturnType<typeof setTimeout>
  quiet?: ReturnType<typeof setTimeout>
}

export class CliReader {
  private buf = ''
  private lines = 0
  private waiter: Waiter | null = null
  private closed = false
  private disconnected = false
  private current: { command: string; index?: number } | null = null
  private lastProgress = 0
  private readonly opts: Required<Omit<CliReaderOptions, 'onProgress' | 'timeouts'>> &
    Pick<CliReaderOptions, 'onProgress'> & { timeouts: Record<string, number> }

  constructor(
    private readonly transport: CliTransport,
    options: CliReaderOptions = {}
  ) {
    this.opts = {
      onProgress: options.onProgress,
      quietMs: options.quietMs ?? 150,
      enterTimeoutMs: options.enterTimeoutMs ?? 3000,
      enterAttempts: options.enterAttempts ?? 3,
      progressIntervalMs: options.progressIntervalMs ?? 100,
      timeouts: { ...DEFAULT_TIMEOUTS, ...options.timeouts }
    }
    transport.onData((chunk) => this.handleData(chunk))
    transport.onClose((disconnected) => {
      this.closed = true
      this.disconnected = disconnected
      this.waiter?.reject(new CliReadError('DISCONNECTED'))
    })
  }

  /** FC로 쓰는 유일한 함수 */
  private async send(cmd: string): Promise<void> {
    if (!isAllowedCommand(cmd)) throw new CliReadError('NOT_ALLOWED', cmd)
    if (this.closed) throw new CliReadError(this.disconnected ? 'DISCONNECTED' : 'NOT_CONNECTED')
    await this.transport.write(cmd === '#' ? '#' : cmd + '\n')
  }

  private handleData(chunk: string) {
    const text = chunk.replace(/\r/g, '')
    this.buf += text
    for (const ch of text) if (ch === '\n') this.lines++
    this.emitProgress(false)

    const w = this.waiter
    if (!w) return
    if (w.quiet) clearTimeout(w.quiet)
    w.quiet = undefined
    if (w.done(this.buf)) {
      w.quiet = setTimeout(() => {
        if (this.waiter === w && w.done(this.buf)) w.resolve()
      }, this.opts.quietMs)
    }
  }

  private emitProgress(force: boolean) {
    const cb = this.opts.onProgress
    if (!cb || !this.current) return
    const now = Date.now()
    if (!force && now - this.lastProgress < this.opts.progressIntervalMs) return
    this.lastProgress = now
    cb({
      stage: this.current.command === '#' ? 'entering' : 'command',
      command: this.current.command === '#' ? undefined : this.current.command,
      index: this.current.index,
      total: READ_COMMANDS.length,
      lines: this.lines
    })
  }

  /** buf를 비우고 명령을 보낸 뒤 done(buf)가 참이 될 때까지 기다린다 */
  private async run(cmd: string, timeoutMs: number, done: (s: string) => boolean, index?: number): Promise<string> {
    if (this.waiter) throw new CliReadError('SESSION_BUSY')
    this.buf = ''
    this.lines = 0
    this.current = { command: cmd, index }
    this.emitProgress(true)

    let waiter!: Waiter
    const finished = new Promise<void>((resolve, reject) => {
      const w: Waiter = (waiter = {
        done,
        resolve: () => {
          cleanup()
          resolve()
        },
        reject: (e) => {
          cleanup()
          reject(e)
        },
        timer: setTimeout(() => w.reject(new CliReadError('TIMEOUT', cmd)), timeoutMs)
      })
      const cleanup = () => {
        clearTimeout(w.timer)
        if (w.quiet) clearTimeout(w.quiet)
        if (this.waiter === w) this.waiter = null
      }
      this.waiter = w
    })

    try {
      await this.send(cmd)
    } catch (e) {
      waiter.reject(e as Error)
    }
    await finished
    this.emitProgress(true)
    return this.buf
  }

  /** CLI 모드 진입. 응답이 없으면 2번 더 (막 부팅한 기체는 몇 초 동안 '#' 에 답하지 않는다 — SITL 재부팅 직후 실측) */
  async enterCli(): Promise<void> {
    // 이미 CLI 모드인 기체(앞서 읽고 exit 없이 끊음)는 '#' 을 에코만 하고 안내문을 내지 않는다 (SITL·실기체 확인)
    const alreadyInCli = (s: string) => s.trim() === '#'
    const done = (s: string) => (s.includes('Entering CLI Mode') && endsWithPrompt(s)) || alreadyInCli(s)
    for (let attempt = 0; attempt < this.opts.enterAttempts; attempt++) {
      try {
        const out = await this.run('#', this.opts.enterTimeoutMs, done)
        // 빈 줄을 보내면 "#" 한 줄이 주석으로 끝나고 프롬프트가 온다 — 그 뒤로는 새로 들어간 것과 같다
        if (alreadyInCli(out)) await this.run('', this.opts.enterTimeoutMs, endsWithPrompt)
        return
      } catch (e) {
        if (!(e instanceof CliReadError) || e.code !== 'TIMEOUT') throw e
      }
    }
    // 마지막으로 받은 내용 (진단용 — 로그에 남는다)
    throw new CliReadError('CLI_ENTER_FAILED', `받은 내용 ${JSON.stringify(this.buf.slice(-120))}`)
  }

  /** 명령 실행 후 응답 본문(에코 줄과 끝 프롬프트 제외)을 돌려준다 */
  async exec(cmd: string, index?: number): Promise<string> {
    const timeout = this.opts.timeouts[cmd] ?? GET_TIMEOUT
    const out = await this.run(cmd, timeout, (t) => responseComplete(cmd, t), index)
    return cleanResponse(out, cmd)
  }

  /** get <이름> → 값 (없으면 null) */
  async getValue(name: string): Promise<string | null> {
    const out = await this.exec(`get ${name}`)
    const m = new RegExp(`^${name}\\s*=\\s?(.*)$`, 'm').exec(out)
    return m ? m[1].trim() : null
  }

  /** version / status / diff all / dump all 순서로 읽는다 */
  async readAll(): Promise<RawCli> {
    const [version, status, diffAll, dumpAll, get] = [
      await this.exec(READ_COMMANDS[0], 0),
      await this.exec(READ_COMMANDS[1], 1),
      await this.exec(READ_COMMANDS[2], 2),
      await this.exec(READ_COMMANDS[3], 3),
      await this.exec(READ_COMMANDS[4], 4)
    ]
    this.opts.onProgress?.({ stage: 'done', total: READ_COMMANDS.length, lines: 0 })
    return { version, status, diffAll, dumpAll, get }
  }

  async close(): Promise<void> {
    if (this.closed) return
    this.closed = true
    await this.transport.close()
  }
}

/** 첫 줄 에코("dump all")와 끝 프롬프트("# ")를 떼어 낸다 */
export function cleanResponse(out: string, cmd: string): string {
  let s = out.replace(/\n# $/, '\n')
  const nl = s.indexOf('\n')
  const first = (nl < 0 ? s : s.slice(0, nl)).trim()
  if (first === cmd || first === `# ${cmd}`) s = nl < 0 ? '' : s.slice(nl + 1)
  return s.replace(/^\n+/, '').replace(/\n+$/, '\n')
}
