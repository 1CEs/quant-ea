import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

const api = {
  python: {
    start: (): Promise<boolean> => ipcRenderer.invoke('python:start'),
    stop: (): Promise<boolean> => ipcRenderer.invoke('python:stop'),
    status: (): Promise<boolean> => ipcRenderer.invoke('python:status'),
    port: (): Promise<number> => ipcRenderer.invoke('python:port')
  },
  onFullscreenChange: (callback: (isFullscreen: boolean) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, value: boolean): void => callback(value)
    ipcRenderer.on('fullscreen-changed', handler)
    return () => ipcRenderer.removeListener('fullscreen-changed', handler)
  },
  credentials: {
    save: (data: { account: string; password: string; server: string }): Promise<boolean> =>
      ipcRenderer.invoke('credentials:save', data),
    load: (): Promise<{ account: string; password: string; server: string } | null> =>
      ipcRenderer.invoke('credentials:load'),
    clear: (): Promise<boolean> => ipcRenderer.invoke('credentials:clear')
  },
  dialog: {
    openCsv: (): Promise<string | null> => ipcRenderer.invoke('dialog:open-csv')
  }
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore
  window.electron = electronAPI
  // @ts-ignore
  window.api = api
}
