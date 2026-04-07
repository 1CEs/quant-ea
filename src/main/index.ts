import { app, shell, BrowserWindow, ipcMain, dialog } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { PythonBridge } from './python-bridge'

let mainWindow: BrowserWindow | null = null
let pythonBridge: PythonBridge | null = null

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    show: false,
    autoHideMenuBar: true,
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#09090b',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
  })

  mainWindow.on('enter-full-screen', () => {
    mainWindow?.webContents.send('fullscreen-changed', true)
  })

  mainWindow.on('leave-full-screen', () => {
    mainWindow?.webContents.send('fullscreen-changed', false)
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.quant-ea')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  pythonBridge = new PythonBridge()

  ipcMain.handle('python:start', async () => {
    return pythonBridge?.start()
  })

  ipcMain.handle('python:stop', async () => {
    return pythonBridge?.stop()
  })

  ipcMain.handle('python:status', async () => {
    return pythonBridge?.isRunning() ?? false
  })

  ipcMain.handle('python:port', async () => {
    return pythonBridge?.getPort() ?? 8765
  })

  ipcMain.handle('credentials:save', async (_event, data: { account: string; password: string; server: string }) => {
    const fs = await import('fs')
    const path = await import('path')
    const crypto = await import('crypto')

    const credPath = path.join(app.getPath('userData'), 'credentials.enc')
    const key = crypto.scryptSync(app.getPath('userData'), 'quant-ea-salt', 32)
    const iv = crypto.randomBytes(16)
    const cipher = crypto.createCipheriv('aes-256-cbc', key, iv)

    let encrypted = cipher.update(JSON.stringify(data), 'utf8', 'hex')
    encrypted += cipher.final('hex')

    fs.writeFileSync(credPath, JSON.stringify({ iv: iv.toString('hex'), data: encrypted }))
    return true
  })

  ipcMain.handle('credentials:load', async () => {
    const fs = await import('fs')
    const path = await import('path')
    const crypto = await import('crypto')

    const credPath = path.join(app.getPath('userData'), 'credentials.enc')
    if (!fs.existsSync(credPath)) return null

    try {
      const raw = JSON.parse(fs.readFileSync(credPath, 'utf8'))
      const key = crypto.scryptSync(app.getPath('userData'), 'quant-ea-salt', 32)
      const iv = Buffer.from(raw.iv, 'hex')
      const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv)

      let decrypted = decipher.update(raw.data, 'hex', 'utf8')
      decrypted += decipher.final('utf8')

      return JSON.parse(decrypted)
    } catch {
      return null
    }
  })

  ipcMain.handle('credentials:clear', async () => {
    const fs = await import('fs')
    const path = await import('path')
    const credPath = path.join(app.getPath('userData'), 'credentials.enc')
    if (fs.existsSync(credPath)) fs.unlinkSync(credPath)
    return true
  })

  ipcMain.handle('dialog:open-csv', async () => {
    if (!mainWindow) return null
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Import CSV Dataset',
      filters: [{ name: 'CSV Files', extensions: ['csv'] }],
      properties: ['openFile'],
    })
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  pythonBridge?.stop()
  if (process.platform !== 'darwin') app.quit()
})
