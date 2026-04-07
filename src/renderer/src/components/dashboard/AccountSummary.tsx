import { useAppStore } from '@/store/app-store'
import { formatCurrency } from '@/lib/utils'
import { Wallet, TrendingUp, TrendingDown, Shield, DollarSign } from 'lucide-react'
import { cn } from '@/lib/utils'

function AccountSummary(): JSX.Element {
  const accountInfo = useAppStore((s) => s.accountInfo)

  if (!accountInfo) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="bg-card border border-border rounded-lg p-4 animate-pulse">
            <div className="h-3 bg-muted rounded w-16 mb-2" />
            <div className="h-6 bg-muted rounded w-24" />
          </div>
        ))}
      </div>
    )
  }

  const cards = [
    { label: 'Balance', value: accountInfo.balance, icon: Wallet, color: 'text-foreground' },
    { label: 'Equity', value: accountInfo.equity, icon: DollarSign, color: 'text-foreground' },
    {
      label: 'Profit/Loss',
      value: accountInfo.profit,
      icon: accountInfo.profit >= 0 ? TrendingUp : TrendingDown,
      color: accountInfo.profit >= 0 ? 'text-profit' : 'text-loss'
    },
    { label: 'Margin', value: accountInfo.margin, icon: Shield, color: 'text-foreground' },
    { label: 'Free Margin', value: accountInfo.free_margin, icon: Wallet, color: 'text-foreground' }
  ]

  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
      {cards.map((card) => (
        <div key={card.label} className="bg-card border border-border rounded-lg p-4">
          <div className="flex items-center gap-1.5 mb-1">
            <card.icon className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">{card.label}</span>
          </div>
          <p className={cn('text-lg font-semibold tabular-nums', card.color)}>
            {formatCurrency(card.value, accountInfo.currency)}
          </p>
        </div>
      ))}
    </div>
  )
}

export default AccountSummary
