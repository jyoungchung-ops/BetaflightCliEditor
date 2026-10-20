// 저장·열기·원문 내보내기. Windows 기본 저장창을 쓰고, 마지막 저장 폴더는 앱 설정에 기억한다.

import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import { mkdir, readFile, stat, writeFile } from 'fs/promises'
import { basename, dirname, extname, join } from 'path'
import { IPC, type FileResult, type OpenedFile } from '@shared/ipc'
import { SAVE_EXT, diffFileName, normalizeSavePath, saveFileName } from '@shared/files'

const MAX_OPEN_BYTES = 20 * 1024 * 1024
const OPEN_EXTS = ['.json', '.txt']

// ── 앱 설정 (userData/settings.json) ─────────────────────────
interface Settings {
  lastSaveDir?: string
}
const settingsPath = () => join(app.getPath('userData'), 'settings.json')

async function loadSettings(): Promise<Settings> {
  try {
    return JSON.parse(await readFile(settingsPath(), 'utf8')) as Settings
  } catch {
    return {}
  }
}
async function saveSettings(s: Settings) {
  await mkdir(dirname(settingsPath()), { recursive: true })
  await writeFile(settingsPath(), JSON.stringify(s, null, 2), 'utf8')
}

/** 처음엔 문서\FPV 기체 를 제안한다 (없으면 만든다) */
async function saveDir(): Promise<string> {
  const s = await loadSettings()
  if (s.lastSaveDir) return s.lastSaveDir
  const dir = join(app.getPath('documents'), 'FPV 기체')
  await mkdir(dir, { recursive: true }).catch(() => {})
  return dir
}

async function rememberDir(filePath: string) {
  const s = await loadSettings()
  await saveSettings({ ...s, lastSaveDir: dirname(filePath) })
}

const win = (e: Electron.IpcMainInvokeEvent) => BrowserWindow.fromWebContents(e.sender) ?? undefined
const errorResult = (e: unknown): FileResult<never> => ({ ok: false, message: String((e as Error)?.message ?? e) })

// ── 파일 읽기 (열기 창, 드래그, 실행 인자 공용) ─────────────────────
export async function readOpenableFile(path: string): Promise<FileResult<OpenedFile>> {
  try {
    const ext = path.toLowerCase().endsWith(SAVE_EXT) ? '.json' : extname(path).toLowerCase()
    if (!OPEN_EXTS.includes(ext)) return { ok: false, message: '.bfview.json 또는 .txt 파일만 열 수 있습니다.' }
    const st = await stat(path)
    if (!st.isFile()) return { ok: false, message: '파일이 아닙니다.' }
    if (st.size > MAX_OPEN_BYTES) return { ok: false, message: '파일이 너무 큽니다 (20MB 초과).' }
    const content = await readFile(path, 'utf8')
    return { ok: true, value: { path, name: basename(path), content, modifiedAt: st.mtime.toISOString() } }
  } catch (e) {
    return errorResult(e)
  }
}

/** 실행 인자에서 열 파일 (파일 연결 더블클릭) */
export function fileFromArgv(argv: string[]): string | undefined {
  return argv.slice(1).find((a) => !a.startsWith('-') && /\.(json|txt)$/i.test(a))
}

let launchFile: string | undefined

export function setLaunchFile(path: string | undefined) {
  launchFile = path
}

export function registerFileIpc(): void {
  ipcMain.handle(IPC.saveSnapshot, async (e, payload: { craftName: string; json: string }): Promise<FileResult<string>> => {
    try {
      if (typeof payload?.json !== 'string' || typeof payload?.craftName !== 'string') throw new Error('잘못된 요청')
      const r = await dialog.showSaveDialog(win(e)!, {
        title: '기체 설정 저장',
        defaultPath: join(await saveDir(), saveFileName(payload.craftName)),
        filters: [
          { name: 'Betaflight CLI Editor 파일', extensions: ['json'] },
          { name: '모든 파일', extensions: ['*'] }
        ]
      })
      if (r.canceled || !r.filePath) return { ok: false, canceled: true, message: '' }
      const path = normalizeSavePath(r.filePath)
      await writeFile(path, payload.json, 'utf8')
      await rememberDir(path)
      return { ok: true, value: path }
    } catch (err) {
      return errorResult(err)
    }
  })

  ipcMain.handle(IPC.exportDiff, async (e, payload: { craftName: string; text: string }): Promise<FileResult<string>> => {
    try {
      if (typeof payload?.text !== 'string' || typeof payload?.craftName !== 'string') throw new Error('잘못된 요청')
      const r = await dialog.showSaveDialog(win(e)!, {
        title: 'diff all 원문 내보내기',
        defaultPath: join(await saveDir(), diffFileName(payload.craftName)),
        filters: [{ name: '텍스트', extensions: ['txt'] }]
      })
      if (r.canceled || !r.filePath) return { ok: false, canceled: true, message: '' }
      // Betaflight CLI 탭에 붙여넣기 좋게 CRLF
      await writeFile(r.filePath, payload.text.replace(/\r?\n/g, '\r\n'), 'utf8')
      await rememberDir(r.filePath)
      return { ok: true, value: r.filePath }
    } catch (err) {
      return errorResult(err)
    }
  })

  ipcMain.handle(IPC.openFile, async (e): Promise<FileResult<OpenedFile>> => {
    const r = await dialog.showOpenDialog(win(e)!, {
      title: '저장 파일 열기',
      defaultPath: await saveDir(),
      properties: ['openFile'],
      filters: [
        { name: '기체 파일 (*.bfview.json, *.txt)', extensions: ['json', 'txt'] },
        { name: '모든 파일', extensions: ['*'] }
      ]
    })
    if (r.canceled || r.filePaths.length === 0) return { ok: false, canceled: true, message: '' }
    return readOpenableFile(r.filePaths[0])
  })

  /** 창에 드래그한 파일 — 경로는 preload의 webUtils로 얻는다 */
  ipcMain.handle(IPC.readDroppedFile, async (_e, path: unknown) => {
    if (typeof path !== 'string' || !path) return { ok: false, message: '파일 경로를 알 수 없습니다.' }
    return readOpenableFile(path)
  })

  /** 앱을 파일로 실행했을 때 그 파일 (한 번만) */
  ipcMain.handle(IPC.takeLaunchFile, async (): Promise<FileResult<OpenedFile> | null> => {
    const p = launchFile
    launchFile = undefined
    return p ? readOpenableFile(p) : null
  })
}
