import { useAppStore } from '@/store/app-store'
import { wsService } from '@/services/websocket'
import { formatNumber } from '@/lib/utils'
import { X } from 'lucide-react'

function PendingOrdersTable(): JSX.Element {
  const pendingOrders = useAppStore((s) => s.pendingOrders)

  const handleCancelOrder = (ticket: number): void => {
    wsService.send('cancel_order', { ticket })
  }

  if (pendingOrders.length === 0) return <></>

  return (
    <div className="bg-card border border-border rounded-lg">
      <div className="px-4 py-3 border-b border-border">
        <h2 className="text-sm font-medium">Pending Orders ({pendingOrders.length})</h2>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border text-muted-foreground">
              <th className="px-4 py-2 text-left font-medium">Ticket</th>
              <th className="px-4 py-2 text-left font-medium">Symbol</th>
              <th className="px-4 py-2 text-left font-medium">Type</th>
              <th className="px-4 py-2 text-right font-medium">Volume</th>
              <th className="px-4 py-2 text-right font-medium">Price</th>
              <th className="px-4 py-2 text-right font-medium">SL</th>
              <th className="px-4 py-2 text-right font-medium">TP</th>
              <th className="px-4 py-2 text-center font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {pendingOrders.map((order) => (
              <tr key={order.ticket} className="border-b border-border/50 hover:bg-accent/30">
                <td className="px-4 py-2 tabular-nums">{order.ticket}</td>
                <td className="px-4 py-2 font-medium">{order.symbol}</td>
                <td className="px-4 py-2">
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-medium uppercase bg-accent text-accent-foreground">
                    {order.type.replace('_', ' ')}
                  </span>
                </td>
                <td className="px-4 py-2 text-right tabular-nums">{formatNumber(order.volume, 2)}</td>
                <td className="px-4 py-2 text-right tabular-nums">{formatNumber(order.price, 5)}</td>
                <td className="px-4 py-2 text-right tabular-nums">{order.sl ? formatNumber(order.sl, 5) : '-'}</td>
                <td className="px-4 py-2 text-right tabular-nums">{order.tp ? formatNumber(order.tp, 5) : '-'}</td>
                <td className="px-4 py-2 text-center">
                  <button
                    onClick={() => handleCancelOrder(order.ticket)}
                    className="text-muted-foreground hover:text-loss transition-colors"
                    title="Cancel order"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default PendingOrdersTable
