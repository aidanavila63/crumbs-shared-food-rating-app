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
    if (!first.has(visit.place.id) || visit.visited_on < first.get(visit.place.id)!) first.set(visit.place.id, visit.visited_on)
    const cuisine = visit.place.cuisine
    if (cuisine && (!cuisineFirst.has(cuisine) || visit.visited_on < cuisineFirst.get(cuisine)!))
      cuisineFirst.set(cuisine, visit.visited_on)
  })
  const byId = new Map(places.map((place) => [place.id, place]))
  const newPlaces = [...first.entries()].filter(([, date]) => date.startsWith(month))
  const crossedOff = newPlaces.filter(([id]) => (byId.get(id)?.created_at ?? '9') < `${month}-01`)
  const bingo = cuisineBingo(places)
  return [
    { id: 'visits', title: 'Eat out 6 times', done: visits.filter((v) => v.visited_on.startsWith(month)).length, target: 6 },
    { id: 'places', title: 'Try 3 new places', done: newPlaces.length, target: 3 },
    {
      id: 'cuisines',
      title: 'Try 3 cuisines you haven’t had before',
      done: [...cuisineFirst.values()].filter((date) => date.startsWith(month)).length,
      target: 3,
    },
    { id: 'wishlist', title: 'Cross 2 places off your want-to-try list', done: crossedOff.length, target: 2 },
    { id: 'bingo', title: 'Get a cuisine bingo', done: Math.min(bingo.bingos, 1), target: 1, note: `${bingo.filled}/25 squares so far` },
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
