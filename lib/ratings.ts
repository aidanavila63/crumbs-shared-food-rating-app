// Rating maths shared across the app: scales (#2), categories (#1), balanced scores (#65).
// Every rating keeps `score` (1-5 whole stars, used everywhere) and, from v4, `points` (0-100)
// so half stars and 10-point scores stay exact.
import type { GroupSettings, Group, Place, Rating } from '../hooks/use-crumbs-data'

export type Scale = '5' | 'half' | '10'

export const DEFAULT_TAGS = ['Cozy', 'Date night', 'Patio', 'Loud', 'Big portions', 'Quick', 'Good value', 'Fancy']

/** Group settings with defaults filled in. */
export function settingsOf(group?: Pick<Group, 'settings'> | null): Required<GroupSettings> {
  const s = group?.settings ?? {}
  return {
    scale: s.scale === 'half' || s.scale === '10' ? s.scale : '5',
    categories: !!s.categories,
    wouldReturn: s.wouldReturn !== false,
    turns: !!s.turns,
    home: s.home !== false,
    weather: s.weather !== false,
    tags: Array.isArray(s.tags) && s.tags.length ? s.tags.slice(0, 16) : DEFAULT_TAGS,
  }
}

export const ratingPoints = (rating: Pick<Rating, 'score' | 'points'>) =>
  rating.points ?? rating.score * 20

/** Group average on the 0-5 scale (exact when points are saved). */
export function average5(ratings: Pick<Rating, 'score' | 'points'>[]) {
  if (!ratings.length) return 0
  return ratings.reduce((sum, rating) => sum + ratingPoints(rating), 0) / ratings.length / 20
}

/** "4.5" on star scales, "9.0" on the 10-point scale. */
export function formatScore(avg5: number, scale: Scale) {
  if (!avg5) return '—'
  return (scale === '10' ? avg5 * 2 : avg5).toFixed(1)
}

/** What the rating input shows for a saved rating: stars (1-5), half stars (0.5-5) or points (1-10). */
export function inputValue(rating: Pick<Rating, 'score' | 'points'> | undefined, scale: Scale) {
  if (!rating) return 0
  const points = ratingPoints(rating)
  if (scale === '10') return Math.max(1, Math.round(points / 10))
  if (scale === 'half') return Math.max(0.5, Math.round(points / 10) / 2)
  return rating.score
}

/** Turns what was tapped into what's saved. */
export function fromInput(value: number, scale: Scale) {
  const points = Math.round(Math.min(100, Math.max(0, scale === '10' ? value * 10 : value * 20)))
  return { points, score: Math.min(5, Math.max(1, Math.round(points / 20))) }
}

export const CATEGORIES = [
  { key: 'food', label: 'Food' },
  { key: 'service', label: 'Service' },
  { key: 'vibe', label: 'Vibe' },
  { key: 'value', label: 'Value' },
] as const
export type CategoryKey = (typeof CATEGORIES)[number]['key']

/** Average of each category across everyone who filled it in (null if nobody did). */
export function categoryAverages(ratings: Rating[]) {
  return Object.fromEntries(
    CATEGORIES.map(({ key }) => {
      const values = ratings.map((rating) => rating[key]).filter((v): v is number => typeof v === 'number')
      return [key, values.length ? values.reduce((a, b) => a + b, 0) / values.length : null]
    }),
  ) as Record<CategoryKey, number | null>
}

/** Overall stars from the categories someone filled in (rounded to a half). */
export function overallFromCategories(rating: Partial<Record<CategoryKey, number | null>>) {
  const values = CATEGORIES.map(({ key }) => rating[key]).filter((v): v is number => typeof v === 'number')
  if (!values.length) return null
  return Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 2) / 2
}

/**
 * #65 Balanced score: people rate differently (one gives everything 5★, another rarely goes
 * above 3★). Each rating is shifted by how far that person's usual average sits from the
 * group's usual average, so a 4★ from a tough rater counts like a 4.5★ from a generous one.
 */
export function raterOffsets(places: Place[]) {
  const byUser = new Map<string, number[]>()
  places.forEach((place) =>
    place.place_ratings.forEach((rating) =>
      byUser.set(rating.user_id, [...(byUser.get(rating.user_id) ?? []), ratingPoints(rating) / 20]),
    ),
  )
  const all = [...byUser.values()].flat()
  if (!all.length) return {}
  const overall = all.reduce((a, b) => a + b, 0) / all.length
  return Object.fromEntries(
    [...byUser.entries()].map(([user, scores]) => [
      user,
      // Need a few ratings before trusting someone's habit.
      scores.length >= 3 ? overall - scores.reduce((a, b) => a + b, 0) / scores.length : 0,
    ]),
  ) as Record<string, number>
}

export function balancedAverage(ratings: Rating[], offsets: Record<string, number>) {
  if (!ratings.length) return 0
  const adjusted = ratings.map((rating) =>
    Math.min(5, Math.max(0.5, ratingPoints(rating) / 20 + (offsets[rating.user_id] ?? 0))),
  )
  return adjusted.reduce((a, b) => a + b, 0) / adjusted.length
}
