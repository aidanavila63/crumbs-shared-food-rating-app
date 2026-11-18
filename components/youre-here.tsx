'use client'
// U2 (Round 87): a small card at the top of Places when you're standing at a place saved here.
// Only uses a location the phone already gave Crumbs (never asks); "Not now" hides it for that
// place for the rest of the day.
import { useEffect, useState } from 'react'
import { MapPin, X } from 'lucide-react'
import type { Place } from '@/hooks/use-crumbs-data'
import { FRESH, locate, type LatLng } from '@/lib/location'
import { placeHere } from '@/lib/youre-here'
import { haptic } from '@/lib/motion'

const KEY = 'crumbs-here-dismissed'
const today = () => new Date().toISOString().slice(0, 10)
function dismissed(id: string) {
  try {
    return localStorage.getItem(KEY) === `${id}:${today()}`
  } catch {
    return false
  }
}

export function YoureHere({
  places,
  onOpen,
  onLog,
}: {
  places: Place[]
  onOpen: (place: Place) => void
  onLog: () => void
}) {
  const [at, setAt] = useState<LatLng | null>(null)
  const [hidden, setHidden] = useState<string | null>(null)
  useEffect(() => {
    let live = true
    // (uses the remembered spot first, and never shows a popup)
    locate({ maxAge: FRESH, ask: false }).then((spot) => live && spot && setAt(spot))
    return () => {
      live = false
    }
  }, [])
  const place = placeHere(places, at)
  if (!place || hidden === place.id || dismissed(place.id)) return null
  return (
    <div className="surface rise-panel flex items-center gap-3" role="status">
      <MapPin size={20} className="shrink-0 text-primary" aria-hidden="true" />
      <span className="min-w-0 flex-1">
        <span className="block truncate font-semibold">You’re at {place.name}</span>
        <span className="block text-sm text-muted-foreground">
          {place.status === 'Been' ? 'Back again? Log it.' : 'First time here? Log it after.'}
        </span>
      </span>
      <button className="secondary !min-h-10 !px-3 text-sm" onClick={() => onOpen(place)}>
        Open
      </button>
      <button
        className="primary !min-h-10 !px-3 text-sm"
        onClick={() => {
          haptic('tap')
          onLog()
        }}
      >
        Log
      </button>
      <button
        className="icon-btn"
        aria-label="Not now"
        onClick={() => {
          try {
            localStorage.setItem(KEY, `${place.id}:${today()}`)
          } catch {}
          setHidden(place.id)
        }}
      >
        <X size={16} />
      </button>
    </div>
  )
}
