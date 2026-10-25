'use client'
import { useMemo, useState } from 'react'
import { useCountUp } from '@/lib/motion'
import type { Place, Profile } from '@/hooks/use-crumbs-data'
import {
  BINGO_CUISINES,
  bestDishes,
  cuisineBingo,
  onThisDay,
  rankedCourses,
  tasteMatch,
  type DishCourse,
} from '@/lib/stats'
import { DISH_KINDS, bestOfKind, rankedKinds } from '@/lib/dish-kinds'

const COURSE_LABEL: Record<DishCourse, string> = {
  starter: 'Starters',
  main: 'Mains',
  side: 'Sides',
  dessert: 'Desserts',
  drink: 'Drinks',
}

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
  const [course, setCourse] = useState<DishCourse | null>(null)
  const courses = useMemo(() => rankedCourses(places), [places])
  // #178 Best of a kind ("Best ramen") across all your places.
  const [kind, setKind] = useState<string | null>(null)
  const kinds = useMemo(() => rankedKinds(places), [places])
  const stats = useMemo(
    () => ({
      dishes: kind ? bestOfKind(places, kind) : bestDishes(places, 10, course ?? undefined),
      match: userId && partner ? tasteMatch(places, userId, partner.id) : null,
      memories: onThisDay(places),
      cuisines: cuisineBreakdown(places),
    }),
    [places, userId, partner, course, kind],
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

      {(stats.dishes.length > 0 || course || kind) && (
        <div className="surface flex flex-col gap-3">
          <span className="tag w-fit">
            {kind
              ? `Best ${DISH_KINDS.find((k) => k.id === kind)?.label.toLowerCase()}`
              : 'Best dishes'}
          </span>
          {courses.length > 0 && (
            <div className="chip-row" role="radiogroup" aria-label="Kind of dish">
              {[null, ...courses].map((c) => (
                <button
                  key={c ?? 'all'}
                  role="radio"
                  aria-checked={!kind && course === c}
                  className={`chip chip-sm ${!kind && course === c ? 'chip-active' : ''}`}
                  onClick={() => {
                    setCourse(c)
                    setKind(null)
                  }}
                >
                  {c ? COURSE_LABEL[c] : 'All'}
                </button>
              ))}
            </div>
          )}
          {kinds.length > 0 && (
            <div className="chip-row" role="radiogroup" aria-label="Best of a kind">
              {kinds.map((k) => (
                <button
                  key={k.id}
                  role="radio"
                  aria-checked={kind === k.id}
                  className={`chip chip-sm ${kind === k.id ? 'chip-active' : ''}`}
                  onClick={() => {
                    setKind(kind === k.id ? null : k.id)
                    setCourse(null)
                  }}
                >
                  {k.emoji} {k.label}
                </button>
              ))}
            </div>
          )}
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
      {stats.cuisines.length > 0 && (
        <div className="surface flex flex-col gap-3">
          <span className="tag w-fit">Cuisines</span>
          {stats.cuisines.map((row) => (
            <div key={row.cuisine} className="flex flex-col gap-1">
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="font-semibold">{row.cuisine}</span>
                <span className="text-xs text-muted-foreground">
                  {row.count} place{row.count === 1 ? '' : 's'}
                  {row.average ? ` · ${row.average.toFixed(1)}★` : ''}
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-muted" aria-hidden="true">
                <div
                  className="bar-fill h-full rounded-full bg-primary"
                  style={{ width: `${(row.average / 5) * 100}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  )
}

/** #63: every cuisine you've been to, with how many places and the group's average. */
function cuisineBreakdown(places: Place[]) {
  const rows = new Map<string, { cuisine: string; count: number; scores: number[] }>()
  places
    .filter((place) => place.status === 'Been' && place.cuisine)
    .forEach((place) => {
      const key = place.cuisine!.trim()
      const row = rows.get(key.toLowerCase()) ?? { cuisine: key, count: 0, scores: [] }
      row.count += 1
      place.place_ratings.forEach((rating) => row.scores.push(rating.score))
      rows.set(key.toLowerCase(), row)
    })
  return [...rows.values()]
    .map((row) => ({
      cuisine: row.cuisine,
      count: row.count,
      average: row.scores.length ? row.scores.reduce((a, b) => a + b, 0) / row.scores.length : 0,
    }))
    .sort((a, b) => b.average - a.average || b.count - a.count)
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
            className={`flex aspect-square items-center justify-center rounded-xl p-1 text-center text-[0.625rem] font-semibold leading-tight ${
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
