// 메인 ↔ 렌더러 IPC 채널 이름과 타입. 렌더러는 preload가 노출한 함수만 쓸 수 있다.

import type { RawCli } from './cli/types'
import type { IpcResult, PortInfo, ReadProgress } from './serial'

export const IPC = {
  appInfo: 'app:info',
  listPorts: 'serial:list',
  connect: 'serial:connect',
  readAll: 'serial:read',
  disconnect: 'serial:disconnect',
  readProgress: 'serial:progress',
  saveSnapshot: 'file:save',
  exportDiff: 'file:export-diff',
  openFile: 'file:open',
  readDroppedFile: 'file:read-dropped',
  takeLaunchFile: 'file:take-launch',
  /** 메인 → 렌더러: 실행 중에 파일로 다시 실행됨 (두 번째 인스턴스) */
  openRequest: 'file:open-request'
} as const

export interface AppInfo {
  appVersion: string
  platform: string
}

export interface OpenedFile {
  path: string
  name: string
  content: string
  /** 파일 수정 시각 (ISO) — CLI 텍스트를 열 때 읽은 시각 대신 쓴다 */
  modifiedAt: string
}

export type FileResult<T> = { ok: true; value: T } | { ok: false; canceled?: boolean; message: string }

/** preload가 window.bfview로 노출하는 API */
export interface BfViewApi {
  getAppInfo(): Promise<AppInfo>
  listPorts(): Promise<IpcResult<PortInfo[]>>
  /** 포트를 열고 CLI에 들어가 craft_name을 읽는다 */
  connect(path: string): Promise<IpcResult<{ craftName: string }>>
  /** version / status / diff all / dump all 을 읽고 포트를 닫는다 */
  readAll(): Promise<IpcResult<RawCli>>
  disconnect(): Promise<IpcResult<null>>
  /** 진행 이벤트 구독. 해제 함수를 돌려준다 */
  onReadProgress(cb: (p: ReadProgress) => void): () => void

  /** 저장창을 열어 JSON을 저장. 값 = 저장한 경로 */
  saveSnapshot(craftName: string, json: string): Promise<FileResult<string>>
  /** diff all 원문을 <이름>_diff.txt 로 */
  exportDiff(craftName: string, text: string): Promise<FileResult<string>>
  openFile(): Promise<FileResult<OpenedFile>>
  /** 드래그한 File 객체를 읽는다 */
  readDroppedFile(file: File): Promise<FileResult<OpenedFile>>
  takeLaunchFile(): Promise<FileResult<OpenedFile> | null>
  onOpenRequest(cb: (r: FileResult<OpenedFile>) => void): () => void
}
