'use client'
import { useMemo, useState } from 'react'
import type { Place, Profile } from '@/hooks/use-crumbs-data'
import { normaliseFacts, openStatus, placeWarnings } from '@/lib/place-info'
import { surprisePool } from '@/lib/stats'
import { useUserLocation } from '@/lib/use-user-location'
import { Sheet } from './sheet'

/** Pick a want-to-try place at random, from only the ones that fit what you feel like. */
export function SurpriseSheet({
  places,
  members = [],
  onOpen,
  onClose,
}: {
  places: Place[]
  members?: Profile[]
  onOpen: (place: Place) => void
  onClose: () => void
}) {
  const [cuisine, setCuisine] = useState<string | null>(null)
  const [maxPrice, setMaxPrice] = useState<number | null>(null)
  const [pinnedOnly, setPinnedOnly] = useState(false)
  const [near, setNear] = useState(false)
  const [openNow, setOpenNow] = useState(false)
  const [skipWarned, setSkipWarned] = useState(true)
  const [picked, setPicked] = useState<Place | null>(null)
  const location = useUserLocation(near)
  const wishlist = useMemo(() => places.filter((place) => place.status === 'Want to try'), [places])
  const cuisines = useMemo(
    () => [...new Set(wishlist.map((place) => place.cuisine).filter(Boolean) as string[])].sort(),
    [wishlist],
  )
  const pool = surprisePool(places, {
    cuisine,
    maxPrice,
    pinnedOnly,
    nearMe: near ? location : null,
  }).filter(
    (place) =>
      // Hours we haven't looked up yet count as "maybe open".
      (!openNow || openStatus(place.opening_hours)?.open !== false) &&
      (!skipWarned || !placeWarnings(normaliseFacts(place.place_facts), members).length),
  )
  const waiting = near && !location

  function spin() {
    const options = pool.length > 1 ? pool.filter((place) => place.id !== picked?.id) : pool
    setPicked(options[Math.floor(Math.random() * options.length)] ?? null)
  }
  const chip = (active: boolean) => `chip chip-sm ${active ? 'chip-active' : ''}`

  return (
    <Sheet label="Surprise us" onClose={onClose}>
      <div className="flex items-center justify-between">
        <h2 className="font-serif text-2xl font-bold">🎲 Surprise us</h2>
        <button className="icon-btn" onClick={onClose} aria-label="Close">
          ×
        </button>
      </div>
      <div className="mt-4 flex flex-col gap-4">
        {cuisines.length > 0 && (
          <div className="flex flex-col gap-2">
            <p className="text-sm font-semibold">Cuisine</p>
            <div className="chip-row">
              <button
                aria-pressed={!cuisine}
                className={chip(!cuisine)}
                onClick={() => setCuisine(null)}
              >
                Any
              </button>
              {cuisines.map((item) => (
                <button
                  key={item}
                  aria-pressed={cuisine === item}
                  className={chip(cuisine === item)}
                  onClick={() => setCuisine(cuisine === item ? null : item)}
                >
                  {item}
                </button>
              ))}
            </div>
          </div>
        )}
        <div className="flex flex-col gap-2">
          <p className="text-sm font-semibold">Price</p>
          <div className="chip-row">
            {[null, 1, 2, 3].map((level) => (
              <button
                key={String(level)}
                aria-pressed={maxPrice === level}
                className={chip(maxPrice === level)}
                onClick={() => setMaxPrice(level)}
              >
                {level ? `Up to ${'$'.repeat(level)}` : 'Any'}
              </button>
            ))}
          </div>
        </div>
        <div className="chip-row">
          <button
            aria-pressed={pinnedOnly}
            className={chip(pinnedOnly)}
            onClick={() => setPinnedOnly(!pinnedOnly)}
          >
            📌 Pinned only
          </button>
          <button aria-pressed={near} className={chip(near)} onClick={() => setNear(!near)}>
            📍 Within 10 km
          </button>
          <button aria-pressed={openNow} className={chip(openNow)} onClick={() => setOpenNow(!openNow)}>
            🕒 Open now
          </button>
          <button aria-pressed={skipWarned} className={chip(skipWarned)} onClick={() => setSkipWarned(!skipWarned)}>
            ⚠ Skip dealbreakers
          </button>
        </div>
        <p className="text-xs text-muted-foreground">
          {waiting
            ? 'Finding where you are…'
            : `${pool.length} place${pool.length === 1 ? '' : 's'} on your want-to-try list match.`}{' '}
          Places you&apos;ve been are never picked.
        </p>
        {picked && (
          <div className="surface flex flex-col gap-2">
            <p className="font-serif text-2xl font-bold">{picked.name}</p>
            <p className="text-sm text-muted-foreground">
              {[
                picked.cuisine,
                picked.price_level ? '$'.repeat(picked.price_level) : null,
                picked.formatted_address,
              ]
                .filter(Boolean)
                .join(' · ')}
            </p>
            <button className="primary" onClick={() => onOpen(picked)}>
              Open it
            </button>
          </div>
        )}
        <button className="primary" disabled={!pool.length || waiting} onClick={spin}>
          {picked ? 'Spin again' : 'Pick for us'}
        </button>
      </div>
    </Sheet>
  )
}
