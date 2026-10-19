// serialport 라이브러리로 CliTransport를 만든다. 포트 목록도 여기서.

import { SerialPort } from 'serialport'
import type { PortInfo } from '@shared/serial'
import { CliReadError, type CliTransport } from './transport'

const FC_VENDOR_IDS = new Set(['0483', '2e3c']) // STM32 VCP, AT32

export async function listPorts(): Promise<PortInfo[]> {
  const ports = await SerialPort.list()
  return ports
    .map((p): PortInfo => {
      const vendorId = p.vendorId?.toLowerCase()
      const likelyFc = vendorId ? FC_VENDOR_IDS.has(vendorId) : false
      const desc = (p as { friendlyName?: string }).friendlyName ?? p.manufacturer ?? ''
      const name = desc.replace(/\s*\(COM\d+\)\s*$/, '')
      return {
        path: p.path,
        label: `${p.path}${name ? ` — ${name}` : ''}${likelyFc ? ' (FC 추정)' : ''}`,
        manufacturer: p.manufacturer,
        vendorId: p.vendorId,
        productId: p.productId,
        likelyFc
      }
    })
    .sort((a, b) => Number(b.likelyFc) - Number(a.likelyFc) || comparePath(a.path, b.path))
}

function comparePath(a: string, b: string): number {
  const na = Number(/\d+$/.exec(a)?.[0] ?? NaN)
  const nb = Number(/\d+$/.exec(b)?.[0] ?? NaN)
  return Number.isNaN(na) || Number.isNaN(nb) ? a.localeCompare(b) : na - nb
}

function mapOpenError(err: Error): CliReadError {
  const msg = err.message ?? ''
  if (/access denied|EBUSY|resource busy|EACCES/i.test(msg)) return new CliReadError('PORT_BUSY', msg)
  if (/file not found|cannot find|ENOENT|no such file/i.test(msg)) return new CliReadError('PORT_NOT_FOUND', msg)
  return new CliReadError('PORT_OPEN_FAILED', msg)
}

export function openSerialTransport(path: string, baudRate = 115200): Promise<CliTransport> {
  const port = new SerialPort({ path, baudRate, autoOpen: false })
  return new Promise((resolve, reject) => {
    port.open((err) => {
      if (err) return reject(mapOpenError(err))
      resolve({
        write: (data) =>
          new Promise((res, rej) => {
            port.write(data, 'latin1', (e) => (e ? rej(new CliReadError('DISCONNECTED', e.message)) : res()))
          }),
        onData: (cb) => port.on('data', (buf: Buffer) => cb(buf.toString('latin1'))),
        onClose: (cb) =>
          port.on('close', (e?: Error & { disconnected?: boolean }) => cb(Boolean(e?.disconnected))),
        close: () =>
          new Promise((res) => {
            if (!port.isOpen) return res()
            port.close(() => res())
          })
      })
    })
  })
}
