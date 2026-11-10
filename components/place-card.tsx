'use client'
import { memo } from 'react'
import { useShowScore } from './score-input'
import { MapPin, Pin } from 'lucide-react'
import { average5 } from '@/lib/ratings'
import { basedOn } from '@/lib/based-on'
import type { Place } from '@/hooks/use-crumbs-data'
import { RatingStars } from './rating-stars'
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
  names = {},
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
  return (
    <button
      type="button"
      onClick={() => onSelect(place)}
      className="surface place-card flex w-full flex-col gap-3 text-left"
      aria-label={`Open ${place.name}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-serif text-2xl font-bold leading-tight break-words">{place.name}</h3>
            {place.pinned && (
              <Pin size={16} className="shrink-0 text-primary" fill="currentColor" aria-label="Pinned" />
            )}
          </div>
          <p className="mt-1 flex items-center gap-1 text-sm text-muted-foreground">
            <MapPin size={14} className="shrink-0" />
            <span className="truncate">{place.formatted_address || 'Address not added'}</span>
          </p>
          {(isClosedForever(place) || hours || away !== null) && (
            <p className="mt-1 text-sm font-semibold">
              {isClosedForever(place) ? (
                <span className="text-destructive">⚠ Permanently closed</span>
              ) : (
                hours && <span className={hours.soon ? 'text-[#b7791f]' : hours.open ? 'text-[#2f7d4f]' : 'text-muted-foreground'}>{hours.soon ? '◐' : hours.open ? '●' : '○'} {hours.text}</span>
              )}
              {away !== null && (
                <span className="font-normal text-muted-foreground">
                  {!isClosedForever(place) && hours ? ' · ' : ''}
                  {away < 1 ? `${Math.round(away * 1000)} m` : `${away.toFixed(1)} km`} from home
                </span>
              )}
            </p>
          )}
          {(place.cuisine || place.price_level) && (
            <p className="mt-1 text-sm text-muted-foreground">
              {[place.cuisine, place.price_level ? '$'.repeat(place.price_level) : null]
                .filter(Boolean)
                .join(' · ')}
            </p>
          )}
        </div>
        <span className="flex shrink-0 flex-col items-end">
          <strong className="font-serif text-3xl leading-8 text-primary">{show(average)}</strong>
          {counted && (
            <span className="text-[0.7rem] text-muted-foreground">
              {counted.split(' · ')[0]}
            </span>
          )}
        </span>
      </div>
      <div className="flex items-center justify-between gap-3">
        <span className={`chip ${place.status === 'Been' ? 'chip-active' : ''}`}>
          {place.status === 'Been' && place.visited_on
            ? `Been · ${new Date(`${place.visited_on}T12:00:00`).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}`
            : place.status}
        </span>
        <RatingStars value={Math.round(average)} />
      </div>
      {hidden && (
        <p className="text-sm text-muted-foreground">🙈 Blind ratings on. Rate it to see each other’s scores.</p>
      )}
      {warnings.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {warnings.map((warning) => (
            <span className="tag text-destructive" key={warning.label}>
              ⚠ {warning.label} · {warning.who.join(', ')} avoids
            </span>
          ))}
        </div>
      )}
      {place.place_ratings.length > 0 && (
        <div className="flex flex-wrap gap-2 text-sm">
          {place.place_ratings.map((rating) => (
            <span className="surface-soft !px-3 !py-1" key={rating.user_id}>
              <strong>{(names[rating.user_id] ?? 'Partner').split(' ')[0]}</strong> {rating.score}★
            </span>
          ))}
        </div>
      )}
      {place.tags?.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {place.tags.map((tag) => (
            <span className="tag" key={tag}>
              {tag}
            </span>
          ))}
        </div>
      )}
    </button>
  )
})
