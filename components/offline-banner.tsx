'use client'
import { useEffect, useState } from 'react'

export function OfflineBanner() {
  const [offline, setOffline] = useState(false)
  useEffect(() => {
    const update = () => setOffline(!navigator.onLine)
    update()
    window.addEventListener('online', update)
    window.addEventListener('offline', update)
    return () => {
      window.removeEventListener('online', update)
      window.removeEventListener('offline', update)
    }
  }, [])
  if (!offline) return null
  return (
    <div
      role="status"
      className="fixed inset-x-0 top-0 z-[60] bg-destructive px-4 py-2 text-center text-sm font-semibold text-white"
      style={{ paddingTop: 'calc(8px + env(safe-area-inset-top))' }}
    >
      You&apos;re offline. Changes won&apos;t save until you reconnect.
    </div>
  )
}
