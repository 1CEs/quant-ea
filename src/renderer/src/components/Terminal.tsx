import { useEffect, useRef, useCallback, useState } from 'react'
import { useTerminalStore, type LogLevel } from '@/store/terminal-store'
import { wsService } from '@/services/websocket'
import { cn } from '@/lib/utils'
import {
  Terminal as TerminalIcon,
  ChevronUp,
  ChevronDown,
  Trash2
} from 'lucide-react'

const LEVEL_COLORS: Record<LogLevel, string> = {
  info: 'text-blue-400',
  warn: 'text-yellow-400',
  error: 'text-red-400',
  success: 'text-emerald-400',
  debug: 'text-zinc-500',
}

const LEVEL_LABELS: Record<LogLevel, string> = {
  info: 'INF',
  warn: 'WRN',
  error: 'ERR',
  success: 'OK ',
  debug: 'DBG',
}

const FILTERS: (LogLevel | 'all')[] = ['all', 'info', 'success', 'warn', 'error', 'debug']

function Terminal(): JSX.Element {
  const entries = useTerminalStore((s) => s.entries)
  const isOpen = useTerminalStore((s) => s.isOpen)
  const height = useTerminalStore((s) => s.height)
  const filter = useTerminalStore((s) => s.filter)
  const log = useTerminalStore((s) => s.log)
  const toggleOpen = useTerminalStore((s) => s.toggleOpen)
  const setHeight = useTerminalStore((s) => s.setHeight)
  const setFilter = useTerminalStore((s) => s.setFilter)
  const clear = useTerminalStore((s) => s.clear)

  const scrollRef = useRef<HTMLDivElement>(null)
  const [autoScroll, setAutoScroll] = useState(true)
  const [dragging, setDragging] = useState(false)
  const dragStartY = useRef(0)
  const dragStartH = useRef(0)

  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [entries, autoScroll])

  const handleScroll = useCallback(() => {
    if (!scrollRef.current) return
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current
    setAutoScroll(scrollHeight - scrollTop - clientHeight < 40)
  }, [])

  useEffect(() => {
    log('info', 'system', 'Terminal initialized')

    const unsub = wsService.on('*', (msg) => {
      const t = msg.type
      if (t === 'connection') {
        const status = msg.data.status as string
        if (status === 'connected') log('success', 'ws', 'WebSocket connected')
        else if (status === 'disconnected') log('warn', 'ws', 'WebSocket disconnected')
        else if (status === 'error') log('error', 'ws', 'WebSocket error')
        return
      }
      if (t === 'login_response') {
        if (msg.data.success) {
          const mode = (msg.data.mt5_mode as string) || 'unknown'
          log('success', 'mt5', `Login successful [mode=${mode}]`)
        } else {
          log('error', 'mt5', `Login failed: ${msg.data.error}`)
        }
        return
      }
      if (t === 'account_info' || t === 'positions') {
        return
      }
      if (t === 'dataset_loaded') {
        if (msg.data.success) {
          const strategy = msg.data.strategy as string
          log('success', 'data', `Dataset loaded: ${msg.data.symbol} ${msg.data.timeframe} — ${msg.data.count} candles [${strategy}]`)
        } else {
          log('error', 'data', `Dataset failed: ${msg.data.error}`)
        }
        return
      }
      if (t === 'bot_status') {
        return
      }
      if (t === 'trade_log') {
        log('info', 'trade', `[${msg.data.action}] ${msg.data.symbol} — ${msg.data.message}`)
        return
      }
      if (t === 'trade_opened') {
        log('success', 'trade', `Opened: ${msg.data.type} ${msg.data.volume} ${msg.data.symbol} @ ${msg.data.price}`)
        return
      }
      if (t === 'trade_closed') {
        const profit = msg.data.profit as number
        log(profit >= 0 ? 'success' : 'warn', 'trade', `Closed: ${msg.data.symbol} P/L: ${profit}`)
        return
      }
      if (t === 'order_placed') {
        log('success', 'order', `Order placed: #${msg.data.ticket}`)
        return
      }
      if (t === 'order_cancelled') {
        log('info', 'order', `Order cancelled: #${msg.data.ticket}`)
        return
      }
      if (t === 'error') {
        log('error', 'server', msg.data.message as string)
        return
      }
      if (t === 'symbols' || t === 'pending_orders') {
        return
      }
    })

    return () => unsub()
  }, [log])

  const filtered = filter === 'all' ? entries : entries.filter((e) => e.level === filter)

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    setDragging(true)
    dragStartY.current = e.clientY
    dragStartH.current = height
  }, [height])

  useEffect(() => {
    if (!dragging) return
    const handleMove = (e: MouseEvent): void => {
      const delta = dragStartY.current - e.clientY
      setHeight(dragStartH.current + delta)
    }
    const handleUp = (): void => setDragging(false)
    window.addEventListener('mousemove', handleMove)
    window.addEventListener('mouseup', handleUp)
    return () => {
      window.removeEventListener('mousemove', handleMove)
      window.removeEventListener('mouseup', handleUp)
    }
  }, [dragging, setHeight])

  return (
    <div className="border-t border-border bg-card flex flex-col" style={{ flexShrink: 0 }}>
      {isOpen && (
        <div
          className="h-1.5 cursor-ns-resize flex items-center justify-center hover:bg-primary/20 transition-colors group"
          onMouseDown={handleMouseDown}
        >
          <div className="w-8 h-0.5 rounded-full bg-muted-foreground/30 group-hover:bg-primary/50 transition-colors" />
        </div>
      )}
      <div
        className="flex items-center justify-between px-3 py-1 cursor-pointer select-none border-b border-border hover:bg-accent/30 transition-colors"
        onClick={toggleOpen}
      >
        <div className="flex items-center gap-2">
          <TerminalIcon className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-xs font-medium">Terminal</span>
          <span className="text-[10px] text-muted-foreground">
            {entries.length} events
          </span>
        </div>
        <div className="flex items-center gap-1">
          {isOpen && (
            <>
              <div className="flex items-center gap-0.5 mr-2">
                {FILTERS.map((f) => (
                  <button
                    key={f}
                    onClick={(e) => { e.stopPropagation(); setFilter(f) }}
                    className={cn(
                      'px-1.5 py-0.5 rounded text-[9px] font-medium uppercase transition-colors',
                      filter === f
                        ? 'bg-accent text-accent-foreground'
                        : 'text-muted-foreground hover:text-foreground'
                    )}
                  >
                    {f}
                  </button>
                ))}
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); clear() }}
                className="p-1 text-muted-foreground hover:text-foreground transition-colors"
                title="Clear"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </>
          )}
          {isOpen ? (
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
          ) : (
            <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />
          )}
        </div>
      </div>

      {isOpen && (
        <>
          <div
            ref={scrollRef}
            onScroll={handleScroll}
            className="overflow-auto font-mono text-[11px] leading-[18px] select-text cursor-text"
            style={{ height }}
          >
            {filtered.length === 0 ? (
              <div className="flex items-center justify-center h-full text-muted-foreground text-xs">
                No log entries
              </div>
            ) : (
              <table className="w-full">
                <tbody>
                  {filtered.map((entry) => (
                    <tr key={entry.id} className="hover:bg-accent/20">
                      <td className="px-2 py-px text-muted-foreground whitespace-nowrap align-top w-[70px]">
                        {new Date(entry.timestamp).toLocaleTimeString('en-GB', { hour12: false })}
                      </td>
                      <td className={cn('px-1 py-px font-bold whitespace-nowrap align-top w-[32px]', LEVEL_COLORS[entry.level])}>
                        {LEVEL_LABELS[entry.level]}
                      </td>
                      <td className="px-1 py-px text-primary/70 whitespace-nowrap align-top w-[52px]">
                        [{entry.source}]
                      </td>
                      <td className="px-1 py-px text-foreground/90 break-all">
                        {entry.message}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
    </div>
  )
}

export default Terminal
