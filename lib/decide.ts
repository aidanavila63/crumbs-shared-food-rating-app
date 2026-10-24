// Pure helpers for Decide & Plan: occasions (#34), swipe/vote results (#30/#40), calendar files
// (#48/#76) and food crawl routes (#26). No network, so it's all free and testable.
import type { Place } from '../hooks/use-crumbs-data'
import type { Plan, SwipeSession, SwipeVote } from '../hooks/use-decide'
import { average5 } from './ratings.ts'
import { distanceKm } from './stats.ts'

// ---------- #34 occasions ----------
export type Occasion = { id: string; label: string; test: (place: Place) => boolean }
const hasTag = (place: Place, ...tags: string[]) =>
  (place.tags ?? []).some((t) => tags.includes(t.toLowerCase()))

export const OCCASIONS: Occasion[] = [
  {
    id: 'date',
    label: '💕 Date night',
    test: (p) => hasTag(p, 'date night', 'fancy', 'cozy') || (p.price_level ?? 0) >= 3,
  },
  {
    id: 'quick',
    label: '⚡ Quick bite',
    test: (p) => hasTag(p, 'quick') || p.price_level === 1,
  },
  {
    id: 'cheap',
    label: '💸 Cheap eats',
    test: (p) => hasTag(p, 'good value', 'cheap') || (p.price_level !== null && p.price_level <= 1),
  },
  {
    id: 'celebrate',
    label: '🎉 Celebration',
    test: (p) => hasTag(p, 'fancy', 'celebration') || average5(p.place_ratings) >= 4.5,
  },
  { id: 'new', label: '✨ Somewhere new', test: (p) => p.status === 'Want to try' },
  {
    id: 'comfort',
    label: '🛋️ Old favourite',
    test: (p) => p.status === 'Been' && average5(p.place_ratings) >= 4,
  },
]

/** Group vibe tags work as occasions too ("Patio", "Brunch"…). */
export function occasionsFor(tags: string[]): Occasion[] {
  const built = new Set([
    'date night',
    'fancy',
    'cozy',
    'quick',
    'good value',
    'cheap',
    'celebration',
  ])
  return [
    ...OCCASIONS,
    ...tags
      .filter((tag) => !built.has(tag.toLowerCase()))
      .map((tag) => ({
        id: `tag:${tag}`,
        label: `🏷️ ${tag}`,
        test: (p: Place) => hasTag(p, tag.toLowerCase()),
      })),
  ]
}

// ---------- #30 / #40 results ----------
export function sessionResults(session: SwipeSession, votes: SwipeVote[], memberIds: string[]) {
  const mine = votes.filter((v) => v.session_id === session.id)
  const rows = session.place_ids.map((placeId) => {
    const here = mine.filter((v) => v.place_id === placeId)
    const yes = here.filter((v) => v.yes).map((v) => v.user_id)
    const no = here.filter((v) => !v.yes).map((v) => v.user_id)
    return {
      placeId,
      yes,
      no,
      match: memberIds.length > 0 && memberIds.every((id) => yes.includes(id)),
    }
  })
  const progress = Object.fromEntries(
    memberIds.map((id) => [
      id,
      new Set(mine.filter((v) => v.user_id === id).map((v) => v.place_id)).size,
    ]),
  )
  const everyoneDone = memberIds.every((id) => progress[id] >= session.place_ids.length)
  const ranked = [...rows].sort((a, b) => b.yes.length - a.yes.length || a.no.length - b.no.length)
  return { rows, ranked, matches: rows.filter((r) => r.match), progress, everyoneDone }
}

export function nextToVote(session: SwipeSession, votes: SwipeVote[], userId: string) {
  const done = new Set(
    votes.filter((v) => v.session_id === session.id && v.user_id === userId).map((v) => v.place_id),
  )
  return session.place_ids.filter((id) => !done.has(id))
}

// ---------- #48 / #76 calendar ----------
const icsDate = (d: Date) =>
  d
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}/, '')
const icsText = (s: string) =>
  s
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/[,;]/g, (m) => `\\${m}`)

/** A one-event .ics file any calendar app can open. Default length 2 hours. */
export function planIcs(
  plan: Pick<Plan, 'id' | 'title' | 'starts_at' | 'note'>,
  place?: Place | null,
  now = new Date(),
) {
  if (!plan.starts_at) return null
  const start = new Date(plan.starts_at)
  const end = new Date(start.getTime() + 2 * 36e5)
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Crumbs//Plans//EN',
    'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:${plan.id}@crumbs`,
    `DTSTAMP:${icsDate(now)}`,
    `DTSTART:${icsDate(start)}`,
    `DTEND:${icsDate(end)}`,
    `SUMMARY:${icsText(plan.title + (place ? ` · ${place.name}` : ''))}`,
    place?.formatted_address ? `LOCATION:${icsText(place.formatted_address)}` : null,
    plan.note ? `DESCRIPTION:${icsText(plan.note)}` : null,
    'BEGIN:VALARM',
    'TRIGGER:-PT2H',
    'ACTION:DISPLAY',
    'DESCRIPTION:Dinner plans',
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ].filter(Boolean)
  return lines.join('\r\n') + '\r\n'
}

// ---------- #26 food crawl ----------
type Located = Place & { latitude: number; longitude: number }
const located = (p: Place): p is Located => p.latitude !== null && p.longitude !== null

/** Walking legs between stops (straight-line distance × 1.3 for streets, 5 km/h). */
export function crawlRoute(stops: Place[]) {
  const legs = stops.slice(1).map((stop, i) => {
    const from = stops[i]
    if (!located(from) || !located(stop)) return null
    const km =
      distanceKm(
        { lat: from.latitude, lng: from.longitude },
        { lat: stop.latitude, lng: stop.longitude },
      ) * 1.3
    return { km, minutes: Math.max(1, Math.round((km / 5) * 60)) }
  })
  const known = legs.filter((leg): leg is { km: number; minutes: number } => !!leg)
  return {
    legs,
    km: known.reduce((sum, leg) => sum + leg.km, 0),
    minutes: known.reduce((sum, leg) => sum + leg.minutes, 0),
    missing: legs.length - known.length,
  }
}

/** Google Maps walking directions through every stop (free link, no API call). */
export function crawlDirectionsUrl(stops: Place[]) {
  const point = (p: Place) =>
    located(p) ? `${p.latitude},${p.longitude}` : `${p.name} ${p.formatted_address ?? ''}`.trim()
  if (stops.length < 2) return null
  const params = new URLSearchParams({
    api: '1',
    origin: point(stops[0]),
    destination: point(stops.at(-1)!),
    travelmode: 'walking',
  })
  if (stops.length > 2) params.set('waypoints', stops.slice(1, -1).map(point).join('|'))
  return `https://www.google.com/maps/dir/?${params.toString()}`
}

/** Reorders stops by nearest-next starting from the first one. */
export function tidyRoute(stops: Place[]) {
  if (stops.length < 3) return stops
  const rest = stops.slice(1)
  const out = [stops[0]]
  while (rest.length) {
    const last = out.at(-1)!
    let best = 0
    let bestKm = Infinity
    rest.forEach((p, i) => {
      if (!located(last) || !located(p)) return
      const km = distanceKm(
        { lat: last.latitude, lng: last.longitude },
        { lat: p.latitude, lng: p.longitude },
      )
      if (km < bestKm) {
        bestKm = km
        best = i
      }
    })
    out.push(rest.splice(best, 1)[0])
  }
  return out
}
