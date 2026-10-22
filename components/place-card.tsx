'use client'
import { MapPin, Pin } from 'lucide-react'
import type { Place } from '@/hooks/use-crumbs-data'
import { RatingStars } from './rating-stars'
export function placeAverage(place: Place) {
  return place.place_ratings.length
    ? place.place_ratings.reduce((sum, rating) => sum + rating.score, 0) /
        place.place_ratings.length
    : 0
}
export function PlaceCard({ place, onSelect }: { place: Place; onSelect: (place: Place) => void }) {
  const average = placeAverage(place)
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
        </div>
        <strong className="font-serif text-3xl text-primary">
          {average ? average.toFixed(1) : '—'}
        </strong>
      </div>
      <div className="flex items-center justify-between gap-3">
        <span className={`chip ${place.status === 'Been' ? 'chip-active' : ''}`}>
          {place.status}
        </span>
        <RatingStars value={Math.round(average)} />
      </div>
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
