// v2 5단계: 기체에 쓰는 유일한 경로 (SPEC 11절 6·7단계, CLAUDE.md "쓰기 송신은 별도 함수 writeSession 하나로만").
//
// - 보낼 수 있는 것은 buildCommands 가 만드는 형식뿐이다 (isGeneratedCommand). 그 밖은 send() 에서 막힌다.
//   12절 차단 목록(defaults, bl, dfu, flash_erase, resource, timer, dma, msc, serialpassthrough, motor, play_sound, vtx_info …)은
//   그 형식에 들어갈 수 없다 — tests/writeSession.test.ts 가 확인한다.
// - 순서는 batch start → 변경 → save(또는 save noreboot). 줄마다 응답을 검사해 오류면 즉시 멈추고 save 를 보내지 않는다.
//   save 전에 끊기면 기체는 재부팅 뒤 원래 설정으로 돌아간다.
// - CLI 진입('#')과 읽기는 CliReader(읽기 화이트리스트)가 한다. 이 클래스는 이미 CLI 안에 있는 연결에 쓴다.

import { isGeneratedCommand } from '@shared/edit/commands'
import type { CliTransport } from './transport'

/**
 * 오류 응답 (docs/cli-compat.md):
 * - `###ERROR IN <명령>: …###` — 모든 CLI 오류
 * - `ERR_CMD_NA:` — STX/ETX 비대화형 모드의 모르는 명령 (쓰기에는 쓰지 않지만 혹시 섞이면)
 * - `Unavailable X` — 2025.12+ feature: 빌드에 없는 기능. ###ERROR 가 아니라 batch 오류 플래그도 서지 않는다
 * - `ERRORS WERE DETECTED` / `PLEASE FIX ERRORS` — batch 중 오류가 있었던 상태의 save 거부 (2026.6.2)
 */
const ERROR_RESPONSE = /###ERROR|^ERR_CMD_NA:|^Unavailable |ERRORS WERE DETECTED|PLEASE FIX ERRORS/m

export function responseError(response: string): string | null {
  const m = ERROR_RESPONSE.exec(response)
  if (!m) return null
  const line = response.split('\n').find((l) => ERROR_RESPONSE.test(l)) ?? m[0]
  return line.trim()
}

export type WriteErrorCode =
  | 'NOT_ALLOWED' // 만들 수 없는 명령 (버그) — 아무것도 보내지 않음
  | 'COMMAND_ERROR' // 기체가 오류로 답함 — save 안 보냄
  | 'TIMEOUT' // 줄 응답 없음 (2초) — save 안 보냄
  | 'DISCONNECTED' // 연결 끊김 (save 전이면 적용 안 됨)
  | 'SAVE_FAILED' // save 가 거부됨
  | 'SAVE_UNKNOWN' // save 를 보낸 뒤 응답 없이 끊김 — 적용 여부를 모름

export class WriteError extends Error {
  constructor(
    readonly code: WriteErrorCode,
    readonly command?: string,
    readonly response?: string,
    /** save 를 보냈는가 (보냈으면 적용됐을 수 있다) */
    readonly saveSent = false
  ) {
    super(`${code}${command ? `: ${command}` : ''}${response ? ` → ${response}` : ''}`)
    this.name = 'WriteError'
  }
}

export interface WriteSessionOptions {
  /** 줄당 응답 대기 (SPEC 12절: 2초) */
  lineTimeoutMs?: number
  /** save 응답 대기 */
  saveTimeoutMs?: number
  /** 프롬프트 뒤 조용해야 하는 시간 */
  quietMs?: number
  /** 송수신 원문 기록 (쓰기 로그) */
  log?(dir: 'send' | 'recv' | 'info', text: string): void
  onProgress?(done: number, total: number, command: string): void
}

export interface WriteOutcome {
  /** save 를 보냈고 응답이 정상 (noreboot 이면 프롬프트, 아니면 Rebooting 또는 끊김) */
  saved: boolean
  /** 재부팅했는가 (save) — 그렇다면 다시 연결해야 한다 */
  rebooted: boolean
  responses: { command: string; response: string }[]
}

export class WriteSession {
  private buf = ''
  private closed = false
  private wake: (() => void) | null = null
  private readonly opts: Required<Omit<WriteSessionOptions, 'log' | 'onProgress'>> & Pick<WriteSessionOptions, 'log' | 'onProgress'>

  constructor(
    private readonly transport: CliTransport,
    options: WriteSessionOptions = {}
  ) {
    this.opts = {
      lineTimeoutMs: options.lineTimeoutMs ?? 2000,
      saveTimeoutMs: options.saveTimeoutMs ?? 8000,
      quietMs: options.quietMs ?? 60,
      log: options.log,
      onProgress: options.onProgress
    }
    transport.onData((chunk) => {
      const t = chunk.replace(/\r/g, '')
      this.buf += t
      this.opts.log?.('recv', t)
      this.wake?.()
    })
    transport.onClose(() => {
      this.closed = true
      this.opts.log?.('info', '연결 끊김')
      this.wake?.()
    })
  }

  /** FC 로 쓰는 유일한 함수 (쓰기 경로). 만든 형식의 명령만 보낸다 */
  private async send(cmd: string): Promise<void> {
    if (!isGeneratedCommand(cmd)) throw new WriteError('NOT_ALLOWED', cmd)
    if (this.closed) throw new WriteError('DISCONNECTED', cmd)
    this.buf = ''
    this.opts.log?.('send', cmd)
    await this.transport.write(cmd + '\n')
  }

  /** 프롬프트("\n# ")가 오고 조용해질 때까지. until 이 참이면 바로 끝 (save 의 Rebooting 등) */
  private waitResponse(timeoutMs: number, until?: (s: string) => boolean): Promise<'prompt' | 'until' | 'closed' | 'timeout'> {
    return new Promise((resolve) => {
      let quiet: ReturnType<typeof setTimeout> | undefined
      const finish = (r: 'prompt' | 'until' | 'closed' | 'timeout') => {
        clearTimeout(timer)
        clearTimeout(quiet)
        this.wake = null
        resolve(r)
      }
      const timer = setTimeout(() => finish('timeout'), timeoutMs)
      const check = () => {
        if (until?.(this.buf)) return finish('until')
        if (this.closed) return finish('closed')
        clearTimeout(quiet)
        if (/\n# $/.test(this.buf)) quiet = setTimeout(() => /\n# $/.test(this.buf) && finish('prompt'), this.opts.quietMs)
      }
      this.wake = check
      check()
    })
  }

  /**
   * 명령을 순서대로 보낸다. commands 는 buildCommands 결과 그대로: batch start … save | save noreboot.
   * 실패하면 WriteError (saveSent 로 save 를 보냈는지 알려 줌).
   */
  async run(commands: string[]): Promise<WriteOutcome> {
    const last = commands.at(-1)
    if (commands[0] !== 'batch start' || (last !== 'save' && last !== 'save noreboot') || commands.length < 3)
      throw new WriteError('NOT_ALLOWED', '명령 순서가 batch start … save 가 아닙니다')
    const bad = commands.find((c) => !isGeneratedCommand(c))
    if (bad !== undefined) throw new WriteError('NOT_ALLOWED', bad) // 하나라도 이상하면 아무것도 보내지 않는다

    const responses: WriteOutcome['responses'] = []
    const body = commands.slice(0, -1)
    for (const [i, cmd] of body.entries()) {
      this.opts.onProgress?.(i, commands.length, cmd)
      await this.send(cmd)
      const r = await this.waitResponse(this.opts.lineTimeoutMs)
      const response = this.responseBody(cmd)
      responses.push({ command: cmd, response })
      if (r === 'closed') throw new WriteError('DISCONNECTED', cmd, response)
      if (r === 'timeout') throw new WriteError('TIMEOUT', cmd, response)
      const err = responseError(response)
      if (err) throw new WriteError('COMMAND_ERROR', cmd, err)
    }

    // save: 4.5.4+ noreboot 은 "# saving" 뒤 프롬프트, save 는 "Rebooting" 뒤 끊김
    const save = last
    this.opts.onProgress?.(body.length, commands.length, save)
    await this.send(save)
    const rebootSeen = (s: string) => /Rebooting/.test(s)
    const r = await this.waitResponse(this.opts.saveTimeoutMs, save === 'save' ? rebootSeen : undefined)
    const response = this.responseBody(save)
    responses.push({ command: save, response })
    const err = responseError(response)
    if (err) throw new WriteError('SAVE_FAILED', save, err, true)
    if (save === 'save noreboot') {
      if (r === 'prompt' && /saving/i.test(response)) return { saved: true, rebooted: false, responses }
      if (r === 'closed') throw new WriteError('SAVE_UNKNOWN', save, response, true)
      if (r === 'timeout') throw new WriteError('SAVE_UNKNOWN', save, response, true)
      // 프롬프트는 왔는데 saving 이 없다 = 저장 안 됨
      throw new WriteError('SAVE_FAILED', save, response || '(응답 없음)', true)
    }
    if (r === 'until' || (r === 'closed' && /saving/i.test(response))) return { saved: true, rebooted: true, responses }
    throw new WriteError('SAVE_UNKNOWN', save, response, true)
  }

  /** 받은 원문에서 에코 줄과 끝 프롬프트를 뺀 본문 */
  private responseBody(cmd: string): string {
    const lines = this.buf.split('\n')
    if (lines[0]?.trim() === cmd) lines.shift()
    while (lines.length && /^(# ?)?$/.test(lines.at(-1)!.trim())) lines.pop()
    return lines.join('\n').trim()
  }
}
