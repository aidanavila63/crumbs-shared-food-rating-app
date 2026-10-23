'use client'
import { useEffect, useMemo, useState } from 'react'
import type { Place, Profile } from '@/hooks/use-crumbs-data'
import { tonightPick } from '@/lib/place-info'
import { placeAverage } from './place-card'

/** One suggestion from your want-to-try list, steady for the day, shown when you open the app. */
export function TonightCard({
  places,
  members,
  onOpen,
}: {
  places: Place[]
  members: Profile[]
  onOpen: (place: Place) => void
}) {
  const [skip, setSkip] = useState(0)
  const [hidden, setHidden] = useState(true)
  const today = new Date().toISOString().slice(0, 10)
  useEffect(() => {
    try {
      setHidden(localStorage.getItem('crumbs-tonight-hide') === today)
    } catch {
      setHidden(false)
    }
  }, [today])
  const pick = useMemo(
    () => tonightPick(places, members, placeAverage, new Date(), skip),
    [places, members, skip],
  )
  if (hidden || !pick) return null
  return (
    <div className="surface flex flex-col gap-2 border-primary/30">
      <div className="flex items-center justify-between">
        <p className="text-sm font-bold uppercase tracking-wide text-primary">Tonight?</p>
        <button
          className="text-xs text-muted-foreground underline"
          onClick={() => {
            try {
              localStorage.setItem('crumbs-tonight-hide', today)
            } catch {}
            setHidden(true)
          }}
        >
          Hide for today
        </button>
      </div>
      <p className="font-serif text-2xl font-bold">{pick.place.name}</p>
      <p className="text-sm text-muted-foreground">
        {[pick.reason, pick.place.cuisine, pick.place.price_level ? '$'.repeat(pick.place.price_level) : null]
          .filter(Boolean)
          .join(' · ')}
      </p>
      <div className="flex gap-2">
        <button className="primary flex-1" onClick={() => onOpen(pick.place)}>
          Open it
        </button>
        {pick.count > 1 && (
          <button className="secondary" onClick={() => setSkip(skip + 1)}>
            Another
          </button>
        )}
      </div>
    </div>
  )
}
