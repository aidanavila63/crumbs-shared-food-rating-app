// "You and Maya both rate Afghan 4.5+": cuisines where two or more people in the group have each
// rated at least one place and score it highly. Pass the ratings you're allowed to see (blind
// ratings already applied), so this can never show a score earlier than the app would.
import type { Place } from '../hooks/use-crumbs-data'
import { ratingPoints, type Scale } from './ratings.ts'

export type Overlap = {
  cuisine: string
  /** user ids, you first */
  who: string[]
  /** everyone averages at least this on the 0-5 scale (steps of 0.5, never below `min`) */
  atLeast: number
}

export function tasteOverlap(
  places: Place[],
  userId: string,
  opts: { min?: number; limit?: number } = {},
): Overlap[] {
  const min = opts.min ?? 4
  const limit = opts.limit ?? 3
  // cuisine -> user -> scores
  const byCuisine = new Map<string, { label: string; scores: Map<string, number[]> }>()
  for (const place of places) {
    const label = place.cuisine?.trim()
    if (!label || !place.place_ratings?.length) continue
    const entry = byCuisine.get(label.toLowerCase()) ?? { label, scores: new Map() }
    for (const rating of place.place_ratings) {
      if (rating.draft || typeof rating.score !== 'number') continue
      const list = entry.scores.get(rating.user_id) ?? []
      // exact value (half stars, 10-point) from points; score alone is rounded to whole stars
      list.push(ratingPoints(rating) / 20)
      entry.scores.set(rating.user_id, list)
    }
    byCuisine.set(label.toLowerCase(), entry)
  }
  const out: Overlap[] = []
  for (const { label, scores } of byCuisine.values()) {
    const fans = [...scores.entries()]
      .map(([id, list]) => [id, list.reduce((s, n) => s + n, 0) / list.length] as const)
      .filter(([, avg]) => avg >= min)
    if (fans.length < 2 || !fans.some(([id]) => id === userId)) continue
    const lowest = Math.min(...fans.map(([, avg]) => avg))
    out.push({
      cuisine: label,
      who: [userId, ...fans.map(([id]) => id).filter((id) => id !== userId)],
      atLeast: Math.floor(lowest * 2) / 2,
    })
  }
  return out
    .sort((a, b) => b.atLeast - a.atLeast || b.who.length - a.who.length || a.cuisine.localeCompare(b.cuisine))
    .slice(0, limit)
}

/** "You and Maya both rate Afghan 4.5+" / "You, Maya and Sam all rate Afghan 4+" */
export function overlapText(o: Overlap, names: Record<string, string>, userId: string, scale: Scale = '5') {
  const people = o.who.map((id) => (id === userId ? 'You' : names[id] || 'Someone'))
  const joined =
    people.length === 2 ? `${people[0]} and ${people[1]}` : `${people.slice(0, -1).join(', ')} and ${people[people.length - 1]}`
  return `${joined} ${people.length === 2 ? 'both' : 'all'} rate ${o.cuisine} ${scale === '10' ? String(o.atLeast * 2) : String(o.atLeast)}+`
}
