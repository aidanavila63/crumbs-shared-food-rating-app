'use client'
// #189 Plan B: your pick is closed or full → first, places on your list close by (most like it
// first: same cuisine or one you love, similar price, open now), then places nearby that aren't
// on your list yet (free open map data, loads when you tap).
import type { Place } from '@/hooks/use-crumbs-data'
import { planB } from '@/lib/decide-more'
import { average5 } from '@/lib/ratings'
import { Overlay } from './overlay'
import { useShowScore } from './score-input'
import { NearbyOffList } from './nearby-off-list'

export function PlanB({
  place,
  places,
  onPick,
  pickLabel = 'Open it',
  onClose,
  supabase,
  demo = false,
  userId,
  onAdded,
}: {
  place: Place
  places: Place[]
  onPick: (place: Place) => void
  pickLabel?: string
  onClose: () => void
  /** for "Not on your list yet" (left out = that section is hidden) */
  supabase?: any
  demo?: boolean
  userId?: string
  onAdded?: (place: Place) => void
}) {
  const show = useShowScore()
  const options = planB(place, places)
  const center =
    place.latitude !== null && place.longitude !== null
      ? { lat: place.latitude, lng: place.longitude }
      : null
  return (
    <Overlay label="Plan B" title="Plan B" onClose={onClose}>
      <div className="flex flex-col gap-3">
        <p className="text-sm text-muted-foreground">Instead of {place.name}:</p>
        <p className="text-sm font-semibold">On your list</p>
        {options.length ? (
          options.map(({ place: p, km, sameCuisine, loved, open }) => (
            <div key={p.id} className="surface-soft flex items-center justify-between gap-2">
              <span className="min-w-0">
                <span className="block font-semibold">{p.name}</span>
                <span className="block text-xs text-muted-foreground">
                  {[
                    sameCuisine ? p.cuisine : loved ? 'One you love' : p.cuisine,
                    km !== null
                      ? km < 1
                        ? `${Math.round(km * 1000)} m away`
                        : `${km.toFixed(1)} km away`
                      : null,
                    open === true ? 'open now' : open === false ? 'closed now' : null,
                    average5(p.place_ratings) ? show(average5(p.place_ratings)) : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
              </span>
              <button
                className="primary shrink-0 !min-h-10 !px-4 text-sm"
                onClick={() => onPick(p)}
              >
                {pickLabel}
              </button>
            </div>
          ))
        ) : (
          <p className="surface-soft text-sm">Nothing else on your list within 5 km.</p>
        )}
        {supabase && onAdded && (
          <NearbyOffList
            center={center}
            near={place.name}
            places={places}
            supabase={supabase}
            demo={demo}
            groupId={place.group_id}
            userId={userId}
            addLabel="Add"
            onAdded={(added) => {
              onAdded(added)
              onPick(added)
            }}
          />
        )}
      </div>
    </Overlay>
  )
}
