// #190 New-member catch-up and #191 member taste profiles (worked out on the phone, free).
import type { Place, Profile } from '../hooks/use-crumbs-data'
import { average5 } from './ratings.ts'
import { dishAverage } from './stats.ts'

/** Joined this group in the last 2 weeks (and isn't the one who made it). */
export function isNewMember(me: Pick<Profile, 'joined_at' | 'role'> | null, now = new Date()) {
  if (!me?.joined_at || me.role === 'owner') return false
  return now.getTime() - new Date(me.joined_at).getTime() < 14 * 864e5
}

export function catchUpSeen(groupId: string) {
  try {
    return localStorage.getItem(`crumbs-catchup-${groupId}`) === '1'
  } catch {
    return true
  }
}
export function markCatchUpSeen(groupId: string) {
  try {
    localStorage.setItem(`crumbs-catchup-${groupId}`, '1')
  } catch {}
}

/** The group's favourites and must-try dishes, for someone who just joined. */
export function catchUp(places: Place[]) {
  const favourites = places
    .filter((p) => p.place_ratings.length && average5(p.place_ratings) >= 4)
    .sort((a, b) => average5(b.place_ratings) - average5(a.place_ratings))
    .slice(0, 3)
  const dishes = places
    .flatMap((p) => (p.dishes ?? []).map((d) => ({ dish: d, place: p, points: dishAverage(d) })))
    .filter((x) => x.points !== null && x.points >= 80)
    .sort((a, b) => b.points! - a.points!)
    .slice(0, 3)
  const wishlist = places.filter((p) => p.status === 'Want to try').length
  return { favourites, dishes, wishlist }
}

/** #191 One member's taste in this group: top cuisines, how they rate vs everyone, signature order. */
export function tasteProfile(places: Place[], userId: string) {
  const mine = places
    .map((p) => ({ p, r: p.place_ratings.find((x) => x.user_id === userId) }))
    .filter((x) => x.r)
  if (!mine.length) return null
  const score = (r: { score: number; points?: number | null }) => (r.points ?? r.score * 20) / 20
  const avgMine = mine.reduce((s, x) => s + score(x.r!), 0) / mine.length
  const others = places.flatMap((p) => p.place_ratings.filter((x) => x.user_id !== userId))
  const avgOthers = others.length ? others.reduce((s, r) => s + score(r), 0) / others.length : null
  const byCuisine = new Map<string, number[]>()
  for (const { p, r } of mine)
    if (p.cuisine) byCuisine.set(p.cuisine, [...(byCuisine.get(p.cuisine) ?? []), score(r!)])
  const cuisines = [...byCuisine.entries()]
    .map(([name, s]) => ({ name, avg: s.reduce((a, b) => a + b, 0) / s.length, n: s.length }))
    .filter((c) => c.avg >= 3.5)
    .sort((a, b) => b.avg - a.avg || b.n - a.n)
    .slice(0, 3)
    .map((c) => c.name)
  const dishes = places.flatMap((p) =>
    (p.dishes ?? []).flatMap((d) =>
      d.dish_ratings
        .filter((r) => r.user_id === userId)
        .map((r) => ({ name: d.name, place: p.name, points: r.points ?? r.score * 20 })),
    ),
  )
  const signature = dishes.sort((a, b) => b.points - a.points)[0] ?? null
  const diff = avgOthers === null ? 0 : avgMine - avgOthers
  return {
    rated: mine.length,
    average: Math.round(avgMine * 10) / 10,
    style:
      avgOthers === null
        ? null
        : diff >= 0.4
          ? 'Generous rater'
          : diff <= -0.4
            ? 'Tough rater'
            : 'Rates like the group',
    cuisines,
    signature,
  }
}
