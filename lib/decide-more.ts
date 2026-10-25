// Deciding round: #189 Plan B, #186 decide in 60 seconds, #187 private limits overlap,
// #132 spin-the-wheel maths, #128 saved areas, #133 good picks. All on the phone (free).
import type { Place } from '../hooks/use-crumbs-data'
import { average5 } from './ratings.ts'
import { distanceKm } from './stats.ts'
import { openStatus } from './place-info.ts'

type LatLng = { lat: number; lng: number }
const at = (p: Place): LatLng | null =>
  p.latitude !== null && p.longitude !== null ? { lat: p.latitude, lng: p.longitude } : null
const closedForGood = (p: Place) => p.business_status === 'CLOSED_PERMANENTLY'

/** #189 Similar places close to this one: same cuisine (or loved), open now if we know, nearest first. */
export function planB(place: Place, places: Place[], now = new Date(), maxKm = 3) {
  const here = at(place)
  return places
    .filter((p) => p.id !== place.id && !closedForGood(p))
    .map((p) => {
      const there = at(p)
      const km = here && there ? distanceKm(here, there) : null
      const sameCuisine = !!place.cuisine && p.cuisine === place.cuisine
      const loved = average5(p.place_ratings) >= 4
      const open = openStatus(p.opening_hours, now)?.open
      return { place: p, km, sameCuisine, loved, open }
    })
    .filter(
      (x) =>
        (x.km === null || x.km <= maxKm) &&
        (x.sameCuisine || x.loved) &&
        x.open !== false &&
        (!place.price_level ||
          !x.place.price_level ||
          Math.abs(x.place.price_level - place.price_level) <= 1),
    )
    .sort(
      (a, b) =>
        Number(b.sameCuisine) - Number(a.sameCuisine) ||
        (a.km ?? 99) - (b.km ?? 99) ||
        average5(b.place.place_ratings) - average5(a.place.place_ratings),
    )
    .slice(0, 3)
}

/** #186 Three good options for tonight: a favourite, something new, and a wildcard. */
export function threeOptions(places: Place[], random = Math.random, now = new Date()) {
  const ok = places.filter(
    (p) => !closedForGood(p) && openStatus(p.opening_hours, now)?.open !== false,
  )
  const pick = (list: Place[], taken: Place[]) => {
    const pool = list.filter((p) => !taken.includes(p))
    return pool.length ? pool[Math.floor(random() * pool.length)] : null
  }
  const out: Place[] = []
  const favourite = pick(
    ok.filter((p) => average5(p.place_ratings) >= 4),
    out,
  )
  if (favourite) out.push(favourite)
  const fresh = pick(
    ok.filter((p) => p.status === 'Want to try'),
    out,
  )
  if (fresh) out.push(fresh)
  while (out.length < 3) {
    const any = pick(ok, out)
    if (!any) break
    out.push(any)
  }
  return out
}

export type Overlap = {
  people: number
  max_price: number | null
  max_km: number | null
  cravings: string[]
}
/** #187 Does a place fit everyone's private limits? (unknown price/location = fits) */
export function fitsOverlap(place: Place, overlap: Overlap | null, here: LatLng | null) {
  if (!overlap?.people) return true
  if (overlap.max_price && place.price_level && place.price_level > overlap.max_price) return false
  if (overlap.max_km && here) {
    const there = at(place)
    if (there && distanceKm(here, there) > Number(overlap.max_km)) return false
  }
  if (overlap.cravings?.length) {
    const text = [place.cuisine, place.name, ...(place.tags ?? [])].join(' ').toLowerCase()
    if (!overlap.cravings.some((c) => text.includes(c.toLowerCase()))) return false
  }
  return true
}

/** #132 Rotation (degrees, clockwise) that lands slice `index` of `count` under the top pointer. */
export function wheelRotation(current: number, index: number, count: number, turns = 5) {
  const slice = 360 / count
  const centre = index * slice + slice / 2
  const base = current - (current % 360)
  return base + turns * 360 + (360 - centre)
}

export type Area = { name: string; lat: number; lng: number; km: number }
/** #128 Places within a saved area. */
export function inArea(place: Place, area: Area) {
  const there = at(place)
  return !!there && distanceKm(area, there) <= area.km
}

/** #133 Cuisines of plans you said were good picks (and bad ones), for suggestions. */
export function pickLearning(
  plans: { place_id: string | null; good_pick?: boolean | null }[],
  places: Place[],
) {
  const good = new Set<string>()
  const bad = new Set<string>()
  for (const plan of plans) {
    const cuisine = places.find((p) => p.id === plan.place_id)?.cuisine
    if (!cuisine || plan.good_pick === null || plan.good_pick === undefined) continue
    ;(plan.good_pick ? good : bad).add(cuisine)
  }
  for (const c of good) bad.delete(c)
  return { good, bad }
}
