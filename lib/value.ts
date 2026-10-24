// #6 Value score: how good a place was for what it cost you, out of 10 — the group's rating,
// nudged up when it cost less a person than your usual and down when it cost more. Worked out
// on the phone from your own visits (spend + how many people); nothing is stored.
import type { Place } from '../hooks/use-crumbs-data'

const points = (r: { score: number; points?: number | null }) => r.points ?? r.score * 20

/**
 * Average cost a person from visits with a spend. Visits without a head count assume
 * `people` (the group's size — usually right for a couple).
 */
export function costPerHead(place: Pick<Place, 'place_visits'>, people = 2): number | null {
  const rows = (place.place_visits ?? []).filter((v) => Number(v.spend) > 0)
  if (!rows.length) return null
  return (
    rows.reduce(
      (sum, v) => sum + Number(v.spend) / (Number(v.people) > 0 ? Number(v.people) : people),
      0,
    ) / rows.length
  )
}

/** Your usual cost a person (the middle of your places), once 3+ places have one. */
export function usualCost(places: Pick<Place, 'place_visits'>[], people = 2): number | null {
  const costs = places
    .map((p) => costPerHead(p, people))
    .filter((c): c is number => c !== null)
    .sort((a, b) => a - b)
  if (costs.length < 3) return null
  const mid = Math.floor(costs.length / 2)
  return costs.length % 2 ? costs[mid] : (costs[mid - 1] + costs[mid]) / 2
}

export type Value = { score: number; perHead: number; usual: number; label: string }

/** Value out of 10, or null without a rating, a cost, or enough places to compare. */
export function valueScore(place: Place, usual: number | null, people = 2): Value | null {
  const perHead = costPerHead(place, people)
  if (!usual || perHead === null || !place.place_ratings.length) return null
  const rating10 =
    place.place_ratings.reduce((sum, r) => sum + points(r), 0) / place.place_ratings.length / 10
  // Half as pricey as usual ≈ +40%, twice as pricey ≈ −30%.
  const score = Math.max(1, Math.min(10, Math.round(rating10 * Math.sqrt(usual / perHead))))
  const label =
    score >= 9
      ? 'Great value'
      : score >= 7
        ? 'Good value'
        : score >= 5
          ? 'Fair value'
          : 'Pricey for what it is'
  return { score, perHead, usual, label }
}
