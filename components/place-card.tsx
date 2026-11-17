'use client'
import { memo } from 'react'
import { useShowScore } from './score-input'
import { Pin } from 'lucide-react'
import { average5 } from '@/lib/ratings'
import { basedOn } from '@/lib/based-on'
import type { Place } from '@/hooks/use-crumbs-data'
import { isClosedForever, normaliseFacts, openStatus, placeWarnings } from '@/lib/place-info'
import { distanceKm } from '@/lib/stats'
import type { Profile } from '@/hooks/use-crumbs-data'
/** Group average on the 0-5 scale; exact (uses points) when half stars / 10-point scores are saved. */
export function placeAverage(place: Place) {
  return average5(place.place_ratings)
}
/** Memoised: a realtime change to one place doesn't redraw every card in the list. */
export const PlaceCard = memo(function PlaceCard({
  place,
  members = [],
  home = null,
  hidden = false,
  onSelect,
}: {
  place: Place
  names?: Record<string, string>
  members?: Profile[]
  home?: { lat: number; lng: number } | null
  hidden?: boolean
  onSelect: (place: Place) => void
}) {
  const show = useShowScore()
  const average = placeAverage(place)
  const counted = average > 0 ? basedOn(place) : null
  const warnings = placeWarnings(normaliseFacts(place.place_facts), members)
  const hours = openStatus(place.opening_hours)
  const away =
    home && place.latitude !== null && place.longitude !== null
      ? distanceKm(home, { lat: place.latitude, lng: place.longitude })
      : null
  // D2 (Round 83): a plain row like "Most-loved dishes" on restaurant pages — name and one line
  // of facts on the left, the score on the right (nothing when unrated); everyone's ratings,
  // stars and status live on the place page.
  const facts = [
    place.cuisine,
    place.price_level ? '$'.repeat(place.price_level) : null,
    away !== null ? (away < 1 ? `${Math.round(away * 1000)} m` : `${away.toFixed(1)} km`) : null,
  ].filter(Boolean)
  const closed = isClosedForever(place)
  return (
    <button
      type="button"
      onClick={() => onSelect(place)}
      className="place-row text-left"
      aria-label={`Open ${place.name}`}
    >
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="truncate font-serif text-lg font-bold leading-tight">{place.name}</span>
          {place.pinned && (
            <Pin
              size={14}
              className="shrink-0 text-primary"
              fill="currentColor"
              aria-label="Pinned"
            />
          )}
          {place.status === 'Want to try' && (
            <span className="tag-outline shrink-0">Want to try</span>
          )}
        </span>
        <span className="mt-0.5 block truncate text-sm text-muted-foreground">
          {closed ? (
            <span className="font-semibold text-destructive">Permanently closed</span>
          ) : hours ? (
            <span
              className={`font-semibold ${hours.soon ? 'text-[#b7791f]' : hours.open ? 'text-[#2f7d4f]' : ''}`}
            >
              {hours.text}
            </span>
          ) : null}
          {(closed || hours) && facts.length ? ' · ' : ''}
          {facts.join(' · ') || (!closed && !hours ? place.formatted_address || '' : '')}
        </span>
        {warnings.length > 0 && (
          <span className="mt-0.5 block truncate text-xs font-semibold text-destructive">
            ⚠ {warnings.map((w) => `${w.label} (${w.who.join(', ')})`).join(' · ')}
          </span>
        )}
        {hidden && (
          <span className="mt-0.5 block text-xs text-muted-foreground">
            Rate it to see everyone’s scores
          </span>
        )}
      </span>
      {average > 0 && (
        <span className="flex shrink-0 flex-col items-end">
          <strong className="font-serif text-2xl leading-7 text-primary">{show(average)}</strong>
          {counted && (
            <span className="text-[0.7rem] text-muted-foreground">{counted.split(' · ')[0]}</span>
          )}
        </span>
      )}
    </button>
  )
})
