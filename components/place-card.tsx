'use client'
import { MapPin, Pin } from 'lucide-react'
import type { Place } from '@/hooks/use-crumbs-data'
import { RatingStars } from './rating-stars'
import { isClosedForever, normaliseFacts, openStatus, placeWarnings } from '@/lib/place-info'
import { distanceKm } from '@/lib/stats'
import type { Profile } from '@/hooks/use-crumbs-data'
export function placeAverage(place: Place) {
  return place.place_ratings.length
    ? place.place_ratings.reduce((sum, rating) => sum + rating.score, 0) /
        place.place_ratings.length
    : 0
}
export function PlaceCard({
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
  const average = placeAverage(place)
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
      className="surface flex w-full flex-col gap-3 text-left transition-transform active:scale-[.99]"
      aria-label={`Open ${place.name}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="font-serif text-2xl font-bold">{place.name}</h3>
            {place.pinned && <Pin size={16} className="text-primary" fill="currentColor" />}
          </div>
          <p className="mt-1 flex items-center gap-1 text-sm text-muted-foreground">
            <MapPin size={14} />
            {place.formatted_address || 'Address not added'}
          </p>
          {(isClosedForever(place) || hours || away !== null) && (
            <p className="mt-1 text-sm font-semibold">
              {isClosedForever(place) ? (
                <span className="text-destructive">⚠ Permanently closed</span>
              ) : (
                hours && <span className={hours.open ? 'text-[#2f7d4f]' : 'text-muted-foreground'}>{hours.open ? '●' : '○'} {hours.text}</span>
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
        <strong className="font-serif text-3xl leading-8 text-primary">
          {average ? average.toFixed(1) : '—'}
        </strong>
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
}
