'use client'
// #189 Plan B: your pick is closed or full → similar places nearby (same cuisine or one you love,
// open now if we know, a similar price), nearest first.
import type { Place } from '@/hooks/use-crumbs-data'
import { planB } from '@/lib/decide-more'
import { average5 } from '@/lib/ratings'
import { Overlay } from './overlay'
import { useShowScore } from './score-input'

export function PlanB({
  place,
  places,
  onPick,
  pickLabel = 'Open it',
  onClose,
}: {
  place: Place
  places: Place[]
  onPick: (place: Place) => void
  pickLabel?: string
  onClose: () => void
}) {
  const show = useShowScore()
  const options = planB(place, places)
  return (
    <Overlay label="Plan B" title="Plan B" onClose={onClose}>
      <div className="flex flex-col gap-3">
        <p className="text-sm text-muted-foreground">
          Instead of {place.name}: similar places close by from your group’s list.
        </p>
        {options.length ? (
          options.map(({ place: p, km, sameCuisine, open }) => (
            <div key={p.id} className="surface-soft flex items-center justify-between gap-2">
              <span className="min-w-0">
                <span className="block font-semibold">{p.name}</span>
                <span className="block text-xs text-muted-foreground">
                  {[
                    sameCuisine ? p.cuisine : 'One you love',
                    km !== null
                      ? km < 1
                        ? `${Math.round(km * 1000)} m away`
                        : `${km.toFixed(1)} km away`
                      : null,
                    open ? 'open now' : null,
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
          <p className="surface-soft text-sm">
            Nothing similar nearby on your list yet — try Explore on the map.
          </p>
        )}
      </div>
    </Overlay>
  )
}
