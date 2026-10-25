// #61 Crumbs Wrapped: your group's year in food, worked out on the phone from your own visits,
// ratings, dishes and home cooking. Nothing is stored or sent anywhere (free).
import type { HomeMeal, Place, Profile } from '../hooks/use-crumbs-data'
import { allVisits, dishAverage, tasteMatch } from './stats.ts'

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]

const avg = (p: Place) =>
  p.place_ratings.length
    ? p.place_ratings.reduce((s, r) => s + (r.points ?? r.score * 20), 0) /
      p.place_ratings.length /
      20
    : 0

function top<T>(items: T[], key: (item: T) => string | null | undefined) {
  const tally = new Map<string, { item: T; n: number }>()
  for (const item of items) {
    const k = key(item)
    if (!k) continue
    const hit = tally.get(k)
    tally.set(k, { item: hit?.item ?? item, n: (hit?.n ?? 0) + 1 })
  }
  return [...tally.values()].sort((a, b) => b.n - a.n)[0] ?? null
}

/** Weeks in a row with a visit, within one year. */
function bestStreak(days: string[]) {
  const monday = (iso: string) => {
    const d = new Date(`${iso}T12:00:00Z`)
    d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7))
    return d.getTime()
  }
  const weeks = [...new Set(days.map(monday))].sort((a, b) => a - b)
  let best = 0
  let run = 0
  weeks.forEach((w, i) => {
    run = i && w - weeks[i - 1] === 7 * 864e5 ? run + 1 : 1
    best = Math.max(best, run)
  })
  return best
}

export type Wrapped = {
  year: number
  visits: number
  places: number
  newPlaces: number
  busiestMonth: { month: string; visits: number } | null
  spend: number
  perHead: number | null
  priciestMonth: { month: string; spend: number } | null
  cuisines: number
  topCuisine: { name: string; visits: number } | null
  regular: { place: Place; visits: number } | null
  favourite: { place: Place; score: number } | null
  bestDish: { name: string; place: string; points: number } | null
  dishesRated: number
  streak: number
  takeout: number
  dates: number
  homeCooked: number
  topMeal: { name: string; times: number } | null
  you: { rated: number; average: number } | null
  match: { name: string; percent: number } | null
  /** #218 every place you ate at, as dots (0-1 across, 0-1 down) sized by visits */
  dots: { x: number; y: number; n: number }[]
  /** #219 how your taste changed since last year */
  evolution: {
    newCuisines: string[]
    lastTop: string | null
    thisTop: string | null
    ratingChange: number | null
  } | null
}

/** #218 Places as dots in a box, keeping the map's shape (longitude squeezed by latitude). */
export function mapDots(points: { lat: number; lng: number; n: number }[]) {
  if (points.length < 2) return []
  const lats = points.map((p) => p.lat)
  const midLat = (Math.min(...lats) + Math.max(...lats)) / 2
  const k = Math.cos((midLat * Math.PI) / 180)
  const xs = points.map((p) => p.lng * k)
  const ys = points.map((p) => -p.lat)
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)]
  const span = Math.max(x1 - x0, y1 - y0) || 1
  return points.map((p, i) => ({
    x: 0.08 + (0.84 * (xs[i] - x0 + (span - (x1 - x0)) / 2)) / span,
    y: 0.08 + (0.84 * (ys[i] - y0 + (span - (y1 - y0)) / 2)) / span,
    n: p.n,
  }))
}

/** The years you have visits in, newest first. */
export function wrappedYears(places: Place[]) {
  return [...new Set(allVisits(places).map((v) => Number(v.visited_on.slice(0, 4))))]
    .filter((y) => y > 2000)
    .sort((a, b) => b - a)
}

/** The year to show first: last year in January/February (if it has visits), else this year. */
export function defaultWrappedYear(places: Place[], today = new Date()) {
  const years = wrappedYears(places)
  const now = today.getFullYear()
  if (today.getMonth() <= 1 && years.includes(now - 1)) return now - 1
  return years.includes(now) ? now : (years[0] ?? now)
}

export function buildWrapped({
  places,
  year,
  userId,
  members = [],
  meals = [],
}: {
  places: Place[]
  year: number
  userId?: string
  members?: Profile[]
  meals?: HomeMeal[]
}): Wrapped | null {
  const y = String(year)
  const visits = allVisits(places).filter((v) => v.visited_on.startsWith(y))
  const cooks = meals.flatMap((m) =>
    m.home_meal_cooks.filter((c) => c.cooked_on.startsWith(y)).map((c) => ({ ...c, meal: m })),
  )
  if (!visits.length && !cooks.length) return null

  const visited = [...new Map(visits.map((v) => [v.place.id, v.place])).values()]
  const firstEver = new Map<string, string>()
  for (const v of allVisits(places))
    if (!firstEver.has(v.place.id) || v.visited_on < firstEver.get(v.place.id)!)
      firstEver.set(v.place.id, v.visited_on)
  const month = top(visits, (v) => v.visited_on.slice(5, 7))
  const spendRows = visits.filter((v) => Number(v.spend) > 0)
  const spend = spendRows.reduce((s, v) => s + Number(v.spend), 0)
  const heads = spendRows.filter((v) => Number(v.people) > 0)
  const byMonth = new Map<string, number>()
  spendRows.forEach((v) =>
    byMonth.set(
      v.visited_on.slice(5, 7),
      (byMonth.get(v.visited_on.slice(5, 7)) ?? 0) + Number(v.spend),
    ),
  )
  const priciest = [...byMonth.entries()].sort((a, b) => b[1] - a[1])[0]
  const cuisine = top(visits, (v) => v.place.cuisine)
  const regular = top(visits, (v) => v.place.id)
  const favourite = visited.filter((p) => p.place_ratings.length).sort((a, b) => avg(b) - avg(a))[0]
  const dishes = visited.flatMap((p) =>
    (p.dishes ?? []).map((d) => ({ d, p, points: dishAverage(d) })),
  )
  const bestDish = dishes.filter((x) => x.points !== null).sort((a, b) => b.points! - a.points!)[0]
  const meal = top(cooks, (c) => c.meal.name)
  const mine = visited.flatMap((p) => p.place_ratings.filter((r) => r.user_id === userId))
  const partner = members.find((m) => m.id !== userId)
  const match = userId && partner ? tasteMatch(visited, userId, partner.id) : null

  return {
    year,
    visits: visits.length,
    places: visited.length,
    newPlaces: visited.filter((p) => firstEver.get(p.id)?.startsWith(y)).length,
    busiestMonth: month
      ? { month: MONTHS[Number(month.item.visited_on.slice(5, 7)) - 1], visits: month.n }
      : null,
    spend: Math.round(spend),
    perHead: heads.length
      ? Math.round(heads.reduce((s, v) => s + Number(v.spend) / Number(v.people), 0) / heads.length)
      : null,
    priciestMonth: priciest
      ? { month: MONTHS[Number(priciest[0]) - 1], spend: Math.round(priciest[1]) }
      : null,
    cuisines: new Set(visits.map((v) => v.place.cuisine).filter(Boolean)).size,
    topCuisine: cuisine ? { name: cuisine.item.place.cuisine!, visits: cuisine.n } : null,
    regular: regular && regular.n >= 2 ? { place: regular.item.place, visits: regular.n } : null,
    favourite: favourite ? { place: favourite, score: Math.round(avg(favourite) * 10) / 10 } : null,
    bestDish: bestDish
      ? { name: bestDish.d.name, place: bestDish.p.name, points: bestDish.points! }
      : null,
    dishesRated: dishes.filter((x) => x.points !== null).length,
    streak: bestStreak(visits.map((v) => v.visited_on)),
    takeout: visits.filter((v) => v.kind === 'takeout' || v.kind === 'delivery').length,
    dates: visits.filter((v) => v.occasion === 'date').length,
    homeCooked: cooks.length,
    topMeal: meal && meal.n >= 2 ? { name: meal.item.meal.name, times: meal.n } : null,
    you: mine.length
      ? {
          rated: mine.length,
          average:
            Math.round(
              (mine.reduce((s, r) => s + (r.points ?? r.score * 20), 0) / mine.length / 20) * 10,
            ) / 10,
        }
      : null,
    match: match && partner ? { name: partner.display_name, percent: match.percent } : null,
    dots: mapDots(
      visited
        .filter((p) => p.latitude !== null && p.longitude !== null)
        .map((p) => ({
          lat: p.latitude!,
          lng: p.longitude!,
          n: visits.filter((v) => v.place.id === p.id).length,
        })),
    ),
    evolution: (() => {
      const before = allVisits(places).filter((v) => v.visited_on < `${y}-01-01`)
      const last = before.filter((v) => v.visited_on.startsWith(String(year - 1)))
      if (!last.length) return null
      const seen = new Set(before.map((v) => v.place.cuisine).filter(Boolean))
      const newCuisines = [
        ...new Set(
          visits.map((v) => v.place.cuisine).filter((c): c is string => !!c && !seen.has(c)),
        ),
      ].slice(0, 4)
      const mineIn = (list: typeof visits) => {
        const ids = new Set(list.map((v) => v.place.id))
        const r = places
          .filter((p) => ids.has(p.id))
          .flatMap((p) => p.place_ratings.filter((x) => x.user_id === userId))
        return r.length
          ? r.reduce((s, x) => s + (x.points ?? x.score * 20), 0) / r.length / 20
          : null
      }
      const a = mineIn(last)
      const b = mineIn(visits)
      return {
        newCuisines,
        lastTop: top(last, (v) => v.place.cuisine)?.item.place.cuisine ?? null,
        thisTop: cuisine?.item.place.cuisine ?? null,
        ratingChange: a !== null && b !== null ? Math.round((b - a) * 10) / 10 : null,
      }
    })(),
  }
}
