// #117 What a score is based on, like a shop's "4.6 ★ (1,132 ratings)": "3 ratings · 6 visits".
import type { Place } from '../hooks/use-crumbs-data'

const n = (count: number, word: string) =>
  `${count.toLocaleString()} ${word}${count === 1 ? '' : 's'}`

export function basedOn(place: Pick<Place, 'place_ratings' | 'place_visits'>) {
  const ratings = place.place_ratings.filter((r) => !(r as { draft?: boolean }).draft).length
  const visits = place.place_visits?.length ?? 0
  if (!ratings) return null
  return visits ? `${n(ratings, 'rating')} · ${n(visits, 'visit')}` : n(ratings, 'rating')
}
