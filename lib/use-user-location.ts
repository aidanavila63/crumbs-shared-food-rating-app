'use client'
import { useEffect, useState } from 'react'
import { FRESH, ROUGH, lastFix, locate, onFix, type LatLng } from './location'

export type { LatLng }

/**
 * The phone's location for a screen. `ask` = this is something you tapped for, so the
 * permission popup may show; otherwise it only uses a remembered fix or already-allowed
 * location and never pops up.
 */
export function useUserLocation(enabled = true, { ask = false }: { ask?: boolean } = {}) {
  const maxAge = ask ? FRESH : ROUGH
  const [location, setLocation] = useState<LatLng | null>(() => lastFix(maxAge))
  useEffect(() => {
    if (!enabled) return
    let live = true
    locate({ maxAge, ask }).then((fix) => live && fix && setLocation(fix))
    const off = onFix((fix) => live && setLocation(fix))
    return () => {
      live = false
      off()
    }
  }, [enabled, ask, maxAge])
  return enabled ? location : null
}
