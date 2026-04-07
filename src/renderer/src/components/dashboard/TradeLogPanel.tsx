import { useAppStore } from '@/store/app-store'
import { formatTime, cn } from '@/lib/utils'
import { ScrollText } from 'lucide-react'

function TradeLogPanel(): JSX.Element {
  const tradeLogs = useAppStore((s) => s.tradeLogs)

  return (
    <div className="bg-card border border-border rounded-lg">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
        <ScrollText className="h-4 w-4 text-muted-foreground" />
        <h2 className="text-sm font-medium">Trade Log</h2>
      </div>
      <div className="max-h-48 overflow-y-auto">
        {tradeLogs.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">No activity yet</div>
        ) : (
          <div className="divide-y divide-border/50">
            {tradeLogs.map((log) => (
              <div key={log.id} className="px-4 py-2 flex items-center gap-3 text-xs">
                <span className="text-muted-foreground tabular-nums w-16 shrink-0">
                  {formatTime(log.timestamp)}
                </span>
                <span
                  className={cn(
                    'px-1.5 py-0.5 rounded text-[10px] font-medium uppercase shrink-0',
                    log.action === 'BUY' && 'bg-profit/10 text-profit',
                    log.action === 'SELL' && 'bg-loss/10 text-loss',
                    log.action === 'CLOSE' && 'bg-accent text-accent-foreground',
                    !['BUY', 'SELL', 'CLOSE'].includes(log.action) &&
                      'bg-muted text-muted-foreground'
                  )}
                >
                  {log.action}
                </span>
                <span className="truncate">{log.message}</span>
                {log.profit !== 0 && (
                  <span
                    className={cn(
                      'ml-auto tabular-nums font-medium shrink-0',
                      log.profit >= 0 ? 'text-profit' : 'text-loss'
                    )}
                  >
                    {log.profit >= 0 ? '+' : ''}
                    {log.profit.toFixed(2)}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default TradeLogPanel
