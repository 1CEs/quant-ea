import { create } from 'zustand'

export type LogLevel = 'info' | 'warn' | 'error' | 'success' | 'debug'

export interface TerminalEntry {
  id: string
  timestamp: number
  level: LogLevel
  source: string
  message: string
}

interface TerminalState {
  entries: TerminalEntry[]
  isOpen: boolean
  height: number
  filter: LogLevel | 'all'

  log: (level: LogLevel, source: string, message: string) => void
  setOpen: (open: boolean) => void
  toggleOpen: () => void
  setHeight: (h: number) => void
  setFilter: (f: LogLevel | 'all') => void
  clear: () => void
}

export const useTerminalStore = create<TerminalState>((set) => ({
  entries: [],
  isOpen: true,
  height: 200,
  filter: 'all',

  log: (level, source, message) =>
    set((state) => ({
      entries: [
        ...state.entries,
        {
          id: crypto.randomUUID(),
          timestamp: Date.now(),
          level,
          source,
          message,
        },
      ].slice(-1000),
    })),

  setOpen: (open) => set({ isOpen: open }),
  toggleOpen: () => set((s) => ({ isOpen: !s.isOpen })),
  setHeight: (height) => set({ height: Math.max(100, Math.min(500, height)) }),
  setFilter: (filter) => set({ filter }),
  clear: () => set({ entries: [] }),
}))
