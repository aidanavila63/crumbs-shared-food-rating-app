// Pure helpers behind the leaderboard, taste match, bingo, year in review and Surprise us.
import type { Dish, Place, Rating } from '../hooks/use-crumbs-data'

export const dishPoints = (rating: Pick<Rating, 'score' | 'points'>) =>
  rating.points ?? rating.score * 20

export function dishAverage(dish: Dish) {
  if (!dish.dish_ratings.length) return null
  const total = dish.dish_ratings.reduce((sum, rating) => sum + dishPoints(rating), 0)
  return Math.round(total / dish.dish_ratings.length)
}

export function bestDishes(places: Place[], limit = 10) {
  return places
    .flatMap((place) =>
      (place.dishes ?? []).map((dish) => ({ dish, place, points: dishAverage(dish) })),
    )
    .filter((row): row is typeof row & { points: number } => row.points !== null)
    .sort((a, b) => b.points - a.points || a.dish.name.localeCompare(b.dish.name))
    .slice(0, limit)
}

/** How closely two people's place ratings agree (100 = identical). */
export function tasteMatch(places: Place[], a: string, b: string) {
  let count = 0
  let diff = 0
  for (const place of places) {
    const first = place.place_ratings.find((rating) => rating.user_id === a)
    const second = place.place_ratings.find((rating) => rating.user_id === b)
    if (!first || !second) continue
    count += 1
    diff += Math.abs(first.score - second.score)
  }
  if (!count) return null
  return { count, percent: Math.round(100 * (1 - diff / count / 4)) }
}

export function averageGiven(places: Place[], userId: string) {
  const scores = places.flatMap((place) =>
    place.place_ratings.filter((rating) => rating.user_id === userId).map((rating) => rating.score),
  )
  return scores.length
    ? { average: scores.reduce((s, n) => s + n, 0) / scores.length, count: scores.length }
    : null
}

export const BINGO_CUISINES = [
  'Italian',
  'Mexican',
  'Japanese',
  'Chinese',
  'Indian',
  'Thai',
  'Korean',
  'Vietnamese',
  'Greek',
  'Mediterranean',
  'Middle Eastern',
  'French',
  'American',
  'Burger',
  'Pizza',
  'BBQ',
  'Seafood',
  'Vegetarian',
  'Ethiopian',
  'Spanish',
  'Caribbean',
  'Turkish',
  'Afghan',
  'Brunch',
  'Dessert',
]

const norm = (text: string) => text.toLowerCase().replace(/[^a-z ]/g, ' ')

/** Which bingo squares are filled by places you've actually been to. */
export function cuisineBingo(places: Place[]) {
  const text = places
    .filter((place) => place.status === 'Been')
    .map((place) => norm(`${place.cuisine ?? ''} ${(place.tags ?? []).join(' ')}`))
  const done = BINGO_CUISINES.map((cuisine) => text.some((entry) => entry.includes(norm(cuisine))))
  const lines: number[][] = []
  for (let i = 0; i < 5; i += 1) {
    lines.push([0, 1, 2, 3, 4].map((n) => i * 5 + n))
    lines.push([0, 1, 2, 3, 4].map((n) => n * 5 + i))
  }
  lines.push([0, 6, 12, 18, 24], [4, 8, 12, 16, 20])
  return {
    done,
    filled: done.filter(Boolean).length,
    bingos: lines.filter((line) => line.every((index) => done[index])).length,
  }
}

export type Visit = { id: string; place_id: string; visited_on: string; spend: number | null }

/** Every visit, falling back to the old single date for places that have no visit rows. */
export function allVisits(places: Place[]) {
  return places.flatMap((place) => {
    const rows = place.place_visits ?? []
    if (rows.length) return rows.map((visit) => ({ ...visit, place }))
    return place.status === 'Been' && place.visited_on
      ? [
          {
            id: `legacy-${place.id}`,
            place_id: place.id,
            visited_on: place.visited_on,
            spend: null,
            place,
          },
        ]
      : []
  })
}

export function yearInReview(places: Place[], year: number) {
  const visits = allVisits(places).filter((visit) => visit.visited_on.startsWith(String(year)))
  if (!visits.length) return null
  const count = (keys: (string | null)[]) => {
    const tally = new Map<string, number>()
    keys.forEach((key) => key && tally.set(key, (tally.get(key) ?? 0) + 1))
    return [...tally.entries()].sort((a, b) => b[1] - a[1])[0] ?? null
  }
  const rated = [...new Map(visits.map((visit) => [visit.place.id, visit.place])).values()]
    .filter((place) => place.place_ratings.length)
    .sort(
      (a, b) =>
        b.place_ratings.reduce((s, r) => s + r.score, 0) / b.place_ratings.length -
        a.place_ratings.reduce((s, r) => s + r.score, 0) / a.place_ratings.length,
    )
  return {
    visits: visits.length,
    spend: visits.reduce((sum, visit) => sum + (visit.spend ?? 0), 0),
    topCuisine: count(visits.map((visit) => visit.place.cuisine)),
    mostVisited: count(visits.map((visit) => visit.place.name)),
    topRated: rated[0] ?? null,
  }
}

export function spendByMonth(places: Place[], year: number) {
  const months = Array.from({ length: 12 }, () => 0)
  allVisits(places).forEach((visit) => {
    if (visit.visited_on.startsWith(String(year))) {
      months[Number(visit.visited_on.slice(5, 7)) - 1] += visit.spend ?? 0
    }
  })
  return months
}

/** "On this day" memories: visits on today's month/day in earlier years. */
export function onThisDay(places: Place[], today = new Date()) {
  const key = `${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
  return allVisits(places)
    .filter(
      (visit) =>
        visit.visited_on.slice(5) === key &&
        Number(visit.visited_on.slice(0, 4)) < today.getFullYear(),
    )
    .map((visit) => ({
      place: visit.place,
      yearsAgo: today.getFullYear() - Number(visit.visited_on.slice(0, 4)),
    }))
}

export type SurpriseFilters = {
  cuisine: string | null
  maxPrice: number | null
  pinnedOnly: boolean
  nearMe: { lat: number; lng: number } | null
}

export function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const rad = (n: number) => (n * Math.PI) / 180
  const h =
    Math.sin(rad(b.lat - a.lat) / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2
  return 12742 * Math.asin(Math.sqrt(h))
}

/** Want-to-try places that match every filter you switched on. */
export function surprisePool(places: Place[], filters: SurpriseFilters) {
  return places.filter((place) => {
    if (place.status !== 'Want to try') return false
    if (place.business_status === 'CLOSED_PERMANENTLY') return false
    if (filters.cuisine && place.cuisine !== filters.cuisine) return false
    if (filters.maxPrice && place.price_level && place.price_level > filters.maxPrice) return false
    if (filters.pinnedOnly && !place.pinned) return false
    if (filters.nearMe) {
      if (place.latitude === null || place.longitude === null) return false
      if (distanceKm(filters.nearMe, { lat: place.latitude, lng: place.longitude }) > 10)
        return false
    }
    return true
  })
}
