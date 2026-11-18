'use client'
import { useEffect } from 'react'

/** U18 (Round 92): clear the number on the app icon (and its count) once Crumbs is on screen. */
function clearBadge() {
  if (document.visibilityState !== 'visible') return
  try {
    ;(navigator as any).clearAppBadge?.()?.catch?.(() => {})
    caches
      ?.open('crumbs-badge')
      .then((cache) => cache.delete('/__badge'))
      .catch(() => {})
  } catch {}
}

export function SwRegister() {
  useEffect(() => {
    if ('serviceWorker' in navigator && process.env.NODE_ENV === 'production') {
      navigator.serviceWorker.register('/sw.js').catch(() => {})
    }
    clearBadge()
    document.addEventListener('visibilitychange', clearBadge)
    return () => document.removeEventListener('visibilitychange', clearBadge)
  }, [])
  return null
}
