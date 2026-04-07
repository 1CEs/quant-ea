import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAppStore } from '@/store/app-store'
import { wsService } from '@/services/websocket'
import { Activity, Loader2, Eye, EyeOff } from 'lucide-react'

function LoginPage(): JSX.Element {
  const navigate = useNavigate()
  const setConnectionStatus = useAppStore((s) => s.setConnectionStatus)
  const setAccountInfo = useAppStore((s) => s.setAccountInfo)
  const setDemoMode = useAppStore((s) => s.setDemoMode)
  const connectionStatus = useAppStore((s) => s.connectionStatus)
  const addNotification = useAppStore((s) => s.addNotification)
  const isFullscreen = useAppStore((s) => s.isFullscreen)

  const [account, setAccount] = useState('')
  const [password, setPassword] = useState('')
  const [server, setServer] = useState('')
  const [remember, setRemember] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [loadingCreds, setLoadingCreds] = useState(true)

  useEffect(() => {
    loadSavedCredentials()
  }, [])

  useEffect(() => {
    const unsub = wsService.on('login_response', (msg) => {
      setLoading(false)
      if (msg.data.success) {
        setConnectionStatus('connected')
        setAccountInfo(msg.data.account_info as never)
        setDemoMode(!!msg.data.demo_mode)
        addNotification({
          type: msg.data.demo_mode ? 'warning' : 'success',
          title: msg.data.demo_mode ? 'Demo Mode' : 'Connected',
          message: msg.data.demo_mode
            ? 'MT5 not available on macOS — using simulated data'
            : 'Logged in to MT5'
        })
        navigate('/', { replace: true })
      } else {
        setConnectionStatus('error')
        addNotification({
          type: 'error',
          title: 'Login Failed',
          message: (msg.data.error as string) || 'Unable to connect to MT5'
        })
      }
    })

    const unsubConn = wsService.on('connection', (msg) => {
      if (msg.data.status === 'connected' && account && password && server) {
        wsService.send('login', { account, password, server })
      }
    })

    return () => {
      unsub()
      unsubConn()
    }
  }, [account, password, server])

  const loadSavedCredentials = async (): Promise<void> => {
    try {
      const creds = await window.api.credentials.load()
      if (creds) {
        setAccount(creds.account)
        setPassword(creds.password)
        setServer(creds.server)
        setRemember(true)
      }
    } catch (err) {
      console.error('Failed to load credentials:', err)
    } finally {
      setLoadingCreds(false)
    }
  }

  const handleLogin = async (): Promise<void> => {
    if (!account || !password || !server) return

    setLoading(true)
    setConnectionStatus('connecting')

    if (remember) {
      await window.api.credentials.save({ account, password, server })
    } else {
      await window.api.credentials.clear()
    }

    await window.api.python.start()

    const port = await window.api.python.port()

    setTimeout(() => {
      wsService.connect(port)
    }, 2000)
  }

  if (loadingCreds) {
    return (
      <div className="flex items-center justify-center h-screen bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="flex flex-col h-screen bg-background">
      {!isFullscreen && <div className="titlebar-drag h-10 shrink-0" />}
      <div className="flex-1 flex items-center justify-center">
      <div className="w-full max-w-sm mx-auto p-8">
        <div className="flex items-center justify-center gap-2 mb-8">
          <Activity className="h-8 w-8 text-primary" />
          <h1 className="text-2xl font-bold">Quant EA</h1>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-muted-foreground mb-1.5">
              Account Number
            </label>
            <input
              type="text"
              value={account}
              onChange={(e) => setAccount(e.target.value)}
              placeholder="e.g. 12345678"
              className="w-full px-3 py-2 bg-secondary border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-muted-foreground mb-1.5">
              Password
            </label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="MT5 password"
                className="w-full px-3 py-2 pr-10 bg-secondary border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-muted-foreground mb-1.5">
              Server
            </label>
            <input
              type="text"
              value={server}
              onChange={(e) => setServer(e.target.value)}
              placeholder="e.g. MetaQuotes-Demo"
              className="w-full px-3 py-2 bg-secondary border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="remember"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
              className="h-4 w-4 rounded border-border bg-secondary accent-primary"
            />
            <label htmlFor="remember" className="text-sm text-muted-foreground cursor-pointer">
              Remember credentials
            </label>
          </div>

          <button
            onClick={handleLogin}
            disabled={loading || !account || !password || !server}
            className="w-full py-2.5 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Connecting...
              </>
            ) : (
              'Connect to MT5'
            )}
          </button>

          {connectionStatus === 'error' && (
            <p className="text-xs text-loss text-center">
              Connection failed. Check credentials and ensure MT5 is running under Wine.
            </p>
          )}
        </div>

        <p className="text-[10px] text-muted-foreground text-center mt-6">
          Credentials are encrypted and stored locally on your machine.
        </p>
      </div>
      </div>
    </div>
  )
}

export default LoginPage
