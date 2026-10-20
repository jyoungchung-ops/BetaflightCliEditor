// 메인 ↔ 렌더러 IPC 채널 이름과 타입. 렌더러는 preload가 노출한 함수만 쓸 수 있다.

import type { RawCli } from './cli/types'
import type { IpcResult, PortInfo, ReadProgress } from './serial'
import type { Edit } from './edit/session'
import type { Conflict, Mismatch } from './edit/writePlan'

export interface WriteBase {
  craftName: string
  readAt: string
  raw: RawCli
}

export type WriteProgressEvent =
  | { stage: 'read'; read: ReadProgress }
  | { stage: 'backup' }
  | { stage: 'send'; done: number; total: number; command: string }
  | { stage: 'reconnect' }
  | { stage: 'verify'; read: ReadProgress }

export interface WriteFailureInfo {
  code: string
  message: string
  /** no = save 전에 멈춤(재부팅하면 원래대로), unknown = save 뒤 확인 못 함 */
  applied: 'no' | 'unknown'
  command?: string
  response?: string
  conflicts?: Conflict[]
  blockers?: string[]
  backup?: { txt: string; json: string }
  beforeRaw?: RawCli
  log?: string
}

export interface WriteResultInfo {
  status: 'ok' | 'mismatch'
  afterRaw: RawCli
  mismatches: Mismatch[]
  commands: string[]
  rebooted: boolean
  backup: { txt: string; json: string }
  beforeRaw: RawCli
  log: string
}

export type WriteIpcResult<T> = { ok: true; value: T } | { ok: false; failure: WriteFailureInfo }

export const IPC = {
  appInfo: 'app:info',
  listPorts: 'serial:list',
  connect: 'serial:connect',
  readAll: 'serial:read',
  disconnect: 'serial:disconnect',
  readProgress: 'serial:progress',
  saveSnapshot: 'file:save',
  exportDiff: 'file:export-diff',
  exportText: 'file:export-text',
  openFile: 'file:open',
  readDroppedFile: 'file:read-dropped',
  takeLaunchFile: 'file:take-launch',
  /** v2 쓰기 절차 (SPEC 11절). 명령 문자열은 렌더러가 보내지 않는다 — 메인이 편집에서 만든다 */
  writePrepare: 'write:prepare',
  writeExecute: 'write:execute',
  writeCancel: 'write:cancel',
  writeVerify: 'write:verify',
  writeProgress: 'write:progress',
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
  /** v2: 변경분·편집 반영 diff 를 txt 로 (fileName 은 기본 파일 이름, 경로 없이) */
  exportText(fileName: string, text: string, title: string): Promise<FileResult<string>>
  openFile(): Promise<FileResult<OpenedFile>>
  /** 드래그한 File 객체를 읽는다 */
  readDroppedFile(file: File): Promise<FileResult<OpenedFile>>
  takeLaunchFile(): Promise<FileResult<OpenedFile> | null>
  onOpenRequest(cb: (r: FileResult<OpenedFile>) => void): () => void

  // ── v2 쓰기 (SPEC 11절) ──
  /** 2단계: 연결해 현재 설정을 읽는다 (연결은 execute/cancel 까지 열려 있음) */
  writePrepare(path: string): Promise<WriteIpcResult<RawCli>>
  /** 3~9단계: 메인이 다시 검사 → 백업 → 전송 → save → 재검증 */
  writeExecute(req: { base: WriteBase; edits: Edit[]; overwriteConflicts: boolean }): Promise<WriteIpcResult<WriteResultInfo>>
  writeCancel(): Promise<void>
  /** [재검증]: 다시 연결해 읽고 대조만 */
  writeVerify(req: { path: string; base: WriteBase; edits: Edit[] }): Promise<WriteIpcResult<{ afterRaw: RawCli; mismatches: Mismatch[] }>>
  onWriteProgress(cb: (p: WriteProgressEvent) => void): () => void
}
