'use client'
import { useMemo } from 'react'
import { useCountUp } from '@/lib/motion'
import type { Place, Profile } from '@/hooks/use-crumbs-data'
import { BINGO_CUISINES, bestDishes, cuisineBingo, onThisDay, tasteMatch } from '@/lib/stats'

/** Everything fun we can work out from your ratings, visits and dish scores. */
export function StatsPanel({
  places,
  members,
  userId,
  onSelect,
}: {
  places: Place[]
  members: Profile[]
  userId?: string
  names: Record<string, string>
  onSelect?: (place: Place) => void
}) {
  // Year in review, spend by month and "who rates harder" were removed (backlog #62, #64, #67 = No).
  // lib/stats.ts keeps yearInReview/spendByMonth for a future "Crumbs Wrapped" (#61).
  const partner = members.find((member) => member.id !== userId)
  const stats = useMemo(
    () => ({
      dishes: bestDishes(places, 10),
      match: userId && partner ? tasteMatch(places, userId, partner.id) : null,
      memories: onThisDay(places),
    }),
    [places, userId, partner],
  )
  const matchShown = useCountUp(stats.match?.percent ?? 0)

  return (
    <>
      {stats.memories.length > 0 && (
        <div className="surface flex flex-col gap-2">
          <span className="tag w-fit">On this day</span>
          {stats.memories.map(({ place, yearsAgo }) => (
            <button
              key={place.id}
              className="surface-soft text-left"
              onClick={() => onSelect?.(place)}
            >
              <p className="font-semibold">{place.name}</p>
              <p className="text-sm text-muted-foreground">
                You went {yearsAgo} year{yearsAgo === 1 ? '' : 's'} ago today
              </p>
            </button>
          ))}
        </div>
      )}

      {stats.dishes.length > 0 && (
        <div className="surface flex flex-col gap-3">
          <span className="tag w-fit">Best dishes</span>
          {stats.dishes.map(({ dish, place, points }, index) => (
            <button
              key={dish.id}
              className="surface-soft flex items-center gap-3 text-left"
              onClick={() => onSelect?.(place)}
            >
              <span className="w-6 font-serif text-xl text-muted-foreground">{index + 1}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold">{dish.name}</span>
                <span className="block truncate text-xs text-muted-foreground">{place.name}</span>
              </span>
              <span className="font-serif text-2xl text-primary">{points}</span>
            </button>
          ))}
        </div>
      )}

      {stats.match && (
        <div className="surface flex flex-col gap-2">
          <span className="tag w-fit">You two</span>
          {stats.match && (
            <p className="text-sm">
              Taste match{' '}
              <strong className="font-serif text-2xl text-primary">{matchShown}%</strong>
              <span className="text-muted-foreground">
                {' '}
                across {stats.match.count} place{stats.match.count === 1 ? '' : 's'} you both rated
              </span>
            </p>
          )}
        </div>
      )}
    </>
  )
}

/** 5×5 cuisine bingo card (the "cuisine passport"). */
export function BingoCard({ places }: { places: Place[] }) {
  const bingo = useMemo(() => cuisineBingo(places), [places])
  return (
    <div className="surface flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="tag w-fit">Cuisine bingo</span>
        <span className="text-xs text-muted-foreground">
          {bingo.filled}/25 · {bingo.bingos} bingo
          {bingo.bingos === 1 ? '' : 's'}
        </span>
      </div>
      <div className="bingo-grid grid grid-cols-5 gap-1.5" role="list" aria-label="Cuisine bingo">
        {BINGO_CUISINES.map((cuisine, index) => (
          <div
            key={cuisine}
            role="listitem"
            aria-label={`${cuisine}: ${bingo.done[index] ? 'tried' : 'not yet'}`}
            className={`flex aspect-square items-center justify-center rounded-xl p-1 text-center text-[10px] font-semibold leading-tight ${
              bingo.done[index]
                ? 'bingo-filled bg-primary text-primary-foreground'
                : 'surface-soft text-muted-foreground'
            }`}
          >
            {cuisine}
          </div>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        A square fills when you&apos;ve been to a place with that cuisine or tag.
      </p>
    </div>
  )
}
