'use client'
import { useMemo } from 'react'
import type { Place, Profile } from '@/hooks/use-crumbs-data'
import {
  BINGO_CUISINES,
  averageGiven,
  bestDishes,
  cuisineBingo,
  onThisDay,
  spendByMonth,
  tasteMatch,
  yearInReview,
} from '@/lib/stats'

const money = (n: number) => `$${n.toFixed(n % 1 ? 2 : 0)}`
const MONTHS = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D']
const first = (name?: string) => (name ?? 'Partner').split(' ')[0]

/** Everything fun we can work out from your ratings, visits and dish scores. */
export function StatsPanel({
  places,
  members,
  userId,
  names,
  onSelect,
}: {
  places: Place[]
  members: Profile[]
  userId?: string
  names: Record<string, string>
  onSelect?: (place: Place) => void
}) {
  const year = new Date().getFullYear()
  const partner = members.find((member) => member.id !== userId)
  const stats = useMemo(() => {
    const spend = spendByMonth(places, year)
    return {
      dishes: bestDishes(places, 10),
      match: userId && partner ? tasteMatch(places, userId, partner.id) : null,
      mine: userId ? averageGiven(places, userId) : null,
      theirs: partner ? averageGiven(places, partner.id) : null,
      bingo: cuisineBingo(places),
      review: yearInReview(places, year),
      spend,
      spendMax: Math.max(...spend, 1),
      memories: onThisDay(places),
    }
  }, [places, userId, partner, year])

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

      {(stats.match || stats.mine) && (
        <div className="surface flex flex-col gap-2">
          <span className="tag w-fit">You two</span>
          {stats.match && (
            <p className="text-sm">
              Taste match{' '}
              <strong className="font-serif text-2xl text-primary">{stats.match.percent}%</strong>
              <span className="text-muted-foreground">
                {' '}
                across {stats.match.count} place{stats.match.count === 1 ? '' : 's'} you both rated
              </span>
            </p>
          )}
          {stats.mine && stats.theirs && (
            <p className="text-sm">
              {stats.mine.average === stats.theirs.average ? (
                'You rate exactly as hard as each other.'
              ) : (
                <>
                  <strong>
                    {stats.mine.average < stats.theirs.average
                      ? 'You'
                      : first(partner ? names[partner.id] : undefined)}
                  </strong>{' '}
                  rate{stats.mine.average < stats.theirs.average ? '' : 's'} harder (avg{' '}
                  {Math.min(stats.mine.average, stats.theirs.average).toFixed(1)}★ vs{' '}
                  {Math.max(stats.mine.average, stats.theirs.average).toFixed(1)}★).
                </>
              )}
            </p>
          )}
        </div>
      )}

      <div className="surface flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <span className="tag w-fit">Cuisine bingo</span>
          <span className="text-xs text-muted-foreground">
            {stats.bingo.filled}/25 · {stats.bingo.bingos} bingo
            {stats.bingo.bingos === 1 ? '' : 's'}
          </span>
        </div>
        <div className="grid grid-cols-5 gap-1.5" role="list" aria-label="Cuisine bingo">
          {BINGO_CUISINES.map((cuisine, index) => (
            <div
              key={cuisine}
              role="listitem"
              aria-label={`${cuisine}: ${stats.bingo.done[index] ? 'tried' : 'not yet'}`}
              className={`flex aspect-square items-center justify-center rounded-xl p-1 text-center text-[10px] font-semibold leading-tight ${
                stats.bingo.done[index]
                  ? 'bg-primary text-primary-foreground'
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

      {stats.review && (
        <div className="surface flex flex-col gap-2">
          <span className="tag w-fit">{year} so far</span>
          <p className="text-sm">
            <strong className="font-serif text-2xl text-primary">{stats.review.visits}</strong>{' '}
            visit
            {stats.review.visits === 1 ? '' : 's'}
            {stats.review.spend > 0 && (
              <>
                {' '}
                · <strong>{money(stats.review.spend)}</strong> spent
              </>
            )}
          </p>
          {stats.review.topCuisine && (
            <p className="text-sm">
              Most visited cuisine: <strong>{stats.review.topCuisine[0]}</strong> (
              {stats.review.topCuisine[1]}×)
            </p>
          )}
          {stats.review.mostVisited && stats.review.mostVisited[1] > 1 && (
            <p className="text-sm">
              Your regular spot: <strong>{stats.review.mostVisited[0]}</strong> (
              {stats.review.mostVisited[1]}×)
            </p>
          )}
          {stats.review.topRated && (
            <button
              className="text-left text-sm underline"
              onClick={() => onSelect?.(stats.review!.topRated!)}
            >
              Best rated: {stats.review.topRated.name}
            </button>
          )}
          {stats.spend.some((n) => n > 0) && (
            <div className="mt-1 flex h-24 items-end gap-1" role="img" aria-label="Spend by month">
              {stats.spend.map((amount, index) => (
                <div key={index} className="flex flex-1 flex-col items-center gap-1">
                  <div
                    className="w-full rounded-t-md bg-primary"
                    style={{
                      height: `${Math.max(2, (amount / stats.spendMax) * 70)}px`,
                      opacity: amount ? 1 : 0.15,
                    }}
                    title={money(amount)}
                  />
                  <span className="text-[10px] text-muted-foreground">{MONTHS[index]}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </>
  )
}
