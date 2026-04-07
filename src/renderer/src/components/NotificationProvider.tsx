import { useEffect } from 'react'
import { useAppStore } from '@/store/app-store'
import { AlertCircle, CheckCircle, Info, XCircle, X } from 'lucide-react'

function NotificationProvider({ children }: { children: React.ReactNode }): JSX.Element {
  const notifications = useAppStore((s) => s.notifications)
  const removeNotification = useAppStore((s) => s.removeNotification)

  useEffect(() => {
    const timers = notifications.map((n) =>
      setTimeout(() => removeNotification(n.id), 5000)
    )
    return () => timers.forEach(clearTimeout)
  }, [notifications, removeNotification])

  const iconMap = {
    success: <CheckCircle className="h-4 w-4 text-profit" />,
    error: <XCircle className="h-4 w-4 text-loss" />,
    warning: <AlertCircle className="h-4 w-4 text-yellow-500" />,
    info: <Info className="h-4 w-4 text-blue-500" />
  }

  return (
    <>
      {children}
      <div className="fixed top-4 right-4 z-50 flex flex-col gap-2 max-w-sm">
        {notifications.map((n) => (
          <div
            key={n.id}
            className="bg-card border border-border rounded-lg p-3 shadow-lg animate-in slide-in-from-right"
          >
            <div className="flex items-start gap-2">
              {iconMap[n.type]}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">{n.title}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{n.message}</p>
              </div>
              <button
                onClick={() => removeNotification(n.id)}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </>
  )
}

export default NotificationProvider
