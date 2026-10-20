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
        serialNumber: p.serialNumber,
        likelyFc
      }
    })
    .sort((a, b) => Number(b.likelyFc) - Number(a.likelyFc) || comparePath(a.path, b.path))
}

/** USB 정보 — 쓰기 후 재부팅한 기체를 다시 찾는 데 쓴다 */
export interface PortIdentity {
  vendorId?: string
  productId?: string
  serialNumber?: string
}

export async function portIdentity(path: string): Promise<PortIdentity | null> {
  const p = (await SerialPort.list()).find((x) => x.path === path)
  return p ? { vendorId: p.vendorId, productId: p.productId, serialNumber: p.serialNumber } : null
}

/**
 * 같은 기체의 포트 경로 (COM 번호가 바뀌어도 VID/PID + 시리얼 번호로 찾는다).
 * 시리얼 번호가 없고 후보가 여럿이면 원래 경로만 — 다른 기체에 붙지 않게
 */
export async function findSamePort(path: string, id: PortIdentity | null): Promise<string | null> {
  const ports = await SerialPort.list()
  const eq = (a?: string, b?: string) => (a ?? '').toLowerCase() === (b ?? '').toLowerCase()
  const same = id
    ? ports.filter((p) => eq(p.vendorId, id.vendorId) && eq(p.productId, id.productId) && (!id.serialNumber || p.serialNumber === id.serialNumber))
    : ports.filter((p) => p.path === path)
  const pick = same.length === 1 ? same[0] : same.find((p) => p.path === path)
  return pick?.path ?? null
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
