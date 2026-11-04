// What goes on your public profile, worked out on the phone from your own groups' data and sent
// to the database, which keeps only short labels and numbers (it can't be used to smuggle text
// onto a public page). Nothing here leaves the phone until you press Save.
import type { Place } from '../hooks/use-crumbs-data'
import { badges } from './badges.ts'
import { passport } from './passport.ts'
import { allVisits, dishAverage } from './stats.ts'

export type ProfileSnapshot = {
  stats: { places: number; cuisines: number; cities: number; visits: number }
  badges: { key: string; label: string; emoji: string }[]
  passport: { city: string; count: number }[]
}

export function buildSnapshot(places: Place[], userId?: string, today = new Date()): ProfileSnapshot {
  const been = places.filter((p) => p.status === 'Been')
  const cuisines = new Set(
    been.map((p) => p.cuisine?.trim().toLowerCase()).filter((c): c is string => !!c),
  )
  const stamps = passport(places)
  return {
    stats: {
      places: been.length,
      cuisines: cuisines.size,
      cities: stamps.length,
      visits: allVisits(places).length,
    },
    badges: badges(places, userId, today)
      .filter((b) => b.earned)
      .map((b) => ({ key: b.id, label: b.title, emoji: b.emoji })),
    passport: stamps
      .sort((a, b) => b.places - a.places)
      .slice(0, 24)
      .map((s) => ({ city: s.city, count: s.places })),
  }
}

/** Places you could show as favourites: ones you've rated, best first (only those linked to a shared restaurant). */
export function favouriteCandidates(places: Place[], userId?: string) {
  return places
    .filter((p) => p.restaurant_id && p.place_ratings.some((r) => r.user_id === userId))
    .map((p) => {
      const mine = p.place_ratings.find((r) => r.user_id === userId)!
      return { place: p, score: Number(mine.points ?? 0) / 20 || Number(mine.score) || 0 }
    })
    .sort((a, b) => b.score - a.score || a.place.name.localeCompare(b.place.name))
}

/** Dishes you could show as top dishes: ones you've rated, best first. */
export function dishCandidates(places: Place[], userId?: string) {
  return places
    .filter((p) => p.restaurant_id)
    .flatMap((p) =>
      (p.dishes ?? [])
        .filter((d) => d.dish_ratings.some((r) => r.user_id === userId))
        .map((d) => ({ place: p, dish: d, points: dishAverage(d) ?? 0 })),
    )
    .sort((a, b) => b.points - a.points || a.dish.name.localeCompare(b.dish.name))
}
