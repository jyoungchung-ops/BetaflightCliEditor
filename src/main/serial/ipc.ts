// 시리얼 IPC 핸들러. 렌더러는 정해진 동작(목록·연결·읽기·닫기)만 요청할 수 있고 명령 문자열은 보낼 수 없다.

import { app, ipcMain, type WebContents } from 'electron'
import { IPC } from '@shared/ipc'
import { CLI_ERROR_MESSAGES, type IpcResult, type PortInfo } from '@shared/serial'
import type { RawCli } from '@shared/cli/types'
import { CliReader } from './cliReader'
import { CliReadError } from './transport'
import { listPorts, openSerialTransport } from './serialTransport'
import { TCP_PREFIX, openTcpTransport } from './tcpTransport'

/** 개발 실행(npm run dev)에서만: SITL TCP 포트를 목록에 보여 주고 연결을 허용한다. 배포 exe에서는 꺼진다 */
const SITL_ENABLED = () => !app.isPackaged
const SITL_PORTS: PortInfo[] = [5761, 5762].map((p) => ({ path: `${TCP_PREFIX}127.0.0.1:${p}`, label: `SITL UART${p - 5760} (tcp 127.0.0.1:${p}, 개발용)`, likelyFc: false }))

let session: { reader: CliReader; sender: WebContents } | null = null
let busy = false

function fail(e: unknown): IpcResult<never> {
  const err = e instanceof CliReadError ? e : new CliReadError('PORT_OPEN_FAILED', String((e as Error)?.message ?? e))
  console.error('[serial]', err.message)
  return { ok: false, code: err.code, message: CLI_ERROR_MESSAGES[err.code] }
}

async function closeSession() {
  const s = session
  session = null
  await s?.reader.close().catch(() => {})
}

async function exclusive<T>(fn: () => Promise<T>): Promise<IpcResult<T>> {
  if (busy) return fail(new CliReadError('SESSION_BUSY'))
  busy = true
  try {
    return { ok: true, value: await fn() }
  } catch (e) {
    await closeSession()
    return fail(e)
  } finally {
    busy = false
  }
}

export function registerSerialIpc(): void {
  ipcMain.handle(IPC.listPorts, async (): Promise<IpcResult<PortInfo[]>> => {
    try {
      return { ok: true, value: [...(await listPorts()), ...(SITL_ENABLED() ? SITL_PORTS : [])] }
    } catch (e) {
      return fail(e)
    }
  })

  /** 포트 열기 + CLI 진입 + craft_name 읽기 */
  ipcMain.handle(IPC.connect, (event, path: unknown) =>
    exclusive(async (): Promise<{ craftName: string }> => {
      if (typeof path !== 'string' || !path) throw new CliReadError('PORT_NOT_FOUND')
      await closeSession()
      const sender = event.sender
      sender.send(IPC.readProgress, { stage: 'opening', total: 4, lines: 0 })
      if (path.startsWith(TCP_PREFIX) && !SITL_ENABLED()) throw new CliReadError('PORT_NOT_FOUND', 'tcp is dev-only')
      const transport = path.startsWith(TCP_PREFIX) ? await openTcpTransport(path) : await openSerialTransport(path)
      const reader = new CliReader(transport, {
        onProgress: (p) => {
          if (!sender.isDestroyed()) sender.send(IPC.readProgress, p)
        }
      })
      session = { reader, sender }
      await reader.enterCli()
      const name = await reader.getValue('craft_name')
      return { craftName: name && name !== '-' ? name : '' }
    })
  )

  /** 4개 명령을 읽고 포트를 닫는다 */
  ipcMain.handle(IPC.readAll, () =>
    exclusive(async (): Promise<RawCli> => {
      if (!session) throw new CliReadError('NOT_CONNECTED')
      const raw = await session.reader.readAll()
      await closeSession()
      return raw
    })
  )

  ipcMain.handle(IPC.disconnect, async () => {
    await closeSession()
    return { ok: true, value: null }
  })
}

export async function shutdownSerial(): Promise<void> {
  await closeSession()
}
