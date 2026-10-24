'use client'
// #109 Feature switches set on the admin page. A switch nobody has added yet keeps today's
// behaviour (on for everyone), so adding the table never hides anything by surprise.
import { useEffect, useState } from 'react'

export function useFlags({
  supabase,
  demo,
  v4,
  isAdmin,
}: {
  supabase: any
  demo: boolean
  v4: boolean
  isAdmin: boolean
}) {
  const [states, setStates] = useState<Record<string, string>>({})
  useEffect(() => {
    if (demo || !v4) return
    let cancelled = false
    supabase
      .from('feature_flags')
      .select('key,state')
      .then(({ data, error }: any) => {
        if (!cancelled && !error)
          setStates(Object.fromEntries((data ?? []).map((f: any) => [f.key, f.state])))
      })
    return () => {
      cancelled = true
    }
  }, [demo, supabase, v4])
  /** `fallback` = what a switch nobody has added yet means (on, unless said otherwise). */
  return (key: string, fallback = true) => {
    const state = states[key]
    if (!state) return fallback
    if (state === 'everyone') return true
    return state === 'admin' && isAdmin
  }
}
