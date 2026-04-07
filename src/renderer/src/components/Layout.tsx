import { useEffect, useCallback } from 'react'
import { Outlet, useNavigate, useLocation } from 'react-router-dom'
import { useAppStore } from '@/store/app-store'
import type { DatasetTfStatus } from '@/store/app-store'
import { wsService } from '@/services/websocket'
import {
  LayoutDashboard,
  Settings,
  LogOut,
  Activity,
  Wifi,
  WifiOff,
  Bot,
  OctagonX,
  FlaskConical,
  CalendarDays
} from 'lucide-react'
import { cn } from '@/lib/utils'
import Terminal from '@/components/Terminal'

function Layout(): JSX.Element {
  const navigate = useNavigate()
  const location = useLocation()
  const connectionStatus = useAppStore((s) => s.connectionStatus)
  const botStatus = useAppStore((s) => s.botStatus)
  const accountInfo = useAppStore((s) => s.accountInfo)
  const demoMode = useAppStore((s) => s.demoMode)
  const isFullscreen = useAppStore((s) => s.isFullscreen)
  const setConnectionStatus = useAppStore((s) => s.setConnectionStatus)
  const setDatasetStatus = useAppStore((s) => s.setDatasetStatus)
  const updateDatasetTf = useAppStore((s) => s.updateDatasetTf)
  const setDatasetImporting = useAppStore((s) => s.setDatasetImporting)
  const addNotification = useAppStore((s) => s.addNotification)

  const handleCsvImported = useCallback((msg: { data: Record<string, unknown> }) => {
    setDatasetImporting(null)
    if (msg.data.success) {
      const tf = msg.data.timeframe as string
      const cached = msg.data.cached_range as { start_time: number; end_time: number; count: number } | null
      if (cached) {
        updateDatasetTf(tf, { count: cached.count, startTime: cached.start_time, endTime: cached.end_time })
      }
      addNotification({ type: 'success', title: 'CSV Imported', message: `XAUUSD ${tf} — ${(msg.data.count as number).toLocaleString()} candles` })
    } else {
      addNotification({ type: 'error', title: 'Import Failed', message: (msg.data.error as string) || 'Failed' })
    }
  }, [addNotification, setDatasetImporting, updateDatasetTf])

  const handleCsvProgress = useCallback((msg: { data: Record<string, unknown> }) => {
    const tf = msg.data.timeframe as string
    const stage = msg.data.stage as string
    if (stage === 'done') setDatasetImporting(null)
    else setDatasetImporting({ tf, stage })
  }, [setDatasetImporting])

  const handleDatasetStatus = useCallback((msg: { data: Record<string, unknown> }) => {
    const tfs = msg.data.timeframes as Record<string, { count: number; start_time: number; end_time: number }> | undefined
    if (!tfs) return
    const next: Record<string, DatasetTfStatus> = {}
    for (const [tf, info] of Object.entries(tfs)) {
      next[tf] = { count: info.count, startTime: info.start_time, endTime: info.end_time }
    }
    setDatasetStatus(next)
  }, [setDatasetStatus])

  useEffect(() => {
    const u1 = wsService.on('csv_imported', handleCsvImported)
    const u2 = wsService.on('csv_progress', handleCsvProgress)
    const u3 = wsService.on('dataset_status', handleDatasetStatus)
    wsService.send('get_dataset_status', {})
    return () => { u1(); u2(); u3() }
  }, [handleCsvImported, handleCsvProgress, handleDatasetStatus])

  const handleLogout = (): void => {
    wsService.send('disconnect')
    wsService.disconnect()
    setConnectionStatus('disconnected')
    navigate('/login')
  }

  const handleEmergencyStop = (): void => {
    wsService.send('emergency_stop')
  }

  const navItems = [
    { path: '/', icon: LayoutDashboard, label: 'Dashboard' },
    { path: '/backtest', icon: FlaskConical, label: 'Backtest' },
    { path: '/pnl-calendar', icon: CalendarDays, label: 'P&L Calendar' },
    { path: '/settings', icon: Settings, label: 'Settings' }
  ]

  return (
    <div className="flex flex-col h-screen">
      <div className="flex flex-1 min-h-0">
      <aside className="w-56 border-r border-border bg-card flex flex-col">
        {!isFullscreen && <div className="titlebar-drag h-10 shrink-0" />}
        <div className="p-4 border-b border-border">
          <div className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-primary" />
            <span className="font-semibold text-sm">Quant EA</span>
            {demoMode && (
              <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-yellow-500/15 text-yellow-500">
                Demo
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5 mt-2">
            {connectionStatus === 'connected' ? (
              <Wifi className="h-3 w-3 text-profit" />
            ) : (
              <WifiOff className="h-3 w-3 text-loss" />
            )}
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider">
              {connectionStatus}
            </span>
          </div>
          {accountInfo && (
            <p className="text-[10px] text-muted-foreground mt-1">
              {accountInfo.login} @ {accountInfo.server}
            </p>
          )}
        </div>

        <nav className="flex-1 p-2">
          {navItems.map((item) => (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
              className={cn(
                'w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-colors',
                location.pathname === item.path
                  ? 'bg-accent text-accent-foreground'
                  : 'text-muted-foreground hover:text-foreground hover:bg-accent/50'
              )}
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </button>
          ))}
        </nav>

        <div className="p-2 border-t border-border space-y-1">
          <div className="flex items-center gap-2 px-3 py-1.5">
            <Bot className="h-3.5 w-3.5" />
            <span className="text-xs">Bot:</span>
            <span
              className={cn(
                'text-xs font-medium',
                botStatus === 'running' && 'text-profit',
                botStatus === 'paused' && 'text-yellow-500',
                botStatus === 'stopped' && 'text-muted-foreground'
              )}
            >
              {botStatus.toUpperCase()}
            </span>
          </div>

          {botStatus === 'running' && (
            <button
              onClick={handleEmergencyStop}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm bg-destructive/10 text-loss hover:bg-destructive/20 transition-colors"
            >
              <OctagonX className="h-4 w-4" />
              Emergency Stop
            </button>
          )}

          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors"
          >
            <LogOut className="h-4 w-4" />
            Disconnect
          </button>
        </div>
      </aside>

      <main className="flex-1 overflow-auto bg-background">
        {!isFullscreen && <div className="titlebar-drag h-10 shrink-0" />}
        <Outlet />
      </main>
      </div>
      <Terminal />
    </div>
  )
}

export default Layout
