// Monthly challenges and the weekly eating-out streak. Everything comes from your visits.
import type { List, Place } from '../hooks/use-crumbs-data'
import { allVisits, cuisineBingo } from './stats.ts'

const mondayOf = (iso: string) => {
  const d = new Date(`${iso}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7))
  return d.toISOString().slice(0, 10)
}
const addDays = (iso: string, days: number) => {
  const d = new Date(`${iso}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}
const isoToday = (today: Date) =>
  `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`

/** Weeks in a row (Mon-Sun) with at least one visit. This week not over yet, so it doesn't break the streak. */
export function visitStreak(places: Place[], today = new Date()) {
  const weeks = new Set(allVisits(places).map((visit) => mondayOf(visit.visited_on)))
  const thisWeek = mondayOf(isoToday(today))
  let current = 0
  let cursor = weeks.has(thisWeek) ? thisWeek : addDays(thisWeek, -7)
  while (weeks.has(cursor)) {
    current += 1
    cursor = addDays(cursor, -7)
  }
  let best = 0
  let run = 0
  let previous: string | null = null
  for (const week of [...weeks].sort()) {
    run = previous && addDays(previous, 7) === week ? run + 1 : 1
    best = Math.max(best, run)
    previous = week
  }
  return { current, best, thisWeekDone: weeks.has(thisWeek) }
}

export type Challenge = { id: string; title: string; done: number; target: number; note?: string }

export function monthlyChallenges(places: Place[], today = new Date()): Challenge[] {
  const month = isoToday(today).slice(0, 7)
  const visits = allVisits(places)
  const first = new Map<string, string>()
  const cuisineFirst = new Map<string, string>()
  visits.forEach((visit) => {
    if (!first.has(visit.place.id) || visit.visited_on < first.get(visit.place.id)!)
      first.set(visit.place.id, visit.visited_on)
    const cuisine = visit.place.cuisine
    if (cuisine && (!cuisineFirst.has(cuisine) || visit.visited_on < cuisineFirst.get(cuisine)!))
      cuisineFirst.set(cuisine, visit.visited_on)
  })
  const byId = new Map(places.map((place) => [place.id, place]))
  const newPlaces = [...first.entries()].filter(([, date]) => date.startsWith(month))
  const crossedOff = newPlaces.filter(([id]) => (byId.get(id)?.created_at ?? '9') < `${month}-01`)
  const bingo = cuisineBingo(places)
  return [
    {
      id: 'visits',
      title: 'Eat out 6 times',
      done: visits.filter((v) => v.visited_on.startsWith(month)).length,
      target: 6,
    },
    { id: 'places', title: 'Try 3 new places', done: newPlaces.length, target: 3 },
    {
      id: 'cuisines',
      title: 'Try 3 cuisines you haven’t had before',
      done: [...cuisineFirst.values()].filter((date) => date.startsWith(month)).length,
      target: 3,
    },
    {
      id: 'wishlist',
      title: 'Cross 2 places off your want-to-try list',
      done: crossedOff.length,
      target: 2,
    },
    {
      id: 'bingo',
      title: 'Get a cuisine bingo',
      done: Math.min(bingo.bingos, 1),
      target: 1,
      note: `${bingo.filled}/25 squares so far`,
    },
  ].map((challenge) => ({ ...challenge, done: Math.min(challenge.done, challenge.target) }))
}

/** Where a trip stands: days to go, spend so far, how many of its places you've been to. */
export function tripSummary(list: List, places: Place[], today = new Date()) {
  const ids = new Set((list.list_places ?? []).map((item) => item.place_id))
  const inList = places.filter((place) => ids.has(place.id))
  const from = list.starts_on ?? null
  const to = list.ends_on ?? null
  const visits = allVisits(inList).filter(
    (visit) => (!from || visit.visited_on >= from) && (!to || visit.visited_on <= to),
  )
  const now = isoToday(today)
  const days = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000)
  let when = ''
  if (from && now < from) when = `${days(now, from)} day${days(now, from) === 1 ? '' : 's'} to go`
  else if (to && now > to) when = 'Trip finished'
  else if (from) when = `Day ${days(from, now) + 1}${to ? ` of ${days(from, to) + 1}` : ''}`
  return {
    total: inList.length,
    visited: new Set(visits.map((visit) => visit.place.id)).size,
    spend: visits.reduce((sum, visit) => sum + Number(visit.spend ?? 0), 0),
    when,
  }
}

// ---------- #138 group goals for the year ----------
export type GoalKind = 'new_cuisines' | 'new_places' | 'visits' | 'home_cooks' | 'dishes'
export const GOAL_KINDS: { id: GoalKind; label: (n: number) => string; emoji: string }[] = [
  { id: 'new_cuisines', label: (n) => `Try ${n} new cuisines`, emoji: '🌍' },
  { id: 'new_places', label: (n) => `Go to ${n} new places`, emoji: '📍' },
  { id: 'visits', label: (n) => `Eat out ${n} times`, emoji: '🍽️' },
  { id: 'home_cooks', label: (n) => `Cook at home ${n} times`, emoji: '🍳' },
  { id: 'dishes', label: (n) => `Rate ${n} dishes`, emoji: '⭐' },
]

/** How far the group is with a goal this year. */
export function goalProgress(
  kind: GoalKind,
  places: Place[],
  meals: { home_meal_cooks: { cooked_on: string }[] }[],
  year: number,
) {
  const y = String(year)
  const visits = places.flatMap((p) =>
    (p.place_visits ?? []).filter((v) => v.visited_on.startsWith(y)).map((v) => ({ v, p })),
  )
  const firstVisit = new Map<string, string>()
  for (const p of places)
    for (const v of p.place_visits ?? [])
      if (!firstVisit.has(p.id) || v.visited_on < firstVisit.get(p.id)!)
        firstVisit.set(p.id, v.visited_on)
  switch (kind) {
    case 'visits':
      return visits.length
    case 'new_places':
      return [...firstVisit.values()].filter((d) => d.startsWith(y)).length
    case 'new_cuisines': {
      const before = new Set(
        places
          .filter((p) => (firstVisit.get(p.id) ?? '9999') < `${y}-01-01` && p.cuisine)
          .map((p) => p.cuisine!.toLowerCase()),
      )
      return new Set(
        visits
          .map(({ p }) => p.cuisine?.toLowerCase())
          .filter((c): c is string => !!c && !before.has(c)),
      ).size
    }
    case 'home_cooks':
      return meals.flatMap((m) => m.home_meal_cooks).filter((c) => c.cooked_on.startsWith(y)).length
    case 'dishes':
      return places
        .flatMap((p) => p.dishes ?? [])
        .filter(
          (d) => d.dish_ratings.length > 0 && (!d.created_at || d.created_at.slice(0, 4) <= y),
        ).length
  }
}

// ---------- #156 seasonal challenge ----------
/** One challenge a season (Dec–Feb, Mar–May, Jun–Aug, Sep–Nov), counted over that season. */
export function seasonalChallenge(places: Place[], today = new Date()): Challenge {
  const m = today.getMonth()
  const y = today.getFullYear()
  const season = m === 11 || m <= 1 ? 'winter' : m <= 4 ? 'spring' : m <= 7 ? 'summer' : 'fall'
  const startMonth = { winter: 11, spring: 2, summer: 5, fall: 8 }[season]
  const startYear = season === 'winter' && m <= 1 ? y - 1 : y
  const start = new Date(startYear, startMonth, 1)
  const end = new Date(startYear, startMonth + 3, 0)
  const iso = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  const visits = allVisits(places).filter(
    (v) => v.visited_on >= iso(start) && v.visited_on <= iso(end),
  )
  const text = (p: Place) => [p.name, p.cuisine, ...(p.tags ?? [])].join(' ').toLowerCase()
  const avg = (p: Place) =>
    p.place_ratings.length
      ? p.place_ratings.reduce((s, r) => s + (r.points ?? r.score * 20), 0) /
        p.place_ratings.length /
        20
      : 0
  const rule = {
    winter: {
      title: '❄️ Soup season: 3 visits for ramen, pho or soup',
      test: (v: (typeof visits)[number]) => /ramen|pho|soup|noodle|hot ?pot/.test(text(v.place)),
    },
    spring: {
      title: '🌸 Brunch crawl: 3 breakfast or brunch visits',
      test: (v: (typeof visits)[number]) =>
        (v as { meal_time?: string }).meal_time === 'breakfast' ||
        /brunch|breakfast|café|cafe/.test(text(v.place)),
    },
    summer: {
      title: '☀️ Patio crawl: 3 visits to places with a patio',
      test: (v: (typeof visits)[number]) => /patio|terrace|rooftop/.test(text(v.place)),
    },
    fall: {
      title: '🍂 Comfort food: 3 visits to places you rate 4★ or more',
      test: (v: (typeof visits)[number]) => avg(v.place) >= 4,
    },
  }[season]
  return {
    id: `season-${season}`,
    title: rule.title,
    done: Math.min(3, visits.filter(rule.test).length),
    target: 3,
    note: `Seasonal — until ${end.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`,
  }
}
