// #42 Smart lists: filled in automatically from your ratings and visits. Nothing is stored.
import type { Place } from '../hooks/use-crumbs-data'
import { usualCost, valueScore } from './value.ts'

const average = (place: Place) =>
  place.place_ratings.length
    ? place.place_ratings.reduce((sum, rating) => sum + rating.score, 0) /
      place.place_ratings.length
    : 0
const visitCount = (place: Place) =>
  place.place_visits?.length || (place.status === 'Been' && place.visited_on ? 1 : 0)

/** The most recent day you went (visits log, or the place's own visited date). */
export function lastVisit(place: Place): string | null {
  const days = [
    ...(place.place_visits ?? []).map((v) => v.visited_on),
    place.status === 'Been' ? place.visited_on : null,
  ].filter((d): d is string => !!d)
  return days.length ? days.sort().at(-1)! : null
}

/** #33 Places you liked (3.5★+) that you haven't been back to in `days`, longest first. */
export function beenAWhile(places: Place[], days = 90, now = new Date()) {
  const cutoff = new Date(now.getTime() - days * 864e5).toISOString().slice(0, 10)
  return places
    .map((p) => ({ place: p, last: lastVisit(p) }))
    .filter(
      ({ place, last }) =>
        place.status === 'Been' && last && last < cutoff && average(place) >= 3.5,
    )
    .sort((a, b) => a.last!.localeCompare(b.last!))
}

/** "3 months ago", "1 year ago" for a YYYY-MM-DD date. */
export function sinceText(day: string, now = new Date()) {
  const months = Math.floor((now.getTime() - new Date(day).getTime()) / (30.44 * 864e5))
  if (months >= 12) {
    const years = Math.floor(months / 12)
    return `${years} year${years === 1 ? '' : 's'} ago`
  }
  return `${Math.max(1, months)} month${months === 1 ? '' : 's'} ago`
}

export type SmartList = { id: string; emoji: string; name: string; hint: string; places: Place[] }

export function smartLists(places: Place[], people = 2): SmartList[] {
  const usual = usualCost(places, people)
  const value = (p: Place) => valueScore(p, usual, people)?.score ?? 0
  return [
    {
      id: 'top',
      emoji: '⭐',
      name: 'Top rated',
      hint: 'Group average 4★ or more',
      places: places.filter((p) => average(p) >= 4).sort((a, b) => average(b) - average(a)),
    },
    {
      id: 'regulars',
      emoji: '🔁',
      name: 'Regulars',
      hint: 'Places you keep going back to',
      places: places
        .filter((p) => visitCount(p) >= 2)
        .sort((a, b) => visitCount(b) - visitCount(a)),
    },
    {
      id: 'value',
      emoji: '💸',
      name: 'Best value',
      hint: 'Great for what it cost you a person (8/10 or more)',
      places: places.filter((p) => value(p) >= 8).sort((a, b) => value(b) - value(a)),
    },
    {
      id: 'while',
      emoji: '🕰️',
      name: 'Been a while',
      hint: 'Places you liked but haven’t been back to in 3+ months',
      places: beenAWhile(places).map(({ place }) => place),
    },
    {
      id: 'unrated',
      emoji: '📝',
      name: 'Rate these',
      hint: 'Been, but nobody has rated it yet',
      places: places.filter((p) => p.status === 'Been' && !p.place_ratings.length),
    },
    {
      id: 'never',
      emoji: '👎',
      name: 'Never again',
      hint: 'Group average 2★ or less',
      places: places.filter((p) => p.place_ratings.length && average(p) <= 2),
    },
  ]
}
