'use client'
import { useEffect, useState } from 'react'
import { onQueueChange, queued } from '@/lib/offline-queue'

export function OfflineBanner() {
  const [offline, setOffline] = useState(false)
  const [waiting, setWaiting] = useState(0)
  useEffect(() => {
    const count = () => setWaiting(queued().length)
    count()
    return onQueueChange(count)
  }, [])
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
  if (!offline && !waiting) return null
  return (
    <div
      role="status"
      className={`fixed inset-x-0 top-0 z-[60] px-4 py-2 text-center text-sm font-semibold text-white ${offline ? 'bg-destructive' : 'bg-primary'}`}
      style={{ paddingTop: 'calc(8px + env(safe-area-inset-top))' }}
    >
      {offline
        ? `You're offline. Quick logs are sent when you're back${waiting ? ` (${waiting} waiting)` : ''}; other changes are kept as drafts to review.`
        : `Sending ${waiting} saved log${waiting === 1 ? '' : 's'}…`}
    </div>
  )
}
