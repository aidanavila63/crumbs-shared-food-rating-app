'use client'
import { useEffect, useMemo, useState } from 'react'
import { SlidersHorizontal } from 'lucide-react'
import type { Place, Profile } from '@/hooks/use-crumbs-data'
import { openStatus, tonightPick } from '@/lib/place-info'
import { distanceKm } from '@/lib/stats'
import { haptic } from '@/lib/motion'
import { placeAverage } from './place-card'

// #32 Tonight filter: budget, distance, open now, craving. Remembered on this phone.
type TonightFilter = { budget: number; km: number; openNow: boolean; cuisine: string | null }
const NO_FILTER: TonightFilter = { budget: 0, km: 0, openNow: false, cuisine: null }
const FILTER_KEY = 'crumbs-tonight-filter'

/** One suggestion from your want-to-try list, steady for the day, shown when you open the app. */
export function TonightCard({
  places,
  members,
  onOpen,
  home = null,
}: {
  places: Place[]
  members: Profile[]
  onOpen: (place: Place) => void
  home?: { lat: number; lng: number } | null
}) {
  const [skip, setSkip] = useState(0)
  const [filtering, setFiltering] = useState(false)
  const [f, setF] = useState<TonightFilter>(NO_FILTER)
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(FILTER_KEY) ?? 'null')
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (saved) setF({ ...NO_FILTER, ...saved })
    } catch {}
  }, [])
  function update(changes: Partial<TonightFilter>) {
    haptic('select')
    const next = { ...f, ...changes }
    setF(next)
    setSkip(0)
    try {
      localStorage.setItem(FILTER_KEY, JSON.stringify(next))
    } catch {}
  }
  const cuisines = useMemo(
    () =>
      [
        ...new Set(
          places
            .filter((p) => p.status === 'Want to try' && p.cuisine)
            .map((p) => p.cuisine as string),
        ),
      ].sort(),
    [places],
  )
  const active =
    (f.budget ? 1 : 0) + (f.km && home ? 1 : 0) + (f.openNow ? 1 : 0) + (f.cuisine ? 1 : 0)
  const pool = useMemo(
    () =>
      places.filter((p) => {
        if (p.status !== 'Want to try') return true // still used to learn what you like
        if (f.budget && p.price_level !== null && p.price_level > f.budget) return false
        if (f.cuisine && p.cuisine !== f.cuisine) return false
        if (f.openNow && openStatus(p.opening_hours)?.open !== true) return false
        if (f.km && home) {
          if (p.latitude === null || p.longitude === null) return false
          if (distanceKm(home, { lat: p.latitude, lng: p.longitude }) > f.km) return false
        }
        return true
      }),
    [places, f, home],
  )
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
    () => tonightPick(pool, members, placeAverage, new Date(), skip),
    [pool, members, skip],
  )
  if (hidden || (!pick && !active)) return null
  return (
    <div className="surface flex flex-col gap-2 border-primary/30">
      <div className="flex items-center justify-between">
        <p className="text-sm font-bold uppercase tracking-wide text-primary">Tonight?</p>
        <span className="flex items-center gap-3">
          <button
            className={`chip chip-sm !min-h-8 !px-2 ${active || filtering ? 'chip-active' : ''}`}
            aria-expanded={filtering}
            aria-label="Tonight filters"
            onClick={() => setFiltering(!filtering)}
          >
            <SlidersHorizontal size={14} />
            {active ? <span className="ml-1">{active}</span> : null}
          </button>
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
        </span>
      </div>
      {filtering && (
        <div className="rise-panel flex flex-col gap-2">
          <div className="chip-row" role="group" aria-label="Budget">
            {[0, 1, 2, 3].map((b) => (
              <button
                key={b}
                aria-pressed={f.budget === b}
                className={`chip chip-sm ${f.budget === b ? 'chip-active' : ''}`}
                onClick={() => update({ budget: b })}
              >
                {b ? `${'$'.repeat(b)} or less` : 'Any price'}
              </button>
            ))}
          </div>
          {home && (
            <div className="chip-row" role="group" aria-label="Distance">
              {[0, 1, 3, 10].map((km) => (
                <button
                  key={km}
                  aria-pressed={f.km === km}
                  className={`chip chip-sm ${f.km === km ? 'chip-active' : ''}`}
                  onClick={() => update({ km })}
                >
                  {km ? `Within ${km} km` : 'Any distance'}
                </button>
              ))}
            </div>
          )}
          <div className="chip-row" role="group" aria-label="Craving">
            <button
              aria-pressed={f.openNow}
              className={`chip chip-sm ${f.openNow ? 'chip-active' : ''}`}
              onClick={() => update({ openNow: !f.openNow })}
            >
              Open now
            </button>
            {cuisines.map((c) => (
              <button
                key={c}
                aria-pressed={f.cuisine === c}
                className={`chip chip-sm ${f.cuisine === c ? 'chip-active' : ''}`}
                onClick={() => update({ cuisine: f.cuisine === c ? null : c })}
              >
                {c}
              </button>
            ))}
          </div>
          {active > 0 && (
            <button
              className="self-start text-xs text-muted-foreground underline"
              onClick={() => update(NO_FILTER)}
            >
              Clear filters
            </button>
          )}
        </div>
      )}
      {!pick && (
        <p className="text-sm text-muted-foreground">Nothing on your list fits those filters.</p>
      )}
      {pick && (
        <>
          <p className="font-serif text-2xl font-bold">{pick.place.name}</p>
          <p className="text-sm text-muted-foreground">
            {[
              pick.reason,
              pick.place.cuisine,
              pick.place.price_level ? '$'.repeat(pick.place.price_level) : null,
            ]
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
        </>
      )}
    </div>
  )
}
