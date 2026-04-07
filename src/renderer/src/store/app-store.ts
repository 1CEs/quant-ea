import { create } from 'zustand'
import type {
  AccountInfo,
  Position,
  PendingOrder,
  TradeHistory,
  TradeLog,
  BotStatus,
  ConnectionStatus,
  BotConfig,
  RiskConfig,
  SymbolInfo
} from '@/types'

export interface DatasetTfStatus {
  count: number
  startTime: number
  endTime: number
}

interface AppState {
  connectionStatus: ConnectionStatus
  accountInfo: AccountInfo | null
  positions: Position[]
  pendingOrders: PendingOrder[]
  tradeHistory: TradeHistory[]
  tradeLogs: TradeLog[]
  botStatus: BotStatus
  botConfig: BotConfig | null
  riskConfig: RiskConfig
  symbols: SymbolInfo[]
  notifications: AppNotification[]
  demoMode: boolean
  isFullscreen: boolean
  datasetStatus: Record<string, DatasetTfStatus>
  datasetImporting: { tf: string; stage: string } | null

  setIsFullscreen: (fs: boolean) => void
  setDemoMode: (demo: boolean) => void
  setConnectionStatus: (status: ConnectionStatus) => void
  setAccountInfo: (info: AccountInfo | null) => void
  setPositions: (positions: Position[]) => void
  setPendingOrders: (orders: PendingOrder[]) => void
  setTradeHistory: (history: TradeHistory[]) => void
  addTradeLog: (log: TradeLog) => void
  setBotStatus: (status: BotStatus) => void
  setBotConfig: (config: BotConfig | null) => void
  setRiskConfig: (config: RiskConfig) => void
  setSymbols: (symbols: SymbolInfo[]) => void
  addNotification: (notification: Omit<AppNotification, 'id' | 'timestamp'>) => void
  removeNotification: (id: string) => void
  setDatasetStatus: (status: Record<string, DatasetTfStatus>) => void
  updateDatasetTf: (tf: string, info: DatasetTfStatus) => void
  setDatasetImporting: (v: { tf: string; stage: string } | null) => void
}

export interface AppNotification {
  id: string
  type: 'success' | 'error' | 'warning' | 'info'
  title: string
  message: string
  timestamp: number
}

export const useAppStore = create<AppState>((set) => ({
  connectionStatus: 'disconnected',
  accountInfo: null,
  positions: [],
  pendingOrders: [],
  tradeHistory: [],
  tradeLogs: [],
  botStatus: 'stopped',
  botConfig: null,
  riskConfig: {
    max_daily_loss: 100,
    max_daily_loss_type: 'amount',
    max_drawdown: 10,
    max_open_trades: 5,
    max_spread: 3,
    trading_hours_enabled: false,
    trading_hours_start: '08:00',
    trading_hours_end: '22:00'
  },
  symbols: [],
  notifications: [],
  demoMode: false,
  isFullscreen: false,
  datasetStatus: {},
  datasetImporting: null,

  setIsFullscreen: (fs) => set({ isFullscreen: fs }),
  setDemoMode: (demo) => set({ demoMode: demo }),
  setConnectionStatus: (status) => set({ connectionStatus: status }),
  setAccountInfo: (info) => set({ accountInfo: info }),
  setPositions: (positions) => set({ positions }),
  setPendingOrders: (orders) => set({ pendingOrders: orders }),
  setTradeHistory: (history) => set({ tradeHistory: history }),
  addTradeLog: (log) => set((state) => ({ tradeLogs: [log, ...state.tradeLogs].slice(0, 500) })),
  setBotStatus: (status) => set({ botStatus: status }),
  setBotConfig: (config) => set({ botConfig: config }),
  setRiskConfig: (config) => set({ riskConfig: config }),
  setSymbols: (symbols) => set({ symbols }),
  setDatasetStatus: (status) => set({ datasetStatus: status }),
  updateDatasetTf: (tf, info) => set((state) => ({ datasetStatus: { ...state.datasetStatus, [tf]: info } })),
  setDatasetImporting: (v) => set({ datasetImporting: v }),
  addNotification: (notification) =>
    set((state) => ({
      notifications: [
        ...state.notifications,
        {
          ...notification,
          id: crypto.randomUUID(),
          timestamp: Date.now()
        }
      ]
    })),
  removeNotification: (id) =>
    set((state) => ({
      notifications: state.notifications.filter((n) => n.id !== id)
    }))
}))
