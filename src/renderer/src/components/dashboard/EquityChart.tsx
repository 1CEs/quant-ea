import { useState, useEffect } from 'react'
import { useAppStore } from '@/store/app-store'
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'

interface EquityPoint {
  time: string
  equity: number
}

function EquityChart(): JSX.Element {
  const accountInfo = useAppStore((s) => s.accountInfo)
  const [data, setData] = useState<EquityPoint[]>([])

  useEffect(() => {
    if (!accountInfo) return
    const now = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
    setData((prev) => {
      const next = [...prev, { time: now, equity: accountInfo.equity }]
      return next.slice(-60)
    })
  }, [accountInfo?.equity])

  return (
    <div className="bg-card border border-border rounded-lg p-4">
      <h2 className="text-sm font-medium mb-4">Equity Curve</h2>
      {data.length < 2 ? (
        <div className="h-48 flex items-center justify-center text-sm text-muted-foreground">
          Collecting data points...
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={200}>
          <AreaChart data={data}>
            <defs>
              <linearGradient id="equityGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="hsl(142, 71%, 45%)" stopOpacity={0.3} />
                <stop offset="95%" stopColor="hsl(142, 71%, 45%)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis
              dataKey="time"
              tick={{ fontSize: 10, fill: 'hsl(240, 5%, 64.9%)' }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tick={{ fontSize: 10, fill: 'hsl(240, 5%, 64.9%)' }}
              axisLine={false}
              tickLine={false}
              domain={['dataMin - 10', 'dataMax + 10']}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: 'hsl(240, 10%, 3.9%)',
                border: '1px solid hsl(240, 3.7%, 15.9%)',
                borderRadius: '6px',
                fontSize: '12px'
              }}
            />
            <Area
              type="monotone"
              dataKey="equity"
              stroke="hsl(142, 71%, 45%)"
              fillOpacity={1}
              fill="url(#equityGrad)"
              strokeWidth={2}
            />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </div>
  )
}

export default EquityChart
