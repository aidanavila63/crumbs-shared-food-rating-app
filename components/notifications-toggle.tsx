'use client'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { disablePush, enablePush, pushIsOn, pushSupported } from '@/lib/push'

/** Turn on "Maya rated Naan Kabob 5★" alerts for this phone. */
export function NotificationsToggle({ userId, supabase }: { userId?: string; supabase: any }) {
  const [supported, setSupported] = useState(false)
  const [on, setOn] = useState(false)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    const ok = pushSupported()
    setSupported(ok)
    if (ok)
      pushIsOn()
        .then(setOn)
        .catch(() => {})
  }, [])
  if (!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || !userId) return null

  async function toggle() {
    setBusy(true)
    try {
      if (on) {
        await disablePush(supabase)
        setOn(false)
      } else {
        await enablePush(supabase, userId!)
        setOn(true)
        toast.success('Notifications on for this phone')
      }
    } catch (error: any) {
      toast.error(error?.message || 'Could not change notifications')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="surface flex flex-col gap-2">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="font-serif text-xl font-bold">Notifications</h3>
          <p className="text-sm text-muted-foreground">
            Know when your partner adds or rates something.
          </p>
        </div>
        <button
          className={on ? 'secondary shrink-0' : 'primary shrink-0'}
          disabled={busy || !supported}
          onClick={toggle}
        >
          {on ? 'Turn off' : 'Turn on'}
        </button>
      </div>
      {!supported && (
        <p className="text-xs text-muted-foreground">
          On iPhone this only works from the Home Screen app: in Safari tap Share → Add to Home
          Screen, then open Crumbs from there (needs iOS 16.4 or newer).
        </p>
      )}
    </div>
  )
}
