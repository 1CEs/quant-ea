import { useState, useEffect, useCallback, useMemo } from 'react'
import { useAppStore } from '@/store/app-store'
import { wsService } from '@/services/websocket'
import {
  FlaskConical,
  Loader2,
  Upload,
  BarChart3,
  Play,
  TrendingUp,
  TrendingDown,
  Target,
  Trophy,
  AlertTriangle,
  ArrowDownRight,
  CheckCircle2,
  FileSpreadsheet,
  Settings2,
  ListOrdered,
  ChevronLeft,
  ChevronRight,
  CalendarDays,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface BacktestTrade {
  direction: string
  entry_price: number
  exit_price: number
  sl: number
  tp: number
  entry_time: number
  exit_time: number
  pnl: number
  exit_reason: string
}

interface BacktestStats {
  total_trades: number
  wins: number
  losses: number
  win_rate: number
  profit_factor: number
  total_pnl: number
  max_drawdown: number
  max_drawdown_pct: number
  avg_win: number
  avg_loss: number
  best_trade: number
  worst_trade: number
  avg_trade_duration: number
  initial_balance: number
  final_balance: number
}

interface BacktestResult {
  stats: BacktestStats
  trades: BacktestTrade[]
  equity_curve: { time: number; equity: number }[]
  timeframe: string
  strategy: string
}

const TIMEFRAMES = ['M5', 'M15', 'M30', 'H1', 'H4', 'D1', 'W1', 'MN1']

interface StrategyPreset {
  id: string
  strategy: string
  name: string
  description: string
  timeframe: string
  balance: number
  lot_size: number
  spread: number
  params: Record<string, number | boolean>
  details: string
}

const STRATEGY_PRESETS: StrategyPreset[] = [
  {
    id: 'rl_m5',
    strategy: 'rl_strategy',
    name: 'RL Thompson Bandit',
    description: 'Reinforcement learning meta-labeler that learns to survive the market. Thompson Sampling bandit filters EMA/RSI/ADX signals — only trades when Bayesian win-rate estimate is favorable. Walk-forward retraining adapts to regime changes.',
    timeframe: 'M5',
    balance: 1000,
    lot_size: 0.01,
    spread: 0.30,
    params: { train_window: 20000, retrain_interval: 5000, adx_min: 20.0, max_hold: 20, atr_period: 10, sl_atr_mult: 1.5, tp_atr_mult: 2.5, spread: 0.30, min_atr: 1.0, win_weight: 1.0, loss_weight: 1.5 },
    details: 'Thompson Sampling · EMA8/21 + RSI7 + ADX · Bayesian filter · Walk-forward/5k · ATR SL×1.5 / TP×2.5',
  },
]

function BacktestPage(): JSX.Element {
  const addNotification = useAppStore((s) => s.addNotification)
  const tfStatus = useAppStore((s) => s.datasetStatus)
  const importing = useAppStore((s) => s.datasetImporting)
  const setDatasetImporting = useAppStore((s) => s.setDatasetImporting)

  const [presetId, setPresetId] = useState(STRATEGY_PRESETS[0].id)
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState('')
  const [result, setResult] = useState<BacktestResult | null>(null)

  const preset = STRATEGY_PRESETS.find(p => p.id === presetId) || STRATEGY_PRESETS[0]

  const handleProgress = useCallback((msg: { data: Record<string, unknown> }) => {
    const status = msg.data.status as string
    const candles = msg.data.candles as number | undefined
    if (status === 'loading') setProgress('Loading candles...')
    else if (status === 'running') setProgress(`Running on ${candles?.toLocaleString() || ''} candles...`)
  }, [])

  const handleResult = useCallback((msg: { data: Record<string, unknown> }) => {
    setRunning(false)
    setProgress('')
    if (msg.data.success) {
      setResult({
        stats: msg.data.stats as BacktestStats,
        trades: msg.data.trades as BacktestTrade[],
        equity_curve: msg.data.equity_curve as { time: number; equity: number }[],
        timeframe: msg.data.timeframe as string,
        strategy: msg.data.strategy as string,
      })
      addNotification({ type: 'success', title: 'Backtest Complete', message: `${(msg.data.stats as BacktestStats).total_trades} trades processed` })
    } else {
      addNotification({ type: 'error', title: 'Backtest Failed', message: (msg.data.error as string) || 'Error' })
    }
  }, [addNotification])

  useEffect(() => {
    const u1 = wsService.on('backtest_progress', handleProgress)
    const u2 = wsService.on('backtest_result', handleResult)
    return () => { u1(); u2() }
  }, [handleProgress, handleResult])

  const handleImport = async (tf: string): Promise<void> => {
    const filePath = await window.api.dialog.openCsv()
    if (!filePath) return
    setDatasetImporting({ tf, stage: 'parsing' })
    wsService.send('import_csv', { file_path: filePath, timeframe: tf })
  }

  const handleRunBacktest = (): void => {
    setRunning(true)
    setResult(null)
    wsService.send('run_backtest', {
      strategy: preset.strategy,
      timeframe: preset.timeframe,
      balance: preset.balance,
      lot_size: preset.lot_size,
      spread: preset.spread,
      params: preset.params,
    })
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-3">
        <FlaskConical className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-lg font-semibold">Backtest</h1>
          <p className="text-xs text-muted-foreground">
            Test trading strategies on historical XAUUSD data
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        <div className="lg:col-span-1 space-y-4">
          <div className="rounded-lg border border-border bg-card p-4 space-y-3">
            <h2 className="text-sm font-medium flex items-center gap-2">
              <Upload className="h-4 w-4" />
              Data (CSV Import)
            </h2>
            <div className="space-y-1">
              {TIMEFRAMES.map((tf) => {
                const status = tfStatus[tf]
                const isImporting = importing?.tf === tf
                const stageLabel = isImporting
                  ? importing.stage === 'parsing' ? 'Parsing CSV...' : importing.stage === 'storing' ? 'Storing to DB...' : 'Importing...'
                  : null
                return (
                  <button
                    key={tf}
                    onClick={() => handleImport(tf)}
                    disabled={!!importing}
                    className={cn(
                      'w-full px-2.5 py-1.5 text-xs rounded-md border transition-all flex items-center gap-2',
                      status ? 'border-profit/30 bg-profit/5 text-foreground' : 'border-border bg-secondary text-muted-foreground hover:text-foreground',
                      isImporting && 'border-primary/40 bg-primary/5',
                      !!importing && !isImporting && 'opacity-40 cursor-not-allowed'
                    )}
                  >
                    {isImporting ? <Loader2 className="h-3 w-3 animate-spin text-primary" /> : status ? <CheckCircle2 className="h-3 w-3 text-profit" /> : <FileSpreadsheet className="h-3 w-3" />}
                    <span className="font-medium">{tf}</span>
                    {isImporting && stageLabel && <span className="ml-auto text-[10px] text-primary animate-pulse">{stageLabel}</span>}
                    {!isImporting && status && <span className="ml-auto text-[10px] text-muted-foreground">{status.count.toLocaleString()}</span>}
                  </button>
                )
              })}
            </div>
          </div>

          <div className="rounded-lg border border-border bg-card p-4 space-y-4">
            <h2 className="text-sm font-medium flex items-center gap-2">
              <Settings2 className="h-4 w-4" />
              Strategy Preset
            </h2>

            <div className="space-y-1.5">
              {STRATEGY_PRESETS.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setPresetId(p.id)}
                  className={cn(
                    'w-full text-left px-3 py-2.5 rounded-md border transition-all',
                    presetId === p.id
                      ? 'border-primary bg-primary/10 text-foreground'
                      : 'border-border bg-secondary text-muted-foreground hover:text-foreground hover:bg-accent'
                  )}
                >
                  <div className="text-xs font-medium">{p.name}</div>
                  <div className="text-[10px] text-muted-foreground mt-1 leading-relaxed">{p.description}</div>
                </button>
              ))}
            </div>

            <div className="rounded-md bg-secondary/50 px-3 py-2">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Config</p>
              <p className="text-[11px] font-medium leading-relaxed">{preset.details}</p>
            </div>

            <div className="border-t border-border pt-3">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2">Settings</p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
                <DetailRow label="Timeframe" value={preset.timeframe} />
                <DetailRow label="Balance" value={`$${preset.balance.toLocaleString()}`} />
                <DetailRow label="Lot Size" value={`${preset.lot_size}`} />
                <DetailRow label="Spread" value={`${preset.spread}`} />
              </div>
            </div>

            <button
              onClick={handleRunBacktest}
              disabled={running}
              className="w-full py-2.5 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {running ? (
                <><Loader2 className="h-4 w-4 animate-spin" />{progress || 'Running...'}</>
              ) : (
                <><Play className="h-4 w-4" />Run Backtest</>
              )}
            </button>
          </div>
        </div>

        <div className="lg:col-span-3">
          {result ? (
            <BacktestResults result={result} />
          ) : (
            <div className="rounded-lg border border-border bg-card flex flex-col items-center justify-center h-96 text-muted-foreground">
              <BarChart3 className="h-10 w-10 mb-3 opacity-30" />
              <p className="text-sm">No backtest results</p>
              <p className="text-xs mt-1">Import CSV data, pick a strategy preset, then run</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function DetailRow({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div className="flex items-center justify-between text-xs gap-2">
      <span className="text-muted-foreground shrink-0">{label}</span>
      <span className="font-medium text-right truncate max-w-[140px]" title={value}>{value}</span>
    </div>
  )
}

function BacktestResults({ result }: { result: BacktestResult }): JSX.Element {
  const { stats, trades, equity_curve } = result
  const profitable = stats.total_pnl >= 0

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard icon={Trophy} label="Total P&L" value={`$${stats.total_pnl.toFixed(2)}`} color={profitable ? 'text-profit' : 'text-loss'} />
        <StatCard icon={Target} label="Win Rate" value={`${stats.win_rate}%`} sub={`${stats.wins}W / ${stats.losses}L`} color={stats.win_rate >= 50 ? 'text-profit' : 'text-loss'} />
        <StatCard icon={TrendingUp} label="Profit Factor" value={`${stats.profit_factor}`} color={stats.profit_factor >= 1 ? 'text-profit' : 'text-loss'} />
        <StatCard icon={ArrowDownRight} label="Max Drawdown" value={`$${stats.max_drawdown.toFixed(2)}`} sub={`${stats.max_drawdown_pct}%`} color="text-loss" />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard icon={ListOrdered} label="Total Trades" value={`${stats.total_trades}`} />
        <StatCard icon={TrendingUp} label="Avg Win" value={`$${stats.avg_win.toFixed(2)}`} color="text-profit" />
        <StatCard icon={TrendingDown} label="Avg Loss" value={`$${stats.avg_loss.toFixed(2)}`} color="text-loss" />
        <StatCard icon={BarChart3} label="Final Balance" value={`$${stats.final_balance.toFixed(2)}`} color={stats.final_balance >= stats.initial_balance ? 'text-profit' : 'text-loss'} />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <MiniStatCard label="Best Trade" value={`$${stats.best_trade.toFixed(2)}`} color="text-profit" />
        <MiniStatCard label="Worst Trade" value={`$${stats.worst_trade.toFixed(2)}`} color="text-loss" />
      </div>

      {equity_curve.length > 0 && (
        <div className="rounded-lg border border-border bg-card p-4">
          <h2 className="text-sm font-medium mb-3">Equity Curve</h2>
          <EquityCurveChart data={equity_curve} initial={stats.initial_balance} />
        </div>
      )}

      {trades.length > 0 && <PnLCalendar trades={trades} />}

      {trades.length > 0 && (
        <div className="rounded-lg border border-border bg-card overflow-hidden">
          <div className="p-3 border-b border-border flex items-center justify-between">
            <h2 className="text-sm font-medium">Trade History</h2>
            <span className="text-[10px] text-muted-foreground">{trades.length} trades</span>
          </div>
          <div className="overflow-auto max-h-96">
            <table className="w-full text-xs">
              <thead className="bg-secondary/50 sticky top-0">
                <tr>
                  <th className="text-left px-3 py-2 font-medium text-muted-foreground">#</th>
                  <th className="text-left px-3 py-2 font-medium text-muted-foreground">Dir</th>
                  <th className="text-left px-3 py-2 font-medium text-muted-foreground">Entry Time</th>
                  <th className="text-right px-3 py-2 font-medium text-muted-foreground">Entry</th>
                  <th className="text-right px-3 py-2 font-medium text-muted-foreground">Exit</th>
                  <th className="text-right px-3 py-2 font-medium text-muted-foreground">SL</th>
                  <th className="text-right px-3 py-2 font-medium text-muted-foreground">TP</th>
                  <th className="text-left px-3 py-2 font-medium text-muted-foreground">Reason</th>
                  <th className="text-right px-3 py-2 font-medium text-muted-foreground">P&L</th>
                </tr>
              </thead>
              <tbody>
                {trades.map((t, i) => (
                  <tr key={i} className="border-t border-border/50 hover:bg-accent/30">
                    <td className="px-3 py-1.5 text-muted-foreground">{i + 1}</td>
                    <td className={cn('px-3 py-1.5 font-medium', t.direction === 'buy' ? 'text-profit' : 'text-loss')}>
                      {t.direction.toUpperCase()}
                    </td>
                    <td className="px-3 py-1.5 text-muted-foreground">{formatTs(t.entry_time)}</td>
                    <td className="text-right px-3 py-1.5">{t.entry_price.toFixed(2)}</td>
                    <td className="text-right px-3 py-1.5">{t.exit_price.toFixed(2)}</td>
                    <td className="text-right px-3 py-1.5 text-muted-foreground">{t.sl.toFixed(2)}</td>
                    <td className="text-right px-3 py-1.5 text-muted-foreground">{t.tp.toFixed(2)}</td>
                    <td className="px-3 py-1.5">
                      <span className={cn(
                        'px-1.5 py-0.5 rounded text-[10px] font-medium',
                        t.exit_reason === 'tp' ? 'bg-profit/10 text-profit' : t.exit_reason === 'sl' ? 'bg-loss/10 text-loss' : 'bg-secondary text-muted-foreground'
                      )}>
                        {t.exit_reason.toUpperCase()}
                      </span>
                    </td>
                    <td className={cn('text-right px-3 py-1.5 font-medium', t.pnl >= 0 ? 'text-profit' : 'text-loss')}>
                      {t.pnl >= 0 ? '+' : ''}{t.pnl.toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {trades.length === 0 && (
        <div className="rounded-lg border border-border bg-card p-6 flex items-center gap-3 text-muted-foreground">
          <AlertTriangle className="h-5 w-5" />
          <p className="text-sm">No trades were generated. Try adjusting the strategy parameters or using a different timeframe.</p>
        </div>
      )}
    </div>
  )
}

function PnLCalendar({ trades }: { trades: BacktestTrade[] }): JSX.Element {
  const dailyPnl = useMemo(() => {
    const map: Record<string, number> = {}
    for (const t of trades) {
      if (!t.exit_time) continue
      const d = new Date(t.exit_time * 1000)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      map[key] = (map[key] || 0) + t.pnl
    }
    return map
  }, [trades])

  const availableMonths = useMemo(() => {
    const keys = Object.keys(dailyPnl).sort()
    if (!keys.length) return []
    const months = new Set<string>()
    for (const k of keys) months.add(k.slice(0, 7))
    return Array.from(months).sort()
  }, [dailyPnl])

  const [monthIdx, setMonthIdx] = useState(0)

  useEffect(() => {
    if (availableMonths.length > 0) setMonthIdx(availableMonths.length - 1)
  }, [availableMonths])

  if (!availableMonths.length) return <></>

  const currentMonth = availableMonths[monthIdx] || availableMonths[availableMonths.length - 1]
  const [yearStr, monStr] = currentMonth.split('-')
  const year = parseInt(yearStr)
  const month = parseInt(monStr) - 1

  const firstDay = new Date(year, month, 1)
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  let startDow = firstDay.getDay() - 1
  if (startDow < 0) startDow = 6

  const prevMonth = new Date(year, month, 0)
  const prevDays = prevMonth.getDate()

  const cells: { day: number; inMonth: boolean; key: string }[] = []
  for (let i = startDow - 1; i >= 0; i--) {
    const d = prevDays - i
    const m = month === 0 ? 12 : month
    const y = month === 0 ? year - 1 : year
    cells.push({ day: d, inMonth: false, key: `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}` })
  }
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ day: d, inMonth: true, key: `${yearStr}-${monStr}-${String(d).padStart(2, '0')}` })
  }
  const remaining = 7 - (cells.length % 7)
  if (remaining < 7) {
    for (let d = 1; d <= remaining; d++) {
      const m = month + 2 > 12 ? 1 : month + 2
      const y = month + 2 > 12 ? year + 1 : year
      cells.push({ day: d, inMonth: false, key: `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}` })
    }
  }

  const weeks: typeof cells[] = []
  for (let i = 0; i < cells.length; i += 7) {
    weeks.push(cells.slice(i, i + 7))
  }

  const monthLabel = firstDay.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })

  const monthPnl = Object.entries(dailyPnl)
    .filter(([k]) => k.startsWith(currentMonth))
    .reduce((sum, [, v]) => sum + v, 0)

  const tradingDays = Object.keys(dailyPnl).filter(k => k.startsWith(currentMonth)).length
  const winDays = Object.entries(dailyPnl).filter(([k, v]) => k.startsWith(currentMonth) && v > 0).length

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <CalendarDays className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-medium">P&L Calendar</h2>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setMonthIdx(Math.max(0, monthIdx - 1))}
            disabled={monthIdx <= 0}
            className="p-1 rounded hover:bg-accent disabled:opacity-30 transition-colors"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="text-xs font-medium min-w-[120px] text-center">{monthLabel}</span>
          <button
            onClick={() => setMonthIdx(Math.min(availableMonths.length - 1, monthIdx + 1))}
            disabled={monthIdx >= availableMonths.length - 1}
            className="p-1 rounded hover:bg-accent disabled:opacity-30 transition-colors"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="flex items-center gap-4 mb-3 text-[10px] text-muted-foreground">
        <span>Month P&L: <span className={cn('font-semibold', monthPnl >= 0 ? 'text-profit' : 'text-loss')}>{monthPnl >= 0 ? '+' : ''}{monthPnl.toFixed(2)}</span></span>
        <span>{tradingDays} trading days</span>
        {tradingDays > 0 && <span>{winDays}W / {tradingDays - winDays}L</span>}
      </div>

      <div className="grid grid-cols-7 gap-px">
        {['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'].map(d => (
          <div key={d} className="text-center text-[10px] text-muted-foreground font-medium py-1">{d}</div>
        ))}
        {weeks.map((week, wi) =>
          week.map((cell, ci) => {
            const pnl = dailyPnl[cell.key]
            const hasPnl = pnl !== undefined
            const isProfit = hasPnl && pnl > 0
            const isLoss = hasPnl && pnl < 0
            return (
              <div
                key={`${wi}-${ci}`}
                className={cn(
                  'relative flex flex-col items-center justify-center rounded-md py-1.5 min-h-[48px] transition-colors',
                  !cell.inMonth && 'opacity-25',
                  hasPnl && isProfit && 'bg-profit/15',
                  hasPnl && isLoss && 'bg-loss/15',
                  hasPnl && pnl === 0 && 'bg-secondary/50',
                )}
                title={hasPnl ? `${cell.key}: ${pnl >= 0 ? '+' : ''}$${pnl.toFixed(2)}` : cell.key}
              >
                <span className={cn(
                  'text-[11px]',
                  !cell.inMonth ? 'text-muted-foreground' : hasPnl ? 'font-medium' : 'text-muted-foreground',
                )}>{cell.day}</span>
                {hasPnl && (
                  <span className={cn(
                    'text-[9px] font-semibold mt-0.5',
                    isProfit ? 'text-profit' : isLoss ? 'text-loss' : 'text-muted-foreground',
                  )}>
                    {pnl >= 0 ? '+' : ''}{pnl.toFixed(2)}
                  </span>
                )}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  color,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: string
  sub?: string
  color?: string
}): JSX.Element {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="flex items-center gap-1.5 mb-1">
        <Icon className="h-3 w-3 text-muted-foreground" />
        <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</p>
      </div>
      <p className={cn('text-lg font-semibold', color)}>{value}</p>
      {sub && <p className={cn('text-xs', color || 'text-muted-foreground')}>{sub}</p>}
    </div>
  )
}

function MiniStatCard({ label, value, color }: { label: string; value: string; color: string }): JSX.Element {
  return (
    <div className="rounded-lg border border-border bg-card p-3 flex items-center justify-between">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={cn('text-sm font-semibold', color)}>{value}</span>
    </div>
  )
}

function EquityCurveChart({ data, initial }: { data: { time: number; equity: number }[]; initial: number }): JSX.Element {
  if (data.length < 2) return <div className="h-48" />

  const w = 900
  const h = 200
  let minE = Infinity
  let maxE = -Infinity
  for (const d of data) {
    if (d.equity < minE) minE = d.equity
    if (d.equity > maxE) maxE = d.equity
  }
  const range = maxE - minE || 1
  const pad = range * 0.05
  const minY = minE - pad
  const maxY = maxE + pad
  const yRange = maxY - minY

  const points = data.map((d, i) => {
    const x = (i / (data.length - 1)) * w
    const y = h - ((d.equity - minY) / yRange) * h
    return `${x},${y}`
  }).join(' ')

  const baseY = h - ((initial - minY) / yRange) * h

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-48" preserveAspectRatio="none">
      <line x1={0} y1={baseY} x2={w} y2={baseY} stroke="#52525b" strokeWidth={1} strokeDasharray="4 4" />
      <polyline points={points} fill="none" stroke="#22c55e" strokeWidth={1.5} />
    </svg>
  )
}

function formatTs(ts: number): string {
  return new Date(ts * 1000).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export default BacktestPage
