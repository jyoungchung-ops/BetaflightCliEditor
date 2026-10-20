import { app, BrowserWindow, ipcMain, shell } from 'electron'
import { join } from 'path'
import { IPC, type AppInfo } from '@shared/ipc'
import { registerSerialIpc, shutdownSerial } from './serial/ipc'
import { registerWriteIpc, shutdownWrite } from './serial/writeIpc'
import { fileFromArgv, readOpenableFile, registerFileIpc, setLaunchFile } from './files'

// 앱은 하나만 실행한다. 이미 실행 중이면 파일을 그 창으로 넘긴다
if (!app.requestSingleInstanceLock()) {
  app.quit()
}

let mainWindow: BrowserWindow | null = null

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 1024,
    minHeight: 640,
    show: false,
    backgroundColor: '#1e1e1e',
    autoHideMenuBar: true,
    title: 'Betaflight CLI Editor',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })
  mainWindow = win
  win.on('closed', () => (mainWindow = null))

  win.once('ready-to-show', () => win.show())

  // 외부 링크는 기본 브라우저로 연다
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) shell.openExternal(url)
    return { action: 'deny' }
  })
  // 창에 파일을 떨어뜨렸을 때 그 파일로 이동하지 않게
  win.webContents.on('will-navigate', (e, url) => {
    if (url !== win.webContents.getURL()) e.preventDefault()
  })

  if (!app.isPackaged && process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

ipcMain.handle(IPC.appInfo, (): AppInfo => ({
  appVersion: app.getVersion(),
  platform: process.platform
}))

registerSerialIpc()
registerWriteIpc()
registerFileIpc()
setLaunchFile(fileFromArgv(process.argv))

app.on('second-instance', async (_e, argv) => {
  if (!mainWindow) return
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.focus()
  const path = fileFromArgv(argv)
  if (path) mainWindow.webContents.send(IPC.openRequest, await readOpenableFile(path))
})

app.on('before-quit', () => {
  void shutdownSerial()
  void shutdownWrite() // save 없이 닫는다
})

app.whenReady().then(() => {
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
