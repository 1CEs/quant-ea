import { useState } from 'react'
import { useAppStore } from '@/store/app-store'
import { wsService } from '@/services/websocket'
import { Save } from 'lucide-react'
import type { RiskConfig } from '@/types'

function SettingsPage(): JSX.Element {
  const riskConfig = useAppStore((s) => s.riskConfig)
  const setRiskConfig = useAppStore((s) => s.setRiskConfig)
  const addNotification = useAppStore((s) => s.addNotification)

  const [localRisk, setLocalRisk] = useState<RiskConfig>({ ...riskConfig })

  const updateField = <K extends keyof RiskConfig>(key: K, value: RiskConfig[K]): void => {
    setLocalRisk((prev) => ({ ...prev, [key]: value }))
  }

  const handleSaveRisk = (): void => {
    setRiskConfig(localRisk)
    wsService.send('update_risk_config', localRisk as unknown as Record<string, unknown>)
    addNotification({ type: 'success', title: 'Settings Saved', message: 'Risk configuration updated.' })
  }

  const handleClearCredentials = async (): Promise<void> => {
    await window.api.credentials.clear()
    addNotification({ type: 'info', title: 'Credentials Cleared', message: 'Saved login data removed.' })
  }

  return (
    <div className="p-6 space-y-8 max-w-2xl">
      <h1 className="text-lg font-semibold">Settings</h1>

      <section className="space-y-4">
        <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
          Risk Management
        </h2>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm mb-1.5">Max Daily Loss</label>
            <input
              type="number"
              value={localRisk.max_daily_loss}
              onChange={(e) => updateField('max_daily_loss', Number(e.target.value))}
              className="w-full px-3 py-2 bg-secondary border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <div>
            <label className="block text-sm mb-1.5">Loss Type</label>
            <select
              value={localRisk.max_daily_loss_type}
              onChange={(e) => updateField('max_daily_loss_type', e.target.value as 'amount' | 'percent')}
              className="w-full px-3 py-2 bg-secondary border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="amount">Amount ($)</option>
              <option value="percent">Percent (%)</option>
            </select>
          </div>
          <div>
            <label className="block text-sm mb-1.5">Max Drawdown (%)</label>
            <input
              type="number"
              value={localRisk.max_drawdown}
              onChange={(e) => updateField('max_drawdown', Number(e.target.value))}
              className="w-full px-3 py-2 bg-secondary border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <div>
            <label className="block text-sm mb-1.5">Max Open Trades</label>
            <input
              type="number"
              value={localRisk.max_open_trades}
              onChange={(e) => updateField('max_open_trades', Number(e.target.value))}
              className="w-full px-3 py-2 bg-secondary border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <div>
            <label className="block text-sm mb-1.5">Max Spread (pips)</label>
            <input
              type="number"
              step="0.1"
              value={localRisk.max_spread}
              onChange={(e) => updateField('max_spread', Number(e.target.value))}
              className="w-full px-3 py-2 bg-secondary border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="tradingHours"
              checked={localRisk.trading_hours_enabled}
              onChange={(e) => updateField('trading_hours_enabled', e.target.checked)}
              className="h-4 w-4 rounded border-border bg-secondary accent-primary"
            />
            <label htmlFor="tradingHours" className="text-sm cursor-pointer">
              Restrict Trading Hours
            </label>
          </div>
          {localRisk.trading_hours_enabled && (
            <div className="grid grid-cols-2 gap-4 pl-6">
              <div>
                <label className="block text-sm mb-1.5">Start (UTC)</label>
                <input
                  type="time"
                  value={localRisk.trading_hours_start}
                  onChange={(e) => updateField('trading_hours_start', e.target.value)}
                  className="w-full px-3 py-2 bg-secondary border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <div>
                <label className="block text-sm mb-1.5">End (UTC)</label>
                <input
                  type="time"
                  value={localRisk.trading_hours_end}
                  onChange={(e) => updateField('trading_hours_end', e.target.value)}
                  className="w-full px-3 py-2 bg-secondary border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
            </div>
          )}
        </div>

        <button
          onClick={handleSaveRisk}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:opacity-90 transition-opacity"
        >
          <Save className="h-4 w-4" />
          Save Risk Settings
        </button>
      </section>

      <section className="space-y-4">
        <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
          Credentials
        </h2>
        <button
          onClick={handleClearCredentials}
          className="px-4 py-2 bg-destructive/10 text-loss rounded-md text-sm font-medium hover:bg-destructive/20 transition-colors"
        >
          Clear Saved Credentials
        </button>
      </section>
    </div>
  )
}

export default SettingsPage
