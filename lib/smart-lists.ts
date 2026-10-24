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
