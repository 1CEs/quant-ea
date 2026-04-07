import { useAppStore } from '@/store/app-store'
import { wsService } from '@/services/websocket'
import { formatNumber, formatCurrency, cn } from '@/lib/utils'
import { X } from 'lucide-react'

function PositionsTable(): JSX.Element {
  const positions = useAppStore((s) => s.positions)

  const handleClosePosition = (ticket: number): void => {
    wsService.send('close_position', { ticket })
  }

  const handleCloseAll = (): void => {
    wsService.send('close_all_positions')
  }

  return (
    <div className="bg-card border border-border rounded-lg">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <h2 className="text-sm font-medium">Open Positions ({positions.length})</h2>
        {positions.length > 0 && (
          <button
            onClick={handleCloseAll}
            className="text-xs text-loss hover:text-loss/80 transition-colors"
          >
            Close All
          </button>
        )}
      </div>

      {positions.length === 0 ? (
        <div className="p-8 text-center text-sm text-muted-foreground">No open positions</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border text-muted-foreground">
                <th className="px-4 py-2 text-left font-medium">Ticket</th>
                <th className="px-4 py-2 text-left font-medium">Symbol</th>
                <th className="px-4 py-2 text-left font-medium">Type</th>
                <th className="px-4 py-2 text-right font-medium">Volume</th>
                <th className="px-4 py-2 text-right font-medium">Open Price</th>
                <th className="px-4 py-2 text-right font-medium">Current</th>
                <th className="px-4 py-2 text-right font-medium">SL</th>
                <th className="px-4 py-2 text-right font-medium">TP</th>
                <th className="px-4 py-2 text-right font-medium">Profit</th>
                <th className="px-4 py-2 text-center font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {positions.map((pos) => (
                <tr key={pos.ticket} className="border-b border-border/50 hover:bg-accent/30">
                  <td className="px-4 py-2 tabular-nums">{pos.ticket}</td>
                  <td className="px-4 py-2 font-medium">{pos.symbol}</td>
                  <td className="px-4 py-2">
                    <span
                      className={cn(
                        'px-1.5 py-0.5 rounded text-[10px] font-medium uppercase',
                        pos.type === 'buy'
                          ? 'bg-profit/10 text-profit'
                          : 'bg-loss/10 text-loss'
                      )}
                    >
                      {pos.type}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">{formatNumber(pos.volume, 2)}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{formatNumber(pos.open_price, 5)}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{formatNumber(pos.current_price, 5)}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{pos.sl ? formatNumber(pos.sl, 5) : '-'}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{pos.tp ? formatNumber(pos.tp, 5) : '-'}</td>
                  <td
                    className={cn(
                      'px-4 py-2 text-right tabular-nums font-medium',
                      pos.profit >= 0 ? 'text-profit' : 'text-loss'
                    )}
                  >
                    {pos.profit >= 0 ? '+' : ''}
                    {formatCurrency(pos.profit)}
                  </td>
                  <td className="px-4 py-2 text-center">
                    <button
                      onClick={() => handleClosePosition(pos.ticket)}
                      className="text-muted-foreground hover:text-loss transition-colors"
                      title="Close position"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

export default PositionsTable
