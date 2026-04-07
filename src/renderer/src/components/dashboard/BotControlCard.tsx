import { useState, useEffect, useCallback } from 'react'
import { useAppStore } from '@/store/app-store'
import { wsService } from '@/services/websocket'
import { cn } from '@/lib/utils'
import { Play, Pause, Square, Bot, ChevronDown, Activity, Loader2 } from 'lucide-react'

const STRATEGIES = [
  {
    id: 'rl_strategy',
    name: 'RL Thompson Bandit',
    timeframe: 'M5',
    description: 'Bayesian RL filter on EMA/RSI/ADX signals',
    params: {
      train_window: 20000, retrain_interval: 5000, adx_min: 20.0,
      max_hold: 20, atr_period: 10, sl_atr_mult: 1.5, tp_atr_mult: 2.5,
      spread: 0.30, min_atr: 1.0, win_weight: 1.0, loss_weight: 1.5,
    },
  },
]

function BotControlCard(): JSX.Element {
  const botStatus = useAppStore((s) => s.botStatus)
  const riskConfig = useAppStore((s) => s.riskConfig)
  const [strategyId, setStrategyId] = useState(STRATEGIES[0].id)
  const [lotSize, setLotSize] = useState('0.01')
  const [pendingAction, setPendingAction] = useState<'start' | 'pause' | 'stop' | 'resume' | null>(null)

  const strategy = STRATEGIES.find((s) => s.id === strategyId) || STRATEGIES[0]

  useEffect(() => {
    setPendingAction(null)
  }, [botStatus])

  const handleStart = (): void => {
    setPendingAction('start')
    wsService.send('start_bot', {
      risk_config: riskConfig,
      strategy: strategy.id,
      symbol: 'XAUUSD',
      timeframe: strategy.timeframe,
      lot_size: parseFloat(lotSize) || 0.01,
      params: strategy.params,
    })
  }

  const handleResume = (): void => {
    setPendingAction('resume')
    wsService.send('start_bot', { risk_config: riskConfig })
  }

  const handlePause = (): void => {
    setPendingAction('pause')
    wsService.send('pause_bot')
  }

  const handleStop = (): void => {
    setPendingAction('stop')
    wsService.send('stop_bot')
  }

  const [progress, setProgress] = useState<{ step: number; total: number; label: string } | null>(null)

  const handleProgress = useCallback((msg: { data: Record<string, unknown> }) => {
    setProgress({ step: msg.data.step as number, total: msg.data.total as number, label: msg.data.label as string })
  }, [])

  useEffect(() => {
    const unsub = wsService.on('bot_progress', handleProgress)
    return unsub
  }, [handleProgress])

  useEffect(() => {
    if (botStatus !== 'starting') setProgress(null)
  }, [botStatus])

  const isBusy = botStatus === 'starting'

  return (
    <div className="bg-card border border-border rounded-lg p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Bot className="h-4 w-4" />
          <h2 className="text-sm font-medium">Bot Control</h2>
        </div>
        <span
          className={cn(
            'text-[10px] font-medium uppercase tracking-wider px-2 py-0.5 rounded',
            botStatus === 'running' && 'bg-profit/10 text-profit',
            botStatus === 'starting' && 'bg-primary/10 text-primary',
            botStatus === 'paused' && 'bg-yellow-500/10 text-yellow-500',
            botStatus === 'stopped' && 'bg-muted text-muted-foreground'
          )}
        >
          {botStatus}
        </span>
      </div>

      {botStatus === 'stopped' && (
        <div className="space-y-3">
          <div className="space-y-1.5">
            <label className="text-[10px] text-muted-foreground uppercase tracking-wider">Strategy</label>
            <div className="relative">
              <select
                value={strategyId}
                onChange={(e) => setStrategyId(e.target.value)}
                className="w-full appearance-none bg-secondary border border-border rounded-md px-2.5 py-1.5 text-xs pr-7 focus:outline-none focus:ring-1 focus:ring-primary"
              >
                {STRATEGIES.map((s) => (
                  <option key={s.id} value={s.id}>{s.name} ({s.timeframe})</option>
                ))}
              </select>
              <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground pointer-events-none" />
            </div>
            <p className="text-[10px] text-muted-foreground">{strategy.description}</p>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <label className="text-[10px] text-muted-foreground uppercase tracking-wider">Symbol</label>
              <div className="bg-secondary border border-border rounded-md px-2.5 py-1.5 text-xs text-muted-foreground">
                XAUUSD
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-[10px] text-muted-foreground uppercase tracking-wider">Lot Size</label>
              <input
                type="number"
                value={lotSize}
                onChange={(e) => setLotSize(e.target.value)}
                step="0.01"
                min="0.01"
                max="10"
                className="w-full bg-secondary border border-border rounded-md px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
          </div>

          <div className="flex items-center gap-2 text-[10px] text-muted-foreground bg-secondary/50 rounded-md px-2.5 py-2">
            <Activity className="h-3 w-3 shrink-0" />
            <span>SL: {strategy.params.sl_atr_mult}× ATR · TP: {strategy.params.tp_atr_mult}× ATR · Train: {(strategy.params.train_window / 1000).toFixed(0)}k candles</span>
          </div>
        </div>
      )}

      {botStatus === 'starting' && (
        <div className="space-y-2.5">
          {[1, 2, 3].map((s) => {
            const step = progress?.step ?? 0
            const done = step > s
            const active = step === s
            const labels = ['Loading candle data', 'Training RL strategy', 'Evaluating signal']
            return (
              <div key={s} className="flex items-center gap-2.5">
                <div className={cn(
                  'h-5 w-5 rounded-full flex items-center justify-center text-[9px] font-bold shrink-0 transition-all duration-300',
                  done && 'bg-profit/20 text-profit',
                  active && 'bg-primary/20 text-primary',
                  !done && !active && 'bg-muted text-muted-foreground/50'
                )}>
                  {done ? '✓' : active ? <Loader2 className="h-3 w-3 animate-spin" /> : s}
                </div>
                <div className="flex-1 min-w-0">
                  <p className={cn(
                    'text-[11px] truncate transition-colors duration-300',
                    done && 'text-muted-foreground',
                    active && 'text-foreground font-medium',
                    !done && !active && 'text-muted-foreground/50'
                  )}>
                    {active && progress?.label ? progress.label : labels[s - 1]}
                  </p>
                </div>
              </div>
            )
          })}
          <div className="h-1 bg-muted rounded-full overflow-hidden mt-1">
            <div
              className="h-full bg-primary rounded-full transition-all duration-500 ease-out"
              style={{ width: `${((progress?.step ?? 0) / 3) * 100}%` }}
            />
          </div>
        </div>
      )}

      {botStatus === 'running' && (
        <div className="flex items-center gap-2 text-xs text-profit">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-profit opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-profit" />
          </span>
          {strategy.name} running on XAUUSD {strategy.timeframe}
        </div>
      )}

      {botStatus === 'paused' && (
        <p className="text-xs text-yellow-500">Bot paused — strategy state preserved</p>
      )}

      <div className="flex gap-2">
        {botStatus === 'stopped' && (
          <button
            onClick={handleStart}
            disabled={!!pendingAction}
            className={cn(
              'flex-1 flex items-center justify-center gap-1.5 py-2 rounded text-xs font-medium transition-all',
              pendingAction === 'start' ? 'bg-primary/10 text-primary cursor-wait' : 'bg-profit/10 text-profit hover:bg-profit/20'
            )}
          >
            {pendingAction === 'start' ? (
              <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Starting...</>
            ) : (
              <><Play className="h-3.5 w-3.5" /> Start Bot</>
            )}
          </button>
        )}
        {isBusy && (
          <button
            onClick={handleStop}
            disabled={pendingAction === 'stop'}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-loss/10 text-loss rounded text-xs font-medium hover:bg-loss/20 transition-colors"
          >
            {pendingAction === 'stop' ? (
              <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Stopping...</>
            ) : (
              <><Square className="h-3.5 w-3.5" /> Cancel</>
            )}
          </button>
        )}
        {botStatus === 'running' && (
          <>
            <button
              onClick={handlePause}
              disabled={!!pendingAction}
              className={cn(
                'flex-1 flex items-center justify-center gap-1.5 py-2 rounded text-xs font-medium transition-all',
                pendingAction === 'pause' ? 'bg-yellow-500/10 text-yellow-500 cursor-wait' : 'bg-yellow-500/10 text-yellow-500 hover:bg-yellow-500/20'
              )}
            >
              {pendingAction === 'pause' ? (
                <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Pausing...</>
              ) : (
                <><Pause className="h-3.5 w-3.5" /> Pause</>
              )}
            </button>
            <button
              onClick={handleStop}
              disabled={!!pendingAction}
              className={cn(
                'flex-1 flex items-center justify-center gap-1.5 py-2 rounded text-xs font-medium transition-all',
                pendingAction === 'stop' ? 'bg-loss/10 text-loss cursor-wait' : 'bg-loss/10 text-loss hover:bg-loss/20'
              )}
            >
              {pendingAction === 'stop' ? (
                <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Stopping...</>
              ) : (
                <><Square className="h-3.5 w-3.5" /> Stop</>
              )}
            </button>
          </>
        )}
        {botStatus === 'paused' && (
          <>
            <button
              onClick={handleResume}
              disabled={!!pendingAction}
              className={cn(
                'flex-1 flex items-center justify-center gap-1.5 py-2 rounded text-xs font-medium transition-all',
                pendingAction === 'resume' ? 'bg-profit/10 text-profit cursor-wait' : 'bg-profit/10 text-profit hover:bg-profit/20'
              )}
            >
              {pendingAction === 'resume' ? (
                <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Resuming...</>
              ) : (
                <><Play className="h-3.5 w-3.5" /> Resume</>
              )}
            </button>
            <button
              onClick={handleStop}
              disabled={!!pendingAction}
              className={cn(
                'flex-1 flex items-center justify-center gap-1.5 py-2 rounded text-xs font-medium transition-all',
                pendingAction === 'stop' ? 'bg-loss/10 text-loss cursor-wait' : 'bg-loss/10 text-loss hover:bg-loss/20'
              )}
            >
              {pendingAction === 'stop' ? (
                <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Stopping...</>
              ) : (
                <><Square className="h-3.5 w-3.5" /> Stop</>
              )}
            </button>
          </>
        )}
      </div>
    </div>
  )
}

export default BotControlCard
