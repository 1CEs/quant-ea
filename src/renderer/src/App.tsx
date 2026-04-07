import { useEffect } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { useAppStore } from '@/store/app-store'
import LoginPage from '@/pages/LoginPage'
import DashboardPage from '@/pages/DashboardPage'
import SettingsPage from '@/pages/SettingsPage'
import BacktestPage from '@/pages/BacktestPage'
import PnLCalendarPage from '@/pages/PnLCalendarPage'
import Layout from '@/components/Layout'
import NotificationProvider from '@/components/NotificationProvider'

function App(): JSX.Element {
  const connectionStatus = useAppStore((s) => s.connectionStatus)
  const isConnected = connectionStatus === 'connected'
  const setIsFullscreen = useAppStore((s) => s.setIsFullscreen)

  useEffect(() => {
    const unsub = window.api.onFullscreenChange((fs) => setIsFullscreen(fs))
    return () => unsub()
  }, [setIsFullscreen])

  return (
    <NotificationProvider>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/"
          element={isConnected ? <Layout /> : <Navigate to="/login" replace />}
        >
          <Route index element={<DashboardPage />} />
          <Route path="backtest" element={<BacktestPage />} />
          <Route path="pnl-calendar" element={<PnLCalendarPage />} />
          <Route path="settings" element={<SettingsPage />} />
        </Route>
        <Route path="*" element={<Navigate to={isConnected ? '/' : '/login'} replace />} />
      </Routes>
    </NotificationProvider>
  )
}

export default App
