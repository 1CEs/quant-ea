import { useState, useMemo } from 'react'
import { useAppStore } from '@/store/app-store'
import { CalendarDays, ChevronLeft, ChevronRight, TrendingUp, TrendingDown } from 'lucide-react'
import { cn } from '@/lib/utils'

const DAY_LABELS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN']

interface DayCell {
  day: number
  inMonth: boolean
  dateKey: string
}

function buildMonthGrid(year: number, month: number): DayCell[][] {
  const firstDay = new Date(year, month, 1)
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  let startDow = firstDay.getDay() - 1
  if (startDow < 0) startDow = 6

  const prevMonthEnd = new Date(year, month, 0)
  const prevDays = prevMonthEnd.getDate()

  const fmt = (y: number, m: number, d: number): string =>
    `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`

  const cells: DayCell[] = []

  for (let i = startDow - 1; i >= 0; i--) {
    const d = prevDays - i
    const prev = new Date(year, month - 1, d)
    cells.push({ day: d, inMonth: false, dateKey: fmt(prev.getFullYear(), prev.getMonth(), d) })
  }

  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ day: d, inMonth: true, dateKey: fmt(year, month, d) })
  }

  const remaining = 7 - (cells.length % 7)
  if (remaining < 7) {
    for (let d = 1; d <= remaining; d++) {
      const next = new Date(year, month + 1, d)
      cells.push({ day: d, inMonth: false, dateKey: fmt(next.getFullYear(), next.getMonth(), d) })
    }
  }

  const weeks: DayCell[][] = []
  for (let i = 0; i < cells.length; i += 7) {
    weeks.push(cells.slice(i, i + 7))
  }
  return weeks
}

function PnLCalendarPage(): JSX.Element {
  const tradeHistory = useAppStore((s) => s.tradeHistory)

  const dailyPnl = useMemo(() => {
    const map: Record<string, { pnl: number; trades: number; wins: number }> = {}
    for (const t of tradeHistory) {
      if (!t.close_time || t.profit === undefined) continue
      const d = new Date(t.close_time)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      if (!map[key]) map[key] = { pnl: 0, trades: 0, wins: 0 }
      map[key].pnl += t.profit
      map[key].trades += 1
      if (t.profit > 0) map[key].wins += 1
    }
    return map
  }, [tradeHistory])

  const availableMonths = useMemo(() => {
    const months = new Set<string>()
    for (const k of Object.keys(dailyPnl)) months.add(k.slice(0, 7))
    if (!months.size) {
      const now = new Date()
      months.add(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`)
    }
    return Array.from(months).sort()
  }, [dailyPnl])

  const [monthIdx, setMonthIdx] = useState(() => availableMonths.length - 1)

  const currentMonth = availableMonths[Math.min(monthIdx, availableMonths.length - 1)] || availableMonths[0]
  const [yearStr, monStr] = currentMonth.split('-')
  const year = parseInt(yearStr)
  const month = parseInt(monStr) - 1

  const weeks = useMemo(() => buildMonthGrid(year, month), [year, month])

  const monthLabel = new Date(year, month, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })

  const monthStats = useMemo(() => {
    let pnl = 0, trades = 0, wins = 0, tradingDays = 0, winDays = 0, lossDays = 0, bestDay = -Infinity, worstDay = Infinity
    for (const [k, v] of Object.entries(dailyPnl)) {
      if (!k.startsWith(currentMonth)) continue
      pnl += v.pnl
      trades += v.trades
      wins += v.wins
      tradingDays += 1
      if (v.pnl > 0) winDays += 1
      if (v.pnl < 0) lossDays += 1
      if (v.pnl > bestDay) bestDay = v.pnl
      if (v.pnl < worstDay) worstDay = v.pnl
    }
    return { pnl, trades, wins, tradingDays, winDays, lossDays, bestDay: bestDay === -Infinity ? 0 : bestDay, worstDay: worstDay === Infinity ? 0 : worstDay }
  }, [dailyPnl, currentMonth])

  const maxAbsPnl = useMemo(() => {
    let mx = 0
    for (const [k, v] of Object.entries(dailyPnl)) {
      if (!k.startsWith(currentMonth)) continue
      if (Math.abs(v.pnl) > mx) mx = Math.abs(v.pnl)
    }
    return mx || 1
  }, [dailyPnl, currentMonth])

  const hasTrades = tradeHistory.length > 0

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <CalendarDays className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-lg font-semibold">P&L Calendar</h1>
          <p className="text-xs text-muted-foreground">Track daily profit and loss from bot trades</p>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <SummaryCard
          label="Month P&L"
          value={`${monthStats.pnl >= 0 ? '+' : ''}$${monthStats.pnl.toFixed(2)}`}
          color={monthStats.pnl >= 0 ? 'text-profit' : 'text-loss'}
        />
        <SummaryCard
          label="Trading Days"
          value={`${monthStats.tradingDays}`}
          sub={monthStats.tradingDays > 0 ? `${monthStats.winDays}W / ${monthStats.lossDays}L` : undefined}
        />
        <SummaryCard
          label="Best Day"
          value={`+$${monthStats.bestDay.toFixed(2)}`}
          color="text-profit"
          icon={TrendingUp}
        />
        <SummaryCard
          label="Worst Day"
          value={`$${monthStats.worstDay.toFixed(2)}`}
          color="text-loss"
          icon={TrendingDown}
        />
      </div>

      <div className="rounded-lg border border-border bg-card">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setMonthIdx(Math.max(0, monthIdx - 1))}
              disabled={monthIdx <= 0}
              className="p-1.5 rounded-md hover:bg-accent disabled:opacity-30 transition-colors"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="text-sm font-medium min-w-[140px] text-center">{monthLabel}</span>
            <button
              onClick={() => setMonthIdx(Math.min(availableMonths.length - 1, monthIdx + 1))}
              disabled={monthIdx >= availableMonths.length - 1}
              className="p-1.5 rounded-md hover:bg-accent disabled:opacity-30 transition-colors"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
          <div className="text-[10px] text-muted-foreground">
            {monthStats.trades} trades this month
          </div>
        </div>

        <div className="p-3">
          <div className="grid grid-cols-7 gap-1 mb-1">
            {DAY_LABELS.map((d) => (
              <div key={d} className="text-center text-[10px] text-muted-foreground font-medium py-1">
                {d}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1">
            {weeks.map((week, wi) =>
              week.map((cell, ci) => {
                const data = dailyPnl[cell.dateKey]
                const hasPnl = !!data
                const pnl = data?.pnl ?? 0
                const isProfit = hasPnl && pnl > 0
                const isLoss = hasPnl && pnl < 0
                const intensity = hasPnl ? Math.min(Math.abs(pnl) / maxAbsPnl, 1) : 0
                const alpha = hasPnl ? Math.max(0.1, intensity * 0.35) : 0

                return (
                  <div
                    key={`${wi}-${ci}`}
                    className={cn(
                      'relative flex flex-col items-center justify-center rounded-lg min-h-[60px] transition-colors border',
                      !cell.inMonth && 'opacity-20',
                      hasPnl && isProfit && 'border-profit/20',
                      hasPnl && isLoss && 'border-loss/20',
                      !hasPnl && 'border-transparent',
                    )}
                    style={hasPnl ? {
                      backgroundColor: isProfit
                        ? `rgba(34, 197, 94, ${alpha})`
                        : isLoss
                          ? `rgba(239, 68, 68, ${alpha})`
                          : 'var(--secondary)',
                    } : undefined}
                    title={hasPnl ? `${cell.dateKey}\n${data.trades} trades · ${data.wins}W / ${data.trades - data.wins}L\nP&L: ${pnl >= 0 ? '+' : ''}$${pnl.toFixed(2)}` : cell.dateKey}
                  >
                    <span className={cn(
                      'text-[11px] leading-none',
                      !cell.inMonth ? 'text-muted-foreground' : hasPnl ? 'font-medium' : 'text-muted-foreground',
                    )}>
                      {cell.day}
                    </span>
                    {hasPnl && (
                      <>
                        <span className={cn(
                          'text-[10px] font-semibold mt-1 leading-none',
                          isProfit ? 'text-profit' : isLoss ? 'text-loss' : 'text-muted-foreground',
                        )}>
                          {pnl >= 0 ? '+' : ''}{pnl.toFixed(2)}
                        </span>
                        <span className="text-[8px] text-muted-foreground mt-0.5 leading-none">
                          {data.trades}t
                        </span>
                      </>
                    )}
                  </div>
                )
              })
            )}
          </div>
        </div>
      </div>

      {!hasTrades && (
        <div className="rounded-lg border border-border bg-card p-8 text-center text-muted-foreground">
          <CalendarDays className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">No trade history yet</p>
          <p className="text-xs mt-1">Start the bot to begin tracking daily P&L</p>
        </div>
      )}
    </div>
  )
}

function SummaryCard({
  label,
  value,
  sub,
  color,
  icon: Icon,
}: {
  label: string
  value: string
  sub?: string
  color?: string
  icon?: React.ComponentType<{ className?: string }>
}): JSX.Element {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="flex items-center gap-1.5 mb-1">
        {Icon && <Icon className="h-3 w-3 text-muted-foreground" />}
        <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</p>
      </div>
      <p className={cn('text-lg font-semibold', color)}>{value}</p>
      {sub && <p className="text-[10px] text-muted-foreground">{sub}</p>}
    </div>
  )
}

export default PnLCalendarPage
