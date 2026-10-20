// v2 쓰기 IPC (SPEC 11절). 렌더러는 "준비 / 실행 / 취소 / 재검증"만 요청할 수 있고 명령 문자열은 보낼 수 없다.
// 명령은 writeFlow 가 편집에서 buildCommands 로 만들고, 송신은 writeSession 하나로만 한다.

import { app, ipcMain } from 'electron'
import { IPC, type WriteFailureInfo, type WriteIpcResult } from '@shared/ipc'
import { CLI_ERROR_MESSAGES } from '@shared/serial'
import { saveDir } from '../files'
import { shutdownSerial } from './ipc'
import { findSamePort, openSerialTransport, portIdentity, type PortIdentity } from './serialTransport'
import { TCP_PREFIX, openTcpTransport } from './tcpTransport'
import { CliReadError, type CliTransport } from './transport'
import { WriteFlow, WriteFlowError, type WriteRequest } from './writeFlow'

const SITL_ENABLED = () => !app.isPackaged

/** 준비할 때 본 포트의 USB 정보 — 재부팅 뒤 같은 기체를 다시 찾는 데 쓴다 */
let portHint: PortIdentity | null = null

async function open(path: string): Promise<CliTransport> {
  if (path.startsWith(TCP_PREFIX)) {
    if (!SITL_ENABLED()) throw new CliReadError('PORT_NOT_FOUND', 'tcp is dev-only')
    return openTcpTransport(path)
  }
  portHint = await portIdentity(path)
  return openSerialTransport(path)
}

/** 재부팅 뒤: 같은 기체의 포트를 다시 연다 (없으면 null — writeFlow 가 15초 동안 되풀이) */
async function reopen(path: string): Promise<CliTransport | null> {
  if (path.startsWith(TCP_PREFIX)) return openTcpTransport(path).catch(() => null)
  const found = await findSamePort(path, portHint)
  return found ? openSerialTransport(found).catch(() => null) : null
}

const flow = new WriteFlow({ open, reopen, saveDir, appVersion: app.getVersion() })
let busy = false

function failure(e: unknown): WriteFailureInfo {
  if (e instanceof WriteFlowError) return e.failure
  if (e instanceof CliReadError) return { code: e.code, message: CLI_ERROR_MESSAGES[e.code], applied: 'no' }
  return { code: 'UNKNOWN', message: String((e as Error)?.message ?? e), applied: 'no' }
}

async function guarded<T>(fn: () => Promise<T>): Promise<WriteIpcResult<T>> {
  if (busy) return { ok: false, failure: { code: 'SESSION_BUSY', message: '이미 쓰기 작업이 진행 중입니다.', applied: 'no' } }
  busy = true
  try {
    return { ok: true, value: await fn() }
  } catch (e) {
    console.error('[write]', e)
    return { ok: false, failure: failure(e) }
  } finally {
    busy = false
  }
}

const isStr = (v: unknown): v is string => typeof v === 'string'
function parseBase(v: unknown): WriteRequest['base'] {
  const b = v as WriteRequest['base'] | undefined
  if (!b || !isStr(b.craftName) || !isStr(b.readAt) || !b.raw || !isStr(b.raw.diffAll) || !isStr(b.raw.dumpAll)) throw new Error('잘못된 요청')
  return { craftName: b.craftName, readAt: b.readAt, raw: { version: String(b.raw.version ?? ''), status: String(b.raw.status ?? ''), diffAll: b.raw.diffAll, dumpAll: b.raw.dumpAll, ...(isStr(b.raw.get) ? { get: b.raw.get } : {}) } }
}

export function registerWriteIpc(): void {
  ipcMain.handle(IPC.writePrepare, (event, path: unknown) =>
    guarded(async () => {
      if (!isStr(path) || !path) throw new CliReadError('PORT_NOT_FOUND')
      await shutdownSerial() // 읽기 세션이 포트를 잡고 있으면 닫는다
      const sender = event.sender
      return flow.prepare(path, (p) => !sender.isDestroyed() && sender.send(IPC.writeProgress, p))
    })
  )

  ipcMain.handle(IPC.writeExecute, (event, req: unknown) =>
    guarded(async () => {
      const r = req as { base?: unknown; edits?: unknown; overwriteConflicts?: unknown }
      const sender = event.sender
      return flow.execute(
        { base: parseBase(r?.base), edits: r?.edits, overwriteConflicts: r?.overwriteConflicts === true },
        (p) => !sender.isDestroyed() && sender.send(IPC.writeProgress, p)
      )
    })
  )

  ipcMain.handle(IPC.writeCancel, async () => {
    await flow.cancel()
  })

  ipcMain.handle(IPC.writeVerify, (event, req: unknown) =>
    guarded(async () => {
      const r = req as { path?: unknown; base?: unknown; edits?: unknown }
      if (!isStr(r?.path) || !r.path) throw new CliReadError('PORT_NOT_FOUND')
      await shutdownSerial()
      const sender = event.sender
      return flow.verify(r.path, { base: parseBase(r.base), edits: r.edits }, (p) => !sender.isDestroyed() && sender.send(IPC.writeProgress, p))
    })
  )
}

export async function shutdownWrite(): Promise<void> {
  await flow.cancel()
}
