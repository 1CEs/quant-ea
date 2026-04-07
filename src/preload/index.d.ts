import { ElectronAPI } from '@electron-toolkit/preload'

interface QuantAPI {
  python: {
    start: () => Promise<boolean>
    stop: () => Promise<boolean>
    status: () => Promise<boolean>
    port: () => Promise<number>
  }
  onFullscreenChange: (callback: (isFullscreen: boolean) => void) => () => void
  credentials: {
    save: (data: { account: string; password: string; server: string }) => Promise<boolean>
    load: () => Promise<{ account: string; password: string; server: string } | null>
    clear: () => Promise<boolean>
  }
  dialog: {
    openCsv: () => Promise<string | null>
  }
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: QuantAPI
  }
}
