// Round 80 (third pass #20): with "Keep what I spend private" on, the database keeps the amount of
// each visit you log in a table only you can read, and your group sees the visit without it. This
// puts your own amounts back on your own visits after loading, so your numbers (value score,
// usual spend, Wrapped) still add up for you.
import type { Place } from '@/hooks/use-crumbs-data'

export type PrivateSpend = { visit_id: string; amount: number | string }

export function withPrivateSpends<T extends Pick<Place, 'place_visits'>>(
  places: T[],
  rows: PrivateSpend[] | null | undefined,
): T[] {
  if (!rows?.length) return places
  const amounts = new Map(rows.map((row) => [row.visit_id, Number(row.amount)]))
  return places.map((place) => {
    const visits = place.place_visits
    if (!visits?.some((visit) => visit.spend == null && amounts.has(visit.id))) return place
    return {
      ...place,
      place_visits: visits.map((visit) =>
        visit.spend == null && amounts.has(visit.id)
          ? { ...visit, spend: amounts.get(visit.id)! }
          : visit,
      ),
    }
  })
}
