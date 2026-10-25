'use client'
// #190 New-member catch-up: the group's favourites, must-try dishes and lists on day one.
import type { Group, List, Place } from '@/hooks/use-crumbs-data'
import { catchUp, markCatchUpSeen } from '@/lib/catch-up'
import { useShowScore } from './score-input'
import { average5 } from '@/lib/ratings'

export function CatchUpCard({
  group,
  places,
  lists,
  onSelect,
  onDone,
}: {
  group: Group
  places: Place[]
  lists: List[]
  onSelect: (place: Place) => void
  onDone: () => void
}) {
  const show = useShowScore()
  const c = catchUp(places)
  if (!c.favourites.length && !c.dishes.length && !lists.length) return null
  return (
    <div className="surface rise-panel mb-4 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm text-muted-foreground">Welcome to {group.name}!</p>
          <h3 className="font-serif text-2xl font-bold">Catch up</h3>
        </div>
        <button
          className="text-sm font-semibold text-primary underline"
          onClick={() => {
            markCatchUpSeen(group.id)
            onDone()
          }}
        >
          Got it
        </button>
      </div>
      {c.favourites.length > 0 && (
        <div className="flex flex-col gap-1">
          <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            Their favourites
          </p>
          {c.favourites.map((p) => (
            <button
              key={p.id}
              className="flex items-center justify-between gap-2 text-left"
              onClick={() => onSelect(p)}
            >
              <span className="font-semibold">{p.name}</span>
              <span className="font-serif text-lg text-primary">
                {show(average5(p.place_ratings))}
              </span>
            </button>
          ))}
        </div>
      )}
      {c.dishes.length > 0 && (
        <div className="flex flex-col gap-1">
          <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            Must-try dishes
          </p>
          {c.dishes.map(({ dish, place, points }) => (
            <button
              key={dish.id}
              className="flex items-center justify-between gap-2 text-left text-sm"
              onClick={() => onSelect(place)}
            >
              <span>
                <strong>{dish.name}</strong> at {place.name}
              </span>
              <span className="text-primary">{points}/100</span>
            </button>
          ))}
        </div>
      )}
      <p className="text-sm text-muted-foreground">
        {c.wishlist
          ? `${c.wishlist} place${c.wishlist === 1 ? '' : 's'} on the want-to-try list`
          : ''}
        {c.wishlist && lists.length ? ' · ' : ''}
        {lists.length
          ? `Lists: ${lists
              .slice(0, 4)
              .map((l) => l.name)
              .join(', ')}`
          : ''}
      </p>
    </div>
  )
}
