import { contextBridge, ipcRenderer, webUtils, type IpcRendererEvent } from 'electron'
import { IPC, type BfViewApi, type FileResult, type OpenedFile, type WriteProgressEvent } from '@shared/ipc'
import type { ReadProgress } from '@shared/serial'

function subscribe<T>(channel: string, cb: (v: T) => void): () => void {
  const listener = (_e: IpcRendererEvent, v: T) => cb(v)
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

const api: BfViewApi = {
  getAppInfo: () => ipcRenderer.invoke(IPC.appInfo),
  listPorts: () => ipcRenderer.invoke(IPC.listPorts),
  connect: (path) => ipcRenderer.invoke(IPC.connect, path),
  readAll: () => ipcRenderer.invoke(IPC.readAll),
  disconnect: () => ipcRenderer.invoke(IPC.disconnect),
  onReadProgress: (cb) => subscribe<ReadProgress>(IPC.readProgress, cb),

  saveSnapshot: (craftName, json) => ipcRenderer.invoke(IPC.saveSnapshot, { craftName, json }),
  exportDiff: (craftName, text) => ipcRenderer.invoke(IPC.exportDiff, { craftName, text }),
  exportText: (fileName, text, title) => ipcRenderer.invoke(IPC.exportText, { fileName, text, title }),
  openFile: () => ipcRenderer.invoke(IPC.openFile),
  readDroppedFile: (file) => ipcRenderer.invoke(IPC.readDroppedFile, webUtils.getPathForFile(file)),
  takeLaunchFile: () => ipcRenderer.invoke(IPC.takeLaunchFile),
  onOpenRequest: (cb) => subscribe<FileResult<OpenedFile>>(IPC.openRequest, cb),

  writePrepare: (path) => ipcRenderer.invoke(IPC.writePrepare, path),
  writeExecute: (req) => ipcRenderer.invoke(IPC.writeExecute, req),
  writeCancel: () => ipcRenderer.invoke(IPC.writeCancel),
  writeVerify: (req) => ipcRenderer.invoke(IPC.writeVerify, req),
  onWriteProgress: (cb) => subscribe<WriteProgressEvent>(IPC.writeProgress, cb)
}

contextBridge.exposeInMainWorld('bfview', api)
