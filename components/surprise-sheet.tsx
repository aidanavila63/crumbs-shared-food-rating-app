'use client'
import { useMemo, useRef, useState } from 'react'
import type { Place, Profile } from '@/hooks/use-crumbs-data'
import { normaliseFacts, openStatus, placeWarnings } from '@/lib/place-info'
import { surprisePool } from '@/lib/stats'
import { useUserLocation } from '@/lib/use-user-location'
import { haptic, motionAllowed } from '@/lib/motion'
import { wheelRotation } from '@/lib/decide-more'
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

  // #132 Spin the wheel: up to 8 of the matching places on a wheel that lands on the pick.
  const [wheel, setWheel] = useState<{ items: Place[]; rotation: number } | null>(null)
  const [spinning, setSpinning] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  function spin() {
    if (spinning) return
    haptic('select')
    const options = pool.length > 1 ? pool.filter((place) => place.id !== picked?.id) : pool
    const winner = options[Math.floor(Math.random() * options.length)] ?? null
    if (!winner) return setPicked(null)
    if (!motionAllowed() || pool.length < 2) return setPicked(winner)
    const others = pool
      .filter((p) => p.id !== winner.id)
      .sort(() => Math.random() - 0.5)
      .slice(0, 7)
    const at = Math.floor(Math.random() * (others.length + 1))
    const items = [...others.slice(0, at), winner, ...others.slice(at)]
    setPicked(null)
    setSpinning(true)
    setWheel((w) => ({
      items,
      rotation: wheelRotation(w?.rotation ?? 0, at, items.length),
    }))
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      setSpinning(false)
      setPicked(winner)
      haptic('success')
    }, 3200)
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
          <button
            aria-pressed={openNow}
            className={chip(openNow)}
            onClick={() => setOpenNow(!openNow)}
          >
            🕒 Open now
          </button>
          <button
            aria-pressed={skipWarned}
            className={chip(skipWarned)}
            onClick={() => setSkipWarned(!skipWarned)}
          >
            ⚠ Skip dealbreakers
          </button>
        </div>
        <p className="text-xs text-muted-foreground">
          {waiting
            ? 'Finding where you are…'
            : `${pool.length} place${pool.length === 1 ? '' : 's'} on your want-to-try list match.`}{' '}
          Places you&apos;ve been are never picked.
        </p>
        {wheel && (
          <div className="spin-wheel-wrap" aria-hidden="true">
            <span className="spin-pointer">▼</span>
            <svg
              viewBox="-100 -100 200 200"
              className="spin-wheel"
              style={{ transform: `rotate(${wheel.rotation}deg)` }}
            >
              {wheel.items.map((p, i) => {
                const n = wheel.items.length
                const a0 = ((i * 360) / n - 90) * (Math.PI / 180)
                const a1 = (((i + 1) * 360) / n - 90) * (Math.PI / 180)
                const mid = (((i + 0.5) * 360) / n - 90) * (Math.PI / 180)
                const large = 360 / n > 180 ? 1 : 0
                const label = p.name.length > 13 ? `${p.name.slice(0, 12)}…` : p.name
                return (
                  <g key={p.id}>
                    <path
                      d={`M0 0 L${96 * Math.cos(a0)} ${96 * Math.sin(a0)} A96 96 0 ${large} 1 ${96 * Math.cos(a1)} ${96 * Math.sin(a1)} Z`}
                      className={`spin-slice-${'abc'[n % 2 === 0 ? i % 2 : i === n - 1 && i % 3 === 0 ? 1 : i % 3]}`}
                    />
                    <text
                      x={58 * Math.cos(mid)}
                      y={58 * Math.sin(mid)}
                      transform={`rotate(${((i + 0.5) * 360) / n} ${58 * Math.cos(mid)} ${58 * Math.sin(mid)})`}
                      textAnchor="middle"
                      dominantBaseline="middle"
                      className="spin-label"
                    >
                      {label}
                    </text>
                  </g>
                )
              })}
              <circle r="14" className="spin-hub" />
            </svg>
          </div>
        )}
        {picked && (
          <div key={picked.id} className="surface dice-reveal flex flex-col gap-2">
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
        <button className="primary" disabled={!pool.length || waiting || spinning} onClick={spin}>
          {spinning ? 'Spinning…' : picked ? 'Spin again' : '🎡 Spin the wheel'}
        </button>
      </div>
    </Sheet>
  )
}
