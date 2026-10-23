// Opening hours, dealbreaker warnings, blind ratings, map colours and the "Tonight?" pick.
import type { Dish, Place } from '../hooks/use-crumbs-data'
import { dishAverage } from './stats.ts'

// ---------- opening hours ----------
export type Hours = { utc: number; periods: { o: [number, number, number]; c: [number, number, number] | null }[] }
const WEEK = 7 * 1440
const toMin = (p: [number, number, number]) => p[0] * 1440 + p[1] * 60 + p[2]
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function clock(minuteOfWeek: number) {
  const m = ((minuteOfWeek % WEEK) + WEEK) % WEEK
  const h = Math.floor((m % 1440) / 60)
  const min = m % 60
  return `${h % 12 || 12}${min ? `:${String(min).padStart(2, '0')}` : ''} ${h < 12 ? 'AM' : 'PM'}`
}

/** Turns Google's regularOpeningHours into the small shape we cache in the database. */
export function hoursFromGoogle(place: any): Hours | null {
  const periods = place?.regularOpeningHours?.periods
  if (!Array.isArray(periods) || !periods.length) return null
  const point = (p: any): [number, number, number] | null =>
    p && Number.isFinite(p.day) ? [p.day, p.hour ?? 0, p.minute ?? 0] : null
  const out = periods
    .map((period: any) => ({ o: point(period.open), c: point(period.close) }))
    .filter((period: any) => period.o) as Hours['periods']
  return out.length ? { utc: Number(place.utcOffsetMinutes ?? 0), periods: out } : null
}

export function openStatus(hours: Hours | null | undefined, now = new Date()) {
  if (!hours?.periods?.length) return null
  const local = new Date(now.getTime() + hours.utc * 60000)
  const cur = local.getUTCDay() * 1440 + local.getUTCHours() * 60 + local.getUTCMinutes()
  if (hours.periods.length === 1 && !hours.periods[0].c && toMin(hours.periods[0].o) === 0)
    return { open: true, text: 'Open 24 hours' }
  let nextOpen: number | null = null
  for (const period of hours.periods) {
    const start = toMin(period.o)
    if (!period.c) return { open: true, text: 'Open now' }
    let end = toMin(period.c)
    if (end <= start) end += WEEK
    if ((cur >= start && cur < end) || (cur + WEEK >= start && cur + WEEK < end))
      return { open: true, text: `Open · closes ${clock(end)}` }
    const wait = (start - cur + WEEK) % WEEK
    if (nextOpen === null || wait < nextOpen) nextOpen = wait
  }
  if (nextOpen === null) return { open: false, text: 'Closed now' }
  const at = cur + nextOpen
  const sameDay = Math.floor(at / 1440) === Math.floor(cur / 1440)
  return { open: false, text: `Closed · opens ${sameDay ? '' : `${DAYS[Math.floor((at % WEEK) / 1440)]} `}${clock(at)}` }
}

export const isClosedForever = (place: Pick<Place, 'business_status'>) =>
  place.business_status === 'CLOSED_PERMANENTLY'

export function hoursAreStale(place: Pick<Place, 'opening_hours' | 'hours_checked_at'>, days = 14, now = new Date()) {
  if (!place.hours_checked_at) return true
  return now.getTime() - new Date(place.hours_checked_at).getTime() > days * 86400000
}

export const hasGoogleId = (place: Pick<Place, 'google_place_id'>) =>
  !place.google_place_id.startsWith('manual:') && !place.google_place_id.startsWith('osm:')

/** Keeps us inside Google's small free daily limits (counted per phone, per day). */
export function takeQuota(name: string, perDay: number) {
  try {
    const key = `crumbs-quota-${name}-${new Date().toISOString().slice(0, 10)}`
    const used = Number(localStorage.getItem(key) ?? 0)
    if (used >= perDay) return false
    localStorage.setItem(key, String(used + 1))
    return true
  } catch {
    return false
  }
}

// ---------- dealbreakers ----------
export type Facts = {
  place_id: string
  noise: 'quiet' | 'normal' | 'loud' | null
  parking: 'easy' | 'hard' | 'none' | null
  accessible: boolean | null
  wait: 'short' | 'long' | null
  cash_only: boolean
  allergens: string[]
  note: string | null
}
export const normaliseFacts = (raw: any): Facts | null =>
  (Array.isArray(raw) ? raw[0] : raw) ?? null

export const AVOID_OPTIONS = [
  { key: 'loud', label: 'Loud places' },
  { key: 'parking', label: 'Hard parking' },
  { key: 'access', label: 'Not accessible' },
  { key: 'wait', label: 'Long waits' },
  { key: 'cash', label: 'Cash only' },
]
export const ALLERGENS = ['Shellfish', 'Nuts', 'Gluten', 'Dairy', 'Eggs', 'Soy', 'Pork', 'Beef']

type Person = { display_name: string; avoid?: string[] | null }
export type Warning = { label: string; who: string[] }
const firstName = (name: string) => (name || 'Someone').split(' ')[0]

function collect(rules: [string, string][], people: Person[]): Warning[] {
  return rules
    .map(([label, key]) => ({
      label,
      who: people.filter((person) => person.avoid?.includes(key)).map((person) => firstName(person.display_name)),
    }))
    .filter((warning) => warning.who.length)
}

/** Facts about a place that clash with something one of you wants to avoid. */
export function placeWarnings(facts: Facts | null | undefined, people: Person[]): Warning[] {
  if (!facts) return []
  const rules: [string, string][] = []
  if (facts.noise === 'loud') rules.push(['Loud', 'loud'])
  if (facts.parking === 'hard' || facts.parking === 'none') rules.push(['Hard parking', 'parking'])
  if (facts.accessible === false) rules.push(['Not accessible', 'access'])
  if (facts.wait === 'long') rules.push(['Long wait', 'wait'])
  if (facts.cash_only) rules.push(['Cash only', 'cash'])
  facts.allergens.forEach((allergen) => rules.push([allergen, `a:${allergen.toLowerCase()}`]))
  return collect(rules, people)
}

/** A dish tagged with something one of you avoids (shellfish, nuts...). */
export function dishWarnings(dish: Pick<Dish, 'tags'>, people: Person[]): Warning[] {
  const tags = (dish.tags ?? []).map((tag) => tag.trim().toLowerCase())
  return collect(
    ALLERGENS.filter((allergen) => tags.includes(allergen.toLowerCase())).map((a): [string, string] => [a, `a:${a.toLowerCase()}`]),
    people,
  )
}

// ---------- blind ratings ----------
/** Hides your partner's scores for anything you haven't rated yet. */
export function maskRatings(places: Place[], userId?: string): Place[] {
  if (!userId) return places
  return places.map((place) => {
    const ratedPlace = place.place_ratings.some((rating) => rating.user_id === userId)
    return {
      ...place,
      place_ratings: ratedPlace ? place.place_ratings : [],
      dishes: place.dishes?.map((dish) =>
        dish.dish_ratings.some((rating) => rating.user_id === userId)
          ? dish
          : { ...dish, dish_ratings: [] },
      ),
    }
  })
}

/** Keeps the real (unmasked) ratings of other people when a masked copy is saved back. */
export function mergeMasked(real: Place, next: Place, userId?: string): Place {
  return {
    ...next,
    place_ratings: [
      ...real.place_ratings.filter((rating) => rating.user_id !== userId),
      ...next.place_ratings.filter((rating) => rating.user_id === userId),
    ],
    dishes: real.dishes,
  }
}

// ---------- map pins ----------
export function markerClass(place: Place, average: number) {
  if (place.status !== 'Been') return 'marker-want'
  if (average >= 4) return 'marker-great'
  if (average >= 3) return 'marker-ok'
  if (average > 0) return 'marker-low'
  return 'marker-been'
}

// ---------- Tonight? ----------
const seed = (text: string) => [...text].reduce((hash, char) => (hash * 31 + char.charCodeAt(0)) | 0, 7)

export function tonightPick(
  places: Place[],
  people: Person[],
  average: (place: Place) => number,
  now = new Date(),
  skip = 0,
) {
  const likedCuisines = new Set(
    places
      .filter((place) => place.status === 'Been' && average(place) >= 4 && place.cuisine)
      .map((place) => place.cuisine as string),
  )
  const day = now.toISOString().slice(0, 10)
  const ranked = places
    .filter((place) => place.status === 'Want to try' && !isClosedForever(place))
    .map((place) => ({ place, hours: openStatus(place.opening_hours, now), warnings: placeWarnings(normaliseFacts(place.place_facts), people) }))
    .filter((row) => row.hours?.open !== false && !row.warnings.length)
    .map((row) => {
      const liked = !!row.place.cuisine && likedCuisines.has(row.place.cuisine)
      return {
        ...row,
        liked,
        score: (liked ? 2 : 0) + (row.hours?.open ? 1 : 0) + (row.place.pinned ? 1 : 0) + (Math.abs(seed(day + row.place.id)) % 100) / 1000,
      }
    })
    .sort((a, b) => b.score - a.score)
  if (!ranked.length) return null
  const pick = ranked[skip % ranked.length]
  const reason = pick.liked
    ? `You both rate ${pick.place.cuisine} highly`
    : pick.hours?.open
      ? pick.hours.text
      : pick.place.pinned
        ? 'Pinned on your list'
        : 'From your want-to-try list'
  return { place: pick.place, reason, count: ranked.length }
}

export type { Dish }
export { dishAverage }
