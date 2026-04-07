import type { WSMessage } from '@/types'

type MessageHandler = (message: WSMessage) => void

export class WebSocketService {
  private ws: WebSocket | null = null
  private url: string = ''
  private handlers: Map<string, Set<MessageHandler>> = new Map()
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private reconnectAttempts: number = 0
  private maxReconnectAttempts: number = 10
  private shouldReconnect: boolean = true

  connect(port: number): void {
    this.url = `ws://localhost:${port}/ws`
    this.shouldReconnect = true
    this.createConnection()
  }

  disconnect(): void {
    this.shouldReconnect = false
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    if (this.ws) {
      this.ws.close()
      this.ws = null
    }
  }

  send(type: string, data: Record<string, unknown> = {}): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type, data }))
    }
  }

  on(type: string, handler: MessageHandler): () => void {
    if (!this.handlers.has(type)) {
      this.handlers.set(type, new Set())
    }
    this.handlers.get(type)!.add(handler)
    return () => this.handlers.get(type)?.delete(handler)
  }

  get isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN
  }

  private createConnection(): void {
    try {
      this.ws = new WebSocket(this.url)

      this.ws.onopen = () => {
        console.log('[WS] Connected')
        this.reconnectAttempts = 0
        this.emit('connection', { type: 'connection', data: { status: 'connected' } })
      }

      this.ws.onmessage = (event) => {
        try {
          const message: WSMessage = JSON.parse(event.data)
          this.emit(message.type, message)
        } catch (error) {
          console.error('[WS] Parse error:', error)
        }
      }

      this.ws.onclose = () => {
        console.log('[WS] Disconnected')
        this.emit('connection', { type: 'connection', data: { status: 'disconnected' } })
        this.attemptReconnect()
      }

      this.ws.onerror = (error) => {
        console.error('[WS] Error:', error)
        this.emit('connection', { type: 'connection', data: { status: 'error' } })
      }
    } catch (error) {
      console.error('[WS] Connection failed:', error)
      this.attemptReconnect()
    }
  }

  private attemptReconnect(): void {
    if (!this.shouldReconnect || this.reconnectAttempts >= this.maxReconnectAttempts) return

    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000)
    this.reconnectAttempts++

    this.reconnectTimer = setTimeout(() => {
      console.log(`[WS] Reconnect attempt ${this.reconnectAttempts}`)
      this.createConnection()
    }, delay)
  }

  private emit(type: string, message: WSMessage): void {
    this.handlers.get(type)?.forEach((handler) => handler(message))
    this.handlers.get('*')?.forEach((handler) => handler(message))
  }
}

export const wsService = new WebSocketService()
