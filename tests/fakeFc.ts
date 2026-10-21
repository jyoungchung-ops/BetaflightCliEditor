// 테스트용 가짜 FC. Betaflight CLI처럼 '#'로 CLI에 들어가고, 입력을 에코하고, 응답 끝에 "\r\n# " 프롬프트를 낸다.

import type { CliTransport } from '../src/main/serial/transport'

export interface FakeFcOptions {
  responses: Record<string, string>
  /** 처음 n번의 '#'은 무시 (CLI 진입 재시도 테스트) */
  ignoreHashes?: number
  /** 응답을 이 크기로 잘라 보낸다 */
  chunkSize?: number
  /** 이 명령 응답을 보내는 중 n번째 청크 뒤에 USB 분리 */
  disconnectDuring?: { command: string; afterChunks: number }
  /** 이 명령 응답을 n번째 청크까지만 보내고 멈춤 */
  stallDuring?: { command: string; afterChunks: number }
  /** 쓰기 명령 응답 (writeSession 테스트). 문자열 = 응답 본문, close = 응답 뒤 연결 끊김(재부팅), silent = 응답 없음 */
  handler?: (cmd: string) => string | { text: string; close: true } | { silent: true } | undefined
  /** 이미 CLI 모드 (앞서 읽고 exit 없이 끊은 기체): '#' 을 에코만 한다 */
  startInCli?: boolean
}

export class FakeFc implements CliTransport {
  readonly writes: string[] = []
  // 실제 포트처럼 여러 구독자 (읽기 CliReader + 쓰기 WriteSession 이 같은 연결을 쓴다)
  private dataCbs: ((s: string) => void)[] = []
  private closeCbs: ((d: boolean) => void)[] = []
  private inCli = false
  private line = ''
  private hashesIgnored = 0
  closed = false

  constructor(private readonly opts: FakeFcOptions) {
    this.inCli = Boolean(opts.startInCli)
  }

  onData(cb: (s: string) => void) {
    this.dataCbs.push(cb)
  }
  onClose(cb: (d: boolean) => void) {
    this.closeCbs.push(cb)
  }
  private dataCb(s: string) {
    for (const cb of this.dataCbs) cb(s)
  }
  private closeCb(d: boolean) {
    for (const cb of this.closeCbs) cb(d)
  }
  async close() {
    this.closed = true
  }

  async write(data: string) {
    this.writes.push(data)
    for (const ch of data) this.receive(ch)
  }

  private receive(ch: string) {
    if (!this.inCli) {
      if (ch !== '#') return
      if (this.hashesIgnored < (this.opts.ignoreHashes ?? 0)) {
        this.hashesIgnored++
        return
      }
      this.inCli = true
      this.stream("\r\nEntering CLI Mode, type 'exit' to return, or 'help'\r\n\r\n# ", '#')
      return
    }
    if (ch === '\n') {
      const cmd = this.line.trim()
      this.line = ''
      // 빈 줄·주석 줄: 프롬프트만
      if (cmd === '' || cmd.startsWith('#')) {
        this.stream('\r\n\r\n# ', cmd)
        return
      }
      const h = this.opts.handler?.(cmd)
      if (h !== undefined) {
        if (typeof h === 'string') this.stream(`\r\n${h}\r\n\r\n# `, cmd)
        else if ('silent' in h) return
        else {
          this.stream(`\r\n${h.text}\r\n`, cmd)
          setTimeout(() => {
            this.closed = true
            this.inCli = false
            for (const cb of this.closeCbs) cb(true)
          }, 20)
        }
        return
      }
      let body = this.opts.responses[cmd]
      if (body === undefined) {
        const get = /^get (\S+)$/.exec(cmd)
        body = get ? `${get[1]} = ${this.opts.responses[`get:${get[1]}`] ?? ''}` : `Invalid name`
      }
      this.stream(`\r\n${body.replace(/\r?\n$/, '')}\r\n\r\n# `, cmd)
      return
    }
    this.line += ch
    this.stream(ch, '') // 에코
  }

  private stream(text: string, cmd: string) {
    const size = this.opts.chunkSize ?? 256
    const chunks: string[] = []
    for (let i = 0; i < text.length; i += size) chunks.push(text.slice(i, i + size))
    let i = 0
    const next = () => {
      if (this.closed) return
      const d = this.opts.disconnectDuring
      if (d && d.command === cmd && i === d.afterChunks) {
        this.closed = true
        this.closeCb(true)
        return
      }
      const s = this.opts.stallDuring
      if (s && s.command === cmd && i === s.afterChunks) return
      if (i >= chunks.length) return
      this.dataCb(chunks[i++])
      setImmediate(next)
    }
    setImmediate(next)
  }
}
