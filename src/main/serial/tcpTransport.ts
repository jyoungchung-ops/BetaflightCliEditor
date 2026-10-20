// 개발용: Betaflight SITL 의 TCP 시리얼(UART1 = 5761 ...)에 CliTransport 로 연결한다.
// 배포 exe 에서는 쓰지 않는다 — ipc.ts 가 app.isPackaged 일 때 tcp:// 주소를 거부한다.
// 이 파일은 데이터를 쓰는 경로를 만들지 않는다: write()는 CliReader.send()(화이트리스트)만 부른다.

import { Socket } from 'net'
import { CliReadError, type CliTransport } from './transport'

export const TCP_PREFIX = 'tcp://'

/** "tcp://127.0.0.1:5761" → { host, port }. 루프백 주소만 허용 */
export function parseTcpTarget(target: string): { host: string; port: number } | null {
  const m = /^tcp:\/\/(127\.0\.0\.1|localhost|\[::1\]):(\d{2,5})$/i.exec(target)
  if (!m) return null
  const port = Number(m[2])
  if (port < 1 || port > 65535) return null
  return { host: m[1] === '[::1]' ? '::1' : m[1], port }
}

export function openTcpTransport(target: string, timeoutMs = 3000): Promise<CliTransport> {
  const t = parseTcpTarget(target)
  if (!t) return Promise.reject(new CliReadError('PORT_NOT_FOUND', `not a loopback tcp target: ${target}`))
  return new Promise((resolve, reject) => {
    const sock = new Socket()
    const timer = setTimeout(() => {
      sock.destroy()
      reject(new CliReadError('PORT_OPEN_FAILED', `tcp connect timeout ${target}`))
    }, timeoutMs)
    sock.once('error', (e) => {
      clearTimeout(timer)
      reject(new CliReadError('PORT_OPEN_FAILED', e.message))
    })
    sock.connect(t.port, t.host, () => {
      clearTimeout(timer)
      sock.removeAllListeners('error')
      let closed = false
      resolve({
        write: (data) =>
          new Promise((res, rej) => {
            sock.write(Buffer.from(data, 'latin1'), (e) => (e ? rej(new CliReadError('DISCONNECTED', e.message)) : res()))
          }),
        onData: (cb) => sock.on('data', (buf: Buffer) => cb(buf.toString('latin1'))),
        onClose: (cb) =>
          sock.on('close', () => {
            if (!closed) cb(true)
          }),
        close: () =>
          new Promise((res) => {
            closed = true
            sock.end(() => res())
            sock.destroy()
          })
      })
    })
  })
}
