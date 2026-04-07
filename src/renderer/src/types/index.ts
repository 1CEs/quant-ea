export interface MT5Credentials {
  account: string
  password: string
  server: string
}

export interface AccountInfo {
  balance: number
  equity: number
  margin: number
  free_margin: number
  profit: number
  currency: string
  leverage: number
  name: string
  server: string
  login: number
}

export interface Position {
  ticket: number
  symbol: string
  type: 'buy' | 'sell'
  volume: number
  open_price: number
  current_price: number
  sl: number
  tp: number
  profit: number
  open_time: string
  magic: number
  comment: string
}

export interface PendingOrder {
  ticket: number
  symbol: string
  type: 'buy_limit' | 'sell_limit' | 'buy_stop' | 'sell_stop'
  volume: number
  price: number
  sl: number
  tp: number
  open_time: string
  comment: string
}

export interface TradeHistory {
  ticket: number
  symbol: string
  type: string
  volume: number
  open_price: number
  close_price: number
  profit: number
  open_time: string
  close_time: string
  comment: string
}

export interface SymbolInfo {
  name: string
  description: string
  spread: number
  digits: number
  point: number
  bid: number
  ask: number
  volume_min: number
  volume_max: number
  volume_step: number
}

export type BotStatus = 'stopped' | 'starting' | 'running' | 'paused'
export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error'
export type Timeframe = 'M1' | 'M5' | 'M15' | 'M30' | 'H1' | 'H4' | 'D1'

export interface BotConfig {
  symbol: string
  timeframe: Timeframe
  lot_size: number
  use_risk_percent: boolean
  risk_percent: number
}

export interface RiskConfig {
  max_daily_loss: number
  max_daily_loss_type: 'amount' | 'percent'
  max_drawdown: number
  max_open_trades: number
  max_spread: number
  trading_hours_enabled: boolean
  trading_hours_start: string
  trading_hours_end: string
}

export interface TradeLog {
  id: number
  timestamp: string
  action: string
  symbol: string
  type: string
  volume: number
  price: number
  sl: number
  tp: number
  profit: number
  message: string
}

export interface WSMessage {
  type: string
  data: Record<string, unknown>
}

export interface OrderRequest {
  action: 'buy' | 'sell' | 'buy_limit' | 'sell_limit' | 'buy_stop' | 'sell_stop'
  symbol: string
  volume: number
  price?: number
  sl?: number
  tp?: number
  comment?: string
}

export interface ModifyRequest {
  ticket: number
  sl?: number
  tp?: number
  price?: number
}

export interface CloseRequest {
  ticket: number
  volume?: number
}
