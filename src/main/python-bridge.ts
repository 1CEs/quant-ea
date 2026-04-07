import { ChildProcess, spawn } from 'child_process'
import { join } from 'path'
import { app } from 'electron'
import { is } from '@electron-toolkit/utils'

export class PythonBridge {
  private process: ChildProcess | null = null
  private port: number = 8765
  private running: boolean = false

  getPort(): number {
    return this.port
  }

  isRunning(): boolean {
    return this.running
  }

  async start(): Promise<boolean> {
    if (this.running) return true

    const pythonPath = this.resolvePythonPath()
    const scriptPath = this.resolveScriptPath()

    try {
      this.process = spawn(pythonPath, [scriptPath, '--port', String(this.port)], {
        cwd: this.resolveScriptDir(),
        env: {
          ...process.env,
          PYTHONUNBUFFERED: '1'
        }
      })

      this.process.stdout?.on('data', (data: Buffer) => {
        console.log(`[Python] ${data.toString().trim()}`)
      })

      this.process.stderr?.on('data', (data: Buffer) => {
        console.error(`[Python Error] ${data.toString().trim()}`)
      })

      this.process.on('close', (code) => {
        console.log(`[Python] Process exited with code ${code}`)
        this.running = false
      })

      this.running = true
      return true
    } catch (error) {
      console.error('[Python] Failed to start:', error)
      return false
    }
  }

  async stop(): Promise<void> {
    if (this.process) {
      this.process.kill('SIGTERM')
      this.process = null
      this.running = false
    }
  }

  private resolvePythonPath(): string {
    if (process.env.PYTHON_PATH) return process.env.PYTHON_PATH
    if (is.dev) {
      return join(app.getAppPath(), 'python', 'venv', 'bin', 'python3')
    }
    return join(process.resourcesPath, 'python', 'venv', 'bin', 'python3')
  }

  private resolveScriptDir(): string {
    if (is.dev) {
      return join(app.getAppPath(), 'python')
    }
    return join(process.resourcesPath, 'python')
  }

  private resolveScriptPath(): string {
    return join(this.resolveScriptDir(), 'main.py')
  }
}
