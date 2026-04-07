import { useEffect } from 'react'
import { useAppStore } from '@/store/app-store'
import { wsService } from '@/services/websocket'
import AccountSummary from '@/components/dashboard/AccountSummary'
import PositionsTable from '@/components/dashboard/PositionsTable'
import PendingOrdersTable from '@/components/dashboard/PendingOrdersTable'
import BotControlCard from '@/components/dashboard/BotControlCard'
import TradeLogPanel from '@/components/dashboard/TradeLogPanel'
import LiveChart from '@/components/dashboard/LiveChart'

function DashboardPage(): JSX.Element {
  const setPositions = useAppStore((s) => s.setPositions)
  const setPendingOrders = useAppStore((s) => s.setPendingOrders)
  const setAccountInfo = useAppStore((s) => s.setAccountInfo)
  const setBotStatus = useAppStore((s) => s.setBotStatus)
  const setSymbols = useAppStore((s) => s.setSymbols)
  const addTradeLog = useAppStore((s) => s.addTradeLog)
  const addNotification = useAppStore((s) => s.addNotification)

  useEffect(() => {
    wsService.send('get_account_info')
    wsService.send('get_positions')
    wsService.send('get_pending_orders')
    wsService.send('get_symbols')
    wsService.send('get_bot_status')

    const unsubs = [
      wsService.on('account_info', (msg) => {
        setAccountInfo(msg.data as never)
      }),
      wsService.on('positions', (msg) => {
        setPositions(msg.data.positions as never)
      }),
      wsService.on('pending_orders', (msg) => {
        setPendingOrders(msg.data.orders as never)
      }),
      wsService.on('bot_status', (msg) => {
        setBotStatus(msg.data.status as never)
      }),
      wsService.on('symbols', (msg) => {
        setSymbols(msg.data.symbols as never)
      }),
      wsService.on('trade_log', (msg) => {
        addTradeLog(msg.data as never)
      }),
      wsService.on('trade_opened', (msg) => {
        addNotification({
          type: 'success',
          title: 'Trade Opened',
          message: `${msg.data.type} ${msg.data.volume} ${msg.data.symbol} @ ${msg.data.price}`
        })
        wsService.send('get_positions')
        wsService.send('get_account_info')
      }),
      wsService.on('trade_closed', (msg) => {
        const profit = msg.data.profit as number
        addNotification({
          type: profit >= 0 ? 'success' : 'warning',
          title: 'Trade Closed',
          message: `${msg.data.symbol} P/L: ${profit >= 0 ? '+' : ''}${profit}`
        })
        wsService.send('get_positions')
        wsService.send('get_account_info')
      }),
      wsService.on('order_placed', () => {
        wsService.send('get_pending_orders')
      }),
      wsService.on('order_cancelled', () => {
        wsService.send('get_pending_orders')
      }),
      wsService.on('error', (msg) => {
        addNotification({
          type: 'error',
          title: 'Error',
          message: msg.data.message as string
        })
      })
    ]

    const tickInterval = setInterval(() => {
      wsService.send('get_positions')
      wsService.send('get_account_info')
    }, 2000)

    return () => {
      unsubs.forEach((fn) => fn())
      clearInterval(tickInterval)
    }
  }, [])

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">Dashboard</h1>
      </div>

      <AccountSummary />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <LiveChart />
        </div>
        <BotControlCard />
      </div>

      <PositionsTable />
      <PendingOrdersTable />
      <TradeLogPanel />
    </div>
  )
}

export default DashboardPage
