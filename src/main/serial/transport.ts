// 시리얼 포트를 감싼 최소 인터페이스. 테스트에서는 가짜 FC로 바꿔 끼운다.

import type { CliErrorCode } from '@shared/serial'

export interface CliTransport {
  write(data: string): Promise<void>
  onData(cb: (chunk: string) => void): void
  /** 포트가 닫히면 호출. USB 분리면 disconnected = true */
  onClose(cb: (disconnected: boolean) => void): void
  close(): Promise<void>
}

export class CliReadError extends Error {
  constructor(
    readonly code: CliErrorCode,
    detail?: string
  ) {
    super(detail ? `${code}: ${detail}` : code)
    this.name = 'CliReadError'
  }
}
