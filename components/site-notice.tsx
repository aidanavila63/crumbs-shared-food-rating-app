'use client'
// Round 77: the line Admin can show everyone (third pass #16), "Crumbs is read-only" while the
// pause is on, and "Update ready — tap to refresh" when a newer version is live (#5). Looks again
// when Crumbs comes back to the screen (at most every few minutes).
import { useEffect, useState } from 'react'
import { haptic } from '@/lib/motion'

const LOOK_EVERY = 5 * 60_000
export const BUILD_ID = process.env.NEXT_PUBLIC_BUILD_ID ?? 'local'

/** "abc1234 · 16 Nov" for Settings and Admin. */
export function buildLabel() {
  const at = process.env.NEXT_PUBLIC_BUILD_TIME
  const day = at ? new Date(at).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) : null
  return `${BUILD_ID}${day ? ` · ${day}` : ''}`
}

type Setting = { on?: boolean; text?: string; message?: string; level?: 'info' | 'warn' }

export function SiteNotice({ supabase, demo }: { supabase: any; demo: boolean }) {
  const [notice, setNotice] = useState<Setting | null>(null)
  const [pause, setPause] = useState<Setting | null>(null)
  const [update, setUpdate] = useState(false)
  const [hidden, setHidden] = useState<string | null>(null)

  useEffect(() => {
    if (demo) return
    let last = 0
    const look = async () => {
      if (document.visibilityState !== 'visible' || Date.now() - last < LOOK_EVERY) return
      last = Date.now()
      const { data } = await supabase.from('site_settings').select('key,value')
      setNotice((data ?? []).find((r: any) => r.key === 'notice')?.value ?? null)
      setPause((data ?? []).find((r: any) => r.key === 'pause')?.value ?? null)
      if (BUILD_ID === 'local') return
      const live = await fetch('/api/version', { cache: 'no-store' })
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null)
      if (live?.build && live.build !== 'local' && live.build !== BUILD_ID) setUpdate(true)
    }
    look()
    try {
      setHidden(sessionStorage.getItem('crumbs-notice-hidden'))
    } catch {}
    document.addEventListener('visibilitychange', look)
    return () => document.removeEventListener('visibilitychange', look)
  }, [demo, supabase])

  const text = notice?.on && notice.text?.trim() ? notice.text.trim() : null
  return (
    <>
      {pause?.on && (
        <div role="status" className="site-notice site-notice-warn">
          {pause.message?.trim() || 'Crumbs is read-only for a few minutes: you can look, but changes will wait.'}
        </div>
      )}
      {text && hidden !== text && (
        <div role="status" className={`site-notice ${notice?.level === 'warn' ? 'site-notice-warn' : ''}`}>
          <span className="min-w-0 flex-1">{text}</span>
          <button
            className="shrink-0 text-xs underline"
            aria-label="Hide this notice"
            onClick={() => {
              setHidden(text)
              try {
                sessionStorage.setItem('crumbs-notice-hidden', text)
              } catch {}
            }}
          >
            Hide
          </button>
        </div>
      )}
      {update && (
        <button
          className="update-ready"
          onClick={() => {
            haptic('tap')
            window.location.reload()
          }}
        >
          Update ready — tap to refresh
        </button>
      )}
    </>
  )
}
